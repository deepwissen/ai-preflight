import type {
  AnalysisResult,
  ContextSnapshot,
  ContextWindowUsage,
  InstructionFileIssue,
  Suggestion,
  WasteAnnotation,
  WastePattern,
} from "../types.js";
import { AI_TOOLS, getContextWindowTokens } from "../ai-tools.js";
import { IMPORT_PATTERNS } from "../import-patterns.js";

/**
 * Tool-aware analyzer — runs LAST in the pipeline.
 * Uses the active tool profile to:
 *   F1: Compute context window usage percentage
 *   F2: Detect missing tool-specific instruction files
 *   F3: Check instruction file quality (line counts)
 *   F4: Detect missing ignore files
 *   F5: Suppress tab-related waste patterns for tools where tabs don't matter
 *   F6: Warn about long conversation history
 *   F8: Detect imports in selection that are missing from context
 *   F9: Warn about truncation risk when context usage is high
 */
export function detectToolAwareIssues(
  context: ContextSnapshot,
  partial: Partial<AnalysisResult>
): Partial<AnalysisResult> {
  if (!context.toolProfile) {
    return {};
  }

  const toolDef = AI_TOOLS[context.toolProfile.toolId];
  if (!toolDef) return {};

  const wastePatterns: WastePattern[] = [];
  const suggestions: Suggestion[] = [];
  const instructionFileIssues: InstructionFileIssue[] = [];
  let priority = (partial.suggestions?.length ?? 0) + 1;

  // F1: Context window usage
  const contextWindowUsage = computeContextWindowUsage(context, partial);

  // F2: Tool-specific instruction files
  checkMissingInstructionFiles(context, toolDef, suggestions, priority);
  priority += suggestions.length;

  // F3: Instruction file quality
  checkInstructionFileQuality(context, instructionFileIssues, suggestions, priority);
  priority = (partial.suggestions?.length ?? 0) + suggestions.length + 1;

  // F4: Ignore file detection
  checkMissingIgnoreFiles(context, toolDef, suggestions, priority);
  priority = (partial.suggestions?.length ?? 0) + suggestions.length + 1;

  // F5: Tab annotation suppression
  const toolAnnotations = suppressTabRules(context, partial, toolDef);

  // F6: Conversation length warning
  checkConversationLength(context, wastePatterns, suggestions, priority);
  priority = (partial.suggestions?.length ?? 0) + suggestions.length + 1;

  // F8: Context gap detection
  detectContextGaps(context, wastePatterns, suggestions, priority);
  priority = (partial.suggestions?.length ?? 0) + suggestions.length + 1;

  // F9: Truncation risk warning
  if (contextWindowUsage) {
    checkTruncationRisk(contextWindowUsage, wastePatterns, suggestions, priority);
    priority = (partial.suggestions?.length ?? 0) + suggestions.length + 1;
  }

  // F10: Injection surface warning
  if (contextWindowUsage) {
    checkInjectionSurface(context, contextWindowUsage, wastePatterns, suggestions, priority);
    priority = (partial.suggestions?.length ?? 0) + suggestions.length + 1;
  }

  // F11: Data flow awareness
  checkDataFlow(context, partial, toolDef, wastePatterns, suggestions, priority);

  return {
    contextWindowUsage,
    toolAnnotations,
    instructionFileIssues,
    wastePatterns,
    suggestions,
  };
}

// ─── F1: Context Window Usage ─────────────────────────────────────

function computeContextWindowUsage(
  context: ContextSnapshot,
  partial: Partial<AnalysisResult>
): ContextWindowUsage | null {
  const tokenEst = partial.tokenEstimate;
  if (!tokenEst || !context.toolProfile) return null;

  const toolDef = AI_TOOLS[context.toolProfile.toolId];
  const contextWindowTokens = getContextWindowTokens(
    context.toolProfile.toolId,
    context.toolProfile.modelId
  );
  const midpoint = Math.round((tokenEst.low + tokenEst.high) / 2);
  const pct = contextWindowTokens > 0 ? Math.round((midpoint / contextWindowTokens) * 100) : 0;

  return {
    toolId: context.toolProfile.toolId,
    toolDisplayName: toolDef.displayName,
    contextWindowTokens,
    estimatedUsagePercent: pct,
    estimatedTokens: midpoint,
  };
}

