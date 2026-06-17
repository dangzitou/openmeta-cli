/** Error names commonly thrown by prompt libraries when the user presses Ctrl+C. */
const PROMPT_ABORT_ERROR_NAMES = new Set([
	'ExitPromptError',
	'AbortPromptError',
	'PromptAbortError',
]);

/** Thrown when the user explicitly cancels a command (e.g. via Ctrl+C or a confirmation prompt). */
export class UserCancelledError extends Error {
	constructor(message: string = 'User cancelled the current command.') {
		super(message);
		this.name = 'UserCancelledError';
	}
}

/** Return `true` when `error` is a prompt-library abort (e.g. user pressed Escape or Ctrl+C). */
export function isPromptAbortError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	if (PROMPT_ABORT_ERROR_NAMES.has(error.name)) {
		return true;
	}

	return /force closed the prompt|prompt was canceled|canceled prompt/i.test(error.message);
}

/** Return `true` when `error` represents a user-initiated cancellation. */
export function isUserCancelledError(error: unknown): boolean {
	return error instanceof UserCancelledError || isPromptAbortError(error);
}

/** Safely extract a human-readable message from an unknown thrown value. */
export function getErrorMessage(
	error: unknown,
	fallback: string = 'Something went wrong. Please try again.',
): string {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message.trim();
	}

	if (typeof error === 'string' && error.trim().length > 0) {
		return error.trim();
	}

	return fallback;
}
