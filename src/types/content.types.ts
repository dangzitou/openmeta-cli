import type { MatchedIssue } from './github.types.js';

/** Type discriminator for generated content artifacts. */
export type ContentType = 'research_note' | 'development_diary';

/** A locally-generated content artifact with its source issues. */
export interface GeneratedContent {
	type: ContentType;
	title: string;
	content: string;
	relatedIssues: MatchedIssue[];
	generatedAt: string;
}
