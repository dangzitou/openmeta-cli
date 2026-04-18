import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { basename, dirname, join, relative, resolve, sep } from 'path';
import { simpleGit, type SimpleGit } from 'simple-git';
import { ensureDirectory, getOpenMetaWorkspaceRoot, logger } from '../infra/index.js';
import type {
  GeneratedFileChange,
  RankedIssue,
  RepoMemory,
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
const MAX_SNIPPET_CHARS = 8000;

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
  private getWorkspacePath(repoFullName: string): string {
    return join(ensureDirectory(getOpenMetaWorkspaceRoot()), sanitizeRepoName(repoFullName));
  }

  async prepareWorkspace(
    issue: RankedIssue,
    memory: RepoMemory,
    runChecks: boolean,
  ): Promise<RepoWorkspaceContext> {
    const workspacePath = this.getWorkspacePath(issue.repoFullName);
    const repoUrl = `https://github.com/${issue.repoFullName}.git`;

    if (!existsSync(workspacePath)) {
      mkdirSync(dirname(workspacePath), { recursive: true });
      await simpleGit().clone(repoUrl, workspacePath);
    }

    const git = simpleGit(workspacePath);
    await git.fetch('origin');

    const defaultBranch = await this.detectDefaultBranch(git);
    const status = await git.status();
    const workspaceDirty = status.files.length > 0;
    const branchName = workspaceDirty ? undefined : `openmeta/${issue.number}-${slugify(issue.title)}`;

    if (!workspaceDirty && branchName) {
      await git.checkout(defaultBranch);
      try {
        await git.pull('origin', defaultBranch);
      } catch (error) {
        logger.debug('Unable to fast-forward workspace before branch creation', error);
      }

      try {
        await git.checkoutLocalBranch(branchName);
      } catch {
        await git.checkout(branchName);
      }
    }

    const topLevelFiles = readdirSync(workspacePath).slice(0, 50);
    const discoveredFiles = this.discoverFiles(workspacePath);
    const candidateFiles = this.rankCandidateFiles(issue, memory, discoveredFiles).slice(0, 8);
    const snippets = candidateFiles.map((path) => ({
      path,
      content: this.readSnippet(join(workspacePath, path)),
    }));
    const testCommands = this.detectTestCommands(workspacePath);
    const testResults = runChecks ? this.runTestCommands(workspacePath, testCommands.slice(0, 3)) : [];

    return {
      workspacePath,
      workspaceDirty,
      defaultBranch,
      branchName,
      topLevelFiles,
      candidateFiles,
      snippets,
      testCommands,
      testResults,
    };
  }

  applyGeneratedChanges(workspacePath: string, fileChanges: GeneratedFileChange[]): string[] {
    const rootPath = resolve(workspacePath);
    const appliedFiles: string[] = [];

    for (const change of fileChanges) {
      const relativePath = change.path.replace(/^\/+/, '').trim();
      if (!relativePath) {
        continue;
      }

      const targetPath = resolve(rootPath, relativePath);
      if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}${sep}`)) {
        logger.warn(`Skipping unsafe generated path outside the workspace: ${change.path}`);
        continue;
      }

      const existingContent = existsSync(targetPath) ? readFileSync(targetPath, 'utf-8') : null;
      if (existingContent === change.content) {
        continue;
      }

      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, change.content, 'utf-8');
      appliedFiles.push(relativePath);
    }

    return appliedFiles;
  }

  runValidationCommands(workspacePath: string, commands: TestCommand[]): TestResult[] {
    return this.runTestCommands(workspacePath, commands);
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

  private discoverFiles(root: string): string[] {
    const queue = [root];
    const files: string[] = [];

    while (queue.length > 0 && files.length < MAX_DISCOVERED_FILES) {
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

        files.push(relative(root, join(current, entry.name)));
        if (files.length >= MAX_DISCOVERED_FILES) {
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

  private scorePath(path: string, keywords: string[], memory: RepoMemory, referencedPaths: string[]): number {
    let score = 0;
    const lowerPath = path.toLowerCase();

    for (const keyword of keywords) {
      if (lowerPath.includes(keyword)) {
        score += 5;
      }
    }

    if (memory.preferredPaths.some((candidate) => candidate === path)) {
      score += 12;
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

        if (scripts['test']) commands.push({ command: this.buildPackageScriptCommand(scriptRunner, 'test'), reason: `Detected package.json test script (${scriptRunner})` });
        if (scripts['lint']) commands.push({ command: this.buildPackageScriptCommand(scriptRunner, 'lint'), reason: `Detected package.json lint script (${scriptRunner})` });
        if (scripts['typecheck']) commands.push({ command: this.buildPackageScriptCommand(scriptRunner, 'typecheck'), reason: `Detected package.json typecheck script (${scriptRunner})` });
        if (scripts['build']) commands.push({ command: this.buildPackageScriptCommand(scriptRunner, 'build'), reason: `Detected package.json build script (${scriptRunner})` });
      } catch (error) {
        logger.debug('Unable to parse package.json for test command detection', error);
      }
    }

    if (existsSync(cargoPath)) {
      commands.push({ command: 'cargo test', reason: 'Detected Cargo.toml' });
    }

    if (existsSync(goModPath)) {
      commands.push({ command: 'go test ./...', reason: 'Detected go.mod' });
    }

    if (existsSync(pyprojectPath)) {
      commands.push({ command: 'pytest', reason: 'Detected pyproject.toml' });
    }

    if (existsSync(makefilePath)) {
      commands.push({ command: 'make test', reason: 'Detected Makefile' });
    }

    return commands.filter((item, index, list) => list.findIndex((candidate) => candidate.command === item.command) === index);
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
      const result = spawnSync(item.command, {
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
}

export const workspaceService = new WorkspaceService();
