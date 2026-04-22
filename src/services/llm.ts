import OpenAI from 'openai';
import { z } from 'zod';
import {
  ImplementationDraftSchema,
  PatchDraftSchema,
  type PatchDraft,
  PullRequestDraftSchema,
  type PullRequestDraft,
} from '../contracts/index.js';
import type {
  GitHubIssue,
  ImplementationDraft,
  MatchedIssue,
  RankedIssue,
  RepoFileSnippet,
  RepoMemory,
  RepoWorkspaceContext,
  TestResult,
  UserProfile,
} from '../types/index.js';
import { logger } from '../infra/logger.js';
import {
  CODE_CHANGE_PROMPT,
  CODE_CHANGE_REPAIR_PROMPT,
  fillPrompt,
  ISSUE_MATCH_PROMPT,
  DAILY_REPORT_GENERATE_PROMPT,
  DAILY_DIARY_GENERATE_PROMPT,
  PATCH_DRAFT_PROMPT,
  PR_DRAFT_PROMPT,
  VALIDATION_REPAIR_PROMPT,
} from '../infra/prompt-templates.js';

export class LLMService {
  private client: OpenAI | null = null;
  private modelName: string = 'gpt-4o-mini';

  initialize(apiKey: string, baseUrl: string, modelName?: string): void {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
    });
    if (modelName) {
      this.modelName = modelName;
    }
  }

  async validateConnection(): Promise<boolean> {
    if (!this.client) {
      throw new Error('LLM client not initialized');
    }

    try {
      await this.client.chat.completions.create({
        model: this.modelName,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
      });
      logger.success('LLM API connection validated');
      return true;
    } catch (error) {
      logger.warn('LLM API connection check failed.');
      logger.debug('LLM API connection check failed', error);
      return false;
    }
  }

  async scoreIssues(userProfile: UserProfile, issues: GitHubIssue[]): Promise<MatchedIssue[]> {
    if (issues.length === 0) {
      return [];
    }

    const issueList = issues.map(i =>
      `Issue Reference: ${this.getIssueReference(i)}
Title: ${i.title}
Body: ${i.body.slice(0, 500)}
Labels: ${i.labels.join(', ')}
Repo Description: ${i.repoDescription}
Repo Stars: ${i.repoStars}`
    ).join('\n\n---\n\n');

    const prompt = fillPrompt(ISSUE_MATCH_PROMPT, {
      userProfile: JSON.stringify(userProfile, null, 2),
      issueList,
    });

    const content = await this.chat(prompt);

    return this.parseLLMResponse(content, issues);
  }

  async generateDailyReport(issueAnalysis: string): Promise<string> {
    const prompt = fillPrompt(DAILY_REPORT_GENERATE_PROMPT, {
      issueAnalysis,
    });

    return await this.chat(prompt);
  }

  async generateDailyDiary(issueAnalysis: string, userCodeSnippets: string): Promise<string> {
    const prompt = fillPrompt(DAILY_DIARY_GENERATE_PROMPT, {
      issueAnalysis,
      userCodeSnippets: userCodeSnippets || 'No code snippets provided.',
    });

    return await this.chat(prompt);
  }

  async generatePatchDraft(issue: RankedIssue, workspace: RepoWorkspaceContext, memory: RepoMemory): Promise<PatchDraft> {
    const repoContext = [
      `Workspace Path: ${workspace.workspacePath}`,
      `Default Branch: ${workspace.defaultBranch}`,
      `Workspace Dirty: ${workspace.workspaceDirty}`,
      `Candidate Files: ${workspace.candidateFiles.join(', ') || 'none'}`,
      `Detected Test Commands: ${workspace.testCommands.map((item) => item.command).join(', ') || 'none'}`,
      `Runnable Validation Commands: ${workspace.validationCommands.map((item) => item.command).join(', ') || 'none'}`,
      `Validation Safety Notes: ${workspace.validationWarnings.join(' | ') || 'none'}`,
      'Snippets:',
      ...workspace.snippets.map((snippet) => `FILE: ${snippet.path}\n${snippet.content}`),
    ].join('\n\n');

    const repoMemory = [
      `Last Selected Issue: ${memory.lastSelectedIssue || 'n/a'}`,
      `Generated Dossiers: ${memory.generatedDossiers}`,
      `Preferred Paths: ${memory.preferredPaths.join(', ') || 'none'}`,
      `Known Test Commands: ${memory.detectedTestCommands.join(', ') || 'none'}`,
    ].join('\n');

    const prompt = fillPrompt(PATCH_DRAFT_PROMPT, {
      issueContext: this.formatRankedIssue(issue),
      repoContext,
      repoMemory,
    });

    return this.generateStructuredOutput({
      prompt,
      parser: this.parsePatchDraft.bind(this),
    });
  }

  async generateImplementationDraft(
    issue: RankedIssue,
    workspace: RepoWorkspaceContext,
    patchDraft: PatchDraft,
  ): Promise<ImplementationDraft> {
    const editableFiles = workspace.snippets.length > 0
      ? workspace.snippets.map((snippet) => `FILE: ${snippet.path}\n${snippet.content}`).join('\n\n')
      : 'No editable files were detected.';

    const prompt = fillPrompt(CODE_CHANGE_PROMPT, {
      issueContext: this.formatRankedIssue(issue),
      patchDraft: JSON.stringify(patchDraft, null, 2),
      editableFiles,
    });

    return this.generateStructuredOutput({
      prompt,
      parser: this.parseImplementationDraft.bind(this),
      repairPrompt: CODE_CHANGE_REPAIR_PROMPT,
      temperature: 0.1,
    });
  }

  async generatePrDraft(
    issue: RankedIssue,
    patchDraft: PatchDraft,
    workspace: RepoWorkspaceContext,
  ): Promise<PullRequestDraft> {
    const validationContext = [
      `Detected Commands: ${workspace.testCommands.map((item) => item.command).join(', ') || 'none'}`,
      `Runnable Commands: ${workspace.validationCommands.map((item) => item.command).join(', ') || 'none'}`,
      `Baseline Results: ${workspace.testResults.length > 0 ? workspace.testResults.map((result) => `${result.command} => ${result.passed ? 'passed' : `failed (${result.exitCode ?? 'n/a'})`}`).join('; ') : 'not executed'}`,
    ].join('\n');

    const prompt = fillPrompt(PR_DRAFT_PROMPT, {
      issueContext: this.formatRankedIssue(issue),
      patchDraft: JSON.stringify(patchDraft, null, 2),
      validationContext,
    });

    return this.generateStructuredOutput({
      prompt,
      parser: this.parsePullRequestDraft.bind(this),
    });
  }

  async generateImplementationRepairDraft(
    issue: RankedIssue,
    patchDraft: PatchDraft,
    validationResults: TestResult[],
    currentFiles: RepoFileSnippet[],
  ): Promise<ImplementationDraft> {
    const validationFailures = validationResults.length > 0
      ? validationResults
        .filter((result) => !result.passed)
        .map((result) => `${result.command} | exit=${result.exitCode ?? 'n/a'}\n${result.output}`.trim())
        .join('\n\n---\n\n')
      : 'No validation failures were provided.';

    const prompt = fillPrompt(VALIDATION_REPAIR_PROMPT, {
      issueContext: this.formatRankedIssue(issue),
      patchDraft: JSON.stringify(patchDraft, null, 2),
      validationFailures,
      currentFiles: currentFiles.length > 0
        ? currentFiles.map((snippet) => `FILE: ${snippet.path}\n${snippet.content}`).join('\n\n')
        : 'No current files were provided.',
    });

    return this.generateStructuredOutput({
      prompt,
      parser: this.parseImplementationDraft.bind(this),
      repairPrompt: CODE_CHANGE_REPAIR_PROMPT,
      temperature: 0.1,
    });
  }

  private async chat(prompt: string, options: { temperature?: number } = {}): Promise<string> {
    if (!this.client) {
      throw new Error('LLM client not initialized');
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.modelName,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: prompt },
        ],
        temperature: options.temperature ?? 0.7,
      });

      const content = response.choices[0]?.message?.content || '';
      return content;
    } catch (error) {
      logger.debug('LLM chat failed', error);
      throw new Error('The LLM request failed. Please verify your provider, model, and API key.');
    }
  }

  private async generateStructuredOutput<T>(input: {
    prompt: string;
    parser: (content: string) => T;
    repairPrompt?: string;
    temperature?: number;
  }): Promise<T> {
    const content = await this.chat(input.prompt, { temperature: input.temperature });

    try {
      return input.parser(content);
    } catch (error) {
      if (!input.repairPrompt) {
        throw error;
      }

      logger.debug('Structured output parsing failed, attempting repair', error);
      const repairedContent = await this.chat(fillPrompt(input.repairPrompt, {
        invalidResponse: content.slice(0, 12000),
      }), { temperature: 0 });

      return input.parser(repairedContent);
    }
  }

  private parseLLMResponse(content: string, originalIssues: GitHubIssue[]): MatchedIssue[] {
    const matchedIssues: MatchedIssue[] = [];
    const lines = content.split('\n');

    for (const issue of originalIssues) {
      const issueReference = this.getIssueReference(issue);
      const issueLinePattern = new RegExp(`^${this.escapeRegExp(issueReference)}\\b`, 'i');
      const issueLineIndex = lines.findIndex(line => issueLinePattern.test(line.trim()));
      if (issueLineIndex === -1) continue;

      const issueLine = lines[issueLineIndex];
      if (!issueLine) {
        continue;
      }

      const scoreMatch = issueLine.match(/SCORE:\s*(\d+)|Score:\s*(\d+)|#\d+\s+(\d+)/i);
      let score = 0;
      if (scoreMatch) {
        const rawScore = scoreMatch[1] || scoreMatch[2] || scoreMatch[3];
        score = rawScore ? parseInt(rawScore, 10) || 0 : 0;
      }

      score = Math.min(100, Math.max(0, score));

      if (score >= 60) {
        const context = lines.slice(issueLineIndex, issueLineIndex + 5).join('\n');

        const demandMatch = context.match(/Core Demand:\s*([^\n]+)/i);
        const techMatch = context.match(/Tech(?:nology)? Requirements?:\s*([^\n]+)/i);
        const workloadMatch = context.match(/Estimated Workload:\s*([^\n]+)/i);

        matchedIssues.push({
          ...issue,
          matchScore: score,
          analysis: {
            coreDemand: demandMatch && demandMatch[1] ? demandMatch[1].trim() : '',
            techRequirements: techMatch && techMatch[1] ? techMatch[1].split(/[,;]/).map(s => s.trim()).filter(Boolean) : [],
            solutionSuggestion: '',
            estimatedWorkload: workloadMatch && workloadMatch[1] ? workloadMatch[1].trim() : '',
          },
        });
      }
    }

    return matchedIssues.sort((a, b) => b.matchScore - a.matchScore);
  }

  private parseImplementationDraft(content: string): ImplementationDraft {
    return this.parseStructuredJson(content, ImplementationDraftSchema);
  }

  private parsePatchDraft(content: string): PatchDraft {
    return this.parseStructuredJson(content, PatchDraftSchema);
  }

  private parsePullRequestDraft(content: string): PullRequestDraft {
    return this.parseStructuredJson(content, PullRequestDraftSchema);
  }

  private parseStructuredJson<T>(content: string, schema: z.ZodType<T>): T {
    let payload: unknown;

    try {
      payload = JSON.parse(this.extractJsonObject(content));
    } catch {
      throw new Error('LLM did not return a parseable JSON object.');
    }

    const result = schema.safeParse(payload);
    if (result.success) {
      return result.data;
    }

    const issueSummary = result.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; ');

    throw new Error(`LLM output failed schema validation. ${issueSummary}`);
  }

  private extractJsonObject(content: string): string {
    const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return content.slice(firstBrace, lastBrace + 1).trim();
    }

    throw new Error('LLM did not return a valid JSON object for the implementation draft.');
  }

  private getIssueReference(issue: GitHubIssue): string {
    return `${issue.repoFullName}#${issue.number}`;
  }

  private formatRankedIssue(issue: RankedIssue): string {
    return [
      `Issue: ${issue.repoFullName}#${issue.number}`,
      `Title: ${issue.title}`,
      `Body: ${issue.body}`,
      `Core Demand: ${issue.analysis.coreDemand}`,
      `Tech Requirements: ${issue.analysis.techRequirements.join(', ')}`,
      `Estimated Workload: ${issue.analysis.estimatedWorkload}`,
      `Technical Match Score: ${issue.matchScore}`,
      `Opportunity Score: ${issue.opportunity.score}`,
      `Overall Score: ${issue.opportunity.overallScore}`,
      `Opportunity Summary: ${issue.opportunity.summary}`,
    ].join('\n');
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

export const llmService = new LLMService();
