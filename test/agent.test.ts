import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { AgentOrchestrator } from '../src/orchestration/agent.js';
import { llmService, workspaceService } from '../src/services/index.js';
import {
  createIssue,
  createMatchedIssue,
  createPatchDraft,
  createPullRequestDraft,
  createRankedIssue,
  createWorkspace,
} from './helpers/factories.js';

interface AgentInternals {
  buildDraftPullRequest(prDraft: ReturnType<typeof createPullRequestDraft>): {
    title: string;
    body: string;
  };
  selectIssueForAutomation(
    issues: Array<ReturnType<typeof createRankedIssue>>,
    minOverallScore: number,
  ): ReturnType<typeof createRankedIssue> | undefined;
  diversifyScoutIssues(
    issues: Array<ReturnType<typeof createRankedIssue>>,
    limit: number,
  ): Array<ReturnType<typeof createRankedIssue>>;
  rankIssuesForProfile(
    issues: Array<ReturnType<typeof createIssue>>,
    userProfile: {
      techStack: string[];
      proficiency: 'beginner' | 'intermediate' | 'advanced';
      focusAreas: string[];
    },
  ): Array<ReturnType<typeof createIssue>>;
  scoreIssuesInBatches(
    userProfile: {
      techStack: string[];
      proficiency: 'beginner' | 'intermediate' | 'advanced';
      focusAreas: string[];
    },
    issues: Array<ReturnType<typeof createIssue>>,
  ): Promise<Array<ReturnType<typeof createMatchedIssue>>>;
  buildLocalIssueMatches(
    issues: Array<ReturnType<typeof createIssue>>,
    userProfile: {
      techStack: string[];
      proficiency: 'beginner' | 'intermediate' | 'advanced';
      focusAreas: string[];
    },
  ): Array<ReturnType<typeof createMatchedIssue>>;
  buildImplementationWorkspace(
    workspace: ReturnType<typeof createWorkspace>,
    patchDraft: ReturnType<typeof createPatchDraft>,
  ): ReturnType<typeof createWorkspace>;
  formatValidationSummary(results: Array<{
    command: string;
    exitCode: number | null;
    passed: boolean;
    output: string;
  }>): string;
  hasBlockingValidationFailures(results: Array<{
    command: string;
    exitCode: number | null;
    passed: boolean;
    output: string;
  }>): boolean;
  generateConcretePatch(
    issue: ReturnType<typeof createRankedIssue>,
    workspace: ReturnType<typeof createWorkspace>,
    patchDraft: ReturnType<typeof createPatchDraft>,
    runChecks: boolean,
    draftOnly?: boolean,
  ): Promise<{
    changedFiles: string[];
    validationResults: Array<{
      command: string;
      exitCode: number | null;
      passed: boolean;
      output: string;
    }>;
    reviewRequired: boolean;
  }>;
}

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('AgentOrchestrator draft PR parsing', () => {
  test('builds a real pull request payload from the structured draft', () => {
    const orchestrator = new AgentOrchestrator() as unknown as AgentInternals;
    const parsed = orchestrator.buildDraftPullRequest(createPullRequestDraft());

    expect(parsed.title).toBe('Add aria-label handling to icon-only buttons');
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

  test('selects the first issue that meets the automation threshold', () => {
    const orchestrator = new AgentOrchestrator() as unknown as AgentInternals;
    const issues = [
      createRankedIssue({ opportunity: { ...createRankedIssue().opportunity, overallScore: 68 } }),
      createRankedIssue({ repoFullName: 'acme/high', repoName: 'high', number: 77, opportunity: { ...createRankedIssue().opportunity, overallScore: 81 } }),
    ];

    const selected = orchestrator.selectIssueForAutomation(issues, 70);
    expect(selected?.repoFullName).toBe('acme/high');
  });

  test('diversifies scout display across repositories before filling repeats', () => {
    const orchestrator = new AgentOrchestrator() as unknown as AgentInternals;
    const issues = [
      createRankedIssue({ repoFullName: 'acme/a', repoName: 'a', number: 1 }),
      createRankedIssue({ repoFullName: 'acme/a', repoName: 'a', number: 2 }),
      createRankedIssue({ repoFullName: 'acme/b', repoName: 'b', number: 3 }),
      createRankedIssue({ repoFullName: 'acme/c', repoName: 'c', number: 4 }),
    ];

    const visible = orchestrator.diversifyScoutIssues(issues, 3);

    expect(visible.map((issue) => `${issue.repoFullName}#${issue.number}`)).toEqual([
      'acme/a#1',
      'acme/b#3',
      'acme/c#4',
    ]);
  });

  test('pre-ranks issue discovery candidates against the saved profile', () => {
    const orchestrator = new AgentOrchestrator() as unknown as AgentInternals;
    const ranked = orchestrator.rankIssuesForProfile([
      createIssue({
        repoFullName: 'acme/python-tool',
        repoName: 'python-tool',
        number: 1,
        title: 'Add pytest coverage for serializers',
        body: 'Fresh issue with unrelated Python testing work.',
        repoDescription: 'Python API utilities',
        updatedAt: new Date().toISOString(),
      }),
      createIssue({
        repoFullName: 'acme/react-ui',
        repoName: 'react-ui',
        number: 2,
        title: 'Fix React keyboard focus in dropdown',
        body: 'The issue is in `src/components/Dropdown.tsx`. Steps to reproduce: tab into the menu. Expected focus moves to the first item.',
        repoDescription: 'Accessible TypeScript React components',
        updatedAt: '2026-03-01T08:00:00.000Z',
      }),
    ], {
      techStack: ['TypeScript', 'React'],
      proficiency: 'intermediate',
      focusAreas: ['web-dev'],
    });

    expect(ranked[0]?.repoFullName).toBe('acme/react-ui');
  });

  test('scores all candidate batches instead of stopping after the first matching batch', async () => {
    const originalScoreIssues = llmService.scoreIssues;
    const batches: number[][] = [];
    const issues = Array.from({ length: 25 }, (_, index) => createIssue({
      id: index + 1,
      number: index + 1,
      repoFullName: `acme/repo-${index + 1}`,
      repoName: `repo-${index + 1}`,
      title: `React issue ${index + 1}`,
    }));

    try {
      llmService.scoreIssues = async (_profile, batch) => {
        batches.push(batch.map((issue) => issue.number));
        return {
          version: '1',
          kind: 'issue_match_list',
          status: 'success',
          data: batch.map((issue) => createMatchedIssue({
            ...issue,
            matchScore: 72,
          })),
        };
      };

      const orchestrator = new AgentOrchestrator() as unknown as AgentInternals;
      const matches = await orchestrator.scoreIssuesInBatches({
        techStack: ['React'],
        proficiency: 'intermediate',
        focusAreas: ['web-dev'],
      }, issues);

      expect(batches).toHaveLength(2);
      expect(matches).toHaveLength(25);
    } finally {
      llmService.scoreIssues = originalScoreIssues;
    }
  });

  test('builds local heuristic issue matches without LLM scoring', () => {
    const orchestrator = new AgentOrchestrator() as unknown as AgentInternals;
    const matches = orchestrator.buildLocalIssueMatches([
      createIssue({
        repoFullName: 'acme/react-ui',
        repoName: 'react-ui',
        number: 12,
        title: 'Fix React focus trap in menu',
        body: 'The bug is in `src/Menu.tsx`. Steps to reproduce: tab through the menu. Expected focus stays inside.',
        labels: ['good first issue', 'accessibility'],
        repoDescription: 'TypeScript React component library',
        repoStars: 420,
      }),
    ], {
      techStack: ['TypeScript', 'React'],
      proficiency: 'intermediate',
      focusAreas: ['web-dev'],
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.matchScore).toBeGreaterThan(60);
    expect(matches[0]?.analysis.techRequirements).toContain('TypeScript');
    expect(matches[0]?.analysis.techRequirements).toContain('React');
    expect(matches[0]?.analysis.estimatedWorkload).toBe('1-3 hours');
    expect(matches[0]?.analysis.solutionSuggestion).toContain('Local scout mode');
  });

  test('loads patch draft target files into implementation context', () => {
    const workspacePath = mkdtempSync(join(tmpdir(), 'openmeta-agent-context-'));
    tempDirs.push(workspacePath);
    mkdirSync(join(workspacePath, 'src', 'components'), { recursive: true });
    writeFileSync(join(workspacePath, 'src', 'components', 'IconButton.tsx'), 'export function IconButton() { return null; }\n', 'utf-8');
    writeFileSync(join(workspacePath, 'src', 'components', 'IconButton.test.tsx'), 'test("icon button", () => {});\n', 'utf-8');

    const orchestrator = new AgentOrchestrator() as unknown as AgentInternals;
    const workspace = orchestrator.buildImplementationWorkspace(
      createWorkspace({
        workspacePath,
        candidateFiles: ['src/components/IconButton.tsx'],
        snippets: [
          {
            path: 'src/components/IconButton.tsx',
            content: 'export function IconButton() { return null; }\n',
          },
        ],
      }),
      createPatchDraft({
        targetFiles: [
          {
            path: 'src/components/IconButton.tsx',
            reason: 'Primary component',
          },
          {
            path: 'src/components/IconButton.test.tsx',
            reason: 'Coverage for the updated behavior',
          },
          {
            path: '../outside.ts',
            reason: 'Unsafe path that must not enter context',
          },
        ],
        proposedChanges: [
          {
            title: 'Update tests',
            details: 'Cover the accessibility behavior.',
            files: ['src/components/IconButton.test.tsx'],
          },
        ],
      }),
    );

    expect(workspace.candidateFiles).toContain('src/components/IconButton.test.tsx');
    expect(workspace.candidateFiles).not.toContain('../outside.ts');
    expect(workspace.snippets.map((snippet) => snippet.path)).toEqual([
      'src/components/IconButton.tsx',
      'src/components/IconButton.test.tsx',
    ]);
  });

  test('treats infrastructure validation failures as non-blocking', () => {
    const orchestrator = new AgentOrchestrator() as unknown as AgentInternals;

    expect(orchestrator.hasBlockingValidationFailures([
      {
        command: 'npm run lint',
        exitCode: 127,
        passed: false,
        output: 'command not found',
      },
    ])).toBe(false);

    expect(orchestrator.hasBlockingValidationFailures([
      {
        command: 'pytest',
        exitCode: 1,
        passed: false,
        output: 'AssertionError',
      },
    ])).toBe(true);
  });

  test('attempts a single validation repair pass after blocking failures', async () => {
    const workspacePath = mkdtempSync(join(tmpdir(), 'openmeta-agent-'));
    tempDirs.push(workspacePath);
    mkdirSync(join(workspacePath, 'src'), { recursive: true });
    writeFileSync(join(workspacePath, 'src', 'app.ts'), 'export const version = 0;\n', 'utf-8');

    const originalGenerateImplementationDraft = llmService.generateImplementationDraft;
    const originalGenerateImplementationRepairDraft = llmService.generateImplementationRepairDraft;
    const originalRunValidationCommands = workspaceService.runValidationCommands;

    let validationRuns = 0;

    try {
      llmService.generateImplementationDraft = async () => ({
        version: '1',
        kind: 'implementation_draft',
        status: 'success',
        data: {
          summary: 'Initial patch',
          fileChanges: [
            {
              path: 'src/app.ts',
              reason: 'Apply the initial implementation',
              content: 'export const version = 1;\n',
            },
          ],
        },
      });

      llmService.generateImplementationRepairDraft = async () => ({
        version: '1',
        kind: 'implementation_draft',
        status: 'success',
        data: {
          summary: 'Repair patch',
          fileChanges: [
            {
              path: 'src/app.ts',
              reason: 'Fix the failing validation path',
              content: 'export const version = 2;\n',
            },
          ],
        },
      });

      workspaceService.runValidationCommands = () => {
        validationRuns += 1;
        return validationRuns === 1
          ? [{ command: 'pytest', exitCode: 1, passed: false, output: 'AssertionError: expected version 2' }]
          : [{ command: 'pytest', exitCode: 0, passed: true, output: '1 passed' }];
      };

      const orchestrator = new AgentOrchestrator() as unknown as AgentInternals;
      const result = await orchestrator.generateConcretePatch(
        createRankedIssue(),
        createWorkspace({
          workspacePath,
          snippets: [{ path: 'src/app.ts', content: 'export const version = 0;\n' }],
          testCommands: [{ command: 'pytest', reason: 'Detected pyproject.toml', source: 'tool-default' }],
          validationCommands: [{ command: 'pytest', reason: 'Detected pyproject.toml', source: 'tool-default' }],
          validationWarnings: [],
          testResults: [],
        }),
        createPatchDraft(),
        true,
      );

      expect(validationRuns).toBe(2);
      expect(result.changedFiles).toEqual(['src/app.ts']);
      expect(result.validationResults[0]?.passed).toBe(true);
      expect(result.reviewRequired).toBe(false);
      expect(readFileSync(join(workspacePath, 'src', 'app.ts'), 'utf-8')).toBe('export const version = 2;\n');
    } finally {
      llmService.generateImplementationDraft = originalGenerateImplementationDraft;
      llmService.generateImplementationRepairDraft = originalGenerateImplementationRepairDraft;
      workspaceService.runValidationCommands = originalRunValidationCommands;
    }
  });

  test('skips generated file edits when the implementation draft requires review', async () => {
    const workspacePath = mkdtempSync(join(tmpdir(), 'openmeta-agent-review-'));
    tempDirs.push(workspacePath);
    mkdirSync(join(workspacePath, 'src'), { recursive: true });
    writeFileSync(join(workspacePath, 'src', 'app.ts'), 'export const version = 0;\n', 'utf-8');

    const originalGenerateImplementationDraft = llmService.generateImplementationDraft;

    try {
      llmService.generateImplementationDraft = async () => ({
        version: '1',
        kind: 'implementation_draft',
        status: 'needs_review',
        data: {
          summary: 'The generated implementation needs manual review.',
          fileChanges: [
            {
              path: 'src/app.ts',
              reason: 'Candidate implementation that should not be auto-applied',
              content: 'export const version = 1;\n',
            },
          ],
        },
      });

      const orchestrator = new AgentOrchestrator() as unknown as AgentInternals;
      const result = await orchestrator.generateConcretePatch(
        createRankedIssue(),
        createWorkspace({
          workspacePath,
          snippets: [{ path: 'src/app.ts', content: 'export const version = 0;\n' }],
          testCommands: [],
          validationCommands: [],
          validationWarnings: [],
          testResults: [],
        }),
        createPatchDraft(),
        true,
      );

      expect(result.changedFiles).toEqual([]);
      expect(result.reviewRequired).toBe(true);
      expect(readFileSync(join(workspacePath, 'src', 'app.ts'), 'utf-8')).toBe('export const version = 0;\n');
    } finally {
      llmService.generateImplementationDraft = originalGenerateImplementationDraft;
    }
  });

  test('skips generated file edits in draft-only mode', async () => {
    const workspacePath = mkdtempSync(join(tmpdir(), 'openmeta-agent-draft-only-'));
    tempDirs.push(workspacePath);
    mkdirSync(join(workspacePath, 'src'), { recursive: true });
    writeFileSync(join(workspacePath, 'src', 'app.ts'), 'export const version = 0;\n', 'utf-8');

    const originalGenerateImplementationDraft = llmService.generateImplementationDraft;
    let implementationRequested = false;

    try {
      llmService.generateImplementationDraft = async () => {
        implementationRequested = true;
        return {
          version: '1',
          kind: 'implementation_draft',
          status: 'success',
          data: {
            summary: 'Patch that should not be requested',
            fileChanges: [
              {
                path: 'src/app.ts',
                reason: 'Draft-only mode should skip this edit',
                content: 'export const version = 1;\n',
              },
            ],
          },
        };
      };

      const orchestrator = new AgentOrchestrator() as unknown as AgentInternals;
      const result = await orchestrator.generateConcretePatch(
        createRankedIssue(),
        createWorkspace({
          workspacePath,
          snippets: [{ path: 'src/app.ts', content: 'export const version = 0;\n' }],
          testCommands: [],
          validationCommands: [],
          validationWarnings: [],
          testResults: [],
        }),
        createPatchDraft(),
        true,
        true,
      );

      expect(implementationRequested).toBe(false);
      expect(result.changedFiles).toEqual([]);
      expect(result.reviewRequired).toBe(false);
      expect(readFileSync(join(workspacePath, 'src', 'app.ts'), 'utf-8')).toBe('export const version = 0;\n');
    } finally {
      llmService.generateImplementationDraft = originalGenerateImplementationDraft;
    }
  });

  test('skips generated file edits when the workspace is already dirty', async () => {
    const workspacePath = mkdtempSync(join(tmpdir(), 'openmeta-agent-dirty-'));
    tempDirs.push(workspacePath);
    mkdirSync(join(workspacePath, 'src'), { recursive: true });
    writeFileSync(join(workspacePath, 'src', 'app.ts'), 'export const version = 0;\n', 'utf-8');

    const originalGenerateImplementationDraft = llmService.generateImplementationDraft;
    let implementationRequested = false;

    try {
      llmService.generateImplementationDraft = async () => {
        implementationRequested = true;
        return {
          version: '1',
          kind: 'implementation_draft',
          status: 'success',
          data: {
            summary: 'Patch that should not be requested',
            fileChanges: [
              {
                path: 'src/app.ts',
                reason: 'Dirty workspaces should be protected',
                content: 'export const version = 1;\n',
              },
            ],
          },
        };
      };

      const orchestrator = new AgentOrchestrator() as unknown as AgentInternals;
      const result = await orchestrator.generateConcretePatch(
        createRankedIssue(),
        createWorkspace({
          workspacePath,
          workspaceDirty: true,
          snippets: [{ path: 'src/app.ts', content: 'export const version = 0;\n' }],
          testCommands: [],
          validationCommands: [],
          validationWarnings: [],
          testResults: [],
        }),
        createPatchDraft(),
        true,
      );

      expect(implementationRequested).toBe(false);
      expect(result.changedFiles).toEqual([]);
      expect(result.reviewRequired).toBe(true);
      expect(readFileSync(join(workspacePath, 'src', 'app.ts'), 'utf-8')).toBe('export const version = 0;\n');
    } finally {
      llmService.generateImplementationDraft = originalGenerateImplementationDraft;
    }
  });

  test('marks the run as review-required when validation repair needs manual review', async () => {
    const workspacePath = mkdtempSync(join(tmpdir(), 'openmeta-agent-repair-review-'));
    tempDirs.push(workspacePath);
    mkdirSync(join(workspacePath, 'src'), { recursive: true });
    writeFileSync(join(workspacePath, 'src', 'app.ts'), 'export const version = 0;\n', 'utf-8');

    const originalGenerateImplementationDraft = llmService.generateImplementationDraft;
    const originalGenerateImplementationRepairDraft = llmService.generateImplementationRepairDraft;
    const originalRunValidationCommands = workspaceService.runValidationCommands;

    let validationRuns = 0;

    try {
      llmService.generateImplementationDraft = async () => ({
        version: '1',
        kind: 'implementation_draft',
        status: 'success',
        data: {
          summary: 'Initial patch',
          fileChanges: [
            {
              path: 'src/app.ts',
              reason: 'Apply the initial implementation',
              content: 'export const version = 1;\n',
            },
          ],
        },
      });

      llmService.generateImplementationRepairDraft = async () => ({
        version: '1',
        kind: 'implementation_draft',
        status: 'needs_review',
        data: {
          summary: 'The repair requires manual inspection.',
          fileChanges: [
            {
              path: 'src/app.ts',
              reason: 'Candidate repair that should not be auto-applied',
              content: 'export const version = 2;\n',
            },
          ],
        },
      });

      workspaceService.runValidationCommands = () => {
        validationRuns += 1;
        return [{ command: 'pytest', exitCode: 1, passed: false, output: 'AssertionError: expected version 2' }];
      };

      const orchestrator = new AgentOrchestrator() as unknown as AgentInternals;
      const result = await orchestrator.generateConcretePatch(
        createRankedIssue(),
        createWorkspace({
          workspacePath,
          snippets: [{ path: 'src/app.ts', content: 'export const version = 0;\n' }],
          testCommands: [{ command: 'pytest', reason: 'Detected pyproject.toml', source: 'tool-default' }],
          validationCommands: [{ command: 'pytest', reason: 'Detected pyproject.toml', source: 'tool-default' }],
          validationWarnings: [],
          testResults: [],
        }),
        createPatchDraft(),
        true,
      );

      expect(validationRuns).toBe(1);
      expect(result.changedFiles).toEqual(['src/app.ts']);
      expect(result.validationResults[0]?.passed).toBe(false);
      expect(result.reviewRequired).toBe(true);
      expect(readFileSync(join(workspacePath, 'src', 'app.ts'), 'utf-8')).toBe('export const version = 1;\n');
    } finally {
      llmService.generateImplementationDraft = originalGenerateImplementationDraft;
      llmService.generateImplementationRepairDraft = originalGenerateImplementationRepairDraft;
      workspaceService.runValidationCommands = originalRunValidationCommands;
    }
  });
});
