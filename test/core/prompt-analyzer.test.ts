import { describe, it, expect } from "vitest";
import { analyzePrompt, extractIntentKeywords } from "../../src/core/analyzers/prompt-analyzer.js";
import type { ContextSnapshot, FileInfo, AnalysisResult, WorkspaceMatch } from "../../src/core/types.js";

function makeFile(overrides: Partial<FileInfo> = {}): FileInfo {
  return {
    path: "src/main.ts",
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

function makeSnapshot(overrides: Partial<ContextSnapshot> = {}): ContextSnapshot {
  return {
    timestamp: Date.now(),
    activeFile: makeFile({ isActive: true }),
    selection: null,
    openTabs: [makeFile({ isActive: true })],
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

function makeResult(): AnalysisResult {
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
  };
}

// ─── Edge Cases ──────────────────────────────────────────────────

describe("prompt-analyzer edge cases", () => {
  it("returns empty analysis for empty prompt", () => {
    const analysis = analyzePrompt("", makeSnapshot(), makeResult());
    expect(analysis.taskType).toBeNull();
    expect(analysis.intentKeywords).toEqual([]);
    expect(analysis.matchingFiles).toEqual([]);
    expect(analysis.missingFiles).toEqual([]);
    expect(analysis.unnecessaryFiles).toEqual([]);
    expect(analysis.scopeHint).toBeNull();
  });

  it("returns empty analysis for whitespace-only prompt", () => {
    const analysis = analyzePrompt("   ", makeSnapshot(), makeResult());
    expect(analysis.intentKeywords).toEqual([]);
  });

  it("handles no files open", () => {
    const snapshot = makeSnapshot({ activeFile: null, openTabs: [] });
    const analysis = analyzePrompt("fix the auth module", snapshot, makeResult());
    expect(analysis.matchingFiles).toEqual([]);
    expect(analysis.unnecessaryFiles).toEqual([]);
  });
});

// ─── Task Classification ─────────────────────────────────────────

describe("prompt-analyzer task classification", () => {
  it("classifies 'fix the bug in auth' as debugging", () => {
    const analysis = analyzePrompt("fix the bug in auth", makeSnapshot(), makeResult());
    expect(analysis.taskType).toBe("debugging");
  });

  it("classifies 'refactor the login flow' as refactoring", () => {
    const analysis = analyzePrompt("refactor the login flow", makeSnapshot(), makeResult());
    expect(analysis.taskType).toBe("refactoring");
  });

  it("classifies 'add a new endpoint' as coding", () => {
    const analysis = analyzePrompt("add a new endpoint for users", makeSnapshot(), makeResult());
    expect(analysis.taskType).toBe("coding");
  });

  it("classifies 'explain how the pipeline works' as explanation", () => {
    const analysis = analyzePrompt("explain how the pipeline works", makeSnapshot(), makeResult());
    expect(analysis.taskType).toBe("explanation");
  });
});

// ─── Intent Keyword Extraction ───────────────────────────────────

describe("prompt-analyzer keyword extraction", () => {
  it("extracts file references as high-confidence", () => {
    const { high, all } = extractIntentKeywords("fix auth.ts");
    expect(high).toContain("auth");
    expect(all).toContain("auth");
  });

  it("extracts module name as high-confidence", () => {
    const { high, all } = extractIntentKeywords("update the auth module");
    expect(high).toContain("auth");
    expect(all).toContain("auth");
  });

  it("extracts path references as high-confidence", () => {
    const { high, all } = extractIntentKeywords("refactor src/billing/invoice");
    expect(high).toContain("billing");
    expect(high).toContain("invoice");
    expect(all).toContain("billing");
  });

  it("filters out stop words and action verbs", () => {
    const { all } = extractIntentKeywords("fix the bug in the auth service");
    expect(all).not.toContain("the");
    expect(all).not.toContain("fix");
  });

  it("puts generic words in all but not high", () => {
    const { high, all } = extractIntentKeywords("fix the login flow");
    // "login" and "flow" are generic words, not file/path/module refs
    expect(all).toContain("login");
    expect(high).not.toContain("login");
  });
});

// ─── Context-Intent Matching ─────────────────────────────────────

describe("prompt-analyzer context-intent match", () => {
  it("matches open tab when path contains intent keyword", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({ path: "src/auth/auth-service.ts", isActive: true }),
      openTabs: [
        makeFile({ path: "src/auth/auth-service.ts", isActive: true }),
        makeFile({ path: "src/billing/invoice.ts" }),
      ],
    });
    // "auth module" → high-confidence keyword "auth"
    const analysis = analyzePrompt("fix the auth module", snapshot, makeResult());
    expect(analysis.matchingFiles).toContain("src/auth/auth-service.ts");
    expect(analysis.matchingFiles).not.toContain("src/billing/invoice.ts");
  });

  it("returns empty matchingFiles when no files match", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({ path: "src/billing/invoice.ts", isActive: true }),
      openTabs: [
        makeFile({ path: "src/billing/invoice.ts", isActive: true }),
      ],
    });
    const analysis = analyzePrompt("fix the auth module", snapshot, makeResult());
    expect(analysis.matchingFiles).toEqual([]);
  });

  it("uses all keywords (including low-confidence) for matching", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({ path: "src/auth/login.ts", isActive: true }),
      openTabs: [makeFile({ path: "src/auth/login.ts", isActive: true })],
    });
    // "login" is low-confidence (generic word), but still used for matching
    const analysis = analyzePrompt("fix login", snapshot, makeResult());
    expect(analysis.matchingFiles).toContain("src/auth/login.ts");
  });
});

