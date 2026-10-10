import { describe, it, expect } from "vitest";
import type { AnalysisResult } from "@deepwissen/preflight-core";
import { getTopReason } from "../../src/platform/status-helpers.js";

function r(partial: Record<string, unknown>): AnalysisResult {
  return {
    instructionFileIssues: [],
    secretFindings: [],
    contextWindowUsage: null,
    wastePatterns: [],
    contextSummary: { openTabCount: 0 },
    ...partial,
  } as unknown as AnalysisResult;
}

describe("getTopReason — priority ladder", () => {
  it("integrity error outranks everything", () => {
    expect(
      getTopReason(
        r({
          instructionFileIssues: [{ severity: "error", issue: "compound" }],
          secretFindings: [{ layer: 1, label: "AWS key" }],
        })
      )
    ).toBe("compound attack detected");
  });

  it("maps a known integrity warning, falls back for unknown", () => {
    expect(
      getTopReason(r({ instructionFileIssues: [{ severity: "warning", issue: "suspicious-instruction" }] }))
    ).toBe("prompt injection found");
    expect(
      getTopReason(r({ instructionFileIssues: [{ severity: "warning", issue: "mystery" }] }))
    ).toBe("integrity issue");
  });

  it("reports a layer-1 secret by label, else generically", () => {
    expect(getTopReason(r({ secretFindings: [{ layer: 1, label: "GitHub token" }] }))).toBe(
      "GitHub token exposed"
    );
    expect(getTopReason(r({ secretFindings: [{ layer: 2 }] }))).toBe("hardcoded secret found");
  });

  it("reports truncation risk above 90% window usage", () => {
    expect(
      getTopReason(r({ contextWindowUsage: { estimatedUsagePercent: 95, estimatedTokens: 1 } }))
    ).toBe("95% context window");
  });

  it("reports a bloated budget band even when the window is not full", () => {
    expect(
      getTopReason(
        r({
          contextWindowUsage: {
            estimatedUsagePercent: 40,
            budgetBand: "bloated",
            estimatedTokens: 82_000,
          },
        })
      )
    ).toBe("context bloated ~82k");
  });

  it("maps warning waste patterns, interpolating tab count", () => {
    expect(getTopReason(r({ wastePatterns: [{ severity: "warning", ruleId: "large-file" }] }))).toBe(
      "large file open"
    );
    expect(
      getTopReason(
        r({
          wastePatterns: [{ severity: "warning", ruleId: "too-many-tabs" }],
          contextSummary: { openTabCount: 12 },
        })
      )
    ).toBe("12 tabs open");
    expect(
      getTopReason(r({ wastePatterns: [{ severity: "warning", ruleId: "novel-rule" }] }))
    ).toBe("novel-rule");
  });

  it("returns undefined for a clean result", () => {
    expect(getTopReason(r({}))).toBeUndefined();
  });
});
