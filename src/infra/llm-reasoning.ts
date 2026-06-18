import type { LLMReasoningEffort } from '../types/index.js';

/** All supported reasoning effort levels, ordered from least to most intensive. */
export const LLM_REASONING_EFFORTS = [
	'none',
	'minimal',
	'low',
	'medium',
	'high',
	'xhigh',
] as const satisfies readonly LLMReasoningEffort[];
/** Default reasoning effort applied when no override is configured. */
export const DEFAULT_LLM_REASONING_EFFORT: LLMReasoningEffort = 'none';

/**
 * Parse a user-supplied string into a valid {@link LLMReasoningEffort}.
 *
 * @param value - Raw string input (case-insensitive, whitespace-trimmed).
 * @returns The matching effort level.
 * @throws {Error} If the value does not match any known effort level.
 */
export function parseLLMReasoningEffort(value: string): LLMReasoningEffort {
	const normalized = value.trim().toLowerCase();
	if (LLM_REASONING_EFFORTS.includes(normalized as LLMReasoningEffort)) {
		return normalized as LLMReasoningEffort;
	}

	throw new Error(`llm.reasoningEffort must be one of: ${LLM_REASONING_EFFORTS.join(', ')}.`);
}
