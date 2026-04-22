import { describe, expect, test } from 'bun:test';
import { LLMService } from '../src/services/llm.js';
import type { ImplementationDraft, MatchedIssue } from '../src/types/index.js';
import { createIssue } from './helpers/factories.js';

interface LLMServiceInternals {
  parseImplementationDraft(content: string): ImplementationDraft;
  parsePullRequestDraft(content: string): {
    title: string;
    summary: string;
    changes: string[];
    validation: string[];
    risks: string[];
  };
  parseLLMResponse(content: string, originalIssues: ReturnType<typeof createIssue>[]): MatchedIssue[];
}

describe('LLMService implementation draft parsing', () => {
  test('parses raw JSON responses into file change drafts', () => {
    const service = new LLMService() as unknown as LLMServiceInternals;
    const draft = service.parseImplementationDraft(`
      {
        "summary": "Update the button label",
        "fileChanges": [
          {
            "path": "src/button.tsx",
            "reason": "Add aria-label",
            "content": "export const Button = () => <button aria-label=\\"Open\\" />;"
          }
        ]
      }
    `);

    expect(draft.summary).toBe('Update the button label');
    expect(draft.fileChanges).toHaveLength(1);
    expect(draft.fileChanges[0]?.path).toBe('src/button.tsx');
  });

  test('rejects fenced JSON responses that fail schema validation', () => {
    const service = new LLMService() as unknown as LLMServiceInternals;
    expect(() => service.parseImplementationDraft(`
      \`\`\`json
      {
        "summary": "Mixed output",
        "fileChanges": [
          {
            "path": "src/app.ts",
            "reason": "Valid",
            "content": "console.log('ok');"
          },
          {
            "path": "",
            "reason": "Missing path",
            "content": "ignored"
          }
        ]
      }
      \`\`\`
    `)).toThrow('LLM output failed schema validation.');
  });

  test('parses fenced JSON responses with raw tsx content', () => {
    const service = new LLMService() as unknown as LLMServiceInternals;
    const draft = service.parseImplementationDraft(`
      \`\`\`json
      {
        "summary": "Add aria-label support",
        "fileChanges": [
          {
            "path": "src/components/IconButton.tsx",
            "reason": "Add accessible label handling for icon-only buttons",
            "content": "export function IconButton() {\\n  return <button aria-label=\\"Open menu\\" />;\\n}"
          }
        ]
      }
      \`\`\`
    `);

    expect(draft.summary).toBe('Add aria-label support');
    expect(draft.fileChanges).toHaveLength(1);
    expect(draft.fileChanges[0]?.path).toBe('src/components/IconButton.tsx');
    expect(draft.fileChanges[0]?.content).toContain('aria-label="Open menu"');
  });

  test('deduplicates repeated file changes by path and keeps the latest version', () => {
    const service = new LLMService() as unknown as LLMServiceInternals;
    const draft = service.parseImplementationDraft(`
      {
        "summary": "Repeated output",
        "fileChanges": [
          {
            "path": "src/button.tsx",
            "reason": "First attempt",
            "content": "export const Button = () => null;"
          },
          {
            "path": "src/button.tsx",
            "reason": "Final attempt",
            "content": "export const Button = () => <button />;"
          }
        ]
      }
    `);

    expect(draft.fileChanges).toHaveLength(1);
    expect(draft.fileChanges[0]?.reason).toBe('Final attempt');
    expect(draft.fileChanges[0]?.content).toContain('<button />');
  });

  test('throws when implementation output is not parseable', () => {
    const service = new LLMService() as unknown as LLMServiceInternals;
    expect(() => service.parseImplementationDraft('unstructured output')).toThrow(
      'LLM did not return a parseable JSON object.',
    );
  });
});

describe('LLMService issue scoring response parsing', () => {
  test('parses matched issues, clamps scores, and sorts by score descending', () => {
    const service = new LLMService() as unknown as LLMServiceInternals;
    const issues = [
      createIssue({ repoFullName: 'acme/demo', repoName: 'demo', number: 42 }),
      createIssue({ repoFullName: 'acme/web', repoName: 'web', number: 7, title: 'Improve docs' }),
      createIssue({ repoFullName: 'acme/ignored', repoName: 'ignored', number: 11 }),
    ];

    const parsed = service.parseLLMResponse([
      'acme/demo#42 [SCORE: 120]',
      'Core Demand: Add accessible labels',
      'Tech Requirements: react, typescript; accessibility',
      'Estimated Workload: 1-2 hours',
      '',
      'acme/web#7 [SCORE: 61]',
      'Core Demand: Improve documentation clarity',
      'Technology Requirements: markdown, docs',
      'Estimated Workload: 30 minutes',
      '',
      'acme/ignored#11 [SCORE: 40]',
      'Core Demand: Ignore this issue',
      'Tech Requirements: none',
      'Estimated Workload: 1 hour',
    ].join('\n'), issues);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.repoFullName).toBe('acme/demo');
    expect(parsed[0]?.matchScore).toBe(100);
    expect(parsed[0]?.analysis.techRequirements).toEqual(['react', 'typescript', 'accessibility']);
    expect(parsed[1]?.repoFullName).toBe('acme/web');
    expect(parsed[1]?.analysis.estimatedWorkload).toBe('30 minutes');
  });
});

describe('LLMService pull request draft parsing', () => {
  test('parses structured pull request drafts', () => {
    const service = new LLMService() as unknown as LLMServiceInternals;
    const draft = service.parsePullRequestDraft(`
      {
        "title": "Add aria-label handling to icon-only buttons",
        "summary": "Ensure icon-only buttons expose accessible names.",
        "changes": ["Update the shared IconButton component"],
        "validation": ["bun test (pending)"],
        "risks": ["Snapshot updates may be required"]
      }
    `);

    expect(draft.title).toBe('Add aria-label handling to icon-only buttons');
    expect(draft.changes).toEqual(['Update the shared IconButton component']);
  });
});