// ─── F2: Missing Instruction Files ────────────────────────────────

function checkMissingInstructionFiles(
  context: ContextSnapshot,
  toolDef: (typeof AI_TOOLS)[keyof typeof AI_TOOLS],
  suggestions: Suggestion[],
  priority: number
): void {
  if (toolDef.instructionFiles.length === 0) return;

  // Check if any of the tool's instruction files are present
  const hasToolInstructionFile = context.aiInstructionFiles.some((f) =>
    toolDef.instructionFiles.some(
      (pattern) => f.path === pattern || f.path.startsWith(pattern + "/")
    )
  );

  if (!hasToolInstructionFile) {
    const fileNames = toolDef.instructionFiles.join(" or ");
    suggestions.push({
      id: "add-tool-instruction-file",
      text: `Create ${fileNames} for ${toolDef.displayName} — AI instruction files improve response quality`,
      priority: priority++,
      dismissed: false,
      action: {
        command: "ai-preflight.action.createInstructionFile",
        args: { toolId: toolDef.id, files: toolDef.instructionFiles },
        label: "Create",
      },
    });
  }
}

// ─── F3: Instruction File Quality ─────────────────────────────────

function checkInstructionFileQuality(
  context: ContextSnapshot,
  issues: InstructionFileIssue[],
  suggestions: Suggestion[],
  priority: number
): void {
  for (const file of context.aiInstructionFiles) {
    if (file.lineCount === 0) {
      issues.push({
        id: `quality-empty-${file.path}`,
        filePath: file.path,
        issue: "empty",
        lineCount: 0,
        description: `${file.path} is empty`,
        suggestion: "Add coding style, conventions, and project-specific rules",
      });
      suggestions.push({
        id: `fix-empty-instruction-${file.path}`,
        text: `${file.path} is empty — add coding conventions and project rules`,
        priority: priority++,
        dismissed: false,
      });
    } else if (file.lineCount < 5) {
      issues.push({
        id: `quality-short-${file.path}`,
        filePath: file.path,
        issue: "too-short",
        lineCount: file.lineCount,
        description: `${file.path} has only ${file.lineCount} lines`,
        suggestion: "Add more rules for better AI guidance",
      });
      suggestions.push({
        id: `fix-short-instruction-${file.path}`,
        text: `${file.path} has only ${file.lineCount} lines — add more rules for better AI guidance`,
        priority: priority++,
        dismissed: false,
      });
    } else if (file.lineCount > 200) {
      issues.push({
        id: `quality-long-${file.path}`,
        filePath: file.path,
        issue: "too-long",
        lineCount: file.lineCount,
        description: `${file.path} is ${file.lineCount} lines — quality degrades with very long instruction files`,
        suggestion: "Trim to the most important rules (under 200 lines)",
      });
      suggestions.push({
        id: `fix-long-instruction-${file.path}`,
        text: `${file.path} is ${file.lineCount} lines — trim to under 200 lines for best results`,
        priority: priority++,
        dismissed: false,
      });
    }
  }
}

// ─── F4: Missing Ignore Files ─────────────────────────────────────

function checkMissingIgnoreFiles(
  context: ContextSnapshot,
  toolDef: (typeof AI_TOOLS)[keyof typeof AI_TOOLS],
  suggestions: Suggestion[],
  priority: number
): void {
  if (toolDef.ignoreFiles.length === 0) return;

  const hasIgnoreFile = toolDef.ignoreFiles.some((ig) => context.ignoreFiles.includes(ig));

  if (!hasIgnoreFile) {
    const ignoreFileName = toolDef.ignoreFiles[0];
    suggestions.push({
      id: "add-ignore-file",
      text: `Create ${ignoreFileName} to exclude noise directories from ${toolDef.displayName}`,
      priority: priority++,
      dismissed: false,
      action: {
        command: "ai-preflight.action.createIgnoreFile",
        args: { fileName: ignoreFileName },
        label: "Create",
      },
    });
  }
}

// ─── F5: Tab Rule Suppression ─────────────────────────────────────

const TAB_RELATED_RULES = new Set([
  "many-tabs",
  "unrelated-tabs",
  "duplicate-tab",
  "language-mismatch",
]);

const TAB_RELATED_SUGGESTIONS = new Set([
  "close-tabs",
  "focus-module",
  "close-duplicate",
  "close-mismatched-langs",
]);

