import type { ContentType } from './content.types.js';

/** Developer skill level, used to calibrate issue difficulty matching. */
export type UserProficiency = 'beginner' | 'intermediate' | 'advanced';
/** Supported scheduler backends for automated agent runs. */
export type SchedulerProvider = 'launchd' | 'cron' | 'manual';

/** Developer profile describing tech stack, skill level, and interests. */
export interface UserProfile {
	/** Primary languages, frameworks, and tools the developer works with. */
	techStack: string[];
	/** Self-reported skill level for difficulty calibration. */
	proficiency: UserProficiency;
	/** Domain areas of interest (e.g. "web", "ml", "devtools"). */
	focusAreas: string[];
}

/** GitHub authentication and repository configuration. */
export interface GitHubConfig {
	/** Personal access token with repo scope. */
	pat: string;
	/** GitHub username of the authenticated user. */
	username: string;
	/** Optional local path to a target repository for artifact publishing. */
	targetRepoPath?: string;
}

/** Supported LLM provider identifiers. */
export type LLMProvider =
	| 'openai'
	| 'minimax'
	| 'moonshot'
	| 'zhipu'
	| 'gemini'
	| 'claude'
	| 'custom';
/** Controls how much reasoning effort the LLM should expend. */
export type LLMReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

/** A named LLM provider profile for multi-model configurations. */
export interface LLMProviderProfile {
	provider: LLMProvider;
	apiBaseUrl: string;
	apiKey: string;
	modelName: string;
	apiHeaders: Record<string, string>;
	reasoningEffort?: LLMReasoningEffort;
	stream?: boolean;
}

/** LLM configuration supporting single or multi-profile setups. */
export interface LLMConfig {
	provider: LLMProvider;
	apiBaseUrl: string;
	apiKey: string;
	modelName: string;
	apiHeaders?: Record<string, string>;
	reasoningEffort?: LLMReasoningEffort;
	stream?: boolean;
	/** Name of the active profile when using multi-profile mode. */
	activeProfile?: string;
	/** Named provider profiles for switching between models. */
	profiles?: Record<string, LLMProviderProfile>;
}

/** Configuration for scheduled/automated agent execution. */
export interface AutomationConfig {
	enabled: boolean;
	/** Daily run time in HH:MM format. */
	scheduleTime: string;
	/** IANA timezone string (e.g. "Asia/Shanghai"). */
	timezone: string;
	contentType: ContentType;
	scheduler: SchedulerProvider;
	/** Minimum opportunity score threshold for automated selection. */
	minMatchScore: number;
	/** Skip execution if today's artifact was already generated. */
	skipIfAlreadyGeneratedToday: boolean;
}

/** Per-dimension scoring weights for issue ranking. */
export interface ScoringWeights {
	freshness: number;
	onboardingClarity: number;
	mergePotential: number;
	impact: number;
	riskPenalty: number;
}

/** Top-level weights combining technical match and opportunity scores. */
export interface OverallWeights {
	technicalMatch: number;
	opportunityScore: number;
}

/** A named scoring preset with weights and a human-readable label. */
export interface ScoringPreset {
	name: string;
	label: string;
	description: string;
	weights: ScoringWeights;
	overallWeights: OverallWeights;
}

/** Active scoring configuration, referencing a preset or custom weights. */
export interface ScoringConfig {
	weights: ScoringWeights;
	overallWeights: OverallWeights;
	preset: string;
}

/** Root application configuration combining all subsystem configs. */
export interface AppConfig {
	userProfile: UserProfile;
	github: GitHubConfig;
	llm: LLMConfig;
	automation: AutomationConfig;
	scoring: ScoringConfig;
	/** Template string for generating commit messages. */
	commitTemplate: string;
}
