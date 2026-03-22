import { describe, it, expect } from "vitest";
import { estimateTokens } from "../../src/core/analyzers/token-estimator.js";
import type { ContextSnapshot } from "../../src/core/types.js";

function makeSnapshot(overrides: Partial<ContextSnapshot> = {}): ContextSnapshot {
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
    ...overrides,
  };
}

describe("estimateTokens", () => {
  it("returns low band for empty context", () => {
    const snapshot = makeSnapshot();
    const result = estimateTokens(snapshot, {});

    expect(result.tokenEstimate?.band).toBe("low");
    expect(result.tokenEstimate?.low).toBe(0);
    expect(result.tokenEstimate?.high).toBe(0);
    expect(result.riskLevel).toBe("low");
  });

  it("estimates tokens from active file", () => {
    const snapshot = makeSnapshot({
      activeFile: {
        path: "index.ts",
        languageId: "typescript",
        lineCount: 100,
        charCount: 4000,
        isActive: true,
        isDirty: false,
        commentLineCount: 0,
        hasConflictMarkers: false,
      },
    });

    const result = estimateTokens(snapshot, {});

    // 4000 chars / 5 = 800 (low), 4000 / 3 = 1333 (high)
    expect(result.tokenEstimate?.low).toBe(800);
    expect(result.tokenEstimate?.high).toBe(1333);
    expect(result.tokenEstimate?.band).toBe("low");
  });

  it("returns medium band for medium-sized context", () => {
    const snapshot = makeSnapshot({
      activeFile: {
        path: "large-file.ts",
        languageId: "typescript",
        lineCount: 500,
        charCount: 20000,
        isActive: true,
        isDirty: false,
        commentLineCount: 0,
        hasConflictMarkers: false,
      },
    });

    const result = estimateTokens(snapshot, {});

    // 20000 / 4 = 5000 midpoint → medium band
    expect(result.tokenEstimate?.band).toBe("medium");
    expect(result.riskLevel).toBe("medium");
  });

  it("returns high band for large context", () => {
    const snapshot = makeSnapshot({
      activeFile: {
        path: "huge-file.ts",
        languageId: "typescript",
        lineCount: 2000,
        charCount: 40000,
        isActive: true,
        isDirty: false,
        commentLineCount: 0,
        hasConflictMarkers: false,
      },
    });

    const result = estimateTokens(snapshot, {});

    // 40000 / 4 = 10000 midpoint → high band
    expect(result.tokenEstimate?.band).toBe("high");
    expect(result.riskLevel).toBe("high");
  });

  it("uses selection size instead of full file when selection exists", () => {
    const snapshot = makeSnapshot({
      activeFile: {
        path: "file.ts",
        languageId: "typescript",
        lineCount: 2000,
        charCount: 80000,
        isActive: true,
        isDirty: false,
        commentLineCount: 0,
        hasConflictMarkers: false,
      },
      selection: {
        lineCount: 10,
        charCount: 400,
        text: "selected code",
      },
    });

    const result = estimateTokens(snapshot, {});

    // Should use 400 chars (selection), not 80000 (full file)
    expect(result.tokenEstimate?.band).toBe("low");
  });

  it("returns low confidence when terminal content is present", () => {
    const snapshot = makeSnapshot({
      terminalContent: {
        source: "terminal",
        lineCount: 300,
        charCount: 12000,
        preview: "Error...",
      },
    });

    const result = estimateTokens(snapshot, {});

    expect(result.tokenEstimate?.confidence).toBe("low");
  });

  it("returns high confidence with multiple tabs (good context picture)", () => {
    const snapshot = makeSnapshot({
      activeFile: {
        path: "main.ts",
        languageId: "typescript",
        lineCount: 50,
        charCount: 2000,
        isActive: true,
        isDirty: false,
        commentLineCount: 0,
        hasConflictMarkers: false,
      },
      openTabs: [
        { path: "a.ts", languageId: "typescript", lineCount: 30, charCount: 1000, isActive: false, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
        { path: "b.ts", languageId: "typescript", lineCount: 30, charCount: 1000, isActive: false, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
        { path: "c.ts", languageId: "typescript", lineCount: 30, charCount: 1000, isActive: false, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
        { path: "d.ts", languageId: "typescript", lineCount: 30, charCount: 1000, isActive: true, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
      ],
    });

    const result = estimateTokens(snapshot, {});

    // 4+ tabs = we have a good picture of what's in context
    expect(result.tokenEstimate?.confidence).toBe("high");
  });

  it("returns high confidence with referenced files (even few tabs)", () => {
    const snapshot = makeSnapshot({
      activeFile: {
        path: "main.ts",
        languageId: "typescript",
        lineCount: 50,
        charCount: 2000,
        isActive: true,
        isDirty: false,
        commentLineCount: 0,
        hasConflictMarkers: false,
      },
      referencedFiles: [
        { path: "util.ts", languageId: "typescript", lineCount: 20, charCount: 800, isActive: false, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
      ],
    });

    const result = estimateTokens(snapshot, {});

    // Referenced files = we know what's being pulled in
    expect(result.tokenEstimate?.confidence).toBe("high");
  });

  it("includes 30% of non-active tab chars in token estimate", () => {
    const snapshot = makeSnapshot({
      activeFile: {
        path: "main.ts",
        languageId: "typescript",
        lineCount: 50,
        charCount: 2000,
        isActive: true,
        isDirty: false,
        commentLineCount: 0,
        hasConflictMarkers: false,
      },
      openTabs: [
        { path: "a.ts", languageId: "typescript", lineCount: 100, charCount: 10000, isActive: false, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
        { path: "b.ts", languageId: "typescript", lineCount: 100, charCount: 10000, isActive: false, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
      ],
    });

    const result = estimateTokens(snapshot, {});

    // Total: 2000 (active) + 10000*0.3 + 10000*0.3 = 8000 chars
    // Low: 8000/5 = 1600, High: 8000/3 ≈ 2667
    expect(result.tokenEstimate?.low).toBe(1600);
    expect(result.tokenEstimate?.high).toBe(2667);
  });

  it("returns low confidence when clipboard size is present", () => {
    const snapshot = makeSnapshot({
      clipboardSize: 5000,
    });

    const result = estimateTokens(snapshot, {});

    expect(result.tokenEstimate?.confidence).toBe("low");
  });

  it("returns high confidence with both referenced files and multiple tabs", () => {
    const snapshot = makeSnapshot({
      activeFile: {
        path: "main.ts",
        languageId: "typescript",
        lineCount: 50,
        charCount: 2000,
        isActive: true,
        isDirty: false,
        commentLineCount: 0,
        hasConflictMarkers: false,
      },
      openTabs: [
        { path: "a.ts", languageId: "typescript", lineCount: 30, charCount: 1000, isActive: false, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
        { path: "b.ts", languageId: "typescript", lineCount: 30, charCount: 1000, isActive: false, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
        { path: "c.ts", languageId: "typescript", lineCount: 30, charCount: 1000, isActive: false, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
        { path: "d.ts", languageId: "typescript", lineCount: 30, charCount: 1000, isActive: true, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
      ],
      referencedFiles: [
        { path: "util.ts", languageId: "typescript", lineCount: 20, charCount: 800, isActive: false, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
      ],
    });

    const result = estimateTokens(snapshot, {});

    expect(result.tokenEstimate?.confidence).toBe("high");
  });
});
