import { describe, it, expect } from "vitest";
import { detectWaste } from "../../src/core/analyzers/waste-detector.js";
import { detectToolAwareIssues } from "../../src/core/analyzers/tool-aware-analyzer.js";
import type { ContextSnapshot, Suggestion } from "../../src/core/types.js";

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

const FILE = {
  path: "src/main.ts",
  languageId: "typescript",
  lineCount: 100,
  charCount: 4000,
  isActive: true,
  isDirty: false,
  commentLineCount: 0,
  hasConflictMarkers: false,
} as const;

function findSuggestion(suggestions: Suggestion[], id: string): Suggestion | undefined {
  return suggestions.find((s) => s.id === id);
}

describe("Suggestion actions — waste-detector", () => {
  it("close-tabs suggestion has closeTabs action", () => {
    const snapshot = makeSnapshot({
      activeFile: FILE,
      openTabs: Array.from({ length: 12 }, (_, i) => ({
        ...FILE,
        path: `src/file-${i}.ts`,
        isActive: i === 0,
      })),
    });
    const result = detectWaste(snapshot, {});
    const s = findSuggestion(result.suggestions!, "close-tabs");
    expect(s?.action).toBeDefined();
    expect(s!.action!.command).toBe("ai-preflight.action.closeTabs");
    expect(s!.action!.label).toBe("Close");
  });

  it("save-file suggestion has saveFile action", () => {
    const snapshot = makeSnapshot({
      activeFile: { ...FILE, isDirty: true },
    });
    const result = detectWaste(snapshot, {});
    const s = findSuggestion(result.suggestions!, "save-file");
    expect(s?.action).toBeDefined();
    expect(s!.action!.command).toBe("ai-preflight.action.saveFile");
    expect(s!.action!.label).toBe("Save");
  });

  it("close-duplicate suggestion has closeDuplicates action", () => {
    const snapshot = makeSnapshot({
      activeFile: FILE,
      openTabs: [
        { ...FILE, isActive: true },
        { ...FILE, isActive: false },
      ],
    });
    const result = detectWaste(snapshot, {});
    const s = findSuggestion(result.suggestions!, "close-duplicate");
    expect(s?.action).toBeDefined();
    expect(s!.action!.command).toBe("ai-preflight.action.closeDuplicates");
  });

  it("focus-module suggestion has focusModule action", () => {
    const snapshot = makeSnapshot({
      activeFile: FILE,
      openTabs: [
        { ...FILE, path: "src/a/one.ts", isActive: true },
        { ...FILE, path: "lib/b/two.ts", isActive: false },
        { ...FILE, path: "test/c/three.ts", isActive: false },
        { ...FILE, path: "utils/d/four.ts", isActive: false },
      ],
    });
    const result = detectWaste(snapshot, {});
    const s = findSuggestion(result.suggestions!, "focus-module");
    expect(s?.action).toBeDefined();
    expect(s!.action!.command).toBe("ai-preflight.action.focusModule");
  });

  it("select-function suggestion has selectFunction action", () => {
    const snapshot = makeSnapshot({
      activeFile: { ...FILE, lineCount: 600 },
      selection: null,
    });
    const result = detectWaste(snapshot, {});
    const s = findSuggestion(result.suggestions!, "select-function");
    expect(s?.action).toBeDefined();
    expect(s!.action!.command).toBe("ai-preflight.action.selectFunction");
    expect(s!.action!.label).toBe("Select");
  });

  it("close-lock-file suggestion has closeTab action with path", () => {
    const snapshot = makeSnapshot({
      activeFile: { ...FILE, path: "package-lock.json" },
    });
    const result = detectWaste(snapshot, {});
    const s = findSuggestion(result.suggestions!, "close-lock-file");
    expect(s?.action).toBeDefined();
    expect(s!.action!.command).toBe("ai-preflight.action.closeTab");
    expect(s!.action!.args?.path).toBe("package-lock.json");
  });

  it("close-env-file suggestion has closeTab action", () => {
    const snapshot = makeSnapshot({
      activeFile: { ...FILE, path: ".env" },
    });
    const result = detectWaste(snapshot, {});
    const s = findSuggestion(result.suggestions!, "close-env-file");
    expect(s?.action).toBeDefined();
    expect(s!.action!.command).toBe("ai-preflight.action.closeTab");
  });

  it("separate-test-prod suggestion has closeTestFiles action", () => {
    const snapshot = makeSnapshot({
      activeFile: FILE,
      openTabs: [
        { ...FILE, path: "src/main.ts", isActive: true },
        { ...FILE, path: "src/util.ts", isActive: false },
        { ...FILE, path: "test/a.test.ts", isActive: false },
        { ...FILE, path: "test/b.test.ts", isActive: false },
        { ...FILE, path: "test/c.test.ts", isActive: false },
      ],
    });
    const result = detectWaste(snapshot, {});
    const s = findSuggestion(result.suggestions!, "separate-test-prod");
    expect(s?.action).toBeDefined();
    expect(s!.action!.command).toBe("ai-preflight.action.closeTestFiles");
  });

  it("resolve-conflicts suggestion has no action", () => {
    const snapshot = makeSnapshot({
      activeFile: { ...FILE, hasConflictMarkers: true },
    });
    const result = detectWaste(snapshot, {});
    const s = findSuggestion(result.suggestions!, "resolve-conflicts");
    expect(s).toBeDefined();
    expect(s!.action).toBeUndefined();
  });

  it("narrow-selection suggestion has no action", () => {
    const snapshot = makeSnapshot({
      activeFile: FILE,
      selection: { lineCount: 600, charCount: 24000, text: "code" },
    });
    const result = detectWaste(snapshot, {});
    const s = findSuggestion(result.suggestions!, "narrow-selection");
    expect(s).toBeDefined();
    expect(s!.action).toBeUndefined();
  });

  it("all action commands follow naming convention", () => {
    // Use a snapshot that triggers many rules
    const snapshot = makeSnapshot({
      activeFile: { ...FILE, lineCount: 600, isDirty: true },
      openTabs: Array.from({ length: 12 }, (_, i) => ({
        ...FILE,
        path: `src/file-${i}.ts`,
        isActive: i === 0,
      })),
    });
    const result = detectWaste(snapshot, {});
    for (const s of result.suggestions!) {
      if (s.action) {
        expect(s.action.command).toMatch(/^ai-preflight\.action\./);
        expect(s.action.label).toBeTypeOf("string");
        expect(s.action.label.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("Suggestion actions — tool-aware-analyzer", () => {
  it("add-tool-instruction-file has createInstructionFile action", () => {
    const snapshot = makeSnapshot({
      activeFile: FILE,
      toolProfile: { toolId: "cursor" as const, detectedVia: "setting" as const },
      aiInstructionFiles: [],
    });
    const result = detectToolAwareIssues(snapshot, {
      tokenEstimate: { low: 100, high: 200, band: "low", confidence: "medium" },
      suggestions: [],
      wastePatterns: [],
    });
    const s = findSuggestion(result.suggestions!, "add-tool-instruction-file");
    expect(s?.action).toBeDefined();
    expect(s!.action!.command).toBe("ai-preflight.action.createInstructionFile");
    expect(s!.action!.args?.toolId).toBe("cursor");
    expect(s!.action!.label).toBe("Create");
  });

  it("add-ignore-file has createIgnoreFile action", () => {
    const snapshot = makeSnapshot({
      activeFile: FILE,
      toolProfile: { toolId: "cursor" as const, detectedVia: "setting" as const },
      ignoreFiles: [],
    });
    const result = detectToolAwareIssues(snapshot, {
      tokenEstimate: { low: 100, high: 200, band: "low", confidence: "medium" },
      suggestions: [],
      wastePatterns: [],
    });
    const s = findSuggestion(result.suggestions!, "add-ignore-file");
    expect(s?.action).toBeDefined();
    expect(s!.action!.command).toBe("ai-preflight.action.createIgnoreFile");
    expect(s!.action!.args?.fileName).toBe(".cursorignore");
    expect(s!.action!.label).toBe("Create");
  });
});
