import type { MatchedIssue, OpportunityAnalysis, RankedIssue } from '../types/index.js';

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function computeFreshnessScore(updatedAt: string): number {
  const hours = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60);

  if (hours <= 24) return 100;
  if (hours <= 72) return 92;
  if (hours <= 7 * 24) return 82;
  if (hours <= 14 * 24) return 70;
  if (hours <= 30 * 24) return 58;
  return 42;
}

function computeOnboardingClarity(issue: MatchedIssue): number {
  const labels = issue.labels.map(label => label.toLowerCase());
  let score = 45;

  if (labels.includes('good first issue') || labels.includes('good-first-issue')) {
    score += 25;
  }

  if (labels.includes('help wanted') || labels.includes('help-wanted')) {
    score += 15;
  }

  if (issue.body.length >= 120) {
    score += 10;
  }

  if (issue.repoDescription) {
    score += 5;
  }

  return clampScore(score);
}

function computeMergePotential(issue: MatchedIssue, freshnessScore: number): number {
  const starSignal = Math.min(28, Math.log10(issue.repoStars + 10) * 18);
  const labelSignal = issue.labels.length > 0 ? 10 : 0;

  return clampScore(35 + starSignal + labelSignal + freshnessScore * 0.25);
}

function computeImpactScore(issue: MatchedIssue): number {
  return clampScore(20 + Math.log10(issue.repoStars + 10) * 28);
}

function summarizeOpportunity(opportunity: OpportunityAnalysis): string {
  const strongest = Object.entries(opportunity.breakdown)
    .sort((left, right) => right[1] - left[1])[0];

  const weakest = Object.entries(opportunity.breakdown)
    .sort((left, right) => left[1] - right[1])[0];

  if (!strongest || !weakest) {
    return 'Opportunity score is based on repository fit and issue freshness.';
  }

  return `Strongest signal: ${strongest[0]} (${strongest[1]}). Main risk: ${weakest[0]} (${weakest[1]}).`;
}

export class OpportunityService {
  rankIssues(issues: MatchedIssue[]): RankedIssue[] {
    return issues
      .map((issue) => {
        const freshness = computeFreshnessScore(issue.updatedAt);
        const onboardingClarity = computeOnboardingClarity(issue);
        const mergePotential = computeMergePotential(issue, freshness);
        const impact = computeImpactScore(issue);
        const opportunityScore = clampScore(
          freshness * 0.25 +
          onboardingClarity * 0.25 +
          mergePotential * 0.30 +
          impact * 0.20,
        );
        const overallScore = clampScore(issue.matchScore * 0.45 + opportunityScore * 0.55);

        const opportunity: OpportunityAnalysis = {
          score: opportunityScore,
          overallScore,
          summary: '',
          breakdown: {
            technicalFit: issue.matchScore,
            freshness,
            onboardingClarity,
            mergePotential,
            impact,
          },
        };

        opportunity.summary = summarizeOpportunity(opportunity);

        return {
          ...issue,
          opportunity,
        };
      })
      .sort((left, right) => right.opportunity.overallScore - left.opportunity.overallScore);
  }
}

export const opportunityService = new OpportunityService();
