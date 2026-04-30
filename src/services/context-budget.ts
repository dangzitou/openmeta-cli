import { basename } from 'path';
import type { RepoFileSnippet } from '../types/index.js';

const DEFAULT_MAX_CONTEXT_TOKENS = 200_000;
const DEFAULT_RESERVED_TOKENS = 8_000;
const APPROX_CHARS_PER_TOKEN = 4;
const COMPRESSED_FILE_CHAR_LIMIT = 1_200;

export interface ContextBudgetOptions {
  maxTokens?: number;
  reservedTokens?: number;
  priorityPaths?: string[];
  keywords?: string[];
}

export interface ContextBudgetResult {
  snippets: RepoFileSnippet[];
  estimatedTokens: number;
  compressed: boolean;
}

export class ContextBudgetService {
  applySnippetBudget(
    snippets: RepoFileSnippet[],
    options: ContextBudgetOptions = {},
  ): ContextBudgetResult {
    const maxTokens = options.maxTokens ?? DEFAULT_MAX_CONTEXT_TOKENS;
    const reservedTokens = options.reservedTokens ?? DEFAULT_RESERVED_TOKENS;
    const budget = Math.max(0, maxTokens - reservedTokens);
    const priorityPaths = new Set((options.priorityPaths ?? []).map((path) => this.normalizePath(path)));
    const keywords = this.normalizeKeywords(options.keywords ?? []);
    const totalTokens = this.estimateSnippetTokens(snippets);

    if (totalTokens <= budget) {
      return {
        snippets: snippets.map((snippet) => this.withTokenEstimate(snippet)),
        estimatedTokens: totalTokens,
        compressed: false,
      };
    }

    let usedTokens = 0;
    let compressed = false;
    const selected: RepoFileSnippet[] = [];

    for (const snippet of [...snippets].sort((left, right) =>
      this.scoreSnippet(right, priorityPaths, keywords) - this.scoreSnippet(left, priorityPaths, keywords)
    )) {
      const full = this.withTokenEstimate(snippet);
      if (usedTokens + (full.estimatedTokens ?? 0) <= budget) {
        selected.push(full);
        usedTokens += full.estimatedTokens ?? 0;
        continue;
      }

      const compact = this.compressSnippet(snippet, keywords);
      const compactTokens = compact.estimatedTokens ?? 0;
      if (compactTokens > 0 && usedTokens + compactTokens <= budget) {
        selected.push(compact);
        usedTokens += compactTokens;
        compressed = true;
      }
    }

    return {
      snippets: selected,
      estimatedTokens: usedTokens,
      compressed,
    };
  }

  estimateTokens(content: string): number {
    return Math.ceil(content.length / APPROX_CHARS_PER_TOKEN);
  }

  private estimateSnippetTokens(snippets: RepoFileSnippet[]): number {
    return snippets.reduce((total, snippet) => total + this.estimateTokens(snippet.content), 0);
  }

  private withTokenEstimate(snippet: RepoFileSnippet): RepoFileSnippet {
    return {
      ...snippet,
      compressed: snippet.compressed ?? false,
      originalChars: snippet.originalChars ?? snippet.content.length,
      estimatedTokens: this.estimateTokens(snippet.content),
    };
  }

  private compressSnippet(snippet: RepoFileSnippet, keywords: string[]): RepoFileSnippet {
    const lines = snippet.content.split(/\r?\n/);
    const keep = new Set<number>();
    const lowerKeywords = keywords.map((keyword) => keyword.toLowerCase());

    for (let index = 0; index < Math.min(12, lines.length); index += 1) {
      keep.add(index);
    }

    for (let index = Math.max(0, lines.length - 10); index < lines.length; index += 1) {
      keep.add(index);
    }

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const lowerLine = trimmed.toLowerCase();
      if (/^(import|export|class|interface|type|enum|function)\b/.test(trimmed)) {
        keep.add(index);
      }

      if (lowerKeywords.some((keyword) => lowerLine.includes(keyword))) {
        for (let offset = -3; offset <= 3; offset += 1) {
          const nearby = index + offset;
          if (nearby >= 0 && nearby < lines.length) {
            keep.add(nearby);
          }
        }
      }
    });

    const compactLines = [...keep]
      .sort((left, right) => left - right)
      .map((index) => lines[index])
      .join('\n')
      .slice(0, COMPRESSED_FILE_CHAR_LIMIT);
    const content = [
      `[OpenMeta compressed snippet: original ${snippet.content.length} chars, showing structural lines and keyword windows.]`,
      compactLines,
    ].join('\n');

    return {
      path: snippet.path,
      content,
      compressed: true,
      originalChars: snippet.content.length,
      estimatedTokens: this.estimateTokens(content),
    };
  }

  private scoreSnippet(snippet: RepoFileSnippet, priorityPaths: Set<string>, keywords: string[]): number {
    let score = 0;
    const path = this.normalizePath(snippet.path);
    const lowerPath = path.toLowerCase();
    const fileName = basename(lowerPath);
    const lowerContent = snippet.content.toLowerCase();

    if (priorityPaths.has(path)) {
      score += 1000;
    }

    for (const priorityPath of priorityPaths) {
      if (lowerPath.endsWith(priorityPath.toLowerCase()) || fileName === basename(priorityPath.toLowerCase())) {
        score += 350;
      }
    }

    for (const keyword of keywords) {
      if (lowerPath.includes(keyword)) {
        score += 16;
      }
      if (fileName.includes(keyword)) {
        score += 20;
      }
      if (lowerContent.includes(keyword)) {
        score += 5;
      }
    }

    return score;
  }

  private normalizeKeywords(keywords: string[]): string[] {
    return [...new Set(keywords
      .map((keyword) => keyword.toLowerCase().trim())
      .filter((keyword) => keyword.length >= 3))];
  }

  private normalizePath(path: string): string {
    return path.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  }
}

export const contextBudgetService = new ContextBudgetService();
