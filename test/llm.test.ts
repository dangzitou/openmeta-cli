import { describe, expect, test } from 'bun:test';
import { LLMService } from '../src/services/llm.js';
import type { ImplementationDraft } from '../src/types/index.js';

interface LLMServiceInternals {
  parseImplementationDraft(content: string): ImplementationDraft;
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

  test('parses fenced JSON responses and drops invalid file entries', () => {
    const service = new LLMService() as unknown as LLMServiceInternals;
    const draft = service.parseImplementationDraft(`
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
    `);

    expect(draft.fileChanges).toHaveLength(1);
    expect(draft.fileChanges[0]?.reason).toBe('Valid');
  });

  test('parses file block responses with raw tsx content', () => {
    const service = new LLMService() as unknown as LLMServiceInternals;
    const draft = service.parseImplementationDraft(`
      SUMMARY: Add aria-label support
      FILE: src/components/IconButton.tsx
      REASON: Add accessible label handling for icon-only buttons
      \`\`\`tsx
      export function IconButton() {
        return <button aria-label="Open menu" />;
      }
      \`\`\`
      END_FILE
    `);

    expect(draft.summary).toBe('Add aria-label support');
    expect(draft.fileChanges).toHaveLength(1);
    expect(draft.fileChanges[0]?.path).toBe('src/components/IconButton.tsx');
    expect(draft.fileChanges[0]?.content).toContain('aria-label="Open menu"');
  });
});
