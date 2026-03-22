import type { AnalysisResult, ContextSnapshot, PositiveSignal } from "../types.js";

/**
 * Detects positive context patterns — things the user is doing right.
 * Provides positive reinforcement alongside waste detection.
 */
export function detectPositiveSignals(
  context: ContextSnapshot,
  partial: Partial<AnalysisResult>
): Partial<AnalysisResult> {
  const positiveSignals: PositiveSignal[] = [];

  // Signal: Clean context (no waste, low tokens, file actually open)
  const wasteCount = partial.wastePatterns?.length ?? 0;
  const band = partial.tokenEstimate?.band;
  if (context.activeFile && wasteCount === 0 && (band === "low" || band === "medium")) {
    positiveSignals.push({
      id: "clean-context",
      label: "Clean context",
      description: "No waste detected — your context is ready for AI",
    });
  }

  // Signal: Good selection scope
  if (
    context.selection &&
    context.activeFile &&
    context.activeFile.lineCount >= 100 &&
    context.selection.lineCount > 0 &&
    context.selection.lineCount <= 200
  ) {
    positiveSignals.push({
      id: "good-selection",
      label: "Focused selection",
      description: "Selection narrows the context to relevant code",
    });
  }

  // Signal: AI instruction files loaded
  if (context.aiInstructionFiles.length > 0) {
    positiveSignals.push({
      id: "ai-instructions-loaded",
      label: "AI instructions active",
      description: `${context.aiInstructionFiles.length} instruction file(s) guiding AI responses`,
    });
  }

  // Signal: Focused workspace (tabs in same module — meaningful with 3+)
  if (context.openTabs.length >= 3) {
    const modules = new Set(
      context.openTabs.map((t) => {
        const parts = t.path.split("/");
        return parts.length >= 3 ? `${parts[0]}/${parts[1]}` : (parts[0] ?? ".");
      })
    );
    if (modules.size <= 2) {
      positiveSignals.push({
        id: "focused-workspace",
        label: "Focused workspace",
        description: "Open tabs are concentrated in related modules",
      });
    }
  }

  return { positiveSignals };
}
