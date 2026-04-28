import type { AnalysisResult, ContextSnapshot, RiskLevel } from "../types.js";

/**
 * Adjusts risk level based on waste patterns and integrity findings.
 *
 * Runs AFTER token estimator, waste detector, and integrity scanner.
 * Reads their outputs from `partial` and boosts risk accordingly.
 *
 * Rules:
 *   Waste-based (from PRODUCT_RULES.md):
 *   - waste found AND band is LOW  → bump to MEDIUM
 *   - waste >= 2  AND band is MEDIUM → bump to HIGH
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
  _context: ContextSnapshot,
  partial: Partial<AnalysisResult>
): Partial<AnalysisResult> {
  const band = partial.tokenEstimate?.band;
  if (!band) return {};

  const wasteCount = partial.wastePatterns?.length ?? 0;

  let riskLevel: RiskLevel = band;

  // Waste-based escalation
  if (band === "low" && wasteCount > 0) {
    riskLevel = "medium";
  } else if (band === "medium" && wasteCount >= 2) {
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

  return { riskLevel };
}
