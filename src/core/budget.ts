import type { BudgetBand, BudgetThresholds, RiskLevel, TokenEstimate } from "./types.js";

/**
 * Context-budget classification — shared by the tool-aware analyzer (which
 * surfaces the band in the UI) and the risk scorer (which uses it as a floor).
 *
 * The bands are ≈absolute, chosen so "lean" stays clear of lost-in-the-middle
 * effects and "bloated" sits in the context-rot curve — independent of the
 * tool's nominal context window. Overridable via ai-preflight.budget.* config.
 */
export const DEFAULT_BUDGET_THRESHOLDS: BudgetThresholds = {
  heavy: 25_000,
  bloated: 75_000,
};

export function classifyBudget(tokens: number, t: BudgetThresholds): BudgetBand {
  if (tokens >= t.bloated) return "bloated";
  if (tokens >= t.heavy) return "heavy";
  return "lean";
}

/** Midpoint of the token-estimate range — the single absolute figure
 *  analyzers reason about. */
export function midpointTokens(est: Pick<TokenEstimate, "low" | "high">): number {
  return Math.round((est.low + est.high) / 2);
}

/** Context-size risk implied by a budget band. */
export function budgetBandToRisk(band: BudgetBand): RiskLevel {
  if (band === "bloated") return "high";
  if (band === "heavy") return "medium";
  return "low";
}
