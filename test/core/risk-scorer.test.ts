import { describe, it, expect } from "vitest";
import { scoreRisk } from "../../src/core/analyzers/risk-scorer.js";
import type { ContextSnapshot, AnalysisResult } from "../../src/core/types.js";

function makeSnapshot(): ContextSnapshot {
  return {
    timestamp: Date.now(),
    activeFile: null,
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

function makePartial(
  band: "low" | "medium" | "high",
  wasteCount: number
): Partial<AnalysisResult> {
  const wastePatterns = Array.from({ length: wasteCount }, (_, i) => ({
    ruleId: `rule-${i}`,
    source: "test",
    description: `waste pattern ${i}`,
    severity: "warning" as const,
    suggestion: `fix ${i}`,
  }));

  return {
    tokenEstimate: {
      low: 100,
      high: 200,
      band,
      confidence: "medium",
    },
    riskLevel: band, // initial risk = band (from token estimator)
    wastePatterns,
  };
}

describe("scoreRisk", () => {
  it("keeps LOW when no waste patterns", () => {
    const result = scoreRisk(makeSnapshot(), makePartial("low", 0));
    expect(result.riskLevel).toBe("low");
  });

  it("bumps LOW to MEDIUM when waste is present", () => {
    const result = scoreRisk(makeSnapshot(), makePartial("low", 1));
    expect(result.riskLevel).toBe("medium");
  });

  it("bumps LOW to MEDIUM when multiple waste patterns present", () => {
    const result = scoreRisk(makeSnapshot(), makePartial("low", 3));
    expect(result.riskLevel).toBe("medium");
  });

  it("keeps MEDIUM when only 1 waste pattern", () => {
    const result = scoreRisk(makeSnapshot(), makePartial("medium", 1));
    expect(result.riskLevel).toBe("medium");
  });

  it("bumps MEDIUM to HIGH when 2+ waste patterns", () => {
    const result = scoreRisk(makeSnapshot(), makePartial("medium", 2));
    expect(result.riskLevel).toBe("high");
  });

  it("bumps MEDIUM to HIGH when 3+ waste patterns", () => {
    const result = scoreRisk(makeSnapshot(), makePartial("medium", 3));
    expect(result.riskLevel).toBe("high");
  });

  it("keeps HIGH as HIGH regardless of waste", () => {
    const result = scoreRisk(makeSnapshot(), makePartial("high", 0));
    expect(result.riskLevel).toBe("high");
  });

  it("keeps HIGH as HIGH even with waste patterns", () => {
    const result = scoreRisk(makeSnapshot(), makePartial("high", 5));
    expect(result.riskLevel).toBe("high");
  });

  it("returns empty object when no token estimate exists", () => {
    const result = scoreRisk(makeSnapshot(), {});
    expect(result.riskLevel).toBeUndefined();
  });
});
