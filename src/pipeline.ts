import {
  estimateTokens,
  detectWaste,
  scanInstructionIntegrity,
  scanMcpConfigs,
  scanSecrets,
  detectTraps,
  scanAgentConfig,
  scoreRisk,
  detectPositiveSignals,
  detectToolAwareIssues,
  type AnalyzerStep,
} from "@deepwissen/preflight-core";

/**
 * The analysis pipeline — the ordered set of core analyzers the extension runs
 * on each context snapshot. Content-security scanners run before scoreRisk so
 * their findings feed the risk level. Exported so the composition is testable.
 */
export function createPipeline(): AnalyzerStep[] {
  return [
    estimateTokens,
    detectWaste,
    scanInstructionIntegrity,
    scanMcpConfigs,
    scanSecrets,
    detectTraps,
    scanAgentConfig, // OWASP LLM06 — excessive agency / unsafe autonomy config
    scoreRisk,
    detectPositiveSignals,
    detectToolAwareIssues,
  ];
}
