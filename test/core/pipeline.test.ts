import { describe, it, expect, vi } from "vitest";
import { runPipeline } from "../../src/core/pipeline.js";
import type { ContextSnapshot, AnalyzerStep } from "../../src/core/types.js";

function makeSnapshot(): ContextSnapshot {
  return {
    timestamp: Date.now(),
    activeFile: {
      path: "test.ts",
      languageId: "typescript",
      lineCount: 100,
      charCount: 4000,
      isActive: true,
      isDirty: false,
      commentLineCount: 0,
      hasConflictMarkers: false,
    },
    selection: null,
    openTabs: [],
    referencedFiles: [],
    terminalContent: null,
    clipboardSize: null,
    chatHistoryLength: 0,
    aiInstructionFiles: [{ path: ".cursorrules", lineCount: 20, toolId: "cursor" as const }],
    toolProfile: null,
    ignoreFiles: [],
  };
}

describe("runPipeline", () => {
  it("returns a complete result with default values for empty pipeline", () => {
    const result = runPipeline(makeSnapshot(), []);

    expect(result.timestamp).toBeTypeOf("number");
    expect(result.riskLevel).toBe("low");
    expect(result.tokenEstimate.band).toBe("low");
    expect(result.wastePatterns).toEqual([]);
    expect(result.suggestions).toEqual([]);
    expect(result.taskType).toBeNull();
    expect(result.modelSuggestion).toBeNull();
  });

  it("runs steps in order and merges results", () => {
    const step1: AnalyzerStep = () => ({
      riskLevel: "medium",
    });

    const step2: AnalyzerStep = () => ({
      taskType: "debugging",
    });

    const result = runPipeline(makeSnapshot(), [step1, step2]);

    expect(result.riskLevel).toBe("medium");
    expect(result.taskType).toBe("debugging");
  });

  it("later steps can see results from earlier steps", () => {
    const step1: AnalyzerStep = () => ({
      riskLevel: "high",
    });

    const step2: AnalyzerStep = (_ctx, partial) => {
      // Step 2 can read step 1's output
      if (partial.riskLevel === "high") {
        return {
          suggestions: [
            { id: "warn", text: "High risk detected", priority: 1, dismissed: false },
          ],
        };
      }
      return {};
    };

    const result = runPipeline(makeSnapshot(), [step1, step2]);

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].text).toBe("High risk detected");
  });

  it("concatenates arrays instead of overwriting them", () => {
    const step1: AnalyzerStep = () => ({
      wastePatterns: [
        {
          ruleId: "rule-a",
          source: "test",
          description: "Pattern A",
          severity: "info" as const,
          suggestion: "Fix A",
        },
      ],
      suggestions: [
        { id: "sug-a", text: "Suggestion A", priority: 1, dismissed: false },
      ],
    });

    const step2: AnalyzerStep = () => ({
      wastePatterns: [
        {
          ruleId: "rule-b",
          source: "test",
          description: "Pattern B",
          severity: "warning" as const,
          suggestion: "Fix B",
        },
      ],
      suggestions: [
        { id: "sug-b", text: "Suggestion B", priority: 2, dismissed: false },
      ],
    });

    const result = runPipeline(makeSnapshot(), [step1, step2]);

    // Both steps' arrays should be present, not just step2's
    expect(result.wastePatterns).toHaveLength(2);
    expect(result.suggestions).toHaveLength(2);
    expect(result.wastePatterns.map((w) => w.ruleId)).toEqual([
      "rule-a",
      "rule-b",
    ]);
    expect(result.suggestions.map((s) => s.id)).toEqual(["sug-a", "sug-b"]);
  });

  it("concatenates positiveSignals from multiple steps", () => {
    const step1: AnalyzerStep = () => ({
      positiveSignals: [
        { id: "signal-a", label: "A", description: "Signal A" },
      ],
    });

    const step2: AnalyzerStep = () => ({
      positiveSignals: [
        { id: "signal-b", label: "B", description: "Signal B" },
      ],
    });

    const result = runPipeline(makeSnapshot(), [step1, step2]);

    expect(result.positiveSignals).toHaveLength(2);
    expect(result.positiveSignals.map((s) => s.id)).toEqual(["signal-a", "signal-b"]);
  });

  it("continues pipeline if a step throws", () => {
    const failingStep: AnalyzerStep = () => {
      throw new Error("step failed");
    };

    const goodStep: AnalyzerStep = () => ({
      taskType: "coding",
    });

    // Suppress console.error for this test
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = runPipeline(makeSnapshot(), [failingStep, goodStep]);

    expect(result.taskType).toBe("coding");
    spy.mockRestore();
  });
});
