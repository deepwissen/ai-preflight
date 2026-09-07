import type { AnalysisResult, ContextSnapshot, RiskLevel } from "../types.js";
import {
  budgetBandToRisk,
  classifyBudget,
  DEFAULT_BUDGET_THRESHOLDS,
  midpointTokens,
} from "../budget.js";

/**
 * Adjusts risk level based on waste patterns and integrity findings.
 *
 * Runs AFTER token estimator, waste detector, and integrity scanner.
 * Reads their outputs from `partial` and boosts risk accordingly.
 *
 * Rules:
 *   Context-size baseline (budget-driven):
 *   - riskLevel starts at the budget band's risk, NOT the raw token band.
 *     This aligns risk with where output quality actually degrades
 *     (context rot) instead of a crude fixed-token cliff.
 *   - budget bands: lean → low, heavy → medium, bloated → high
 *
 *   Waste-based escalation (relative to that baseline):
 *   - waste found AND baseline is LOW  → bump to MEDIUM
 *   - waste >= 2  AND baseline is MEDIUM → bump to HIGH
 *   - HIGH stays HIGH regardless
 *
 *   Security-sensitive waste (independent escalation):
 *   - sensitive-file or env-file on LOW → at least MEDIUM
 *
 *   Integrity-based (minimum floor):
 *   - any integrity finding with severity "error"   → at least HIGH
 *   - any integrity finding with severity "warning"  → at least MEDIUM
 *   - severity "info" does not affect risk level
 */
export function scoreRisk(
  context: ContextSnapshot,
  partial: Partial<AnalysisResult>
): Partial<AnalysisResult> {
  if (!partial.tokenEstimate) return {};

  const wasteCount = partial.wastePatterns?.length ?? 0;

  // Context-size risk is driven by the budget band (lean/heavy/bloated), not
  // the raw token-band cliff. Thresholds are configurable via the snapshot.
  const thresholds = context.budgetThresholds ?? DEFAULT_BUDGET_THRESHOLDS;
  const budgetBand = classifyBudget(midpointTokens(partial.tokenEstimate), thresholds);
  let riskLevel: RiskLevel = budgetBandToRisk(budgetBand);

  // Waste-based escalation, relative to the size-derived baseline
  if (riskLevel === "low" && wasteCount > 0) {
    riskLevel = "medium";
  } else if (riskLevel === "medium" && wasteCount >= 2) {
    riskLevel = "high";
  }

  // Security-sensitive rules independently escalate risk
  const SECURITY_RULES = new Set(["sensitive-file", "env-file"]);
  const hasSecurityWaste = (partial.wastePatterns ?? []).some((wp) =>
    SECURITY_RULES.has(wp.ruleId)
  );
  if (hasSecurityWaste && riskLevel === "low") {
    riskLevel = "medium";
  }

  // Integrity-based floor — severity drives minimum risk level
  const integrityIssues = partial.instructionFileIssues ?? [];
  for (const issue of integrityIssues) {
    if (issue.severity === "error" && riskLevel !== "high") {
      riskLevel = "high";
      break; // Can't go higher
    }
    if (issue.severity === "warning" && riskLevel === "low") {
      riskLevel = "medium";
    }
  }

  // Secret findings floor — Layer 1 (error) → HIGH, any finding → at least MEDIUM
  const secrets = partial.secretFindings ?? [];
  if (secrets.some((f) => f.severity === "error") && riskLevel !== "high") {
    riskLevel = "high";
  } else if (secrets.length > 0 && riskLevel === "low") {
    riskLevel = "medium";
  }

  return { riskLevel };
}
