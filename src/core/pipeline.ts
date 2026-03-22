import type { AnalysisResult, AnalyzerStep, ContextSnapshot } from "./types.js";

/**
 * Runs a context snapshot through an ordered list of analyzer steps.
 * Each step receives the context and the accumulated partial result.
 * Steps are independent — a failing step doesn't block others.
 */
export function runPipeline(
  context: ContextSnapshot,
  steps: AnalyzerStep[]
): AnalysisResult {
  let partial: Partial<AnalysisResult> = {
    timestamp: Date.now(),
    suggestions: [],
    wastePatterns: [],
    positiveSignals: [],
  };

  for (const step of steps) {
    try {
      const result = step(context, partial);
      partial = {
        ...partial,
        ...result,
        // Concatenate arrays instead of overwriting
        wastePatterns: [
          ...(partial.wastePatterns ?? []),
          ...(result.wastePatterns ?? []),
        ],
        suggestions: [
          ...(partial.suggestions ?? []),
          ...(result.suggestions ?? []),
        ],
        positiveSignals: [
          ...(partial.positiveSignals ?? []),
          ...(result.positiveSignals ?? []),
        ],
      };
    } catch (err) {
      console.error("[Pipeline] Step failed, skipping:", err);
    }
  }

  return toComplete(partial);
}

/** Fills in defaults for any missing fields. */
function toComplete(partial: Partial<AnalysisResult>): AnalysisResult {
  return {
    timestamp: partial.timestamp ?? Date.now(),
    tokenEstimate: partial.tokenEstimate ?? {
      low: 0,
      high: 0,
      band: "low",
      confidence: "low",
    },
    riskLevel: partial.riskLevel ?? "low",
    wastePatterns: partial.wastePatterns ?? [],
    positiveSignals: partial.positiveSignals ?? [],
    taskType: partial.taskType ?? null,
    modelSuggestion: partial.modelSuggestion ?? null,
    suggestions: partial.suggestions ?? [],
    contextSummary: partial.contextSummary ?? {
      activeFileName: null,
      selectionLines: null,
      openTabCount: 0,
      openTabNames: [],
    },
    tokenBreakdown: partial.tokenBreakdown ?? [],
    contextWindowUsage: partial.contextWindowUsage ?? null,
    toolAnnotations: partial.toolAnnotations ?? {},
    instructionFileIssues: partial.instructionFileIssues ?? [],
    outcomeInsights: partial.outcomeInsights,
  };
}
