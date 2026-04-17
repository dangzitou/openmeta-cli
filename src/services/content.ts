import type {
  ContentType,
  ContributionInboxItem,
  GeneratedContent,
  ProofOfWorkRecord,
  RankedIssue,
  RepoMemory,
  RepoWorkspaceContext,
  MatchedIssue,
} from '../types/index.js';
import { getLocalDateStamp } from '../infra/date.js';

export class ContentService {
  generateResearchNote(issues: MatchedIssue[], reportContent: string): GeneratedContent {
    const title = `Daily Open Source Issue Research Notes - ${getLocalDateStamp()}`;

    return {
      type: 'research_note',
      title,
      content: reportContent,
      relatedIssues: issues,
      generatedAt: new Date().toISOString(),
    };
  }

  generateDiary(issues: MatchedIssue[], diaryContent: string): GeneratedContent {
    const title = `Daily Development Diary - ${getLocalDateStamp()}`;

    return {
      type: 'development_diary',
      title,
      content: diaryContent,
      relatedIssues: issues,
      generatedAt: new Date().toISOString(),
    };
  }

  formatAsMarkdown(content: GeneratedContent): string {
    let md = `# ${content.title}\n\n`;
    md += `Generated at: ${content.generatedAt}\n\n`;
    md += `---\n\n`;
    md += content.content;
    md += `\n\n---\n\n`;
    md += `## Related Issues\n\n`;

    for (const issue of content.relatedIssues) {
      md += `### [${issue.repoFullName}#${issue.number}] ${issue.title}\n`;
      md += `- Match Score: ${issue.matchScore}/100\n`;
      md += `- Labels: ${issue.labels.join(', ')}\n`;
      md += `- Link: ${issue.htmlUrl}\n`;
      md += `- Core Demand: ${issue.analysis.coreDemand}\n`;
      md += `- Tech Requirements: ${issue.analysis.techRequirements.join(', ')}\n`;
      md += `- Solution Suggestion: ${issue.analysis.solutionSuggestion}\n`;
      md += `- Estimated Workload: ${issue.analysis.estimatedWorkload}\n\n`;
    }

    return md;
  }

  formatCommitMessage(content: GeneratedContent, template: string): string {
    const typeLabel = content.type === 'research_note' ? 'Research Notes' : 'Development Diary';
    const date = getLocalDateStamp();
    return template
      .replace('{{title}}', `${typeLabel} - ${date}`)
      .replace('{{content}}', `Daily open source contribution log for ${date}`);
  }

  getContentTypeLabel(type: ContentType): string {
    return type === 'research_note' ? 'Research Notes' : 'Development Diary';
  }

  formatContributionDossier(
    issue: RankedIssue,
    workspace: RepoWorkspaceContext,
    memory: RepoMemory,
    patchDraft: string,
    prDraft: string,
  ): string {
    const lines = [
      `# OpenMeta Contribution Dossier - ${issue.repoFullName}#${issue.number}`,
      '',
      '## Opportunity Snapshot',
      '',
      `- Overall Score: ${issue.opportunity.overallScore}/100`,
      `- Technical Match: ${issue.matchScore}/100`,
      `- Opportunity Score: ${issue.opportunity.score}/100`,
      `- Summary: ${issue.opportunity.summary}`,
      '',
      '## Breakdown',
      '',
      `- Technical Fit: ${issue.opportunity.breakdown.technicalFit}`,
      `- Freshness: ${issue.opportunity.breakdown.freshness}`,
      `- Onboarding Clarity: ${issue.opportunity.breakdown.onboardingClarity}`,
      `- Merge Potential: ${issue.opportunity.breakdown.mergePotential}`,
      `- Impact: ${issue.opportunity.breakdown.impact}`,
      '',
      '## Workspace',
      '',
      `- Workspace Path: ${workspace.workspacePath}`,
      `- Default Branch: ${workspace.defaultBranch}`,
      `- Agent Branch: ${workspace.branchName || 'not created'}`,
      `- Workspace Dirty: ${workspace.workspaceDirty}`,
      '',
      '## Detected Test Commands',
      '',
      ...(workspace.testCommands.length > 0 ? workspace.testCommands.map((item) => `- \`${item.command}\` | ${item.reason}`) : ['- None detected']),
      '',
      '## Baseline Test Results',
      '',
      ...(workspace.testResults.length > 0
        ? workspace.testResults.map((result) => `- \`${result.command}\` | ${result.passed ? 'passed' : `failed (${result.exitCode ?? 'n/a'})`}`)
        : ['- Not executed']),
      '',
      '## Repo Memory',
      '',
      `- Generated Dossiers: ${memory.generatedDossiers}`,
      `- Last Selected Issue: ${memory.lastSelectedIssue || 'n/a'}`,
      `- Preferred Paths: ${memory.preferredPaths.join(', ') || 'none'}`,
      '',
      '## Patch Draft',
      '',
      patchDraft,
      '',
      '## PR Draft',
      '',
      prDraft,
      '',
      `_Generated at ${new Date().toISOString()}_`,
      '',
    ];

    return lines.join('\n');
  }

  formatInboxMarkdown(items: ContributionInboxItem[]): string {
    const lines = [
      '# Contribution Inbox',
      '',
      ...(items.length > 0
        ? items.map((item) => `- [${item.status.toUpperCase()}] ${item.repoFullName}#${item.issueNumber} | overall ${item.overallScore} | ${item.summary}`)
        : ['- Inbox is empty']),
      '',
    ];

    return lines.join('\n');
  }

  formatProofOfWorkMarkdown(records: ProofOfWorkRecord[]): string {
    const lines = [
      '# Proof of Work',
      '',
      ...(records.length > 0
        ? records.slice(0, 20).map((record) => `- ${record.repoFullName}#${record.issueNumber} | overall ${record.overallScore} | published=${record.published}`)
        : ['- No activity recorded']),
      '',
    ];

    return lines.join('\n');
  }
}

export const contentService = new ContentService();
