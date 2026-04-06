import { describe, it, expect } from "vitest";
import { detectToolAwareIssues } from "../../src/core/analyzers/tool-aware-analyzer.js";
import type {
  ContextSnapshot,
  AnalysisResult,
  FileInfo,
  ToolProfile,
  InstructionFileInfo,
} from "../../src/core/types.js";

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
    activeFileTestPairs: [],
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

function cursorProfile(): ToolProfile {
  return { toolId: "cursor", detectedVia: "setting" };
}

function claudeProfile(): ToolProfile {
  return { toolId: "claude-code", detectedVia: "setting" };
}

function copilotProfile(): ToolProfile {
  return { toolId: "copilot", detectedVia: "auto" };
}

function makeInstruction(path: string, lineCount: number, toolId: string | null = null): InstructionFileInfo {
  return { path, lineCount, toolId: toolId as InstructionFileInfo["toolId"] };
}

describe("detectToolAwareIssues", () => {
  // ─── No-op ──────────────────────────────────────────────────────

  it("returns empty result when toolProfile is null", () => {
    const result = detectToolAwareIssues(makeSnapshot(), {});
    expect(result).toEqual({});
  });

  // ─── F1: Context Window Usage ───────────────────────────────────

  describe("F1: Context window usage", () => {
    it("computes usage percentage for cursor (200k)", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({ toolProfile: cursorProfile() }),
        { tokenEstimate: { low: 10000, high: 20000, band: "medium", confidence: "medium" } }
      );

      expect(result.contextWindowUsage).toBeDefined();
      expect(result.contextWindowUsage!.toolId).toBe("cursor");
      expect(result.contextWindowUsage!.toolDisplayName).toBe("Cursor");
      expect(result.contextWindowUsage!.contextWindowTokens).toBe(200_000);
      // midpoint = 15000, pct = 15000/200000 = 7.5% → rounds to 8
      expect(result.contextWindowUsage!.estimatedUsagePercent).toBe(8);
      expect(result.contextWindowUsage!.estimatedTokens).toBe(15000);
    });

    it("computes usage for claude-code (150k)", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({ toolProfile: claudeProfile() }),
        { tokenEstimate: { low: 50000, high: 70000, band: "high", confidence: "medium" } }
      );

      expect(result.contextWindowUsage!.contextWindowTokens).toBe(150_000);
      // midpoint = 60000, pct = 60000/150000 = 40%
      expect(result.contextWindowUsage!.estimatedUsagePercent).toBe(40);
    });

    it("computes usage for gemini (1M) — very low percentage", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({ toolProfile: { toolId: "gemini", detectedVia: "setting" } }),
        { tokenEstimate: { low: 5000, high: 10000, band: "medium", confidence: "medium" } }
      );

      expect(result.contextWindowUsage!.contextWindowTokens).toBe(1_000_000);
      // midpoint = 7500, pct ≈ 1%
      expect(result.contextWindowUsage!.estimatedUsagePercent).toBe(1);
    });

    it("uses model-specific context window when modelId is set", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: { toolId: "copilot", modelId: "gemini", detectedVia: "setting" },
        }),
        { tokenEstimate: { low: 30000, high: 34000, band: "high", confidence: "medium" } }
      );

      // copilot + gemini model = 64k context
      expect(result.contextWindowUsage!.contextWindowTokens).toBe(64_000);
      // midpoint = 32000, pct = 32000/64000 = 50%
      expect(result.contextWindowUsage!.estimatedUsagePercent).toBe(50);
    });

    it("uses haiku context window (100k) when modelId is haiku", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: { toolId: "claude-code", modelId: "haiku", detectedVia: "setting" },
        }),
        { tokenEstimate: { low: 40000, high: 60000, band: "high", confidence: "medium" } }
      );

      // haiku = 100k, midpoint = 50000, pct = 50%
      expect(result.contextWindowUsage!.contextWindowTokens).toBe(100_000);
      expect(result.contextWindowUsage!.estimatedUsagePercent).toBe(50);
    });

    it("works with auto-detected tool profile", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: { toolId: "copilot", detectedVia: "auto" },
        }),
        { tokenEstimate: { low: 10000, high: 20000, band: "medium", confidence: "medium" } }
      );

      expect(result.contextWindowUsage!.toolId).toBe("copilot");
      expect(result.contextWindowUsage!.toolDisplayName).toBe("GitHub Copilot");
      expect(result.contextWindowUsage!.contextWindowTokens).toBe(115_000);
    });

    it("returns null contextWindowUsage when no token estimate", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({ toolProfile: cursorProfile() }),
        {}
      );

      expect(result.contextWindowUsage).toBeNull();
    });
  });

  // ─── F2: Tool-Specific Instruction Files ────────────────────────

  describe("F2: Tool-specific instruction files", () => {
    it("suggests creating instruction file when none found for tool", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: cursorProfile(),
          aiInstructionFiles: [],
        }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      const texts = result.suggestions!.map((s) => s.text);
      expect(texts.some((t) => t.includes(".cursorrules") && t.includes("Cursor"))).toBe(true);
    });

    it("does not suggest instruction file when tool has matching file", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: cursorProfile(),
          aiInstructionFiles: [makeInstruction(".cursorrules", 50, "cursor")],
        }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      const ids = result.suggestions!.map((s) => s.id);
      expect(ids).not.toContain("add-tool-instruction-file");
    });

    it("does not suggest instruction file for chatgpt (no instruction files)", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: { toolId: "chatgpt", detectedVia: "setting" },
          aiInstructionFiles: [],
        }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      const ids = result.suggestions!.map((s) => s.id);
      expect(ids).not.toContain("add-tool-instruction-file");
    });

    it("suggests .windsurfrules for windsurf", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: { toolId: "windsurf", detectedVia: "setting" },
          aiInstructionFiles: [],
        }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      const texts = result.suggestions!.map((s) => s.text);
      expect(texts.some((t) => t.includes(".windsurfrules") && t.includes("Windsurf"))).toBe(true);
    });

    it("suggests .amazonq/rules for amazon-q", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: { toolId: "amazon-q", detectedVia: "setting" },
          aiInstructionFiles: [],
        }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      const texts = result.suggestions!.map((s) => s.text);
      expect(texts.some((t) => t.includes(".amazonq/rules") && t.includes("Amazon Q"))).toBe(true);
    });

    it("suggests GEMINI.md for gemini", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: { toolId: "gemini", detectedVia: "setting" },
          aiInstructionFiles: [],
        }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      const texts = result.suggestions!.map((s) => s.text);
      expect(texts.some((t) => t.includes("GEMINI.md") && t.includes("Gemini"))).toBe(true);
    });

    it("still warns when only a different tool's instruction file is present", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: claudeProfile(),
          aiInstructionFiles: [makeInstruction(".cursorrules", 50, "cursor")],
        }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      const ids = result.suggestions!.map((s) => s.id);
      expect(ids).toContain("add-tool-instruction-file");
    });

    it("matches .cursor/rules subdirectory for cursor", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: cursorProfile(),
          aiInstructionFiles: [makeInstruction(".cursor/rules/my-rule.mdc", 30, "cursor")],
        }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      const ids = result.suggestions!.map((s) => s.id);
      expect(ids).not.toContain("add-tool-instruction-file");
    });

    it("suggests CLAUDE.md for claude-code", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: claudeProfile(),
          aiInstructionFiles: [],
        }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      const texts = result.suggestions!.map((s) => s.text);
      expect(texts.some((t) => t.includes("CLAUDE.md") && t.includes("Claude Code"))).toBe(true);
    });
  });

  // ─── F3: Instruction File Quality ──────────────────────────────

  describe("F3: Instruction file quality", () => {
    it("reports empty instruction file", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: cursorProfile(),
          aiInstructionFiles: [makeInstruction(".cursorrules", 0, "cursor")],
        }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      expect(result.instructionFileIssues!.length).toBe(1);
      expect(result.instructionFileIssues![0].issue).toBe("empty");
    });

    it("reports too-short instruction file (<5 lines)", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: cursorProfile(),
          aiInstructionFiles: [makeInstruction(".cursorrules", 3, "cursor")],
        }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      expect(result.instructionFileIssues!.length).toBe(1);
      expect(result.instructionFileIssues![0].issue).toBe("too-short");
    });

    it("reports too-long instruction file (>200 lines)", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: cursorProfile(),
          aiInstructionFiles: [makeInstruction(".cursorrules", 350, "cursor")],
        }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      expect(result.instructionFileIssues!.length).toBe(1);
      expect(result.instructionFileIssues![0].issue).toBe("too-long");
      expect(result.instructionFileIssues![0].lineCount).toBe(350);
    });

    it("does not report issues for normal instruction file (50 lines)", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: cursorProfile(),
          aiInstructionFiles: [makeInstruction(".cursorrules", 50, "cursor")],
        }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      expect(result.instructionFileIssues!.length).toBe(0);
    });
  });

  // ─── F4: Ignore File Detection ──────────────────────────────────

  describe("F4: Ignore file detection", () => {
    it("suggests creating ignore file when missing for tool", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: claudeProfile(),
          ignoreFiles: [],
        }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      const texts = result.suggestions!.map((s) => s.text);
      expect(texts.some((t) => t.includes(".claudeignore") && t.includes("Claude Code"))).toBe(true);
    });

    it("does not suggest ignore file when it exists", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: claudeProfile(),
          ignoreFiles: [".claudeignore"],
        }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      const ids = result.suggestions!.map((s) => s.id);
      expect(ids).not.toContain("add-ignore-file");
    });

    it("suggests .cursorignore for cursor", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: cursorProfile(),
          ignoreFiles: [],
        }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      const texts = result.suggestions!.map((s) => s.text);
      expect(texts.some((t) => t.includes(".cursorignore") && t.includes("Cursor"))).toBe(true);
    });

    it("suggests .codeiumignore for windsurf", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: { toolId: "windsurf", detectedVia: "setting" },
          ignoreFiles: [],
        }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      const texts = result.suggestions!.map((s) => s.text);
      expect(texts.some((t) => t.includes(".codeiumignore") && t.includes("Windsurf"))).toBe(true);
    });

    it("does not suggest ignore file for tools with no ignore files", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: copilotProfile(),
          ignoreFiles: [],
        }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      const ids = result.suggestions!.map((s) => s.id);
      expect(ids).not.toContain("add-ignore-file");
    });
  });

  // ─── F5: Tab Rule Suppression ───────────────────────────────────

  describe("F5: Tab rule suppression", () => {
    const tabWastePatterns = [
      { ruleId: "many-tabs", source: "tabs", description: "15 tabs open", severity: "info" as const, suggestion: "Close tabs" },
      { ruleId: "unrelated-tabs", source: "tabs", description: "Tabs span 5 modules", severity: "info" as const, suggestion: "Focus" },
    ];

    const tabSuggestions = [
      { id: "close-tabs", text: "Close tabs", priority: 1, dismissed: false },
      { id: "focus-module", text: "Focus on one module", priority: 2, dismissed: false },
    ];

    it("suppresses tab rules for claude-code", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({ toolProfile: claudeProfile() }),
        {
          wastePatterns: tabWastePatterns,
          suggestions: tabSuggestions,
          tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" },
        }
      );

      expect(result.toolAnnotations!["many-tabs"]).toBeDefined();
      expect(result.toolAnnotations!["many-tabs"].suppressed).toBe(true);
      expect(result.toolAnnotations!["unrelated-tabs"].suppressed).toBe(true);
      expect(result.toolAnnotations!["close-tabs"].suppressed).toBe(true);
      expect(result.toolAnnotations!["focus-module"].suppressed).toBe(true);
    });

    it("suppresses tab rules for chatgpt", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({ toolProfile: { toolId: "chatgpt", detectedVia: "setting" } }),
        {
          wastePatterns: tabWastePatterns,
          suggestions: tabSuggestions,
          tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" },
        }
      );

      expect(result.toolAnnotations!["many-tabs"].suppressed).toBe(true);
    });

    it("does NOT suppress tab rules for cursor", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({ toolProfile: cursorProfile() }),
        {
          wastePatterns: tabWastePatterns,
          suggestions: tabSuggestions,
          tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" },
        }
      );

      expect(Object.keys(result.toolAnnotations!)).toHaveLength(0);
    });

    it("does NOT suppress tab rules for copilot", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({ toolProfile: copilotProfile() }),
        {
          wastePatterns: tabWastePatterns,
          suggestions: tabSuggestions,
          tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" },
        }
      );

      expect(Object.keys(result.toolAnnotations!)).toHaveLength(0);
    });

    it("does NOT suppress tab rules for windsurf", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({ toolProfile: { toolId: "windsurf", detectedVia: "setting" } }),
        {
          wastePatterns: tabWastePatterns,
          suggestions: tabSuggestions,
          tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" },
        }
      );

      expect(Object.keys(result.toolAnnotations!)).toHaveLength(0);
    });
  });

  // ─── F6: Conversation Length ────────────────────────────────────

  describe("F6: Conversation length warning", () => {
    it("no warning at 0 messages", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({ toolProfile: cursorProfile(), chatHistoryLength: 0 }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
      expect(ruleIds).not.toContain("long-conversation");
    });

    it("info warning at 11 messages", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({ toolProfile: cursorProfile(), chatHistoryLength: 11 }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      const wp = result.wastePatterns!.find((w) => w.ruleId === "long-conversation");
      expect(wp).toBeDefined();
      expect(wp!.severity).toBe("info");
    });

    it("warning at 21 messages", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({ toolProfile: cursorProfile(), chatHistoryLength: 21 }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      const wp = result.wastePatterns!.find((w) => w.ruleId === "long-conversation");
      expect(wp).toBeDefined();
      expect(wp!.severity).toBe("warning");
    });
  });

  // ─── F9: Truncation Risk ───────────────────────────────────────

  describe("F9: Truncation risk warning", () => {
    it("no warning below 70%", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({ toolProfile: { toolId: "amazon-q", detectedVia: "setting" } }),
        { tokenEstimate: { low: 20000, high: 30000, band: "medium", confidence: "medium" } }
      );

      // midpoint = 25000, amazon-q = 75k → 33%
      const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
      expect(ruleIds).not.toContain("truncation-risk");
    });

    it("info warning at 71-90%", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({ toolProfile: { toolId: "amazon-q", detectedVia: "setting" } }),
        { tokenEstimate: { low: 50000, high: 60000, band: "high", confidence: "medium" } }
      );

      // midpoint = 55000, amazon-q = 75k → 73%
      const wp = result.wastePatterns!.find((w) => w.ruleId === "truncation-risk");
      expect(wp).toBeDefined();
      expect(wp!.severity).toBe("info");
    });

    it("warning at >90%", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({ toolProfile: { toolId: "amazon-q", detectedVia: "setting" } }),
        { tokenEstimate: { low: 68000, high: 72000, band: "high", confidence: "medium" } }
      );

      // midpoint = 70000, amazon-q = 75k → 93%
      const wp = result.wastePatterns!.find((w) => w.ruleId === "truncation-risk");
      expect(wp).toBeDefined();
      expect(wp!.severity).toBe("warning");
      expect(wp!.description).toContain("truncated");
    });
  });

  // ─── F10: Injection Surface Warning ─────────────────────────────

  describe("F10: Injection surface warning", () => {
    it("fires when context usage > 70% and instruction files exist", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: { toolId: "amazon-q", detectedVia: "setting" },
          aiInstructionFiles: [makeInstruction(".amazonq/rules/main", 20, "amazon-q")],
        }),
        { tokenEstimate: { low: 55000, high: 60000, band: "high", confidence: "medium" } }
      );

      // midpoint = 57500, amazon-q = 75k → 77%
      const wp = result.wastePatterns!.find((w) => w.ruleId === "injection-surface");
      expect(wp).toBeDefined();
      expect(wp!.severity).toBe("info");
      expect(wp!.description).toContain("instruction file(s)");
    });

    it("does not fire when context usage <= 70%", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: cursorProfile(),
          aiInstructionFiles: [makeInstruction(".cursorrules", 20, "cursor")],
        }),
        { tokenEstimate: { low: 10000, high: 20000, band: "medium", confidence: "medium" } }
      );

      const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
      expect(ruleIds).not.toContain("injection-surface");
    });

    it("does not fire when no instruction files exist", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: { toolId: "amazon-q", detectedVia: "setting" },
          aiInstructionFiles: [],
        }),
        { tokenEstimate: { low: 55000, high: 60000, band: "high", confidence: "medium" } }
      );

      const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
      expect(ruleIds).not.toContain("injection-surface");
    });

    it("does not fire at exactly 70%", () => {
      // amazon-q = 75k, midpoint = 52500 → 70%
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: { toolId: "amazon-q", detectedVia: "setting" },
          aiInstructionFiles: [makeInstruction(".amazonq/rules/main", 20, "amazon-q")],
        }),
        { tokenEstimate: { low: 52500, high: 52500, band: "high", confidence: "medium" } }
      );

      const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
      expect(ruleIds).not.toContain("injection-surface");
    });

    it("includes correct instruction file count in description", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: { toolId: "amazon-q", detectedVia: "setting" },
          aiInstructionFiles: [
            makeInstruction(".amazonq/rules/main", 20, "amazon-q"),
            makeInstruction(".cursorrules", 15, "cursor"),
            makeInstruction("CLAUDE.md", 30, "claude-code"),
          ],
        }),
        { tokenEstimate: { low: 55000, high: 60000, band: "high", confidence: "medium" } }
      );

      const wp = result.wastePatterns!.find((w) => w.ruleId === "injection-surface");
      expect(wp).toBeDefined();
      expect(wp!.description).toContain("3 instruction file(s)");
    });

    it("generates both wastePattern and suggestion", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: { toolId: "amazon-q", detectedVia: "setting" },
          aiInstructionFiles: [makeInstruction(".amazonq/rules/main", 20, "amazon-q")],
        }),
        { tokenEstimate: { low: 55000, high: 60000, band: "high", confidence: "medium" } }
      );

      const wp = result.wastePatterns!.find((w) => w.ruleId === "injection-surface");
      const suggestion = result.suggestions!.find((s) => s.id === "review-injection-surface");
      expect(wp).toBeDefined();
      expect(suggestion).toBeDefined();
      expect(suggestion!.text).toContain("instruction file(s)");
    });
  });

  // ─── F11: Data Flow Awareness ──────────────────────────────────

  describe("F11: Data flow awareness", () => {
    it("fires when sensitive files are in waste patterns", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: cursorProfile(),
        }),
        {
          tokenEstimate: { low: 5000, high: 10000, band: "medium", confidence: "medium" },
          wastePatterns: [
            { ruleId: "env-file", source: ".env", description: ".env detected", severity: "warning", suggestion: "Close" },
          ],
        }
      );

      const wp = result.wastePatterns!.find((w) => w.ruleId === "data-flow-warning");
      expect(wp).toBeDefined();
      expect(wp!.severity).toBe("warning");
      expect(wp!.description).toContain("Anysphere");
      expect(wp!.description).toContain("Cursor");
    });

    it("includes token estimate in description", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: claudeProfile(),
        }),
        {
          tokenEstimate: { low: 10000, high: 20000, band: "medium", confidence: "medium" },
          wastePatterns: [
            { ruleId: "sensitive-file", source: "id_rsa", description: "key detected", severity: "warning", suggestion: "Close" },
          ],
        }
      );

      const wp = result.wastePatterns!.find((w) => w.ruleId === "data-flow-warning");
      expect(wp).toBeDefined();
      expect(wp!.description).toContain("Anthropic");
      expect(wp!.description).toContain("~15k tokens");
    });

    it("does not fire without sensitive waste patterns", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: cursorProfile(),
        }),
        {
          tokenEstimate: { low: 5000, high: 10000, band: "medium", confidence: "medium" },
          wastePatterns: [
            { ruleId: "large-file", source: "big.ts", description: "large", severity: "warning", suggestion: "Select" },
          ],
        }
      );

      const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
      expect(ruleIds).not.toContain("data-flow-warning");
    });

    it("does not fire without tool profile", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({ toolProfile: null }),
        {
          wastePatterns: [
            { ruleId: "env-file", source: ".env", description: ".env detected", severity: "warning", suggestion: "Close" },
          ],
        }
      );

      expect(result).toEqual({});
    });

    it("shows correct provider for copilot", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: copilotProfile(),
        }),
        {
          tokenEstimate: { low: 5000, high: 10000, band: "medium", confidence: "medium" },
          wastePatterns: [
            { ruleId: "env-file", source: ".env", description: ".env detected", severity: "warning", suggestion: "Close" },
          ],
        }
      );

      const wp = result.wastePatterns!.find((w) => w.ruleId === "data-flow-warning");
      expect(wp).toBeDefined();
      expect(wp!.description).toContain("Microsoft/GitHub");
      expect(wp!.description).toContain("GitHub Copilot");
    });

    it("fires with sensitive-file alone as trigger", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: cursorProfile(),
        }),
        {
          tokenEstimate: { low: 5000, high: 10000, band: "medium", confidence: "medium" },
          wastePatterns: [
            { ruleId: "sensitive-file", source: "id_rsa", description: "key file", severity: "warning", suggestion: "Close" },
          ],
        }
      );

      const wp = result.wastePatterns!.find((w) => w.ruleId === "data-flow-warning");
      expect(wp).toBeDefined();
      expect(wp!.description).toContain("Anysphere");
    });

    it("shows 'unknown size' when no token estimate", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: cursorProfile(),
        }),
        {
          wastePatterns: [
            { ruleId: "env-file", source: ".env", description: ".env detected", severity: "warning", suggestion: "Close" },
          ],
        }
      );

      const wp = result.wastePatterns!.find((w) => w.ruleId === "data-flow-warning");
      expect(wp).toBeDefined();
      expect(wp!.description).toContain("unknown size");
    });

    it("generates suggestion with provider name", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: claudeProfile(),
        }),
        {
          tokenEstimate: { low: 5000, high: 10000, band: "medium", confidence: "medium" },
          wastePatterns: [
            { ruleId: "env-file", source: ".env", description: ".env detected", severity: "warning", suggestion: "Close" },
          ],
        }
      );

      const suggestion = result.suggestions!.find((s) => s.id === "data-flow-warning");
      expect(suggestion).toBeDefined();
      expect(suggestion!.text).toContain("Anthropic");
      expect(suggestion!.text).toContain("Claude Code");
    });
  });

  // ─── F8: Context Gap Detection ──────────────────────────────────

  describe("F8: Context gap detection", () => {
    it("detects missing imported file from selection", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: cursorProfile(),
          selection: {
            lineCount: 10,
            charCount: 200,
            text: "import { helper } from './utils/helpers';\nconsole.log(helper());",
          },
          openTabs: [
            makeFile({ path: "src/app.ts", isActive: true }),
          ],
        }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
      expect(ruleIds).toContain("context-gap");
      expect(result.wastePatterns!.find((w) => w.ruleId === "context-gap")!.description).toContain("helpers");
    });

    it("does not warn when imported file is in open tabs", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: cursorProfile(),
          selection: {
            lineCount: 10,
            charCount: 200,
            text: "import { helper } from './utils/helpers';",
          },
          openTabs: [
            makeFile({ path: "src/app.ts", isActive: true }),
            makeFile({ path: "src/utils/helpers.ts" }),
          ],
        }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
      expect(ruleIds).not.toContain("context-gap");
    });

    it("does not warn when no selection", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: cursorProfile(),
          selection: null,
        }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
      expect(ruleIds).not.toContain("context-gap");
    });

    it("ignores non-relative imports (node_modules packages)", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: cursorProfile(),
          selection: {
            lineCount: 5,
            charCount: 100,
            text: "import express from 'express';\nimport { z } from 'zod';",
          },
          openTabs: [],
        }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
      expect(ruleIds).not.toContain("context-gap");
    });

    it("detects missing require() imports", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: cursorProfile(),
          selection: {
            lineCount: 5,
            charCount: 100,
            text: "const db = require('./db/connection');\nconst config = require('../config');",
          },
          openTabs: [
            makeFile({ path: "src/app.ts", isActive: true }),
          ],
        }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      const wp = result.wastePatterns!.find((w) => w.ruleId === "context-gap");
      expect(wp).toBeDefined();
      expect(wp!.description).toContain("2 file(s)");
    });

    it("detects multiple missing imports", () => {
      const result = detectToolAwareIssues(
        makeSnapshot({
          toolProfile: cursorProfile(),
          selection: {
            lineCount: 10,
            charCount: 300,
            text: "import { foo } from './services/foo';\nimport { bar } from './models/bar';\nimport { baz } from '../shared/baz';",
          },
          openTabs: [
            makeFile({ path: "src/app.ts", isActive: true }),
          ],
        }),
        { tokenEstimate: { low: 0, high: 0, band: "low", confidence: "medium" } }
      );

      const wp = result.wastePatterns!.find((w) => w.ruleId === "context-gap");
      expect(wp).toBeDefined();
      expect(wp!.description).toContain("3 file(s)");
    });
  });
});
