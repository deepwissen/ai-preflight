import { describe, it, expect } from "vitest";
import { scoreRisk } from "../../src/core/analyzers/risk-scorer.js";
import type {
  ContextSnapshot,
  AnalysisResult,
  InstructionFileIssue,
} from "../../src/core/types.js";

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
    activeFileTestPairs: [],
  };
}

function makePartial(
  band: "low" | "medium" | "high",
  wasteCount: number,
  integrityIssues?: InstructionFileIssue[]
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
    ...(integrityIssues ? { instructionFileIssues: integrityIssues } : {}),
  };
}

function makeIntegrityIssue(
  severity: "info" | "warning" | "error",
  issue: InstructionFileIssue["issue"] = "suspicious-instruction"
): InstructionFileIssue {
  return {
    id: `integrity-${issue}-test`,
    filePath: ".cursorrules",
    issue,
    severity,
    lineNumber: 1,
    matchedText: "test",
    description: "test issue",
    suggestion: "fix it",
  };
}

describe("scoreRisk", () => {
  // ─── Waste-based rules (existing) ───────────────────────────────

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

  // ─── Integrity-based floor ─────────────────────────────────────

  it("error integrity finding raises LOW to HIGH", () => {
    const result = scoreRisk(
      makeSnapshot(),
      makePartial("low", 0, [makeIntegrityIssue("error")])
    );
    expect(result.riskLevel).toBe("high");
  });

  it("error integrity finding raises MEDIUM to HIGH", () => {
    const result = scoreRisk(
      makeSnapshot(),
      makePartial("medium", 0, [makeIntegrityIssue("error")])
    );
    expect(result.riskLevel).toBe("high");
  });

  it("error integrity finding keeps HIGH as HIGH", () => {
    const result = scoreRisk(
      makeSnapshot(),
      makePartial("high", 0, [makeIntegrityIssue("error")])
    );
    expect(result.riskLevel).toBe("high");
  });

  it("warning integrity finding raises LOW to MEDIUM", () => {
    const result = scoreRisk(
      makeSnapshot(),
      makePartial("low", 0, [makeIntegrityIssue("warning")])
    );
    expect(result.riskLevel).toBe("medium");
  });

  it("warning integrity finding keeps MEDIUM as MEDIUM", () => {
    const result = scoreRisk(
      makeSnapshot(),
      makePartial("medium", 0, [makeIntegrityIssue("warning")])
    );
    expect(result.riskLevel).toBe("medium");
  });

  it("info integrity finding does NOT raise LOW", () => {
    const result = scoreRisk(
      makeSnapshot(),
      makePartial("low", 0, [makeIntegrityIssue("info")])
    );
    expect(result.riskLevel).toBe("low");
  });

  it("error overrides waste-based MEDIUM (compound attack scenario)", () => {
    // Band is low, no waste → would stay LOW
    // But error integrity finding → HIGH
    const result = scoreRisk(
      makeSnapshot(),
      makePartial("low", 0, [makeIntegrityIssue("error")])
    );
    expect(result.riskLevel).toBe("high");
  });

  it("multiple integrity findings: highest severity wins", () => {
    const result = scoreRisk(
      makeSnapshot(),
      makePartial("low", 0, [
        makeIntegrityIssue("info", "hidden-unicode"),
        makeIntegrityIssue("warning", "bidi-override"),
        makeIntegrityIssue("error", "suspicious-instruction"),
      ])
    );
    expect(result.riskLevel).toBe("high");
  });

  it("waste + integrity combine: waste bumps to MEDIUM, error bumps to HIGH", () => {
    const result = scoreRisk(
      makeSnapshot(),
      makePartial("low", 1, [makeIntegrityIssue("error")])
    );
    expect(result.riskLevel).toBe("high");
  });

  it("no integrity issues keeps waste-only behavior", () => {
    const result = scoreRisk(
      makeSnapshot(),
      makePartial("low", 1, [])
    );
    expect(result.riskLevel).toBe("medium");
  });
});
