import { describe, it, expect } from "vitest";
import { runPipeline } from "../../src/core/pipeline.js";
import { estimateTokens } from "../../src/core/analyzers/token-estimator.js";
import { detectWaste } from "../../src/core/analyzers/waste-detector.js";
import { scoreRisk } from "../../src/core/analyzers/risk-scorer.js";
import { detectPositiveSignals } from "../../src/core/analyzers/positive-signals.js";
import { detectToolAwareIssues } from "../../src/core/analyzers/tool-aware-analyzer.js";
import type { AnalyzerStep, AnalysisResult } from "../../src/core/types.js";
import type { AnalysisUpdateMessage } from "../../src/core/messages.js";
import {
  CLEAN_SMALL,
  MEDIUM_WITH_SELECTION,
  NOISY_LARGE,
  LARGE_SELECTION,
  EMPTY,
  MIXED_TEST_PROD,
} from "../fixtures/context-snapshots.js";

/**
 * Contract tests: verify the full pipeline produces valid, complete results
 * that match the message shape the webview expects.
 *
 * These catch wiring issues between:
 *   pipeline output → postMessage → webview rendering
 */

const PIPELINE: AnalyzerStep[] = [estimateTokens, detectWaste, scoreRisk, detectPositiveSignals, detectToolAwareIssues];

function assertValidResult(result: AnalysisResult): void {
  // Required fields exist
  expect(result.timestamp).toBeTypeOf("number");
  expect(result.riskLevel).toMatch(/^(low|medium|high)$/);
  expect(result.tokenEstimate).toBeDefined();
  expect(result.tokenEstimate.low).toBeTypeOf("number");
  expect(result.tokenEstimate.high).toBeTypeOf("number");
  expect(result.tokenEstimate.low).toBeLessThanOrEqual(result.tokenEstimate.high);
  expect(result.tokenEstimate.band).toMatch(/^(low|medium|high)$/);
  expect(result.tokenEstimate.confidence).toMatch(/^(low|medium|high)$/);
  expect(Array.isArray(result.wastePatterns)).toBe(true);
  expect(Array.isArray(result.positiveSignals)).toBe(true);
  expect(Array.isArray(result.suggestions)).toBe(true);

  // Every waste pattern has required fields
  for (const wp of result.wastePatterns) {
    expect(wp.ruleId).toBeTypeOf("string");
    expect(wp.source).toBeTypeOf("string");
    expect(wp.description).toBeTypeOf("string");
    expect(wp.severity).toMatch(/^(info|warning)$/);
    expect(wp.suggestion).toBeTypeOf("string");
  }

  // Every suggestion has required fields
  for (const s of result.suggestions) {
    expect(s.id).toBeTypeOf("string");
    expect(s.text).toBeTypeOf("string");
    expect(s.priority).toBeTypeOf("number");
    expect(s.dismissed).toBeTypeOf("boolean");
    if (s.action) {
      expect(s.action.command).toBeTypeOf("string");
      expect(s.action.label).toBeTypeOf("string");
    }
  }

  // Token breakdown
  expect(Array.isArray(result.tokenBreakdown)).toBe(true);
  for (const entry of result.tokenBreakdown) {
    expect(entry.source).toBeTypeOf("string");
    expect(entry.path).toBeTypeOf("string");
    expect(entry.estimatedTokens.low).toBeTypeOf("number");
    expect(entry.estimatedTokens.high).toBeTypeOf("number");
    expect(entry.percentage).toBeTypeOf("number");
  }

  // Suggestions count >= waste patterns (tool-aware analyzer may add extra suggestions)
  expect(result.suggestions.length).toBeGreaterThanOrEqual(result.wastePatterns.length);

  // Result can be wrapped in a valid message
  const message: AnalysisUpdateMessage = {
    type: "analysis-update",
    data: result,
  };
  expect(message.type).toBe("analysis-update");
  expect(message.data).toBe(result);
}