function suppressTabRules(
  context: ContextSnapshot,
  partial: Partial<AnalysisResult>,
  toolDef: (typeof AI_TOOLS)[keyof typeof AI_TOOLS]
): Record<string, WasteAnnotation> {
  const annotations: Record<string, WasteAnnotation> = {};

  if (toolDef.tabsAffectContext) return annotations;

  const reason = `${toolDef.displayName} reads files on demand — open tabs don't affect context`;

  // Annotate waste pattern rule IDs
  for (const wp of partial.wastePatterns ?? []) {
    if (TAB_RELATED_RULES.has(wp.ruleId)) {
      annotations[wp.ruleId] = { suppressed: true, reason };
    }
  }

  // Annotate suggestion IDs
  for (const s of partial.suggestions ?? []) {
    if (TAB_RELATED_SUGGESTIONS.has(s.id)) {
      annotations[s.id] = { suppressed: true, reason };
    }
  }

  return annotations;
}

// ─── F6: Conversation Length Warning ──────────────────────────────

function checkConversationLength(
  context: ContextSnapshot,
  wastePatterns: WastePattern[],
  suggestions: Suggestion[],
  priority: number
): void {
  if (context.chatHistoryLength > 20) {
    wastePatterns.push({
      ruleId: "long-conversation",
      source: "chat",
      description: `Conversation is ${context.chatHistoryLength} messages — earlier context may be lost`,
      severity: "warning",
      suggestion: "Start a fresh conversation for new tasks",
    });
    suggestions.push({
      id: "fresh-conversation",
      text: `Conversation is ${context.chatHistoryLength} messages long — start a fresh one for new tasks`,
      priority: priority++,
      dismissed: false,
    });
  } else if (context.chatHistoryLength > 10) {
    wastePatterns.push({
      ruleId: "long-conversation",
      source: "chat",
      description: `Conversation is ${context.chatHistoryLength} messages`,
      severity: "info",
      suggestion: "Consider starting a fresh conversation",
    });
    suggestions.push({
      id: "fresh-conversation",
      text: `Conversation is ${context.chatHistoryLength} messages — consider starting a fresh one`,
      priority: priority++,
      dismissed: false,
    });
  }
}

// ─── F8: Context Gap Detection ────────────────────────────────────

function detectContextGaps(
  context: ContextSnapshot,
  wastePatterns: WastePattern[],
  suggestions: Suggestion[],
  priority: number
): void {
  if (!context.selection?.text) return;

  // Extract relative imports from selection text
  const importedPaths = new Set<string>();
  for (const pattern of IMPORT_PATTERNS) {
    // Reset regex state
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(context.selection.text)) !== null) {
      importedPaths.add(match[1]);
    }
  }

  if (importedPaths.size === 0) return;

  // Build set of file names in context (tabs + referenced files)
  const contextFiles = new Set<string>();
  for (const tab of context.openTabs) {
    contextFiles.add(fileBaseName(tab.path));
    contextFiles.add(tab.path);
  }
  for (const ref of context.referencedFiles) {
    contextFiles.add(fileBaseName(ref.path));
    contextFiles.add(ref.path);
  }

  // Find imports missing from context
  const missingImports: string[] = [];
  for (const imp of importedPaths) {
    // Extract just the filename for matching (e.g., './utils/helpers' → 'helpers')
    const baseName = fileBaseName(imp);
    // Try common extensions
    const found =
      contextFiles.has(baseName) ||
      contextFiles.has(baseName + ".ts") ||
      contextFiles.has(baseName + ".tsx") ||
      contextFiles.has(baseName + ".js") ||
      contextFiles.has(baseName + ".jsx");
    if (!found) {
      missingImports.push(imp);
    }
  }

  if (missingImports.length > 0) {
    wastePatterns.push({
      ruleId: "context-gap",
      source: "selection",
      description: `Selection imports ${missingImports.length} file(s) not in context: ${missingImports.join(", ")}`,
      severity: "info",
      suggestion: "Open imported files so the AI has full context",
    });
    suggestions.push({
      id: "open-imported-files",
      text: `Selection references ${missingImports.length} file(s) not in open tabs — open them for better AI context`,
      priority: priority++,
      dismissed: false,
    });
  }
}

