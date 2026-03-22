import type {
  AnalysisResult,
  ContextSnapshot,
  ContextSummary,
  TokenBand,
  ConfidenceLevel,
  RiskLevel,
  FileTokenBreakdown,
} from "../types.js";
import {
  CHARS_PER_TOKEN,
  TOKEN_BAND_LOW,
  TOKEN_BAND_HIGH,
} from "../types.js";

/**
 * Estimates token count from context sources.
 *
 * Uses characters / CHARS_PER_TOKEN as a heuristic.
 * Returns a range (low–high) rather than a single number
 * to avoid false precision.
 */
export function estimateTokens(
  context: ContextSnapshot,
  _partial: Partial<AnalysisResult>
): Partial<AnalysisResult> {
  const { totalChars, entries } = countTotalCharsWithBreakdown(context);

  const low = Math.round(totalChars / 5); // generous estimate
  const high = Math.round(totalChars / 3); // conservative estimate
  const midpoint = Math.round(totalChars / CHARS_PER_TOKEN);

  const band = classifyBand(midpoint);
  const confidence = assessConfidence(context);

  // Build per-source token breakdown
  const tokenBreakdown: FileTokenBreakdown[] = entries.map((entry) => ({
    source: entry.source,
    path: entry.path,
    estimatedTokens: {
      low: Math.round(entry.chars / 5),
      high: Math.round(entry.chars / 3),
    },
    percentage: totalChars > 0 ? Math.round((Math.abs(entry.chars) / totalChars) * 100) : 0,
  }));

  return {
    tokenEstimate: { low, high, band, confidence },
    riskLevel: bandToRisk(band),
    contextSummary: buildSummary(context),
    tokenBreakdown,
  };
}

interface CharBreakdownEntry {
  source: FileTokenBreakdown["source"];
  path: string;
  chars: number;
}

function countTotalCharsWithBreakdown(context: ContextSnapshot): {
  totalChars: number;
  entries: CharBreakdownEntry[];
} {
  const entries: CharBreakdownEntry[] = [];
  let total = 0;

  if (context.activeFile) {
    entries.push({
      source: "active-file",
      path: context.activeFile.path,
      chars: context.activeFile.charCount,
    });
    total += context.activeFile.charCount;
  }

  if (context.selection) {
    // Selection replaces the active file contribution
    const activeChars = context.activeFile?.charCount ?? 0;
    entries.push({
      source: "selection-override",
      path: context.activeFile?.path ?? "selection",
      chars: context.selection.charCount - activeChars,
    });
    total = context.selection.charCount;
  }

  for (const tab of context.openTabs) {
    if (!tab.isActive) {
      const tabChars = Math.round(tab.charCount * 0.3);
      entries.push({
        source: "tab",
        path: tab.path,
        chars: tabChars,
      });
      total += tabChars;
    }
  }

  for (const ref of context.referencedFiles) {
    entries.push({
      source: "referenced-file",
      path: ref.path,
      chars: ref.charCount,
    });
    total += ref.charCount;
  }

  if (context.terminalContent) {
    entries.push({
      source: "terminal",
      path: "Terminal output",
      chars: context.terminalContent.charCount,
    });
    total += context.terminalContent.charCount;
  }

  return { totalChars: total, entries };
}

function classifyBand(tokens: number): TokenBand {
  if (tokens < TOKEN_BAND_LOW) return "low";
  if (tokens > TOKEN_BAND_HIGH) return "high";
  return "medium";
}

function bandToRisk(band: TokenBand): RiskLevel {
  return band; // 1:1 mapping for v1
}

function buildSummary(context: ContextSnapshot): ContextSummary {
  const tabNames = context.openTabs
    .filter((t) => !t.isActive)
    .map((t) => t.path.split("/").pop() ?? t.path);

  return {
    activeFileName: context.activeFile?.path.split("/").pop() ?? null,
    selectionLines: context.selection?.lineCount ?? null,
    openTabCount: context.openTabs.length,
    openTabNames: tabNames,
  };
}

function assessConfidence(context: ContextSnapshot): ConfidenceLevel {
  if (context.terminalContent || context.clipboardSize) {
    return "low"; // uncertain content included
  }
  if (context.referencedFiles.length > 0 || context.openTabs.length > 3) {
    return "high"; // good picture — we can see multiple context sources
  }
  return "medium";
}
