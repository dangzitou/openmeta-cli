import OpenAI from 'openai';
import type { GitHubIssue, MatchedIssue, UserProfile, LLMProvider } from '../types/index.js';
import { logger } from '../infra/logger.js';
import { fillPrompt, ISSUE_MATCH_PROMPT, DAILY_REPORT_GENERATE_PROMPT, DAILY_DIARY_GENERATE_PROMPT } from '../infra/prompt-templates.js';

export class LLMService {
  private client: OpenAI | null = null;
  private provider: LLMProvider = 'openai';
  private apiKey: string = '';
  private apiBaseUrl: string = '';

  initialize(apiKey: string, baseUrl: string, provider: LLMProvider = 'openai', _modelName?: string): void {
    this.apiKey = apiKey;
    this.apiBaseUrl = baseUrl;
    this.provider = provider;

    if (provider === 'openai') {
      this.client = new OpenAI({
        apiKey,
        baseURL: baseUrl,
      });
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      if (this.provider === 'minimax') {
        return await this.validateMiniMax();
      } else {
        if (!this.client) {
          throw new Error('OpenAI client not initialized');
        }
        await this.client.models.list();
        logger.success('LLM API connection validated');
        return true;
      }
    } catch (error) {
      logger.error('LLM API connection failed:', error);
      return false;
    }
  }

  private async validateMiniMax(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/v1/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });
      if (response.ok) {
        logger.success('LLM API connection validated');
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async scoreIssues(userProfile: UserProfile, issues: GitHubIssue[]): Promise<MatchedIssue[]> {
    const issueList = issues.map(i =>
      `Issue #${i.number} in ${i.repoFullName}
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

    const matchedIssues = this.parseLLMResponse(content, issues);
    return matchedIssues.slice(0, 3);
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

  private async chat(prompt: string, model?: string): Promise<string> {
    if (this.provider === 'minimax') {
      return await this.chatMiniMax(prompt, model);
    } else {
      return await this.chatOpenAI(prompt, model);
    }
  }

  private async chatOpenAI(prompt: string, model?: string): Promise<string> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    try {
      const response = await this.client.chat.completions.create({
        model: model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      });

      const content = response.choices[0]?.message?.content || '';
      logger.debug('LLM response:', content);
      return content;
    } catch (error) {
      logger.error('OpenAI chat failed:', error);
      throw error;
    }
  }

  private async chatMiniMax(prompt: string, model?: string): Promise<string> {
    const modelName = model || 'MiniMax-Text-01';

    try {
      const response = await fetch(`${this.apiBaseUrl}/v1/text/chatcompletion_v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MiniMax API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as {
        choices?: Array<{ messages?: Array<{ content?: string }> }>;
        text?: string;
      };

      // MiniMax response format varies, try different paths
      const content = data.choices?.[0]?.messages?.[0]?.content || data.text || '';
      logger.debug('MiniMax response:', content);
      return content;
    } catch (error) {
      logger.error('MiniMax chat failed:', error);
      throw error;
    }
  }

  private parseLLMResponse(content: string, originalIssues: GitHubIssue[]): MatchedIssue[] {
    const matchedIssues: MatchedIssue[] = [];

    for (const issue of originalIssues) {
      const scoreMatch = content.match(new RegExp(`#${issue.number}[^\\d]*(\\d+)`, 'i'));
      const score = scoreMatch && scoreMatch[1] ? parseInt(scoreMatch[1], 10) : 0;

      if (score >= 60) {
        const sectionMatch = content.match(
          new RegExp(`#${issue.number}[\\s\\S]*?(?=#\\d|$$)`, 'i')
        );
        const section = sectionMatch ? sectionMatch[0] : '';

        const demandMatch = section.match(/core demand:[:\s]*([\\s\\S]*?)(?=tech requirements|$)/i);
        const techMatch = section.match(/tech requirements:[:\s]*([\\s\\S]*?)(?=solution hints|estimated workload|$)/i);
        const solutionMatch = section.match(/solution hints?:[:\s]*([\\s\\S]*?)(?=estimated workload|$)/i);
        const workloadMatch = section.match(/estimated workload:[:\s]*([\\s\\S]*?)(?=##|$)/i);

        matchedIssues.push({
          ...issue,
          matchScore: score,
          analysis: {
            coreDemand: demandMatch && demandMatch[1] ? demandMatch[1].trim() : '',
            techRequirements: techMatch && techMatch[1] ? techMatch[1].split(/[,\n]/).map(s => s.trim()).filter(Boolean) : [],
            solutionSuggestion: solutionMatch && solutionMatch[1] ? solutionMatch[1].trim() : '',
            estimatedWorkload: workloadMatch && workloadMatch[1] ? workloadMatch[1].trim() : '',
          },
        });
      }
    }

    return matchedIssues.sort((a, b) => b.matchScore - a.matchScore);
  }
}

export const llmService = new LLMService();