// ─── Missing Context Detection ───────────────────────────────────

describe("prompt-analyzer missing context", () => {
  it("detects files mentioned in prompt but not open", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({ path: "src/main.ts", isActive: true }),
      openTabs: [makeFile({ path: "src/main.ts", isActive: true })],
    });
    const analysis = analyzePrompt("fix auth-service.ts", snapshot, makeResult());
    expect(analysis.missingFiles).toContain("auth-service.ts");
  });

  it("detects imports in selection not in tabs", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({ path: "src/auth/auth.ts", isActive: true }),
      selection: {
        lineCount: 5,
        charCount: 120,
        text: "import { db } from './db-connection';\nimport { hash } from './hash-util';",
      },
      openTabs: [makeFile({ path: "src/auth/auth.ts", isActive: true })],
    });
    const analysis = analyzePrompt("fix the auth module", snapshot, makeResult());
    expect(analysis.missingFiles.some(f => f.includes("db-connection"))).toBe(true);
    expect(analysis.missingFiles.some(f => f.includes("hash-util"))).toBe(true);
  });

  it("does not flag files that are already open", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({ path: "src/auth/auth-service.ts", isActive: true }),
      openTabs: [
        makeFile({ path: "src/auth/auth-service.ts", isActive: true }),
      ],
    });
    const analysis = analyzePrompt("fix auth-service.ts", snapshot, makeResult());
    expect(analysis.missingFiles).not.toContain("auth-service.ts");
  });

  it("does NOT generate 'module not open' noise from generic words", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({ path: "src/main.ts", isActive: true }),
      openTabs: [makeFile({ path: "src/main.ts", isActive: true })],
    });
    // v0.1 would generate "service (no related files open)" — v0.2 should not
    const analysis = analyzePrompt("fix the auth service", snapshot, makeResult());
    const moduleNoise = analysis.missingFiles.filter(f => f.includes("(no related"));
    expect(moduleNoise).toEqual([]);
  });
});

// ─── Low Relevance Detection ─────────────────────────────────────

describe("prompt-analyzer low relevance (v0.2 precision)", () => {
  it("flags tabs as low-relevance when high-confidence keywords exist", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({ path: "src/auth/auth.ts", isActive: true }),
      openTabs: [
        makeFile({ path: "src/auth/auth.ts", isActive: true }),
        makeFile({ path: "src/billing/invoice.ts" }),
        makeFile({ path: "data/users.csv" }),
      ],
    });
    // "auth module" → "auth" is high-confidence (module pattern)
    const analysis = analyzePrompt("fix the auth module", snapshot, makeResult());
    expect(analysis.unnecessaryFiles).toContain("src/billing/invoice.ts");
    expect(analysis.unnecessaryFiles).toContain("data/users.csv");
  });

  it("does not flag tabs that match high-confidence keywords", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({ path: "src/auth/auth.ts", isActive: true }),
      openTabs: [
        makeFile({ path: "src/auth/auth.ts", isActive: true }),
        makeFile({ path: "src/auth/auth-types.ts" }),
      ],
    });
    const analysis = analyzePrompt("fix the auth module", snapshot, makeResult());
    expect(analysis.unnecessaryFiles).not.toContain("src/auth/auth-types.ts");
  });

  it("does not flag active file as low-relevance", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({ path: "src/billing/invoice.ts", isActive: true }),
      openTabs: [
        makeFile({ path: "src/billing/invoice.ts", isActive: true }),
      ],
    });
    const analysis = analyzePrompt("fix the auth module", snapshot, makeResult());
    expect(analysis.unnecessaryFiles).not.toContain("src/billing/invoice.ts");
  });

  it("returns empty when only generic words (no high-confidence keywords)", () => {
    const snapshot = makeSnapshot({
      openTabs: [
        makeFile({ isActive: true }),
        makeFile({ path: "src/foo.ts" }),
      ],
    });
    // "fix login" → "login" is low-confidence only → no low-relevance flags
    const analysis = analyzePrompt("fix login", snapshot, makeResult());
    expect(analysis.unnecessaryFiles).toEqual([]);
  });

  it("returns empty when no keywords at all", () => {
    const snapshot = makeSnapshot({
      openTabs: [
        makeFile({ isActive: true }),
        makeFile({ path: "src/foo.ts" }),
      ],
    });
    const analysis = analyzePrompt("the", snapshot, makeResult());
    expect(analysis.unnecessaryFiles).toEqual([]);
  });
});

