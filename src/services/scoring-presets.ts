import type {
	OverallWeights,
	ScoringConfig,
	ScoringPreset,
	ScoringWeights,
} from '../types/index.js';

/** Built-in scoring presets that weight different evaluation dimensions. */
export const SCORING_PRESETS: ScoringPreset[] = [
	{
		name: 'balanced',
		label: 'Balanced',
		description: 'Default balanced scoring across all dimensions',
		weights: {
			freshness: 0.25,
			onboardingClarity: 0.25,
			mergePotential: 0.3,
			impact: 0.2,
			riskPenalty: 0.35,
		},
		overallWeights: { technicalMatch: 0.45, opportunityScore: 0.55 },
	},
	{
		name: 'impact-first',
		label: 'Impact First',
		description: 'Prioritize high-star repos for resume/portfolio visibility',
		weights: {
			freshness: 0.15,
			onboardingClarity: 0.15,
			mergePotential: 0.2,
			impact: 0.4,
			riskPenalty: 0.2,
		},
		overallWeights: { technicalMatch: 0.4, opportunityScore: 0.6 },
	},
	{
		name: 'quick-wins',
		label: 'Quick Wins',
		description: 'Prioritize fresh issues with clear descriptions for fast turnaround',
		weights: {
			freshness: 0.35,
			onboardingClarity: 0.35,
			mergePotential: 0.2,
			impact: 0.05,
			riskPenalty: 0.15,
		},
		overallWeights: { technicalMatch: 0.55, opportunityScore: 0.45 },
	},
	{
		name: 'rising-stars',
		label: 'Rising Stars',
		description: 'Discover responsive 1k-5k star projects that are actively growing',
		weights: {
			freshness: 0.25,
			onboardingClarity: 0.3,
			mergePotential: 0.25,
			impact: 0.05,
			riskPenalty: 0.2,
		},
		overallWeights: { technicalMatch: 0.5, opportunityScore: 0.5 },
	},
	{
		name: 'learning',
		label: 'Learning',
		description: 'Prioritize small, well-documented projects for learning',
		weights: {
			freshness: 0.2,
			onboardingClarity: 0.4,
			mergePotential: 0.25,
			impact: 0.05,
			riskPenalty: 0.1,
		},
		overallWeights: { technicalMatch: 0.55, opportunityScore: 0.45 },
	},
];

export const DEFAULT_SCORING: ScoringConfig = {
	weights: SCORING_PRESETS[0]?.weights,
	overallWeights: SCORING_PRESETS[0]?.overallWeights,
	preset: 'balanced',
};

/** Return the preset with the given name, or undefined if not found. */
export function getPreset(name: string): ScoringPreset | undefined {
	return SCORING_PRESETS.find((p) => p.name === name);
}

/**
 * Normalize scoring weights so that the four primary dimensions sum to 1.0.
 *
 * The `riskPenalty` weight is left unchanged since it operates as an
 * independent penalty multiplier rather than a dimension share.
 * Falls back to the default balanced weights when all dimensions are zero.
 */
export function normalizeWeights(weights: ScoringWeights): ScoringWeights {
	const sum =
		weights.freshness + weights.onboardingClarity + weights.mergePotential + weights.impact;
	if (sum === 0) {
		return { ...DEFAULT_SCORING.weights };
	}
	return {
		freshness: +(weights.freshness / sum).toFixed(3),
		onboardingClarity: +(weights.onboardingClarity / sum).toFixed(3),
		mergePotential: +(weights.mergePotential / sum).toFixed(3),
		impact: +(weights.impact / sum).toFixed(3),
		riskPenalty: weights.riskPenalty,
	};
}

/** Normalize overall weights so that technicalMatch + opportunityScore = 1.0. */
export function normalizeOverallWeights(weights: OverallWeights): OverallWeights {
	const sum = weights.technicalMatch + weights.opportunityScore;
	if (sum === 0) {
		return { ...DEFAULT_SCORING.overallWeights };
	}
	return {
		technicalMatch: +(weights.technicalMatch / sum).toFixed(3),
		opportunityScore: +(weights.opportunityScore / sum).toFixed(3),
	};
}
