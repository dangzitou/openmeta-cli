import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ensureDirectory, getOpenMetaStateDir, getLocalDateStamp } from '../infra/index.js';
import type { RankedIssue, RepoMemory, RepoWorkspaceContext } from '../types/index.js';

function sanitizeRepoName(repoFullName: string): string {
  return repoFullName.replace(/\//g, '__');
}

function defaultMemory(repoFullName: string): RepoMemory {
  return {
    repoFullName,
    firstSeenAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    detectedTestCommands: [],
    preferredPaths: [],
    generatedDossiers: 0,
    recentIssues: [],
  };
}

export class MemoryService {
  private getMemoryDir(): string {
    return ensureDirectory(join(getOpenMetaStateDir(), 'repo-memory'));
  }

  private getMemoryPath(repoFullName: string): string {
    return join(this.getMemoryDir(), `${sanitizeRepoName(repoFullName)}.json`);
  }

  getPath(repoFullName: string): string {
    return this.getMemoryPath(repoFullName);
  }

  load(repoFullName: string): RepoMemory {
    const path = this.getMemoryPath(repoFullName);

    if (!existsSync(path)) {
      return defaultMemory(repoFullName);
    }

    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<RepoMemory>;
    return {
      ...defaultMemory(repoFullName),
      ...raw,
      detectedTestCommands: raw.detectedTestCommands ?? [],
      preferredPaths: raw.preferredPaths ?? [],
      recentIssues: raw.recentIssues ?? [],
    };
  }

  update(issue: RankedIssue, workspace: RepoWorkspaceContext): RepoMemory {
    const current = this.load(issue.repoFullName);
    const next: RepoMemory = {
      ...current,
      lastUpdatedAt: new Date().toISOString(),
      lastSelectedIssue: `${issue.repoFullName}#${issue.number}`,
      workspacePath: workspace.workspacePath,
      lastBranchName: workspace.branchName,
      detectedTestCommands: workspace.testCommands.map((item) => item.command).slice(0, 8),
      preferredPaths: workspace.candidateFiles.slice(0, 12),
      generatedDossiers: current.generatedDossiers + 1,
      recentIssues: [
        {
          reference: `${issue.repoFullName}#${issue.number}`,
          title: issue.title,
          overallScore: issue.opportunity.overallScore,
          generatedAt: new Date().toISOString(),
        },
        ...current.recentIssues.filter((item) => item.reference !== `${issue.repoFullName}#${issue.number}`),
      ].slice(0, 10),
    };

    writeFileSync(this.getMemoryPath(issue.repoFullName), JSON.stringify(next, null, 2), 'utf-8');
    return next;
  }

  renderMarkdown(memory: RepoMemory): string {
    const lines = [
      `# Repo Memory: ${memory.repoFullName}`,
      '',
      `- First Seen: ${memory.firstSeenAt}`,
      `- Last Updated: ${memory.lastUpdatedAt}`,
      `- Generated Dossiers: ${memory.generatedDossiers}`,
      `- Last Selected Issue: ${memory.lastSelectedIssue || 'n/a'}`,
      `- Workspace Path: ${memory.workspacePath || 'n/a'}`,
      `- Last Branch: ${memory.lastBranchName || 'n/a'}`,
      '',
      '## Preferred Paths',
      '',
      ...(memory.preferredPaths.length > 0 ? memory.preferredPaths.map((path) => `- ${path}`) : ['- None recorded']),
      '',
      '## Detected Test Commands',
      '',
      ...(memory.detectedTestCommands.length > 0 ? memory.detectedTestCommands.map((command) => `- \`${command}\``) : ['- None detected']),
      '',
      '## Recent Issues',
      '',
      ...(memory.recentIssues.length > 0
        ? memory.recentIssues.map((issue) => `- ${issue.reference} | score ${issue.overallScore} | ${issue.generatedAt}`)
        : ['- No issues recorded']),
      '',
      `_Snapshot Date: ${getLocalDateStamp()}_`,
      '',
    ];

    return lines.join('\n');
  }
}

export const memoryService = new MemoryService();