// ─── Token Estimation ────────────────────────────────────────────

describe("prompt-analyzer token estimation", () => {
  it("estimates relevant tokens from matching files", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({ path: "src/auth/auth.ts", charCount: 4000, isActive: true }),
      openTabs: [
        makeFile({ path: "src/auth/auth.ts", charCount: 4000, isActive: true }),
        makeFile({ path: "src/auth/auth-types.ts", charCount: 2000 }),
      ],
    });
    const analysis = analyzePrompt("fix the auth module", snapshot, makeResult());
    expect(analysis.relevantTokenEstimate.low).toBeGreaterThan(0);
    expect(analysis.relevantTokenEstimate.high).toBeGreaterThan(analysis.relevantTokenEstimate.low);
  });

  it("estimates wasted tokens from low-relevance files with 30% tab weight", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({ path: "src/auth/auth.ts", charCount: 4000, isActive: true }),
      openTabs: [
        makeFile({ path: "src/auth/auth.ts", charCount: 4000, isActive: true }),
        makeFile({ path: "src/billing/invoice.ts", charCount: 10000 }),
      ],
    });
    // "auth module" → "auth" is high-confidence
    const analysis = analyzePrompt("fix the auth module", snapshot, makeResult());
    // invoice.ts is low-relevance, 10000 chars * 0.3 = 3000 chars
    // low = 3000/5 = 600, high = 3000/3 = 1000
    expect(analysis.wastedTokenEstimate.low).toBe(600);
    expect(analysis.wastedTokenEstimate.high).toBe(1000);
  });
});

// ─── Scope Hints (v0.2 tighter thresholds) ───────────────────────

describe("prompt-analyzer scope hints", () => {
  it("warns when prompt spans 3+ task types", () => {
    const analysis = analyzePrompt(
      "fix the auth bug and add tests and refactor the login flow",
      makeSnapshot(),
      makeResult(),
    );
    expect(analysis.scopeHint).toContain("task types");
  });

  it("does NOT warn for 2 task types without broad language", () => {
    // "fix the bug in login" = debugging only (fix + bug are same category)
    // "rename the auth variable" = refactoring only
    // Two separate prompts, each single-type — let's test a true 2-type case:
    // "explain the auth bug" = explanation + debugging, no broad language
    const analysis = analyzePrompt(
      "explain the auth bug",
      makeSnapshot(),
      makeResult(),
    );
    expect(analysis.scopeHint).toBeNull();
  });

  it("warns for 2 task types with broad language", () => {
    const analysis = analyzePrompt(
      "fix all the bugs and refactor the entire module",
      makeSnapshot(),
      makeResult(),
    );
    expect(analysis.scopeHint).toContain("Broad scope");
  });

  it("warns when prompt is very brief", () => {
    const analysis = analyzePrompt("fix it", makeSnapshot(), makeResult());
    expect(analysis.scopeHint).toContain("brief");
  });

  it("returns null scope hint for focused prompts", () => {
    const analysis = analyzePrompt(
      "refactor the auth service to use dependency injection",
      makeSnapshot(),
      makeResult(),
    );
    expect(analysis.scopeHint).toBeNull();
  });
});

// ─── Integration ─────────────────────────────────────────────────

