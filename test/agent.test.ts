import { describe, expect, test } from 'bun:test';
import { AgentOrchestrator } from '../src/orchestration/agent.js';
import { createRankedIssue } from './helpers/factories.js';

interface AgentInternals {
  parseDraftPullRequest(prDraft: string, issue: ReturnType<typeof createRankedIssue>): {
    title: string;
    body: string;
  };
  formatValidationSummary(results: Array<{
    command: string;
    exitCode: number | null;
    passed: boolean;
    output: string;
  }>): string;
}

describe('AgentOrchestrator draft PR parsing', () => {
  test('extracts the title from the explicit Title line', () => {
    const orchestrator = new AgentOrchestrator() as unknown as AgentInternals;
    const parsed = orchestrator.parseDraftPullRequest([
      'Title: Add aria-label attributes to icon-only buttons',
      '',
      '## Summary',
      'Add accessible labels across key UI buttons.',
    ].join('\n'), createRankedIssue());

    expect(parsed.title).toBe('Add aria-label attributes to icon-only buttons');
    expect(parsed.body).toContain('## Summary');
    expect(parsed.body).not.toContain('Title:');
  });

  test('marks exit code 127 validations as unavailable instead of failed', () => {
    const orchestrator = new AgentOrchestrator() as unknown as AgentInternals;
    const summary = orchestrator.formatValidationSummary([
      {
        command: 'npm run lint',
        exitCode: 127,
        passed: false,
        output: 'sh: npm: command not found',
      },
    ]);

    expect(summary).toBe('npm run lint=unavailable (127)');
  });
});
