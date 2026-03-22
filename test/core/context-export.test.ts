import { describe, it, expect } from "vitest";
import { exportContext } from "../../src/core/context-export.js";
import type {
  ContextSnapshot,
  AnalysisResult,
  FileInfo,
} from "../../src/core/types.js";

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

function makeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    timestamp: Date.now(),
    tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" },
    riskLevel: "low",
    wastePatterns: [],
    positiveSignals: [],
    taskType: null,
    modelSuggestion: null,
    suggestions: [],
    contextSummary: {
      activeFileName: null,
      selectionLines: null,
      openTabCount: 0,
      openTabNames: [],
    },
    tokenBreakdown: [],
    contextWindowUsage: null,
    toolAnnotations: {},
    instructionFileIssues: [],
    ...overrides,
  };
}

describe("exportContext", () => {
  it("returns a string", () => {
    const output = exportContext(makeSnapshot(), makeResult());
    expect(output).toBeTypeOf("string");
  });

  it("includes risk level", () => {
    const output = exportContext(
      makeSnapshot(),
      makeResult({ riskLevel: "high" })
    );
    expect(output).toContain("HIGH");
  });

  it("includes token estimate range", () => {
    const output = exportContext(
      makeSnapshot(),
      makeResult({
        tokenEstimate: {
          low: 500,
          high: 900,
          band: "low",
          confidence: "medium",
        },
      })
    );
    expect(output).toContain("500");
    expect(output).toContain("900");
  });

  it("includes active file info", () => {
    const output = exportContext(
      makeSnapshot({
        activeFile: makeFile({ path: "src/auth/login.ts", isActive: true }),
      }),
      makeResult()
    );
    expect(output).toContain("src/auth/login.ts");
  });

  it("includes selection info when present", () => {
    const output = exportContext(
      makeSnapshot({
        selection: { lineCount: 25, charCount: 1000, text: "function foo() {}" },
      }),
      makeResult()
    );
    expect(output).toContain("25 lines");
  });

  it("includes open tabs", () => {
    const output = exportContext(
      makeSnapshot({
        openTabs: [
          makeFile({ path: "src/a.ts" }),
          makeFile({ path: "src/b.ts" }),
        ],
      }),
      makeResult()
    );
    expect(output).toContain("src/a.ts");
    expect(output).toContain("src/b.ts");
  });

  it("includes waste patterns", () => {
    const output = exportContext(
      makeSnapshot(),
      makeResult({
        wastePatterns: [
          {
            ruleId: "large-file",
            source: "test.ts",
            description: "File is 2000 lines",
            severity: "warning",
            suggestion: "Narrow selection",
          },
        ],
      })
    );
    expect(output).toContain("large-file");
    expect(output).toContain("File is 2000 lines");
  });

  it("includes positive signals", () => {
    const output = exportContext(
      makeSnapshot(),
      makeResult({
        positiveSignals: [
          {
            id: "clean-context",
            label: "Clean context",
            description: "No waste detected",
          },
        ],
      })
    );
    expect(output).toContain("Clean context");
  });

  it("includes suggestions", () => {
    const output = exportContext(
      makeSnapshot(),
      makeResult({
        suggestions: [
          {
            id: "trim-terminal",
            text: "Trim terminal output",
            priority: 1,
            dismissed: false,
          },
        ],
      })
    );
    expect(output).toContain("Trim terminal output");
  });

  it("excludes dismissed suggestions from export", () => {
    const output = exportContext(
      makeSnapshot(),
      makeResult({
        suggestions: [
          { id: "active", text: "Active suggestion", priority: 1, dismissed: false },
          { id: "gone", text: "Dismissed suggestion", priority: 2, dismissed: true },
        ],
      })
    );
    expect(output).toContain("Active suggestion");
    expect(output).not.toContain("Dismissed suggestion");
  });

  it("includes terminal content in export", () => {
    const output = exportContext(
      makeSnapshot({
        terminalContent: {
          source: "terminal",
          lineCount: 50,
          charCount: 2000,
          preview: "Error: something failed",
        },
      }),
      makeResult()
    );
    expect(output).toContain("Terminal");
    expect(output).toContain("50 lines");
  });

  it("includes AI instruction files in export", () => {
    const output = exportContext(
      makeSnapshot({
        aiInstructionFiles: [
          { path: ".cursorrules", lineCount: 20, toolId: "cursor" as const },
          { path: "CLAUDE.md", lineCount: 30, toolId: "claude-code" as const },
        ],
      }),
      makeResult()
    );
    expect(output).toContain(".cursorrules");
    expect(output).toContain("CLAUDE.md");
  });

  it("handles empty context gracefully", () => {
    const output = exportContext(makeSnapshot(), makeResult());
    expect(output).toBeTypeOf("string");
    expect(output.length).toBeGreaterThan(0);
  });
});