describe("prompt-analyzer integration", () => {
  it("full scenario: 'refactor auth' with auth and unrelated files", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({ path: "src/auth/auth-service.ts", charCount: 8000, isActive: true }),
      openTabs: [
        makeFile({ path: "src/auth/auth-service.ts", charCount: 8000, isActive: true }),
        makeFile({ path: "src/auth/auth-types.ts", charCount: 2000 }),
        makeFile({ path: "src/billing/invoice.ts", charCount: 6000 }),
        makeFile({ path: "data/users.csv", charCount: 80000 }),
      ],
    });

    // "auth service" → "auth" is high-confidence (module pattern for "service")
    const analysis = analyzePrompt("refactor the auth service", snapshot, makeResult());

    expect(analysis.taskType).toBe("refactoring");
    expect(analysis.matchingFiles).toContain("src/auth/auth-service.ts");
    expect(analysis.matchingFiles).toContain("src/auth/auth-types.ts");
    expect(analysis.unnecessaryFiles).toContain("src/billing/invoice.ts");
    expect(analysis.unnecessaryFiles).toContain("data/users.csv");
    expect(analysis.wastedTokenEstimate.high).toBeGreaterThan(0);
    expect(analysis.relevantTokenEstimate.high).toBeGreaterThan(0);
  });

  it("generic prompt without high-confidence keywords does not over-flag", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({ path: "src/main.ts", isActive: true }),
      openTabs: [
        makeFile({ path: "src/main.ts", isActive: true }),
        makeFile({ path: "src/utils/helpers.ts" }),
        makeFile({ path: "src/config/settings.ts" }),
      ],
    });

    // "make it faster" → no high-confidence keywords
    const analysis = analyzePrompt("make it faster", snapshot, makeResult());

    expect(analysis.unnecessaryFiles).toEqual([]); // no false positives
    expect(analysis.missingFiles).toEqual([]);      // no noise
  });
});

// ─── Workspace Matches ──────────────────────────────────────────

describe("prompt-analyzer workspace matches", () => {
  it("passes workspace matches through to result", () => {
    const wsMatches: WorkspaceMatch[] = [
      {
        path: "src/auth/auth-utils.ts",
        reason: "import",
        keyword: "./auth-utils",
        confidence: "high",
      },
    ];
    const analysis = analyzePrompt("fix the auth module", makeSnapshot(), makeResult(), wsMatches);
    expect(analysis.workspaceMatches).toEqual(wsMatches);
    expect(analysis.workspaceMatches.length).toBe(1);
  });

  it("defaults to empty workspace matches when not provided", () => {
    const analysis = analyzePrompt("fix the auth module", makeSnapshot(), makeResult());
    expect(analysis.workspaceMatches).toEqual([]);
  });

  it("is backward compatible — existing tests still get empty workspaceMatches", () => {
    const analysis = analyzePrompt("", makeSnapshot(), makeResult());
    expect(analysis.workspaceMatches).toEqual([]);
  });

  it("includes workspaceMatches in empty analysis", () => {
    const analysis = analyzePrompt("   ", makeSnapshot(), makeResult());
    expect(analysis.workspaceMatches).toEqual([]);
  });

  it("preserves workspace matches with contentMatch field", () => {
    const wsMatches: WorkspaceMatch[] = [
      {
        path: "src/session-store.ts",
        reason: "content",
        keyword: "jwt",
        confidence: "low",
        contentMatch: {
          lineNumber: 45,
          preview: "import { verify } from 'jsonwebtoken';",
        },
      },
    ];
    const analysis = analyzePrompt("fix jwt auth", makeSnapshot(), makeResult(), wsMatches);
    expect(analysis.workspaceMatches[0].contentMatch).toBeDefined();
    expect(analysis.workspaceMatches[0].contentMatch?.lineNumber).toBe(45);
    expect(analysis.workspaceMatches[0].contentMatch?.preview).toContain("jsonwebtoken");
  });

  it("handles mixed match types in single result", () => {
    const wsMatches: WorkspaceMatch[] = [
      { path: "src/auth.ts", reason: "import", keyword: "./auth", confidence: "high" },
      { path: "src/auth.test.ts", reason: "test-pair", keyword: "auth", confidence: "high" },
      {
        path: "src/session.ts",
        reason: "content",
        keyword: "auth",
        confidence: "low",
        contentMatch: { lineNumber: 10, preview: "const auth = getAuth();" },
      },
    ];
    const analysis = analyzePrompt("fix the auth module", makeSnapshot(), makeResult(), wsMatches);
    expect(analysis.workspaceMatches.length).toBe(3);
    expect(analysis.workspaceMatches.map((m) => m.reason)).toEqual(["import", "test-pair", "content"]);
  });

  it("content matches with empty preview are handled", () => {
    const wsMatches: WorkspaceMatch[] = [
      {
        path: "src/empty-match.ts",
        reason: "content",
        keyword: "auth",
        confidence: "low",
        contentMatch: { lineNumber: 1, preview: "" },
      },
    ];
    const analysis = analyzePrompt("fix the auth module", makeSnapshot(), makeResult(), wsMatches);
    expect(analysis.workspaceMatches[0].contentMatch?.preview).toBe("");
  });
});
