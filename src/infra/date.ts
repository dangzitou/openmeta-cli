/**
 * Return a `YYYY-MM-DD` date stamp for the given date using local time.
 *
 * @param date - The date to format (defaults to now).
 * @returns A `YYYY-MM-DD` formatted string in local time.
 */
export function getLocalDateStamp(date: Date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');

	return `${year}-${month}-${day}`;
}

/**
 * Build the daily note markdown filename for the given date.
 *
 * @param date - The date to use (defaults to now).
 * @returns A filename like `openmeta-daily-2026-06-18.md`.
 */
export function getDailyNoteFileName(date: Date = new Date()): string {
	return `openmeta-daily-${getLocalDateStamp(date)}.md`;
}
