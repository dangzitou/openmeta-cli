import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ensureDirectory, getOpenMetaStateDir } from '../infra/index.js';
import type { AgentRunRecord, AgentRunStatus } from '../types/index.js';

/** Persisted state for the run history ledger. */
interface RunHistoryState {
	/** Most recent agent run records, newest first, capped at 100. */
	records: AgentRunRecord[];
}

function defaultState(): RunHistoryState {
	return { records: [] };
}

/** Generate a unique run identifier from an ISO timestamp. */
function createRunId(startedAt: string): string {
	const stamp = startedAt.replace(/[-:T.Z]/g, '').slice(0, 14);
	const suffix = Math.random().toString(36).slice(2, 8);
	return `run_${stamp}_${suffix}`;
}

/**
 * Tracks recent agent command executions as an append-only ledger.
 *
 * Records are persisted as JSON in the OpenMeta state directory.  At most
 * 100 entries are retained (newest first); older entries are pruned on
 * every write.
 */
export class RunHistoryService {
	private getStatePath(): string {
		return join(ensureDirectory(getOpenMetaStateDir()), 'runs.json');
	}

	/** Return the absolute path to the run history JSON file. */
	getPath(): string {
		return this.getStatePath();
	}

	/** Load the run history state from disk, returning an empty history if missing. */
	load(): RunHistoryState {
		const path = this.getStatePath();

		if (!existsSync(path)) {
			return defaultState();
		}

		const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<RunHistoryState>;
		return {
			records: raw.records ?? [],
		};
	}

	/** Create and persist a new running agent run record. */
	start(input: { commandName: string; args: string[] }): AgentRunRecord {
		const startedAt = new Date().toISOString();
		const record: AgentRunRecord = {
			id: createRunId(startedAt),
			commandName: input.commandName,
			args: input.args,
			status: 'running',
			startedAt,
		};

		this.write([record, ...this.load().records].slice(0, 100));
		return record;
	}

	finish(
		id: string,
		status: Exclude<AgentRunStatus, 'running'>,
		error?: string,
	): AgentRunRecord | undefined {
		const state = this.load();
		const current = state.records.find((record) => record.id === id);

		if (!current) {
			return undefined;
		}

		const finishedAt = new Date().toISOString();
		const updated: AgentRunRecord = {
			...current,
			status,
			finishedAt,
			durationMs: Math.max(
				0,
				new Date(finishedAt).getTime() - new Date(current.startedAt).getTime(),
			),
			...(error ? { error } : {}),
		};

		this.write([updated, ...state.records.filter((record) => record.id !== id)].slice(0, 100));
		return updated;
	}

	/** Look up a run record by its id. */
	find(id: string): AgentRunRecord | undefined {
		return this.load().records.find((record) => record.id === id);
	}

	private write(records: AgentRunRecord[]): void {
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
	}
}

export const runHistoryService = new RunHistoryService();
