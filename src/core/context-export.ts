import type { AnalysisResult, ContextSnapshot } from "./types.js";

/**
 * Formats a context snapshot and analysis result into human-readable markdown.
 * Useful for debugging, sharing, or clipboard export.
 * Pure function — no side effects.
 */
export function exportContext(context: ContextSnapshot, result: AnalysisResult): string {
  const lines: string[] = [];

  lines.push("# AI Preflight Report");
  lines.push("");
  lines.push(`**Risk Level:** ${result.riskLevel.toUpperCase()}  `);
  lines.push(
    `**Token Estimate:** ~${result.tokenEstimate.low} – ${result.tokenEstimate.high} tokens (${result.tokenEstimate.band} band, ${result.tokenEstimate.confidence} confidence)  `
  );
  lines.push("");

  // Active file
  lines.push("## Context Sources");
  lines.push("");
  if (context.activeFile) {
    lines.push(
      `- **Active file:** \`${context.activeFile.path}\` (${context.activeFile.lineCount} lines, ${context.activeFile.charCount} chars)`
    );
  } else {
    lines.push("- **Active file:** none");
  }

  // Selection
  if (context.selection) {
    lines.push(
      `- **Selection:** ${context.selection.lineCount} lines (${context.selection.charCount} chars)`
    );
  }

  // Open tabs
  if (context.openTabs.length > 0) {
    lines.push(`- **Open tabs (${context.openTabs.length}):**`);
    for (const tab of context.openTabs) {
      lines.push(`  - \`${tab.path}\` (${tab.lineCount} lines)`);
    }
  }

  // Terminal
  if (context.terminalContent) {
    lines.push(
      `- **Terminal:** ${context.terminalContent.lineCount} lines (${context.terminalContent.charCount} chars)`
    );
  }

  // AI instruction files
  if (context.aiInstructionFiles.length > 0) {
    lines.push(
      `- **AI instructions:** ${context.aiInstructionFiles.map((f) => f.path).join(", ")}`
    );
  }

  // Token breakdown
  if (result.tokenBreakdown.length > 0) {
    lines.push("");
    lines.push("## Token Breakdown");
    lines.push("");
    for (const entry of result.tokenBreakdown) {
      const lowK = (entry.estimatedTokens.low / 1000).toFixed(1);
      const highK = (entry.estimatedTokens.high / 1000).toFixed(1);
      lines.push(
        `- **${entry.path}** (${entry.source}): ~${lowK}k–${highK}k tokens (${entry.percentage}%)`
      );
    }
  }

  lines.push("");

  // Waste patterns
  if (result.wastePatterns.length > 0) {
    lines.push("## Waste Patterns");
    lines.push("");
    for (const wp of result.wastePatterns) {
      const icon = wp.severity === "warning" ? "!!" : "i";
      lines.push(`- [${icon}] **${wp.ruleId}**: ${wp.description}`);
    }
    lines.push("");
  }

  // Positive signals
  if (result.positiveSignals.length > 0) {
    lines.push("## Positive Signals");
    lines.push("");
    for (const ps of result.positiveSignals) {
      lines.push(`- **${ps.label}**: ${ps.description}`);
    }
    lines.push("");
  }

  // Suggestions
  if (result.suggestions.length > 0) {
    const active = result.suggestions.filter((s) => !s.dismissed);
    if (active.length > 0) {
      lines.push("## Suggestions");
      lines.push("");
      for (const s of active) {
        lines.push(`${s.priority}. ${s.text}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
