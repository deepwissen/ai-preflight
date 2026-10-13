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
  type ContextSnapshot,
  type FileInfo,
  type InstructionFileIssue,
  type McpConfigFileInfo,
} from "@deepwissen/preflight-core";

// The snapshot the ContextBridge produces carries detected workspace agent-config
// files in addition to the core fields. (Extension-local; core ignores it.)
type SnapshotWithAgentConfigs = ContextSnapshot & { agentConfigFiles?: McpConfigFileInfo[] };

function fileInfoFor(path: string, content: string): FileInfo {
  return {
    path,
    languageId: "",
    lineCount: content.split("\n").length,
    charCount: content.length,
    isActive: false,
    isDirty: false,
    commentLineCount: 0,
    hasConflictMarkers: false,
    content,
  };
}

/**
 * Excessive-agency scan (OWASP LLM06) over the active file AND every detected
 * workspace agent-config file — so a repo that over-permissions the agent is
 * flagged on project open, not only when the config happens to be the open file.
 * Reuses the core scanAgentConfig per file (which reads activeFile).
 */
const scanAgentConfigs: AnalyzerStep = (context) => {
  const issues: InstructionFileIssue[] = [];
  const seen = new Set<string>();
  const run = (snap: ContextSnapshot): void => {
    for (const i of scanAgentConfig(snap, {}).instructionFileIssues ?? []) issues.push(i);
  };

  if (context.activeFile?.content) {
    run(context);
    seen.add(context.activeFile.path);
  }
  for (const cfg of (context as SnapshotWithAgentConfigs).agentConfigFiles ?? []) {
    if (!cfg.content || seen.has(cfg.path)) continue;
    seen.add(cfg.path);
    run({ ...context, activeFile: fileInfoFor(cfg.path, cfg.content) });
  }

  return { instructionFileIssues: issues };
};

/**
 * The analysis pipeline — the ordered set of analyzers the extension runs on each
 * context snapshot. Content-security scanners run before scoreRisk so their
 * findings feed the risk level. Exported so the composition is testable.
 */
export function createPipeline(): AnalyzerStep[] {
  return [
    estimateTokens,
    detectWaste,
    scanInstructionIntegrity,
    scanMcpConfigs,
    scanSecrets,
    detectTraps,
    scanAgentConfigs, // OWASP LLM06 — active file + all detected workspace agent configs
    scoreRisk,
    detectPositiveSignals,
    detectToolAwareIssues,
  ];
}
