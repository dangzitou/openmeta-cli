import type { ContentType, GeneratedContent, MatchedIssue } from '../types/index.js';
import { getLocalDateStamp } from '../infra/date.js';
import { logger } from '../infra/logger.js';

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
}

export const contentService = new ContentService();
