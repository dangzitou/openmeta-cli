import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ensureDirectory, getLocalDateStamp, getOpenMetaStateDir } from '../infra/index.js';
import type { ContributionInboxItem } from '../types/index.js';

/** Persisted state for the contribution inbox. */
interface InboxState {
	/** Items sorted by descending overallScore. */
	items: ContributionInboxItem[];
}

function defaultState(): InboxState {
	return { items: [] };
}

/**
 * Manages the local contribution inbox — a ranked list of discovered
 * open-source opportunities the agent has evaluated.
 *
 * State is persisted as JSON in the OpenMeta state directory. Writes use
 * an atomic tmp-then-rename pattern to avoid corruption on crash.
 */
export class InboxService {
	private getInboxPath(): string {
		return join(ensureDirectory(getOpenMetaStateDir()), 'inbox.json');
	}

	/** Return the absolute path to the inbox JSON file. */
	getPath(): string {
		return this.getInboxPath();
	}

	/** Load the inbox state from disk, returning an empty inbox if missing. */
	load(): InboxState {
		const path = this.getInboxPath();

		if (!existsSync(path)) {
			return defaultState();
		}

		const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<InboxState>;
		return {
			items: raw.items ?? [],
		};
	}

	/**
	 * Upsert an item into the inbox.
	 *
	 * If an item with the same `id` already exists it is replaced; otherwise
	 * the new item is prepended. The resulting list is sorted by descending
	 * `overallScore` before persisting.
	 *
	 * @returns The updated items list after save.
	 */
	saveItem(item: ContributionInboxItem): ContributionInboxItem[] {
		const state = this.load();
		const items = [item, ...state.items.filter((entry) => entry.id !== item.id)].sort(
			(left, right) => right.overallScore - left.overallScore,
		);

		const targetPath = this.getInboxPath();
		const tmpPath = `${targetPath}.tmp.${process.pid}`;
		try {
			writeFileSync(tmpPath, JSON.stringify({ items }, null, 2), 'utf-8');
			renameSync(tmpPath, targetPath);
		} catch (error) {
			try {
				unlinkSync(tmpPath);
			} catch {
				/* ignore cleanup failure */
			}
			throw error;
		}
		return items;
	}

	/** Render the inbox as a human-readable Markdown document. */
	renderMarkdown(items: ContributionInboxItem[]): string {
		const lines = [
			'# Contribution Inbox',
			'',
			...(items.length > 0
				? items.map(
						(item) =>
							`- [${item.status.toUpperCase()}] ${item.repoFullName}#${item.issueNumber} | overall ${item.overallScore} | ${item.summary}`,
					)
				: ['- Inbox is empty']),
			'',
			`_Snapshot Date: ${getLocalDateStamp()}_`,
			'',
		];

		return lines.join('\n');
	}
}

export const inboxService = new InboxService();
