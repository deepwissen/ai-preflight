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
  };
}

// Risk size-baseline is now budget-driven, so the requested tier is expressed
// as a token count that lands in the matching budget band (lean/heavy/bloated).
const TIER_TOKENS: Record<"low" | "medium" | "high", number> = {
  low: 150, // lean   (< 25k)
  medium: 40_000, // heavy  (25k–75k)
  high: 80_000, // bloated (> 75k)
};

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

  const tokens = TIER_TOKENS[band];
  return {
    tokenEstimate: {
      low: tokens,
      high: tokens,
      band,
      confidence: "medium",
    },
    riskLevel: band, // overwritten by scoreRisk; kept for shape completeness
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

  // ─── Security-sensitive rule escalation ──────────────────────

  it("sensitive-file independently escalates LOW to MEDIUM", () => {
    const result = scoreRisk(makeSnapshot(), {
      ...makePartial("low", 0),
      wastePatterns: [
        {
          ruleId: "sensitive-file",
          source: "id_rsa",
          description: "SSH key open",
          severity: "warning" as const,
          suggestion: "Close",
        },
      ],
    });
    expect(result.riskLevel).toBe("medium");
  });

  it("env-file independently escalates LOW to MEDIUM", () => {
    const result = scoreRisk(makeSnapshot(), {
      ...makePartial("low", 0),
      wastePatterns: [
        {
          ruleId: "env-file",
          source: ".env",
          description: ".env open",
          severity: "warning" as const,
          suggestion: "Close",
        },
      ],
    });
    expect(result.riskLevel).toBe("medium");
  });

  it("non-security waste alone on LOW stays at MEDIUM (normal escalation)", () => {
    const result = scoreRisk(makeSnapshot(), makePartial("low", 1));
    expect(result.riskLevel).toBe("medium");
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

  // ─── Context-size risk is budget-driven (not the raw token band) ───

  /** Builds a partial whose token-estimate `band` field is set independently
   *  of the actual token count, to prove the band field is ignored and the
   *  budget band (from the token count) drives size-risk. */
  function makeBudgetPartial(
    band: "low" | "medium" | "high",
    midpointEachSide: number
  ): Partial<AnalysisResult> {
    return {
      tokenEstimate: { low: midpointEachSide, high: midpointEachSide, band, confidence: "medium" },
      riskLevel: band,
      wastePatterns: [],
    };
  }

  it("a bloated context is HIGH regardless of the token band field", () => {
    // 80k tokens → bloated → high, even though the band field says "low".
    const result = scoreRisk(makeSnapshot(), makeBudgetPartial("low", 80_000));
    expect(result.riskLevel).toBe("high");
  });

  it("a heavy context is MEDIUM regardless of the token band field", () => {
    // 40k tokens → heavy → medium, even though the band field says "low".
    const result = scoreRisk(makeSnapshot(), makeBudgetPartial("low", 40_000));
    expect(result.riskLevel).toBe("medium");
  });

  it("a lean context is LOW even when the token band field says HIGH", () => {
    // Budget-driven risk REPLACES the band: a tiny (lean) context is LOW.
    // This is the deliberate relaxation vs. the old 8k token-band cliff.
    const result = scoreRisk(makeSnapshot(), makeBudgetPartial("high", 500));
    expect(result.riskLevel).toBe("low");
  });

  it("honors custom budget thresholds from the snapshot", () => {
    const snapshot = { ...makeSnapshot(), budgetThresholds: { heavy: 5_000, bloated: 10_000 } };
    // 12k tokens → bloated under the custom 10k threshold → high.
    const result = scoreRisk(snapshot, makeBudgetPartial("low", 12_000));
    expect(result.riskLevel).toBe("high");
  });
});
