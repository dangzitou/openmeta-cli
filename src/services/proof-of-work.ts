import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ensureDirectory, getLocalDateStamp, getOpenMetaStateDir } from '../infra/index.js';
import type { ProofOfWorkRecord } from '../types/index.js';

/** Persisted state for the proof-of-work ledger. */
interface ProofOfWorkState {
	/** Records sorted by descending recency (newest first). */
	records: ProofOfWorkRecord[];
}

function defaultState(): ProofOfWorkState {
	return { records: [] };
}

/**
 * Manages the local proof-of-work ledger — a record of every contribution
 * attempt the agent has made, including scores and publication status.
 *
 * State is persisted as JSON in the OpenMeta state directory. Writes use
 * an atomic tmp-then-rename pattern to avoid corruption on crash.
 */
export class ProofOfWorkService {
	private getStatePath(): string {
		return join(ensureDirectory(getOpenMetaStateDir()), 'proof-of-work.json');
	}

	/** Return the absolute path to the proof-of-work JSON file. */
	getPath(): string {
		return this.getStatePath();
	}

	/** Load the proof-of-work state from disk, returning empty records if missing. */
	load(): ProofOfWorkState {
		const path = this.getStatePath();

		if (!existsSync(path)) {
			return defaultState();
		}

		const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<ProofOfWorkState>;
		return {
			records: raw.records ?? [],
		};
	}

	/**
	 * Prepend a new contribution record to the ledger.
	 *
	 * The list is capped at 100 entries — oldest records are dropped when
	 * the limit is exceeded.
	 *
	 * @returns The updated records list after save.
	 */
	record(entry: ProofOfWorkRecord): ProofOfWorkRecord[] {
		const current = this.load();
		const records = [entry, ...current.records].slice(0, 100);
		const targetPath = this.getStatePath();
		const tmpPath = `${targetPath}.tmp.${process.pid}`;
		try {
			writeFileSync(tmpPath, JSON.stringify({ records }, null, 2), 'utf-8');
			renameSync(tmpPath, targetPath);
		} catch (error) {
			try {
				unlinkSync(tmpPath);
			} catch {
				/* ignore cleanup failure */
			}
			throw error;
		}
		return records;
	}

	/** Render the proof-of-work ledger as a human-readable Markdown document. */
	renderMarkdown(records: ProofOfWorkRecord[]): string {
		const total = records.length;
		const published = records.filter((item) => item.published).length;
		const topRepositories = [...new Set(records.map((item) => item.repoFullName))].slice(0, 10);

		const lines = [
			'# Proof of Work',
			'',
			`- Total Draft Contributions: ${total}`,
			`- Published Runs: ${published}`,
			`- Unique Repositories: ${topRepositories.length}`,
			'',
			'## Top Repositories',
			'',
			...(topRepositories.length > 0 ? topRepositories.map((repo) => `- ${repo}`) : ['- None yet']),
			'',
			'## Recent Activity',
			'',
			...(records.slice(0, 10).length > 0
				? records
						.slice(0, 10)
						.map(
							(record) =>
								`- ${record.repoFullName}#${record.issueNumber} | overall ${record.overallScore} | published=${record.published}${record.pullRequestUrl ? ` | pr=${record.pullRequestUrl}` : ''}`,
						)
				: ['- No activity recorded']),
			'',
			`_Snapshot Date: ${getLocalDateStamp()}_`,
			'',
		];

		return lines.join('\n');
	}
}

export const proofOfWorkService = new ProofOfWorkService();