describe("Full pipeline contract", () => {
  it("CLEAN_SMALL → LOW risk, no waste", () => {
    const result = runPipeline(CLEAN_SMALL, PIPELINE);
    assertValidResult(result);

    expect(result.riskLevel).toBe("low");
    expect(result.wastePatterns).toHaveLength(0);
    expect(result.suggestions).toHaveLength(0);
    // Clean context should have positive signals
    const signalIds = result.positiveSignals.map((s) => s.id);
    expect(signalIds).toContain("clean-context");
    expect(signalIds).toContain("ai-instructions-loaded");
  });

  it("MEDIUM_WITH_SELECTION → uses selection size for estimate", () => {
    const result = runPipeline(MEDIUM_WITH_SELECTION, PIPELINE);
    assertValidResult(result);

    // Selection is 3200 chars → ~800 tokens midpoint + referenced file 8000 chars
    // Total should be moderate, not huge (because selection overrides file)
    expect(result.tokenEstimate.low).toBeLessThan(10000);
  });

  it("NOISY_LARGE → HIGH risk, multiple waste patterns", () => {
    const result = runPipeline(NOISY_LARGE, PIPELINE);
    assertValidResult(result);

    expect(result.riskLevel).toBe("high");
    expect(result.wastePatterns.length).toBeGreaterThanOrEqual(2);

    const ruleIds = result.wastePatterns.map((w) => w.ruleId);
    expect(ruleIds).toContain("large-file");
    expect(ruleIds).toContain("many-tabs");
    // 1500-line file with no selection
    expect(ruleIds).toContain("no-selection-large-file");
  });

  it("LARGE_SELECTION → warns about large selection, risk boosted to HIGH", () => {
    const result = runPipeline(LARGE_SELECTION, PIPELINE);
    assertValidResult(result);

    const ruleIds = result.wastePatterns.map((w) => w.ruleId);
    expect(ruleIds).toContain("large-selection");
    // large-file should also trigger (3000 lines)
    expect(ruleIds).toContain("large-file");
    // Risk boost: MEDIUM band + 2 waste patterns → HIGH
    expect(result.riskLevel).toBe("high");
    // no-selection-large-file should NOT trigger (selection exists)
    expect(ruleIds).not.toContain("no-selection-large-file");
  });

  it("EMPTY → LOW risk, no crash", () => {
    const result = runPipeline(EMPTY, PIPELINE);
    assertValidResult(result);

    expect(result.riskLevel).toBe("low");
    expect(result.tokenEstimate.low).toBe(0);
    expect(result.tokenEstimate.high).toBe(0);
  });

  it("MIXED_TEST_PROD → detects test-prod-mixed pattern", () => {
    const result = runPipeline(MIXED_TEST_PROD, PIPELINE);
    assertValidResult(result);

    const ruleIds = result.wastePatterns.map((w) => w.ruleId);
    expect(ruleIds).toContain("test-prod-mixed");
  });

  it("tool profile activates context window meter and tool-specific suggestions", () => {
    const snapshot = {
      ...CLEAN_SMALL,
      toolProfile: { toolId: "cursor" as const, detectedVia: "setting" as const },
      aiInstructionFiles: [], // no instruction files → should trigger F2
      ignoreFiles: [], // no ignore files → should trigger F4
    };

    const result = runPipeline(snapshot, PIPELINE);
    assertValidResult(result);

    // F1: Context window usage should be populated
    expect(result.contextWindowUsage).not.toBeNull();
    expect(result.contextWindowUsage!.toolId).toBe("cursor");
    expect(result.contextWindowUsage!.contextWindowTokens).toBe(200_000);

    // F2: Should suggest creating .cursorrules
    const texts = result.suggestions.map((s) => s.text);
    expect(texts.some((t) => t.includes(".cursorrules"))).toBe(true);

    // F4: Should suggest creating .cursorignore
    expect(texts.some((t) => t.includes(".cursorignore"))).toBe(true);

    // Tool annotations should be empty (cursor tabs DO matter)
    expect(Object.keys(result.toolAnnotations)).toHaveLength(0);
  });

  it("claude-code profile suppresses tab-related waste patterns", () => {
    const snapshot = {
      ...NOISY_LARGE,
      toolProfile: { toolId: "claude-code" as const, detectedVia: "auto" as const },
    };

    const result = runPipeline(snapshot, PIPELINE);
    assertValidResult(result);

    // Tab rules should be suppressed for claude-code
    expect(result.toolAnnotations["many-tabs"]).toBeDefined();
    expect(result.toolAnnotations["many-tabs"].suppressed).toBe(true);

    // Non-tab rules should NOT be suppressed
    expect(result.toolAnnotations["large-file"]).toBeUndefined();
  });
});
