import * as vscode from "vscode";
import type { AnalysisResult, PromptAnalysis } from "../core/types.js";
import { ContextBridge } from "./context-bridge.js";
import { runPipeline } from "../core/pipeline.js";
import type { AnalyzerStep } from "../core/types.js";
import type { createDismissalTracker } from "../core/dismissal-tracker.js";
import { analyzePrompt } from "../core/analyzers/prompt-analyzer.js";

type DismissalTracker = ReturnType<typeof createDismissalTracker>;

/**
 * Registers @preflight as a chat participant in GitHub Copilot Chat.
 * Users type "@preflight refactor auth" to get prompt-aware context analysis.
 */
export function registerChatParticipant(
  context: vscode.ExtensionContext,
  contextBridge: ContextBridge,
  pipelineSteps: AnalyzerStep[],
  dismissalTracker: DismissalTracker,
): void {
  const participant = vscode.chat.createChatParticipant(
    "ai-preflight.preflight",
    (request, _chatContext, response, _token) => {
      const snapshot = contextBridge.captureNow();
      const result = runPipeline(snapshot, pipelineSteps);
      result.suggestions = dismissalTracker.apply(result.suggestions);

      // Prompt-aware analysis when user typed text after @preflight
      const promptAnalysis = request.prompt.trim()
        ? analyzePrompt(request.prompt, snapshot, result)
        : null;

      response.markdown(formatResultAsMarkdown(result, promptAnalysis));
    },
  );

  participant.iconPath = new vscode.ThemeIcon("search-fuzzy");

  context.subscriptions.push(participant);
}

function formatResultAsMarkdown(
  result: AnalysisResult,
  promptAnalysis?: PromptAnalysis | null,
): string {
  const lines: string[] = [];

  // Risk badge
  const riskIcon = result.riskLevel === "low" ? "$(pass)" : result.riskLevel === "medium" ? "$(warning)" : "$(error)";
  lines.push(`## ${riskIcon} Prompt Risk: **${result.riskLevel.toUpperCase()}**`);
  lines.push("");

  // Token estimate
  const lowK = (result.tokenEstimate.low / 1000).toFixed(1);
  const highK = (result.tokenEstimate.high / 1000).toFixed(1);
  lines.push(`**Prompt Estimate:** ~${lowK}k – ${highK}k tokens (${result.tokenEstimate.confidence} confidence)`);
  lines.push("");

  // Context window usage
  if (result.contextWindowUsage) {
    const u = result.contextWindowUsage;
    const usedK = (u.estimatedTokens / 1000).toFixed(1);
    const totalK = (u.contextWindowTokens / 1000).toFixed(0);
    lines.push(`**Context Window — ${u.toolDisplayName}:** ~${usedK}k of ${totalK}k tokens (${u.estimatedUsagePercent}%)`);
    lines.push("");
  }

  // Context sources
  lines.push("### Context Sources");
  if (result.contextSummary.activeFileName) {
    lines.push(`- **Active file:** \`${result.contextSummary.activeFileName}\``);
  }
  if (result.contextSummary.selectionLines) {
    lines.push(`- **Selection:** ${result.contextSummary.selectionLines} lines`);
  }
  if (result.contextSummary.openTabCount > 0) {
    lines.push(`- **Open tabs:** ${result.contextSummary.openTabCount} (${result.contextSummary.openTabNames.join(", ")})`);
  }
  lines.push("");

  // Token breakdown
  if (result.tokenBreakdown.length > 0) {
    lines.push("### Token Breakdown");
    const sorted = [...result.tokenBreakdown].sort((a, b) => b.percentage - a.percentage);
    for (const entry of sorted) {
      if (entry.percentage === 0) continue;
      const eLow = (entry.estimatedTokens.low / 1000).toFixed(1);
      const eHigh = (entry.estimatedTokens.high / 1000).toFixed(1);
      lines.push(`- \`${entry.path}\` (${entry.source}): ~${eLow}k–${eHigh}k tokens (${entry.percentage}%)`);
    }
    lines.push("");
  }

  // Waste patterns
  if (result.wastePatterns.length > 0) {
    lines.push("### Waste Detected");
    for (const wp of result.wastePatterns) {
      const icon = wp.severity === "warning" ? "$(warning)" : "$(info)";
      lines.push(`- ${icon} **${wp.ruleId}:** ${wp.description}`);
    }
    lines.push("");
  }

  // Positive signals
  if (result.positiveSignals.length > 0) {
    lines.push("### What's Working");
    for (const ps of result.positiveSignals) {
      lines.push(`- $(pass) **${ps.label}** — ${ps.description}`);
    }
    lines.push("");
  }

  // Suggestions
  const active = result.suggestions.filter(s => !s.dismissed);
  if (active.length > 0) {
    lines.push("### Suggestions");
    for (const s of active) {
      lines.push(`${s.priority}. ${s.text}`);
    }
    lines.push("");
  }

  // ─── Prompt-Aware Analysis ("For This Task" section) ───────────
  if (promptAnalysis && promptAnalysis.intentKeywords.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("### For This Task");
    lines.push("");

    // Task type
    if (promptAnalysis.taskType) {
      lines.push(`**Task type:** ${promptAnalysis.taskType}`);
      lines.push("");
    }

    // Context-intent match
    if (promptAnalysis.matchingFiles.length > 0) {
      const names = promptAnalysis.matchingFiles.map(f => `\`${f.split("/").pop()}\``).join(", ");
      lines.push(`$(pass) **Likely relevant files:** ${names}`);
    } else {
      lines.push("$(warning) **No matching files found** — open files don't appear to match your prompt");
    }
    lines.push("");

    // Missing context
    if (promptAnalysis.missingFiles.length > 0) {
      lines.push("$(info) **Possible missing dependencies:**");
      for (const f of promptAnalysis.missingFiles) {
        lines.push(`  - ${f}`);
      }
      lines.push("");
    }

    // Low relevance context
    if (promptAnalysis.unnecessaryFiles.length > 0) {
      const names = promptAnalysis.unnecessaryFiles.map(f => `\`${f.split("/").pop()}\``).join(", ");
      lines.push(`$(info) **Low relevance to prompt:** ${names}`);
      if (promptAnalysis.wastedTokenEstimate.high > 0) {
        const wLow = (promptAnalysis.wastedTokenEstimate.low / 1000).toFixed(1);
        const wHigh = (promptAnalysis.wastedTokenEstimate.high / 1000).toFixed(1);
        lines.push(`  (~${wLow}k–${wHigh}k tokens unlikely related to this task)`);
      }
      lines.push("");
    }

    // Task-relevant tokens
    if (promptAnalysis.relevantTokenEstimate.high > 0) {
      const rLow = (promptAnalysis.relevantTokenEstimate.low / 1000).toFixed(1);
      const rHigh = (promptAnalysis.relevantTokenEstimate.high / 1000).toFixed(1);
      lines.push(`**Task-relevant tokens:** ~${rLow}k–${rHigh}k`);
      lines.push("");
    }

    // Scope hint
    if (promptAnalysis.scopeHint) {
      lines.push(`$(lightbulb) ${promptAnalysis.scopeHint}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}
