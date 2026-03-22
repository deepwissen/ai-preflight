import type { AnalysisResult, ContextSnapshot, RiskLevel } from "../types.js";

/**
 * Adjusts risk level based on waste pattern count.
 *
 * Runs AFTER token estimator and waste detector in the pipeline.
 * Reads their outputs from `partial` and boosts risk when waste
 * compounds the token size concern.
 *
 * Rules (from PRODUCT_RULES.md):
 *   - waste found AND band is LOW  → bump to MEDIUM
 *   - waste >= 2  AND band is MEDIUM → bump to HIGH
 *   - HIGH stays HIGH regardless
 */
export function scoreRisk(
  _context: ContextSnapshot,
  partial: Partial<AnalysisResult>
): Partial<AnalysisResult> {
  const band = partial.tokenEstimate?.band;
  if (!band) return {};

  const wasteCount = partial.wastePatterns?.length ?? 0;

  let riskLevel: RiskLevel = band;

  if (band === "low" && wasteCount > 0) {
    riskLevel = "medium";
  } else if (band === "medium" && wasteCount >= 2) {
    riskLevel = "high";
  }

  return { riskLevel };
}
