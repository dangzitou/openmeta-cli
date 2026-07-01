import { type AgentRunOptions, agentOrchestrator } from './agent.js';

/** Options accepted by the daily orchestrator. Aliased from {@link AgentRunOptions}. */
export type DailyExecutionOptions = AgentRunOptions;

/**
 * Thin wrapper that delegates to the agent orchestrator.
 *
 * The `daily` command exists as a backward-compatible alias for `openmeta agent`.
 * All real logic lives in {@link agentOrchestrator}; this class keeps the command
 * registration layer decoupled so that future daily-specific behaviour (e.g.
 * scheduled digest output) can be layered in without touching the agent flow.
 */
export class DailyOrchestrator {
	async execute(options: DailyExecutionOptions = {}): Promise<void> {
		await agentOrchestrator.run(options);
	}
}

export const dailyOrchestrator = new DailyOrchestrator();
