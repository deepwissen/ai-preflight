import { describe, it, expect } from "vitest";
import { detectPositiveSignals } from "../../src/core/analyzers/positive-signals.js";
import type { ContextSnapshot, FileInfo } from "../../src/core/types.js";

function makeSnapshot(
  overrides: Partial<ContextSnapshot> = {}
): ContextSnapshot {
  return {
    timestamp: Date.now(),
    activeFile: null,
    selection: null,
    openTabs: [],
    referencedFiles: [],
    terminalContent: null,
    clipboardSize: null,
    chatHistoryLength: 0,
    aiInstructionFiles: [],
    toolProfile: null,
    ignoreFiles: [],
    ...overrides,
  };
}

function makeFile(overrides: Partial<FileInfo> = {}): FileInfo {
  return {
    path: "src/default.ts",
    languageId: "typescript",
    lineCount: 100,
    charCount: 4000,
    isActive: false,
    isDirty: false,
    commentLineCount: 0,
    hasConflictMarkers: false,
    ...overrides,
  };
}

describe("detectPositiveSignals", () => {
  it("signals clean context when no waste and low tokens", () => {
    const result = detectPositiveSignals(
      makeSnapshot({ activeFile: makeFile({ isActive: true }) }),
      {
        wastePatterns: [],
        tokenEstimate: { low: 100, high: 300, band: "low", confidence: "medium" },
      }
    );

    const ids = result.positiveSignals!.map((s) => s.id);
    expect(ids).toContain("clean-context");
  });

  it("does NOT signal clean-context on high token band", () => {
    const result = detectPositiveSignals(
      makeSnapshot({ activeFile: makeFile({ isActive: true }) }),
      {
        wastePatterns: [],
        tokenEstimate: { low: 10000, high: 30000, band: "high", confidence: "medium" },
      }
    );

    const ids = result.positiveSignals!.map((s) => s.id);
    expect(ids).not.toContain("clean-context");
  });

  it("does NOT signal clean context when waste exists", () => {
    const result = detectPositiveSignals(makeSnapshot(), {
      wastePatterns: [
        {
          ruleId: "large-file",
          source: "test",
          description: "large",
          severity: "warning",
          suggestion: "fix",
        },
      ],
      tokenEstimate: { low: 100, high: 300, band: "low", confidence: "medium" },
    });

    const ids = result.positiveSignals!.map((s) => s.id);
    expect(ids).not.toContain("clean-context");
  });

  it("signals good selection scope when selection is reasonable", () => {
    const result = detectPositiveSignals(
      makeSnapshot({
        activeFile: makeFile({ lineCount: 600, isActive: true }),
        selection: { lineCount: 30, charCount: 1200, text: "function foo() {}" },
      }),
      { wastePatterns: [] }
    );

    const ids = result.positiveSignals!.map((s) => s.id);
    expect(ids).toContain("good-selection");
  });

  it("does NOT signal good selection when selection is too large", () => {
    const result = detectPositiveSignals(
      makeSnapshot({
        activeFile: makeFile({ lineCount: 600, isActive: true }),
        selection: { lineCount: 600, charCount: 24000, text: "..." },
      }),
      { wastePatterns: [] }
    );

    const ids = result.positiveSignals!.map((s) => s.id);
    expect(ids).not.toContain("good-selection");
  });

  it("signals AI instructions loaded when present", () => {
    const result = detectPositiveSignals(
      makeSnapshot({ aiInstructionFiles: [
        { path: ".cursorrules", lineCount: 20, toolId: "cursor" as const },
        { path: "CLAUDE.md", lineCount: 30, toolId: "claude-code" as const },
      ] }),
      { wastePatterns: [] }
    );

    const ids = result.positiveSignals!.map((s) => s.id);
    expect(ids).toContain("ai-instructions-loaded");
  });

  it("does NOT signal AI instructions when none present", () => {
    const result = detectPositiveSignals(
      makeSnapshot({ aiInstructionFiles: [] }),
      { wastePatterns: [] }
    );

    const ids = result.positiveSignals!.map((s) => s.id);
    expect(ids).not.toContain("ai-instructions-loaded");
  });

  it("signals focused workspace when few tabs in same module", () => {
    const result = detectPositiveSignals(
      makeSnapshot({
        openTabs: [
          makeFile({ path: "src/auth/login.ts" }),
          makeFile({ path: "src/auth/session.ts" }),
          makeFile({ path: "src/auth/types.ts" }),
        ],
      }),
      { wastePatterns: [] }
    );

    const ids = result.positiveSignals!.map((s) => s.id);
    expect(ids).toContain("focused-workspace");
  });

  it("does NOT signal focused workspace with only 2 tabs", () => {
    const result = detectPositiveSignals(
      makeSnapshot({
        openTabs: [
          makeFile({ path: "src/auth/login.ts" }),
          makeFile({ path: "src/auth/session.ts" }),
        ],
      }),
      { wastePatterns: [] }
    );

    const ids = result.positiveSignals!.map((s) => s.id);
    expect(ids).not.toContain("focused-workspace");
  });

  it("does NOT signal focused workspace with tabs across many modules", () => {
    const result = detectPositiveSignals(
      makeSnapshot({
        openTabs: [
          makeFile({ path: "src/auth/login.ts" }),
          makeFile({ path: "src/api/routes.ts" }),
          makeFile({ path: "src/db/models.ts" }),
          makeFile({ path: "src/ui/sidebar.ts" }),
        ],
      }),
      { wastePatterns: [] }
    );

    const ids = result.positiveSignals!.map((s) => s.id);
    expect(ids).not.toContain("focused-workspace");
  });

  it("does NOT signal clean-context when no file is open", () => {
    const result = detectPositiveSignals(makeSnapshot({ activeFile: null }), {
      wastePatterns: [],
      tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" },
    });

    const ids = result.positiveSignals!.map((s) => s.id);
    expect(ids).not.toContain("clean-context");
  });

  it("signals clean-context when file is open and context is clean", () => {
    const result = detectPositiveSignals(
      makeSnapshot({ activeFile: makeFile({ isActive: true }) }),
      {
        wastePatterns: [],
        tokenEstimate: { low: 100, high: 300, band: "low", confidence: "medium" },
      }
    );

    const ids = result.positiveSignals!.map((s) => s.id);
    expect(ids).toContain("clean-context");
  });
});
