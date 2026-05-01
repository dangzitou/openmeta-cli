import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { basename, dirname, join, relative, resolve, sep } from 'path';
import { simpleGit, type SimpleGit } from 'simple-git';
import { ensureDirectory, getOpenMetaWorkspaceRoot, logger } from '../infra/index.js';
import type { PatchDraft } from '../contracts/index.js';
import type {
  GeneratedFileChange,
  GeneratedChangeApplyResult,
  RankedIssue,
  RepoMemory,
  RepoFileSnippet,
  RepoWorkspaceContext,
  TestCommand,
  TestResult,
} from '../types/index.js';

const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  'target',
  'vendor',
]);

const MAX_DISCOVERED_FILES = 250;
const MAX_CONTEXT_DISCOVERY_FILES = 2000;
const MAX_SNIPPET_CHARS = 8000;
const MAX_GENERATED_FILES = 6;
const MAX_GENERATED_FILE_CHARS = 60_000;
const DEFAULT_CONTEXT_EXPANSION_LIMIT = 8;
const DEFAULT_CONTEXT_SNIPPET_LIMIT = 24;
type ExecutionMode = 'interactive' | 'headless';

function sanitizeRepoName(repoFullName: string): string {
  return repoFullName.replace(/\//g, '__');
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export class WorkspaceService {
  private getCacheWorkspacePath(repoFullName: string): string {
    return join(ensureDirectory(getOpenMetaWorkspaceRoot()), '_cache', sanitizeRepoName(repoFullName));
  }

  private getRunWorkspacePath(repoFullName: string, issue: RankedIssue): string {
    return join(
      ensureDirectory(getOpenMetaWorkspaceRoot()),
      '_runs',
      sanitizeRepoName(repoFullName),
      `${Date.now()}-${slugify(issue.title) || 'issue'}`,
    );
  }

  async prepareWorkspace(
    issue: RankedIssue,
    memory: RepoMemory,
    runChecks: boolean,
    executionMode: ExecutionMode = 'interactive',
  ): Promise<RepoWorkspaceContext> {
    const sourceWorkspacePath = this.getCacheWorkspacePath(issue.repoFullName);
    const repoUrl = `https://github.com/${issue.repoFullName}.git`;

    const git = await this.ensureCleanCacheWorkspace(sourceWorkspacePath, repoUrl);

    const defaultBranch = await this.detectDefaultBranch(git);
    const runWorkspacePath = await this.createIsolatedWorkspace(git, sourceWorkspacePath, defaultBranch, issue);
    const runGit = simpleGit(runWorkspacePath);
    const branchName = await this.createWorkspaceBranchName(runGit, issue);
    await runGit.checkout(['-B', branchName]);

    const runStatus = await runGit.status();
    const topLevelFiles = readdirSync(runWorkspacePath).slice(0, 50);
    const discoveredFiles = this.discoverFiles(runWorkspacePath, MAX_DISCOVERED_FILES);
    const candidateFiles = this.rankCandidateFiles(issue, memory, discoveredFiles).slice(0, 8);
    const snippets = candidateFiles.map((path) => ({
      path,
      content: this.readSnippet(join(runWorkspacePath, path)),
    }));
    const testCommands = this.detectTestCommands(runWorkspacePath);
    const { commands: validationCommands, warnings: validationWarnings } =
      this.selectValidationCommands(testCommands, executionMode);
    const testResults = runChecks ? this.runTestCommands(runWorkspacePath, validationCommands.slice(0, 3)) : [];

    return {
      workspacePath: runWorkspacePath,
      workspaceKind: 'isolated',
      sourceWorkspacePath,
      runWorkspacePath,
      workspaceDirty: runStatus.files.length > 0,
      defaultBranch,
      branchName,
      topLevelFiles,
      candidateFiles,
      snippets,
      testCommands,
      validationCommands,
      validationWarnings,
      testResults,
    };
  }

  private async ensureCleanCacheWorkspace(sourceWorkspacePath: string, repoUrl: string): Promise<SimpleGit> {
    const cloneFresh = async (): Promise<SimpleGit> => {
      rmSync(sourceWorkspacePath, { recursive: true, force: true });
      mkdirSync(dirname(sourceWorkspacePath), { recursive: true });
      await simpleGit().clone(repoUrl, sourceWorkspacePath);
      return simpleGit(sourceWorkspacePath);
    };

    if (!existsSync(sourceWorkspacePath)) {
      return cloneFresh();
    }

    let git = simpleGit(sourceWorkspacePath);
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      logger.warn(`Cache workspace is not a git repository. Recreating: ${sourceWorkspacePath}`);
      return cloneFresh();
    }

    const status = await git.status();
    if (status.files.length > 0) {
      logger.warn(`Cache workspace is dirty. Recreating from remote: ${sourceWorkspacePath}`);
      return cloneFresh();
    }

    await git.fetch('origin');
    return git;
  }

  applyGeneratedChanges(
    workspacePath: string,
    fileChanges: GeneratedFileChange[],
    options: { allowedPaths?: string[] } = {},
  ): GeneratedChangeApplyResult {
    const rootPath = resolve(workspacePath);
    const allowedPaths = new Set((options.allowedPaths ?? []).map((path) => path.replace(/^\/+/, '').trim()).filter(Boolean));
    const appliedFiles: string[] = [];
    const skippedFiles: GeneratedChangeApplyResult['skippedFiles'] = [];

    if (fileChanges.length > MAX_GENERATED_FILES) {
      return {
        appliedFiles: [],
        skippedFiles: fileChanges.map((change) => ({
          path: change.path,
          reason: `Generated patch touches ${fileChanges.length} files; automatic apply limit is ${MAX_GENERATED_FILES}.`,
        })),
        reviewRequired: true,
        reviewReason: `Generated patch touches ${fileChanges.length} files, which exceeds the automatic apply limit of ${MAX_GENERATED_FILES}.`,
      };
    }

    for (const change of fileChanges) {
      const relativePath = change.path.replace(/^\/+/, '').trim();
      if (!relativePath) {
        skippedFiles.push({ path: change.path, reason: 'Generated path is empty.' });
        continue;
      }

      const targetPath = resolve(rootPath, relativePath);
      if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}${sep}`)) {
        logger.warn(`Skipping unsafe generated path outside the workspace: ${change.path}`);
        skippedFiles.push({ path: change.path, reason: 'Generated path is outside the workspace.' });
        continue;
      }

      if (allowedPaths.size > 0 && !allowedPaths.has(relativePath)) {
        skippedFiles.push({ path: relativePath, reason: 'Generated path was not part of the selected implementation context.' });
        continue;
      }

      if (change.content.length > MAX_GENERATED_FILE_CHARS) {
        skippedFiles.push({ path: relativePath, reason: `Generated content exceeds ${MAX_GENERATED_FILE_CHARS} characters.` });
        continue;
      }

      const existingContent = existsSync(targetPath) ? readFileSync(targetPath, 'utf-8') : null;
      if (existingContent === change.content) {
        skippedFiles.push({ path: relativePath, reason: 'Generated content is unchanged.' });
        continue;
      }

      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, change.content, 'utf-8');
      appliedFiles.push(relativePath);
    }

    const unsafeSkipped = skippedFiles.filter((file) =>
      file.reason.includes('outside the workspace') ||
      file.reason.includes('not part of the selected implementation context') ||
      file.reason.includes('exceeds')
    );

    return {
      appliedFiles,
      skippedFiles,
      reviewRequired: unsafeSkipped.length > 0,
      reviewReason: unsafeSkipped.length > 0 ? unsafeSkipped.map((file) => `${file.path}: ${file.reason}`).join('; ') : undefined,
    };
  }

  runValidationCommands(workspacePath: string, commands: TestCommand[]): TestResult[] {
    return this.runTestCommands(workspacePath, commands);
  }

  readWorkspaceFiles(workspacePath: string, filePaths: string[]): RepoFileSnippet[] {
    const rootPath = resolve(workspacePath);

    return filePaths.flatMap((filePath) => {
      const relativePath = filePath.replace(/^\/+/, '').trim();
      if (!relativePath) {
        return [];
      }

      const targetPath = resolve(rootPath, relativePath);
      if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}${sep}`)) {
        logger.warn(`Skipping unsafe workspace read outside the repository root: ${filePath}`);
        return [];
      }

      return [{
        path: relativePath,
        content: this.readSnippet(targetPath),
      }];
    });
  }

  expandImplementationContext(input: {
    issue: RankedIssue;
    patchDraft: PatchDraft;
    workspace: RepoWorkspaceContext;
    round: number;
    maxNewFiles?: number;
    maxTotalSnippets?: number;
  }): RepoWorkspaceContext {
    const maxNewFiles = input.maxNewFiles ?? DEFAULT_CONTEXT_EXPANSION_LIMIT;
    const maxTotalSnippets = input.maxTotalSnippets ?? DEFAULT_CONTEXT_SNIPPET_LIMIT;
    const existingPaths = new Set(input.workspace.snippets.map((snippet) => snippet.path));
    const availableSlots = Math.max(0, maxTotalSnippets - input.workspace.snippets.length);
    if (availableSlots === 0 || maxNewFiles <= 0) {
      return input.workspace;
    }

    const targetPaths = this.extractPatchDraftPaths(input.patchDraft);
    const keywords = this.buildContextKeywords(input.issue, input.patchDraft);
    const discoveredFiles = this.discoverFiles(input.workspace.workspacePath, MAX_CONTEXT_DISCOVERY_FILES);
    const nextPaths = this.rankContextExpansionFiles({
      files: discoveredFiles,
      existingPaths,
      targetPaths,
      keywords,
      round: input.round,
    }).slice(0, Math.min(maxNewFiles, availableSlots));

    if (nextPaths.length === 0) {
      logger.info(`Context expansion round ${input.round} found no additional files.`);
      return input.workspace;
    }

    const extraSnippets = this.readWorkspaceFiles(input.workspace.workspacePath, nextPaths);
    logger.info(`Context expansion round ${input.round} loaded ${extraSnippets.length} additional file(s).`);

    return {
      ...input.workspace,
      candidateFiles: this.uniqueStrings([
        ...input.workspace.candidateFiles,
        ...nextPaths,
      ]),
      snippets: this.mergeSnippets(input.workspace.snippets, extraSnippets).slice(0, maxTotalSnippets),
    };
  }

  private async createIsolatedWorkspace(
    git: SimpleGit,
    sourceWorkspacePath: string,
    defaultBranch: string,
    issue: RankedIssue,
  ): Promise<string> {
    try {
      await git.checkout(defaultBranch);
      try {
        await git.pull('origin', defaultBranch);
      } catch (error) {
        logger.debug('Unable to fast-forward cache workspace before creating isolated run workspace', error);
      }
    } catch (error) {
      logger.debug(`Unable to align cache workspace to ${defaultBranch}`, error);
    }

    const runWorkspacePath = this.getRunWorkspacePath(issue.repoFullName, issue);
    rmSync(runWorkspacePath, { recursive: true, force: true });
    mkdirSync(dirname(runWorkspacePath), { recursive: true });

    try {
      await git.raw(['worktree', 'prune']);
      await git.raw(['worktree', 'add', '--detach', runWorkspacePath, `origin/${defaultBranch}`]);
      logger.info(`Prepared isolated workspace via git worktree: ${runWorkspacePath}`);
      return runWorkspacePath;
    } catch (error) {
      logger.debug('Unable to create isolated workspace via git worktree, falling back to local clone', error);
    }

    await simpleGit().clone(sourceWorkspacePath, runWorkspacePath, ['--no-local']);
    const runGit = simpleGit(runWorkspacePath);
    await runGit.checkout(defaultBranch);
    logger.info(`Prepared isolated workspace via local clone fallback: ${runWorkspacePath}`);
    return runWorkspacePath;
  }

  private async detectDefaultBranch(git: SimpleGit): Promise<string> {
    try {
      const branchReference = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD']);
      const segments = branchReference.trim().split('/');
      return segments.at(-1) || 'main';
    } catch {
      const branches = await git.branch();

      if (branches.all.includes('main')) {
        return 'main';
      }

      if (branches.all.includes('master')) {
        return 'master';
      }

      return branches.current || 'main';
    }
  }

  private async createWorkspaceBranchName(git: SimpleGit, issue: RankedIssue): Promise<string> {
    const baseBranchName = `openmeta/${issue.number}-${slugify(issue.title) || 'issue'}`;
    const localBranches = await git.branchLocal();
    if (!localBranches.all.includes(baseBranchName)) {
      return baseBranchName;
    }

    return `${baseBranchName}-${Date.now()}`;
  }

  private discoverFiles(root: string, maxFiles: number = MAX_DISCOVERED_FILES): string[] {
    const queue = [root];
    const files: string[] = [];

    while (queue.length > 0 && files.length < maxFiles) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      for (const entry of readdirSync(current, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (!EXCLUDED_DIRS.has(entry.name)) {
            queue.push(join(current, entry.name));
          }
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        files.push(this.normalizeRelativePath(relative(root, join(current, entry.name))));
        if (files.length >= maxFiles) {
          break;
        }
      }
    }

    return files;
  }

  private rankCandidateFiles(issue: RankedIssue, memory: RepoMemory, files: string[]): string[] {
    const referencedPaths = this.extractReferencedPaths(`${issue.title}\n${issue.body}`);
    const keywords = `${issue.title} ${issue.analysis.coreDemand} ${issue.analysis.techRequirements.join(' ')}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3);

    return [...files]
      .sort((left, right) => this.scorePath(right, keywords, memory, referencedPaths) - this.scorePath(left, keywords, memory, referencedPaths));
  }

  private rankContextExpansionFiles(input: {
    files: string[];
    existingPaths: Set<string>;
    targetPaths: string[];
    keywords: string[];
    round: number;
  }): string[] {
    return [...input.files]
      .filter((path) => !input.existingPaths.has(path))
      .filter((path) => this.isLikelyContextFile(path))
      .sort((left, right) =>
        this.scoreContextExpansionPath(right, input.keywords, input.targetPaths, input.round) -
        this.scoreContextExpansionPath(left, input.keywords, input.targetPaths, input.round)
      );
  }

  private scoreContextExpansionPath(path: string, keywords: string[], targetPaths: string[], round: number): number {
    let score = 0;
    const lowerPath = path.toLowerCase();
    const fileName = basename(lowerPath);

    for (const targetPath of targetPaths) {
      const lowerTarget = targetPath.toLowerCase();
      if (lowerPath === lowerTarget) {
        score += 120;
      } else if (lowerPath.endsWith(lowerTarget)) {
        score += 80;
      } else if (lowerPath.includes(lowerTarget) || fileName === basename(lowerTarget)) {
        score += 45;
      }
    }

    for (const keyword of keywords) {
      if (lowerPath.includes(keyword)) {
        score += 8;
      }
      if (fileName.includes(keyword)) {
        score += 10;
      }
    }

    if (/\.(test|spec)\.(ts|tsx|js|jsx|py|go|rs|java|kt)$/.test(lowerPath)) {
      score += round > 1 ? 10 : 4;
    }
    if (/\.(ts|tsx|js|jsx|py|go|rs|java|kt)$/.test(fileName)) {
      score += 6;
    }
    if (lowerPath.includes('/src/') || lowerPath.startsWith('src/')) {
      score += 5;
    }

    return score;
  }

  private scorePath(path: string, keywords: string[], memory: RepoMemory, referencedPaths: string[]): number {
    let score = 0;
    const lowerPath = path.toLowerCase();
    const pathSignals = memory.pathSignals ?? [];
    const recentIssues = memory.recentIssues ?? [];
    const pathSignal = pathSignals.find((signal) => signal.path === path);
    const recentIssue = recentIssues.find((issue) => issue.changedFiles.includes(path));

    for (const keyword of keywords) {
      if (lowerPath.includes(keyword)) {
        score += 5;
      }
    }

    if (memory.preferredPaths.some((candidate) => candidate === path)) {
      score += 12;
    }

    if (pathSignal) {
      score += pathSignal.candidateCount;
      score += pathSignal.changedCount * 6;
      score += pathSignal.successfulValidationCount * 10;
      score += pathSignal.publishedCount * 14;
    }

    if (recentIssue) {
      score += 6;

      if (recentIssue.status === 'published' || recentIssue.status === 'pr_opened') {
        score += 6;
      } else if (recentIssue.status === 'validated') {
        score += 3;
      }
    }

    for (const referencedPath of referencedPaths) {
      const lowerReferencedPath = referencedPath.toLowerCase();
      if (lowerPath.endsWith(lowerReferencedPath)) {
        score += 48;
        break;
      }

      if (lowerPath.includes(lowerReferencedPath) || basename(lowerPath) === basename(lowerReferencedPath)) {
        score += 24;
      }
    }

    const fileName = basename(path).toLowerCase();
    if (fileName === 'readme.md') {
      score += 6;
    }

    if (/\.(ts|tsx|js|jsx|py|go|rs|java|kt)$/.test(fileName)) {
      score += 4;
    }

    return score;
  }

  private readSnippet(path: string): string {
    try {
      const content = readFileSync(path, 'utf-8');
      return content.slice(0, MAX_SNIPPET_CHARS);
    } catch {
      return '';
    }
  }

  private normalizeRelativePath(path: string): string {
    return path.split(sep).join('/');
  }

  private buildContextKeywords(issue: RankedIssue, patchDraft: PatchDraft): string[] {
    const patchText = [
      patchDraft.goal,
      ...patchDraft.targetFiles.flatMap((file) => [file.path, file.reason]),
      ...patchDraft.proposedChanges.flatMap((change) => [change.title, change.details, ...change.files]),
    ].join(' ');
    const text = [
      issue.title,
      issue.body,
      issue.analysis.coreDemand,
      issue.analysis.techRequirements.join(' '),
      patchText,
    ].join(' ');

    return this.uniqueStrings(text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3)
      .filter((token) => !this.isLowSignalKeyword(token)))
      .slice(0, 80);
  }

  private extractPatchDraftPaths(patchDraft: PatchDraft): string[] {
    return this.uniqueStrings([
      ...patchDraft.targetFiles.map((file) => file.path),
      ...patchDraft.proposedChanges.flatMap((change) => change.files),
    ].map((path) => path.replace(/^\/+/, '').trim()).filter(Boolean));
  }

  private isLikelyContextFile(path: string): boolean {
    return /\.(ts|tsx|js|jsx|py|go|rs|java|kt|json|md|css|scss|yml|yaml)$/.test(path.toLowerCase());
  }

  private isLowSignalKeyword(token: string): boolean {
    return new Set([
      'the',
      'and',
      'for',
      'with',
      'from',
      'this',
      'that',
      'issue',
      'update',
      'change',
      'changes',
      'file',
      'files',
      'test',
      'tests',
    ]).has(token);
  }

  private mergeSnippets(current: RepoFileSnippet[], next: RepoFileSnippet[]): RepoFileSnippet[] {
    const snippets = new Map<string, RepoFileSnippet>();
    for (const snippet of [...current, ...next]) {
      if (!snippets.has(snippet.path)) {
        snippets.set(snippet.path, snippet);
      }
    }

    return [...snippets.values()];
  }

  private uniqueStrings(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }

  private extractReferencedPaths(content: string): string[] {
    const matches = content.matchAll(/(?:^|[\s`'"])((?:[\w.-]+\/)+[\w.-]+\.(?:ts|tsx|js|jsx|py|go|rs|java|kt|json|md|css|scss))/gm);
    return [...new Set(
      [...matches]
        .map((match) => match[1]?.trim())
        .filter((value): value is string => Boolean(value)),
    )];
  }

  private detectTestCommands(workspacePath: string): TestCommand[] {
    const commands: TestCommand[] = [];
    const packageJsonPath = join(workspacePath, 'package.json');
    const cargoPath = join(workspacePath, 'Cargo.toml');
    const goModPath = join(workspacePath, 'go.mod');
    const pyprojectPath = join(workspacePath, 'pyproject.toml');
    const makefilePath = join(workspacePath, 'Makefile');

    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
          scripts?: Record<string, string>;
          packageManager?: string;
        };
        const scripts = packageJson.scripts ?? {};
        const scriptRunner = this.detectPackageScriptRunner(workspacePath, packageJson.packageManager);

        if (scripts['test']) commands.push({
          command: this.buildPackageScriptCommand(scriptRunner, 'test'),
          reason: `Detected package.json test script (${scriptRunner})`,
          source: 'repo-script',
        });
        if (scripts['lint']) commands.push({
          command: this.buildPackageScriptCommand(scriptRunner, 'lint'),
          reason: `Detected package.json lint script (${scriptRunner})`,
          source: 'repo-script',
        });
        if (scripts['typecheck']) commands.push({
          command: this.buildPackageScriptCommand(scriptRunner, 'typecheck'),
          reason: `Detected package.json typecheck script (${scriptRunner})`,
          source: 'repo-script',
        });
        if (scripts['build']) commands.push({
          command: this.buildPackageScriptCommand(scriptRunner, 'build'),
          reason: `Detected package.json build script (${scriptRunner})`,
          source: 'repo-script',
        });
      } catch (error) {
        logger.debug('Unable to parse package.json for test command detection', error);
      }
    }

    if (existsSync(cargoPath)) {
      commands.push({ command: 'cargo test', reason: 'Detected Cargo.toml', source: 'tool-default' });
    }

    if (existsSync(goModPath)) {
      commands.push({ command: 'go test ./...', reason: 'Detected go.mod', source: 'tool-default' });
    }

    if (existsSync(pyprojectPath)) {
      commands.push({ command: 'pytest', reason: 'Detected pyproject.toml', source: 'tool-default' });
    }

    if (existsSync(makefilePath)) {
      commands.push({ command: 'make test', reason: 'Detected Makefile', source: 'repo-script' });
    }

    return commands.filter((item, index, list) => list.findIndex((candidate) => candidate.command === item.command) === index);
  }

  private selectValidationCommands(
    commands: TestCommand[],
    executionMode: ExecutionMode,
  ): { commands: TestCommand[]; warnings: string[] } {
    if (executionMode !== 'headless') {
      return {
        commands: commands.slice(0, 3),
        warnings: [],
      };
    }

    const selected = commands.filter((command) => command.source === 'tool-default').slice(0, 3);
    const warnings = commands
      .filter((command) => command.source === 'repo-script')
      .map((command) => `Skipped ${command.command} during headless validation because it comes from repository-defined scripts.`);

    return {
      commands: selected,
      warnings,
    };
  }

  private detectPackageScriptRunner(workspacePath: string, packageManager?: string): 'bun' | 'pnpm' | 'yarn' | 'npm' {
    const normalizedPackageManager = packageManager?.toLowerCase();
    if (normalizedPackageManager?.startsWith('bun@')) {
      return 'bun';
    }

    if (normalizedPackageManager?.startsWith('pnpm@')) {
      return 'pnpm';
    }

    if (normalizedPackageManager?.startsWith('yarn@')) {
      return 'yarn';
    }

    if (normalizedPackageManager?.startsWith('npm@')) {
      return 'npm';
    }

    if (existsSync(join(workspacePath, 'bun.lock')) || existsSync(join(workspacePath, 'bun.lockb'))) {
      return 'bun';
    }

    if (existsSync(join(workspacePath, 'pnpm-lock.yaml'))) {
      return 'pnpm';
    }

    if (existsSync(join(workspacePath, 'yarn.lock'))) {
      return 'yarn';
    }

    if (existsSync(join(workspacePath, 'package-lock.json'))) {
      return 'npm';
    }

    return 'bun';
  }

  private buildPackageScriptCommand(runner: 'bun' | 'pnpm' | 'yarn' | 'npm', scriptName: string): string {
    if (runner === 'yarn') {
      return `yarn ${scriptName}`;
    }

    return `${runner} run ${scriptName}`;
  }

  private runTestCommands(workspacePath: string, commands: TestCommand[]): TestResult[] {
    return commands.map((item) => {
      const toolDefault = this.resolveToolDefaultCommand(item);
      const result = toolDefault
        ? spawnSync(toolDefault.command, toolDefault.args, {
          cwd: workspacePath,
          encoding: 'utf-8',
          timeout: 120000,
        })
        : spawnSync(item.command, {
          cwd: workspacePath,
          encoding: 'utf-8',
          shell: true,
          timeout: 120000,
        });

      const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim().slice(0, 2000);
      return {
        command: item.command,
        exitCode: typeof result.status === 'number' ? result.status : null,
        passed: result.status === 0,
        output,
      };
    });
  }

  private resolveToolDefaultCommand(command: TestCommand): { command: string; args: string[] } | null {
    if (command.source !== 'tool-default') {
      return null;
    }

    switch (command.command) {
      case 'cargo test':
        return { command: 'cargo', args: ['test'] };
      case 'go test ./...':
        return { command: 'go', args: ['test', './...'] };
      case 'pytest':
        return { command: 'pytest', args: [] };
      default:
        return null;
    }
  }
}

export const workspaceService = new WorkspaceService();
