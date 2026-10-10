import type { AnalysisResult } from "@deepwissen/preflight-core";

/**
 * Pick the single most important reason to show in the status bar. Pure, so the
 * priority ladder (integrity > secrets > truncation > budget > waste) can be
 * unit-tested directly. Keeps it short — max ~30 chars.
 */
export function getTopReason(result: AnalysisResult): string | undefined {
  // Priority 1: integrity errors (compound attacks)
  const integrityError = result.instructionFileIssues.find((i) => i.severity === "error");
  if (integrityError) {
    return "compound attack detected";
  }

  // Priority 2: integrity warnings (prompt injection, bidi)
  const integrityWarning = result.instructionFileIssues.find((i) => i.severity === "warning");
  if (integrityWarning) {
    const reasons: Record<string, string> = {
      "suspicious-instruction": "prompt injection found",
      "bidi-override": "bidi attack found",
      "hidden-unicode": "hidden unicode found",
      "mcp-embedded-secret": "secret in MCP config",
      "mcp-suspicious-tool": "suspicious MCP tool",
      "mcp-unknown-server": "untrusted MCP server",
      "mcp-risky-config": "risky MCP config",
    };
    return reasons[integrityWarning.issue] ?? "integrity issue";
  }

  // Priority 2.5: secrets found in file content
  if (result.secretFindings?.length > 0) {
    const layer1 = result.secretFindings.find((f) => f.layer === 1);
    if (layer1) return `${layer1.label} exposed`;
    return "hardcoded secret found";
  }

  // Priority 3: truncation risk (won't physically fit)
  if (result.contextWindowUsage && result.contextWindowUsage.estimatedUsagePercent > 90) {
    return `${result.contextWindowUsage.estimatedUsagePercent}% context window`;
  }

  // Priority 3.5: context budget (quality / context rot) — fires even when the
  // window is far from full, which the truncation % above would miss.
  if (result.contextWindowUsage?.budgetBand === "bloated") {
    const k = Math.round(result.contextWindowUsage.estimatedTokens / 1000);
    return `context bloated ~${k}k`;
  }

  // Priority 4: first warning-severity waste pattern
  const warning = result.wastePatterns.find((w) => w.severity === "warning");
  if (warning) {
    const reasons: Record<string, string> = {
      "large-file": "large file open",
      "lock-file": "lock file open",
      "env-file": "env file open",
      "sensitive-file": "sensitive file open",
      "generated-file": "generated file open",
      "too-many-tabs": `${result.contextSummary.openTabCount} tabs open`,
      "data-file": "data file open",
      "no-selection-large-file": "no selection on large file",
      "git-conflict-markers": "conflict markers",
      "unsaved-file": "unsaved changes",
      "truncation-risk": "near context limit",
      "context-budget": "context bloated",
      "data-flow-warning": "sensitive data in context",
      "secret-in-content": "secret in file",
    };
    return reasons[warning.ruleId] ?? warning.ruleId;
  }

  return undefined;
}
