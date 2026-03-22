import { describe, it, expect } from "vitest";
import { estimateTokens } from "../../src/core/analyzers/token-estimator.js";
import type { ContextSnapshot, FileTokenBreakdown } from "../../src/core/types.js";

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
    aiInstructionFiles: [],
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

describe("Token Breakdown", () => {
  it("empty context → empty breakdown", () => {
    const result = estimateTokens(makeSnapshot(), {});
    expect(result.tokenBreakdown).toEqual([]);
  });

  it("active-file-only → single entry with 100%", () => {
    const result = estimateTokens(makeSnapshot({ activeFile: FILE }), {});
    const bd = result.tokenBreakdown!;

    expect(bd).toHaveLength(1);
    expect(bd[0].source).toBe("active-file");
    expect(bd[0].path).toBe("src/main.ts");
    expect(bd[0].estimatedTokens.low).toBe(800); // 4000/5
    expect(bd[0].estimatedTokens.high).toBe(1333); // 4000/3
    expect(bd[0].percentage).toBe(100);
  });

  it("selection override → two entries (active-file + selection-override)", () => {
    const result = estimateTokens(
      makeSnapshot({
        activeFile: { ...FILE, charCount: 10000 },
        selection: { lineCount: 10, charCount: 400, text: "code" },
      }),
      {}
    );
    const bd = result.tokenBreakdown!;

    expect(bd).toHaveLength(2);
    const activeEntry = bd.find((e) => e.source === "active-file")!;
    const overrideEntry = bd.find((e) => e.source === "selection-override")!;

    expect(activeEntry).toBeDefined();
    expect(overrideEntry).toBeDefined();
    // Override chars: 400 - 10000 = -9600 (negative = savings)
    expect(overrideEntry.estimatedTokens.low).toBe(Math.round(-9600 / 5));
    expect(overrideEntry.estimatedTokens.high).toBe(Math.round(-9600 / 3));
  });

  it("inactive tabs → 30% factor applied", () => {
    const result = estimateTokens(
      makeSnapshot({
        activeFile: FILE,
        openTabs: [
          { ...FILE, isActive: true },
          { ...FILE, path: "src/utils.ts", isActive: false, charCount: 10000 },
        ],
      }),
      {}
    );
    const bd = result.tokenBreakdown!;
    const tabEntry = bd.find((e) => e.source === "tab")!;

    expect(tabEntry).toBeDefined();
    expect(tabEntry.path).toBe("src/utils.ts");
    // 10000 * 0.3 = 3000 chars → 600 low, 1000 high
    expect(tabEntry.estimatedTokens.low).toBe(600);
    expect(tabEntry.estimatedTokens.high).toBe(1000);
  });

  it("referenced files → appear in breakdown at full size", () => {
    const result = estimateTokens(
      makeSnapshot({
        activeFile: FILE,
        referencedFiles: [
          { ...FILE, path: "src/ref.ts", isActive: false, charCount: 5000 },
        ],
      }),
      {}
    );
    const bd = result.tokenBreakdown!;
    const refEntry = bd.find((e) => e.source === "referenced-file")!;

    expect(refEntry).toBeDefined();
    expect(refEntry.path).toBe("src/ref.ts");
    expect(refEntry.estimatedTokens.low).toBe(1000); // 5000/5
  });

  it("terminal content → appears in breakdown", () => {
    const result = estimateTokens(
      makeSnapshot({
        terminalContent: {
          source: "terminal" as const,
          lineCount: 100,
          charCount: 4000,
          preview: "Error...",
        },
      }),
      {}
    );
    const bd = result.tokenBreakdown!;
    const termEntry = bd.find((e) => e.source === "terminal")!;

    expect(termEntry).toBeDefined();
    expect(termEntry.path).toBe("Terminal output");
    expect(termEntry.estimatedTokens.low).toBe(800);
  });

  it("percentages are reasonable for multi-source context", () => {
    const result = estimateTokens(
      makeSnapshot({
        activeFile: { ...FILE, charCount: 4000 },
        openTabs: [
          { ...FILE, isActive: true },
          { ...FILE, path: "a.ts", isActive: false, charCount: 4000 },
        ],
      }),
      {}
    );
    const bd = result.tokenBreakdown!;

    // Active: 4000, Tab: 4000*0.3 = 1200, Total: 5200
    // Active %: round(4000/5200*100) = 77
    // Tab %: round(1200/5200*100) = 23
    const activeEntry = bd.find((e) => e.source === "active-file")!;
    const tabEntry = bd.find((e) => e.source === "tab")!;
    expect(activeEntry.percentage).toBe(77);
    expect(tabEntry.percentage).toBe(23);
  });

  it("breakdown tokens match aggregate estimate", () => {
    const result = estimateTokens(
      makeSnapshot({
        activeFile: { ...FILE, charCount: 4000 },
        openTabs: [
          { ...FILE, isActive: true },
          { ...FILE, path: "a.ts", isActive: false, charCount: 6000 },
          { ...FILE, path: "b.ts", isActive: false, charCount: 2000 },
        ],
      }),
      {}
    );

    // Sum of positive entries' low tokens should approximate aggregate low
    const positiveLow = result.tokenBreakdown!
      .filter((e) => e.estimatedTokens.low > 0)
      .reduce((sum, e) => sum + e.estimatedTokens.low, 0);

    // Allow rounding tolerance
    expect(Math.abs(positiveLow - result.tokenEstimate!.low)).toBeLessThanOrEqual(2);
  });

  it("multiple tabs → breakdown has entry per inactive tab", () => {
    const result = estimateTokens(
      makeSnapshot({
        activeFile: FILE,
        openTabs: [
          { ...FILE, isActive: true },
          { ...FILE, path: "a.ts", isActive: false },
          { ...FILE, path: "b.ts", isActive: false },
          { ...FILE, path: "c.ts", isActive: false },
        ],
      }),
      {}
    );
    const bd = result.tokenBreakdown!;
    const tabEntries = bd.filter((e) => e.source === "tab");
    expect(tabEntries).toHaveLength(3);
  });
});