function fileBaseName(path: string): string {
  const parts = path.split("/");
  const name = parts[parts.length - 1] ?? path;
  // Strip extension for matching
  return name.replace(/\.\w+$/, "");
}

// ─── F9: Truncation Risk ──────────────────────────────────────────

function checkTruncationRisk(
  usage: ContextWindowUsage,
  wastePatterns: WastePattern[],
  suggestions: Suggestion[],
  priority: number
): void {
  if (usage.estimatedUsagePercent > 90) {
    wastePatterns.push({
      ruleId: "truncation-risk",
      source: "context-window",
      description: `Context uses ~${usage.estimatedUsagePercent}% of ${usage.toolDisplayName}'s limit — AI response may be truncated`,
      severity: "warning",
      suggestion: "Reduce context or start a fresh conversation",
    });
    suggestions.push({
      id: "reduce-context",
      text: `Context is at ~${usage.estimatedUsagePercent}% of ${usage.toolDisplayName}'s ${Math.round(usage.contextWindowTokens / 1000)}k token limit — reduce context or start fresh`,
      priority: priority++,
      dismissed: false,
    });
  } else if (usage.estimatedUsagePercent > 70) {
    wastePatterns.push({
      ruleId: "truncation-risk",
      source: "context-window",
      description: `Context uses ~${usage.estimatedUsagePercent}% of ${usage.toolDisplayName}'s limit`,
      severity: "info",
      suggestion: "Monitor context size as you add more content",
    });
    suggestions.push({
      id: "reduce-context",
      text: `Context is at ~${usage.estimatedUsagePercent}% of ${usage.toolDisplayName}'s limit — monitor as you add more content`,
      priority: priority++,
      dismissed: false,
    });
  }
}

// ─── F10: Injection Surface Warning ───────────────────────────────

function checkInjectionSurface(
  context: ContextSnapshot,
  usage: ContextWindowUsage,
  wastePatterns: WastePattern[],
  suggestions: Suggestion[],
  priority: number
): void {
  if (usage.estimatedUsagePercent <= 70) return;
  if (context.aiInstructionFiles.length === 0) return;

  const fileCount = context.aiInstructionFiles.length;
  wastePatterns.push({
    ruleId: "injection-surface",
    source: "context-window",
    description: `Large context (~${usage.estimatedUsagePercent}% full) with ${fileCount} instruction file(s) increases prompt injection surface area`,
    severity: "info",
    suggestion: "Review instruction files for unexpected content and reduce context size",
  });
  suggestions.push({
    id: "review-injection-surface",
    text: `Large context (~${usage.estimatedUsagePercent}% full) with ${fileCount} instruction file(s) — review instruction files for unexpected content`,
    priority: priority++,
    dismissed: false,
  });
}

// ─── F11: Data Flow Awareness ─────────────────────────────────────

function checkDataFlow(
  context: ContextSnapshot,
  partial: Partial<AnalysisResult>,
  toolDef: (typeof AI_TOOLS)[keyof typeof AI_TOOLS],
  wastePatterns: WastePattern[],
  suggestions: Suggestion[],
  priority: number
): void {
  if (!context.toolProfile) return;

  const sensitivePatterns = (partial.wastePatterns ?? []).filter(
    (wp) => wp.ruleId === "env-file" || wp.ruleId === "sensitive-file"
  );
  if (sensitivePatterns.length === 0) return;

  const tokenEst = partial.tokenEstimate;
  const tokenLabel = tokenEst
    ? (() => {
        const mid = Math.round((tokenEst.low + tokenEst.high) / 2);
        return mid >= 1000 ? `~${Math.round(mid / 1000)}k tokens` : `~${mid} tokens`;
      })()
    : "unknown size";

  wastePatterns.push({
    ruleId: "data-flow-warning",
    source: "context-window",
    description: `Sensitive files in context (${tokenLabel}) will be sent to ${toolDef.provider} (${toolDef.displayName})`,
    severity: "warning",
    suggestion: "Close sensitive files before prompting or verify they contain no secrets",
  });
  suggestions.push({
    id: "data-flow-warning",
    text: `Sensitive files will be sent to ${toolDef.provider} via ${toolDef.displayName} — close them or verify no secrets are present`,
    priority: priority++,
    dismissed: false,
  });
}
