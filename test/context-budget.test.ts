import { describe, expect, test } from 'bun:test';
import { contextBudgetService } from '../src/services/context-budget.js';

describe('contextBudgetService', () => {
  test('keeps snippets unchanged when they fit within the budget', () => {
    const result = contextBudgetService.applySnippetBudget([
      { path: 'src/a.ts', content: 'export const a = true;\n' },
      { path: 'src/b.ts', content: 'export const b = true;\n' },
    ], {
      maxTokens: 1000,
      reservedTokens: 0,
    });

    expect(result.compressed).toBe(false);
    expect(result.snippets.map((snippet) => snippet.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(result.snippets.every((snippet) => snippet.estimatedTokens && snippet.estimatedTokens > 0)).toBe(true);
  });

  test('prioritizes important files when compression is required', () => {
    const largeFiller = Array.from({ length: 400 }, (_, index) => `const filler${index} = ${index};`).join('\n');
    const important = [
      'import { filterOrders } from "./filters";',
      'export function OrderListTable() {',
      '  return filterOrders("fulfillment_status");',
      '}',
      largeFiller,
    ].join('\n');

    const result = contextBudgetService.applySnippetBudget([
      { path: 'docs/notes.md', content: largeFiller.repeat(10) },
      { path: 'packages/admin/orders/order-list-table.tsx', content: important.repeat(8) },
      { path: 'src/misc.ts', content: largeFiller.repeat(10) },
    ], {
      maxTokens: 900,
      reservedTokens: 0,
      priorityPaths: ['packages/admin/orders/order-list-table.tsx'],
      keywords: ['fulfillment', 'orders'],
    });

    expect(result.estimatedTokens).toBeLessThanOrEqual(900);
    expect(result.snippets[0]?.path).toBe('packages/admin/orders/order-list-table.tsx');
    expect(result.snippets[0]?.compressed).toBe(true);
    expect(result.snippets[0]?.content).toContain('OpenMeta compressed snippet');
    expect(result.snippets[0]?.content).toContain('filterOrders');
  });

  test('compression keeps structural lines and keyword windows', () => {
    const content = [
      'import { z } from "zod";',
      'const unrelated = 1;',
      ...Array.from({ length: 120 }, (_, index) => `const filler${index} = ${index};`),
      'export function buildPaymentStatusFilter() {',
      '  return "payment_status";',
      '}',
      ...Array.from({ length: 120 }, (_, index) => `const tail${index} = ${index};`),
    ].join('\n');

    const result = contextBudgetService.applySnippetBudget([
      { path: 'src/orders/query-config.ts', content },
    ], {
      maxTokens: 450,
      reservedTokens: 0,
      priorityPaths: ['src/orders/query-config.ts'],
      keywords: ['payment_status'],
    });

    expect(result.compressed).toBe(true);
    expect(result.estimatedTokens).toBeLessThanOrEqual(450);
    expect(result.snippets[0]?.content).toContain('import { z }');
    expect(result.snippets[0]?.content).toContain('buildPaymentStatusFilter');
    expect(result.snippets[0]?.content).toContain('payment_status');
  });
});
