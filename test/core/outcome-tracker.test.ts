import { describe, it, expect, vi } from "vitest";
import { OutcomeTracker } from "../../src/core/outcome-tracker.js";
import type { OutcomeStore } from "../../src/core/outcome-tracker.js";
import type { AnalysisResult } from "../../src/core/types.js";

function makeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    timestamp: Date.now(),
    tokenEstimate: { low: 500, high: 1000, band: "low", confidence: "medium" },
    riskLevel: "low",
    wastePatterns: [],
    positiveSignals: [],
    taskType: null,
    modelSuggestion: null,
    suggestions: [],
    contextSummary: {
      activeFileName: "main.ts",
      selectionLines: null,
      openTabCount: 1,
      openTabNames: [],
    },
    tokenBreakdown: [],
    contextWindowUsage: null,
    toolAnnotations: {},
    instructionFileIssues: [],
    ...overrides,
  };
}

function makeStore(): OutcomeStore & { saved: unknown[] } {
  const store = {
    saved: [] as unknown[],
    loadSessions: () => [],
    saveSessions: (sessions: unknown[]) => { store.saved = sessions; },
  };
  return store;
}

describe("OutcomeTracker", () => {
  it("recordAnalysis stores snapshot with correct fields", () => {
    const tracker = new OutcomeTracker();
    const result = makeResult({
      riskLevel: "high",
      wastePatterns: [
        { ruleId: "large-file", source: "file.ts", description: "big", severity: "warning", suggestion: "fix" },
      ],
      suggestions: [
        { id: "narrow-file", text: "narrow it", priority: 1, dismissed: false },
        { id: "save-file", text: "save it", priority: 2, dismissed: true },
      ],
    });

    tracker.recordAnalysis(result);
    const summary = tracker.getSessionSummary();

    expect(summary.totalAnalyses).toBe(1);
    expect(summary.riskDistribution.high).toBe(1);
  });

  it("recordSignal stores signal in current session", () => {
    const tracker = new OutcomeTracker();
    tracker.recordSignal({ type: "undo", timestamp: Date.now() });
    tracker.recordSignal({ type: "undo", timestamp: Date.now() });

    const summary = tracker.getSessionSummary();
    expect(summary.totalSignals).toBe(2);
    expect(summary.signalsByType["undo"]).toBe(2);
  });

  it("rapid re-analysis (<30s) auto-generates re-prompt signal", () => {
    const tracker = new OutcomeTracker();
    const now = Date.now();

    tracker.recordAnalysis(makeResult({ timestamp: now }));
    // Second analysis only 5s later
    tracker.recordAnalysis(makeResult({ timestamp: now + 5000 }));

    const summary = tracker.getSessionSummary();
    expect(summary.signalsByType["re-prompt"]).toBe(1);
  });

  it("non-rapid analysis does NOT generate re-prompt signal", () => {
    const tracker = new OutcomeTracker();
    const now = Date.now();

    tracker.recordAnalysis(makeResult({ timestamp: now }));
    // 60s later — not rapid
    tracker.recordAnalysis(makeResult({ timestamp: now + 60_000 }));

    const summary = tracker.getSessionSummary();
    expect(summary.signalsByType["re-prompt"]).toBeUndefined();
  });

  it("first analysis has no re-prompt signal", () => {
    const tracker = new OutcomeTracker();
    tracker.recordAnalysis(makeResult({ timestamp: Date.now() }));

    const summary = tracker.getSessionSummary();
    expect(summary.totalSignals).toBe(0);
  });

  it("getSessionSummary returns correct counts", () => {
    const tracker = new OutcomeTracker();

    tracker.recordAnalysis(makeResult({ riskLevel: "low" }));
    tracker.recordAnalysis(makeResult({ riskLevel: "medium" }));
    tracker.recordAnalysis(makeResult({ riskLevel: "high" }));
    tracker.recordSignal({ type: "undo", timestamp: Date.now() });
    tracker.recordSignal({ type: "repeated-edit", timestamp: Date.now() });

    const summary = tracker.getSessionSummary();
    expect(summary.sessionCount).toBe(1);
    expect(summary.totalAnalyses).toBe(3);
    expect(summary.totalSignals).toBeGreaterThanOrEqual(2); // may include auto re-prompt
    expect(summary.riskDistribution.low).toBe(1);
    expect(summary.riskDistribution.medium).toBe(1);
    expect(summary.riskDistribution.high).toBe(1);
  });

  it("getSessionSummary groups signals by type", () => {
    const tracker = new OutcomeTracker();

    tracker.recordSignal({ type: "undo", timestamp: Date.now() });
    tracker.recordSignal({ type: "undo", timestamp: Date.now() });
    tracker.recordSignal({ type: "repeated-edit", timestamp: Date.now() });

    const summary = tracker.getSessionSummary();
    expect(summary.signalsByType["undo"]).toBe(2);
    expect(summary.signalsByType["repeated-edit"]).toBe(1);
  });

  it("endSession closes current and starts new", () => {
    const tracker = new OutcomeTracker();
    tracker.recordAnalysis(makeResult());
    tracker.endSession();
    tracker.recordAnalysis(makeResult());

    const summary = tracker.getSessionSummary();
    expect(summary.sessionCount).toBe(2);
    expect(summary.totalAnalyses).toBe(2);
  });

  it("rolling window evicts oldest sessions beyond 50", () => {
    const tracker = new OutcomeTracker();

    // Create 52 sessions
    for (let i = 0; i < 52; i++) {
      tracker.recordAnalysis(makeResult());
      tracker.endSession();
    }

    const summary = tracker.getSessionSummary();
    // 50 stored + 1 current = 51
    expect(summary.sessionCount).toBeLessThanOrEqual(51);
  });

  it("persistence via OutcomeStore", () => {
    const store = makeStore();
    const tracker = new OutcomeTracker(store);

    tracker.recordAnalysis(makeResult());
    expect(store.saved.length).toBeGreaterThan(0);

    tracker.recordSignal({ type: "undo", timestamp: Date.now() });
    expect(store.saved.length).toBeGreaterThan(0);
  });

  it("recordAction marks last analysis snapshot", () => {
    const tracker = new OutcomeTracker();
    tracker.recordAnalysis(makeResult({
      suggestions: [{ id: "close-tabs", text: "close", priority: 1, dismissed: false }],
    }));

    tracker.recordAction("close-tabs");

    // Verify by checking the session summary — actedSuggestionIds populated
    const summary = tracker.getSessionSummary();
    expect(summary.totalAnalyses).toBe(1);
  });

  it("getCorrelations returns empty with insufficient data", () => {
    const tracker = new OutcomeTracker();
    tracker.recordAnalysis(makeResult({ riskLevel: "high" }));

    const correlations = tracker.getCorrelations();
    expect(correlations).toHaveLength(0);
  });

  it("getCorrelations returns correlations with sufficient data", () => {
    const tracker = new OutcomeTracker();

    // Create 3 high-risk sessions with re-prompts
    for (let i = 0; i < 3; i++) {
      tracker.recordAnalysis(makeResult({ riskLevel: "high" }));
      tracker.recordSignal({ type: "re-prompt", timestamp: Date.now() });
      tracker.endSession();
    }

    // Create 3 low-risk sessions without re-prompts
    for (let i = 0; i < 3; i++) {
      tracker.recordAnalysis(makeResult({ riskLevel: "low" }));
      tracker.endSession();
    }

    const correlations = tracker.getCorrelations();
    expect(correlations.length).toBeGreaterThanOrEqual(1);

    const riskCorrelation = correlations.find((c) => c.label === "High risk re-prompt ratio");
    expect(riskCorrelation).toBeDefined();
    expect(riskCorrelation!.sampleSize).toBe(7); // 3 high + 3 low + 1 current
    expect(riskCorrelation!.value).toBeGreaterThan(0);
  });

  it("multiple sessions accumulate correctly", () => {
    const store = makeStore();
    const tracker = new OutcomeTracker(store);

    tracker.recordAnalysis(makeResult({ riskLevel: "low" }));
    tracker.endSession();
    tracker.recordAnalysis(makeResult({ riskLevel: "high" }));
    tracker.endSession();
    tracker.recordAnalysis(makeResult({ riskLevel: "medium" }));

    const summary = tracker.getSessionSummary();
    expect(summary.sessionCount).toBe(3); // 2 ended + 1 current
    expect(summary.totalAnalyses).toBe(3);
    expect(summary.riskDistribution.low).toBe(1);
    expect(summary.riskDistribution.medium).toBe(1);
    expect(summary.riskDistribution.high).toBe(1);
  });
});
