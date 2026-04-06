import { describe, it, expect } from "vitest";
import { detectWaste } from "../../src/core/analyzers/waste-detector.js";
import type { ContextSnapshot, FileInfo } from "../../src/core/types.js";

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

describe("detectWaste", () => {
  // ─── Existing rules ────────────────────────────────────────────

  it("returns no waste for clean context", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "small.ts",
        lineCount: 50,
        charCount: 2000,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});

    expect(result.wastePatterns).toHaveLength(0);
    expect(result.suggestions).toHaveLength(0);
  });

  it("detects large active file", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "huge-service.ts",
        lineCount: 1500,
        charCount: 60000,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});

    expect(result.wastePatterns!.length).toBeGreaterThanOrEqual(1);
    expect(result.wastePatterns![0].ruleId).toBe("large-file");
  });

  it("detects large selection", () => {
    const snapshot = makeSnapshot({
      selection: {
        lineCount: 600,
        charCount: 24000,
        text: "lots of code...",
      },
    });

    const result = detectWaste(snapshot, {});

    expect(result.wastePatterns).toHaveLength(1);
    expect(result.wastePatterns![0].ruleId).toBe("large-selection");
  });

  it("detects too many open tabs", () => {
    const tabs = Array.from({ length: 15 }, (_, i) =>
      makeFile({
        path: `src/services/file-${i}.ts`,
        isActive: i === 0,
      })
    );

    const snapshot = makeSnapshot({ openTabs: tabs });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("many-tabs");
  });

  it("detects multiple waste patterns simultaneously", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "huge.ts",
        lineCount: 2000,
        charCount: 80000,
        isActive: true,
      }),
      selection: null,
    });

    const result = detectWaste(snapshot, {});

    expect(result.wastePatterns!.length).toBeGreaterThanOrEqual(2);
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("large-file");
    expect(ruleIds).toContain("no-selection-large-file");
  });

  it("detects generated/non-code files", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "dist/extension.js.map",
        languageId: "json",
        lineCount: 1,
        charCount: 80000,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});

    expect(result.wastePatterns!.length).toBeGreaterThanOrEqual(1);
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("generated-file");
  });

  it("detects generated file in /dist/ path", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "dist/bundle.js",
        languageId: "javascript",
        lineCount: 50,
        charCount: 2000,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("generated-file");
  });

  it("detects generated file in /build/ path", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "build/output.js",
        languageId: "javascript",
        lineCount: 50,
        charCount: 2000,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("generated-file");
  });

  it("detects generated file in /node_modules/ path", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "node_modules/lodash/index.js",
        languageId: "javascript",
        lineCount: 50,
        charCount: 2000,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("generated-file");
  });

  it("detects large file by char count even if line count is low", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "bundle.js",
        languageId: "javascript",
        lineCount: 5,
        charCount: 200000,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});

    expect(result.wastePatterns!.length).toBeGreaterThanOrEqual(1);
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("large-file");
  });

  it("detects lock files in active editor", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "package-lock.json",
        languageId: "json",
        lineCount: 15000,
        charCount: 600000,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("lock-file");
  });

  it("detects lock files in open tabs", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "src/index.ts",
        lineCount: 50,
        charCount: 2000,
        isActive: true,
      }),
      openTabs: [
        makeFile({
          path: "pnpm-lock.yaml",
          languageId: "yaml",
          lineCount: 8000,
          charCount: 300000,
        }),
      ],
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("lock-file");
  });

  it("detects .env files as privacy risk", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: ".env",
        languageId: "plaintext",
        lineCount: 20,
        charCount: 500,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("env-file");
    expect(
      result.wastePatterns![
        result.wastePatterns!.findIndex((w) => w.ruleId === "env-file")
      ].severity
    ).toBe("warning");
  });

  it("detects .env.local variant in tabs", () => {
    const snapshot = makeSnapshot({
      openTabs: [
        makeFile({
          path: ".env.local",
          languageId: "plaintext",
          lineCount: 10,
          charCount: 200,
        }),
      ],
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("env-file");
  });

  it("offsets suggestion priority based on prior pipeline suggestions", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: ".env",
        languageId: "plaintext",
        lineCount: 20,
        charCount: 500,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {
      suggestions: [
        { id: "prior", text: "existing suggestion", priority: 1, dismissed: false },
      ],
    });

    // waste-detector returns only its own suggestions (pipeline handles concat)
    expect(result.suggestions!.length).toBeGreaterThanOrEqual(1);
    // Priority starts after prior suggestions count (1 prior → first new starts at 2)
    expect(result.suggestions![0].priority).toBe(2);
  });

  // ─── Tier 1: AI instruction files missing ──────────────────────

  it("detects missing AI instruction files", () => {
    const snapshot = makeSnapshot({
      aiInstructionFiles: [],
      activeFile: makeFile({ isActive: true }),
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("ai-instructions-missing");
    const pattern = result.wastePatterns!.find(
      (w) => w.ruleId === "ai-instructions-missing"
    );
    expect(pattern!.severity).toBe("info");
  });

  it("does not trigger ai-instructions-missing when files present", () => {
    const snapshot = makeSnapshot({
      aiInstructionFiles: [
        { path: ".cursorrules", lineCount: 20, toolId: "cursor" as const },
        { path: "CLAUDE.md", lineCount: 30, toolId: "claude-code" as const },
      ],
      activeFile: makeFile({ lineCount: 50, charCount: 2000, isActive: true }),
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).not.toContain("ai-instructions-missing");
  });

  // ─── Tier 1: Unsaved file ─────────────────────────────────────

  it("detects unsaved file", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "src/app.ts",
        isDirty: true,
        lineCount: 50,
        charCount: 2000,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("unsaved-file");
    const pattern = result.wastePatterns!.find(
      (w) => w.ruleId === "unsaved-file"
    );
    expect(pattern!.severity).toBe("warning");
  });

  it("does not trigger unsaved-file when file is saved", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        isDirty: false,
        lineCount: 50,
        charCount: 2000,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).not.toContain("unsaved-file");
  });

  // ─── Tier 1: Test + production mixed ──────────────────────────
  // Only triggers with 3+ test files mixed with prod (TDD with 1-2 test files is fine)

  it("detects test and production files mixed when many test files open", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({ path: "src/auth/service.ts", isActive: true }),
      openTabs: [
        makeFile({ path: "src/auth/service.ts", isActive: true }),
        makeFile({ path: "src/auth/types.ts" }),
        makeFile({ path: "test/auth/service.test.ts" }),
        makeFile({ path: "test/auth/types.test.ts" }),
        makeFile({ path: "test/auth/integration.test.ts" }),
      ],
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("test-prod-mixed");
    const pattern = result.wastePatterns!.find(
      (w) => w.ruleId === "test-prod-mixed"
    );
    expect(pattern!.severity).toBe("info");
  });

  it("does NOT trigger test-prod-mixed for TDD (1-2 test files)", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({ path: "src/auth/service.ts", isActive: true }),
      openTabs: [
        makeFile({ path: "src/auth/service.ts", isActive: true }),
        makeFile({ path: "test/auth/service.test.ts" }),
        makeFile({ path: "src/auth/types.ts" }),
      ],
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).not.toContain("test-prod-mixed");
  });

  it("does not trigger test-prod-mixed with fewer than 5 total tabs", () => {
    const snapshot = makeSnapshot({
      openTabs: [
        makeFile({ path: "src/auth/service.ts", isActive: true }),
        makeFile({ path: "test/auth/a.test.ts" }),
        makeFile({ path: "test/auth/b.test.ts" }),
        makeFile({ path: "test/auth/c.test.ts" }),
      ],
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).not.toContain("test-prod-mixed");
  });

  it("does not trigger test-prod-mixed when only test files", () => {
    const snapshot = makeSnapshot({
      openTabs: [
        makeFile({ path: "test/a.test.ts", isActive: true }),
        makeFile({ path: "test/b.test.ts" }),
        makeFile({ path: "test/c.spec.ts" }),
        makeFile({ path: "test/d.test.ts" }),
        makeFile({ path: "test/e.test.ts" }),
      ],
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).not.toContain("test-prod-mixed");
  });

  // ─── Tier 1: Unrelated tabs ───────────────────────────────────

  it("detects unrelated tabs spanning 4+ modules", () => {
    const snapshot = makeSnapshot({
      openTabs: [
        makeFile({ path: "src/auth/login.ts", isActive: true }),
        makeFile({ path: "src/billing/invoice.ts" }),
        makeFile({ path: "src/users/profile.ts" }),
        makeFile({ path: "lib/utils/format.ts" }),
      ],
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("unrelated-tabs");
    const pattern = result.wastePatterns!.find(
      (w) => w.ruleId === "unrelated-tabs"
    );
    expect(pattern!.severity).toBe("info");
  });

  it("does not trigger unrelated-tabs with 3 modules", () => {
    const snapshot = makeSnapshot({
      openTabs: [
        makeFile({ path: "src/auth/login.ts", isActive: true }),
        makeFile({ path: "src/auth/register.ts" }),
        makeFile({ path: "src/billing/invoice.ts" }),
        makeFile({ path: "src/users/profile.ts" }),
      ],
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).not.toContain("unrelated-tabs");
  });

  // ─── Tier 1: No selection on large file ───────────────────────

  it("detects no selection on large file", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "src/big-service.ts",
        lineCount: 600,
        charCount: 24000,
        isActive: true,
      }),
      selection: null,
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("no-selection-large-file");
    const pattern = result.wastePatterns!.find(
      (w) => w.ruleId === "no-selection-large-file"
    );
    expect(pattern!.severity).toBe("warning");
  });

  it("does not trigger no-selection-large-file when selection exists", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "src/big-service.ts",
        lineCount: 600,
        charCount: 24000,
        isActive: true,
      }),
      selection: {
        lineCount: 20,
        charCount: 800,
        text: "selected code",
      },
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).not.toContain("no-selection-large-file");
  });

  it("does not trigger no-selection-large-file for small files", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "src/small.ts",
        lineCount: 100,
        charCount: 4000,
        isActive: true,
      }),
      selection: null,
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).not.toContain("no-selection-large-file");
  });

  // ─── Sensitive file detection ────────────────────────────────

  it("detects SSH private key file as active file", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "id_rsa",
        languageId: "plaintext",
        lineCount: 30,
        charCount: 1600,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("sensitive-file");
    const pattern = result.wastePatterns!.find((w) => w.ruleId === "sensitive-file");
    expect(pattern!.severity).toBe("warning");
    expect(pattern!.description).toContain("secrets or private keys");
  });

  it("detects SSH public key in tabs", () => {
    const snapshot = makeSnapshot({
      openTabs: [
        makeFile({
          path: "id_ed25519.pub",
          languageId: "plaintext",
          lineCount: 1,
          charCount: 100,
        }),
      ],
    });

    const result = detectWaste(snapshot, {});
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("sensitive-file");
  });

  it("detects PEM file", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "server.pem",
        languageId: "plaintext",
        lineCount: 20,
        charCount: 1000,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("sensitive-file");
  });

  it("detects .key file", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "private.key",
        languageId: "plaintext",
        lineCount: 20,
        charCount: 1000,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("sensitive-file");
  });

  it("detects credentials.json", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "credentials.json",
        languageId: "json",
        lineCount: 50,
        charCount: 2000,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("sensitive-file");
  });

  it("detects .npmrc", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: ".npmrc",
        languageId: "plaintext",
        lineCount: 5,
        charCount: 200,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("sensitive-file");
  });

  it("detects docker-compose.yml", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "docker-compose.yml",
        languageId: "yaml",
        lineCount: 50,
        charCount: 2000,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("sensitive-file");
  });

  it("detects docker-compose.dev.yaml variant", () => {
    const snapshot = makeSnapshot({
      openTabs: [
        makeFile({
          path: "docker-compose.dev.yaml",
          languageId: "yaml",
          lineCount: 30,
          charCount: 1200,
        }),
      ],
    });

    const result = detectWaste(snapshot, {});
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("sensitive-file");
  });

  it("detects serviceAccountKey.json", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "serviceAccountKey.json",
        languageId: "json",
        lineCount: 15,
        charCount: 800,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("sensitive-file");
  });

  it("detects .p12 keystore file", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "release.p12",
        languageId: "plaintext",
        lineCount: 10,
        charCount: 3000,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("sensitive-file");
  });

  it("detects .pfx certificate file", () => {
    const snapshot = makeSnapshot({
      openTabs: [
        makeFile({
          path: "cert.pfx",
          languageId: "plaintext",
          lineCount: 5,
          charCount: 2000,
        }),
      ],
    });

    const result = detectWaste(snapshot, {});
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("sensitive-file");
  });

  it("detects .jks keystore file", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "keystore.jks",
        languageId: "plaintext",
        lineCount: 5,
        charCount: 2000,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("sensitive-file");
  });

  it("detects id_ecdsa SSH key", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "id_ecdsa",
        languageId: "plaintext",
        lineCount: 10,
        charCount: 500,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("sensitive-file");
  });

  it("detects id_dsa SSH key", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "id_dsa",
        languageId: "plaintext",
        lineCount: 20,
        charCount: 1000,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("sensitive-file");
  });

  it("detects .pypirc credential file", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: ".pypirc",
        languageId: "plaintext",
        lineCount: 5,
        charCount: 200,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("sensitive-file");
  });

  it("detects .netrc credential file", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: ".netrc",
        languageId: "plaintext",
        lineCount: 3,
        charCount: 100,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("sensitive-file");
  });

  it("detects firebase-adminsdk JSON file", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "firebase-adminsdk-abc123.json",
        languageId: "json",
        lineCount: 12,
        charCount: 800,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("sensitive-file");
  });

  it("sensitive-file suggestion has close tab action with path", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "id_rsa",
        languageId: "plaintext",
        lineCount: 30,
        charCount: 1600,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});
    const suggestion = result.suggestions!.find((s) => s.id === "close-sensitive-file");
    expect(suggestion).toBeDefined();
    expect(suggestion!.action).toBeDefined();
    expect(suggestion!.action!.command).toBe("ai-preflight.action.closeTab");
    expect(suggestion!.action!.args).toEqual({ path: "id_rsa" });
  });

  it("env-file description uses security framing", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: ".env",
        languageId: "plaintext",
        lineCount: 20,
        charCount: 500,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});
    const envPattern = result.wastePatterns!.find((w) => w.ruleId === "env-file");
    expect(envPattern).toBeDefined();
    expect(envPattern!.description).toContain("environment secrets");
    expect(envPattern!.description).toContain("will be sent to AI");
  });

  it("detects both env-file and sensitive-file simultaneously", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: ".env",
        languageId: "plaintext",
        lineCount: 20,
        charCount: 500,
        isActive: true,
      }),
      openTabs: [
        makeFile({
          path: "id_rsa",
          languageId: "plaintext",
          lineCount: 30,
          charCount: 1600,
        }),
      ],
    });

    const result = detectWaste(snapshot, {});
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("env-file");
    expect(ruleIds).toContain("sensitive-file");
  });

  it("does not trigger sensitive-file for normal source files", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "src/app.ts",
        languageId: "typescript",
        lineCount: 100,
        charCount: 4000,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});
    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).not.toContain("sensitive-file");
  });

  // ─── Tier 2: High comment ratio ─────────────────────────────

  it("detects high comment ratio (>40%)", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "src/legacy.ts",
        lineCount: 100,
        charCount: 4000,
        commentLineCount: 50, // 50% comments
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("high-comment-ratio");
    const pattern = result.wastePatterns!.find(
      (w) => w.ruleId === "high-comment-ratio"
    );
    expect(pattern!.severity).toBe("info");
  });

  it("does not trigger high-comment-ratio for small files", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "src/tiny.ts",
        lineCount: 30, // below 50-line threshold
        charCount: 1200,
        commentLineCount: 20, // 67% comments but file is too small
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).not.toContain("high-comment-ratio");
  });

  it("does not trigger high-comment-ratio for well-documented code (30%)", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "src/well-documented.ts",
        lineCount: 100,
        charCount: 4000,
        commentLineCount: 30, // 30% — normal documentation
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).not.toContain("high-comment-ratio");
  });

  // ─── Tier 2: Duplicate tabs ───────────────────────────────────

  it("detects duplicate tabs", () => {
    const snapshot = makeSnapshot({
      openTabs: [
        makeFile({ path: "src/app.ts", isActive: true }),
        makeFile({ path: "src/app.ts" }),
      ],
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("duplicate-tab");
    const pattern = result.wastePatterns!.find(
      (w) => w.ruleId === "duplicate-tab"
    );
    expect(pattern!.severity).toBe("info");
  });

  it("does not trigger duplicate-tab when all paths are unique", () => {
    const snapshot = makeSnapshot({
      openTabs: [
        makeFile({ path: "src/a.ts", isActive: true }),
        makeFile({ path: "src/b.ts" }),
      ],
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).not.toContain("duplicate-tab");
  });

  // ─── Tier 2: Git conflict markers ─────────────────────────────

  it("detects git conflict markers", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "src/merge-me.ts",
        hasConflictMarkers: true,
        lineCount: 50,
        charCount: 2000,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("git-conflict-markers");
    const pattern = result.wastePatterns!.find(
      (w) => w.ruleId === "git-conflict-markers"
    );
    expect(pattern!.severity).toBe("warning");
  });

  it("does not trigger git-conflict-markers when none present", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "src/clean.ts",
        hasConflictMarkers: false,
        lineCount: 50,
        charCount: 2000,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).not.toContain("git-conflict-markers");
  });

  // ─── Tier 2: Data files ───────────────────────────────────────

  it("detects large data files in tabs", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "src/app.ts",
        lineCount: 50,
        charCount: 2000,
        isActive: true,
      }),
      openTabs: [
        makeFile({
          path: "data/users.csv",
          languageId: "csv",
          lineCount: 10000,
          charCount: 80000,
        }),
      ],
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("data-file");
    const pattern = result.wastePatterns!.find(
      (w) => w.ruleId === "data-file"
    );
    expect(pattern!.severity).toBe("warning");
  });

  it("detects large data file as active file", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "data/export.json",
        languageId: "json",
        lineCount: 5000,
        charCount: 200000,
        isActive: true,
      }),
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("data-file");
  });

  it("detects large data file in inactive tab via lineCount fallback", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "src/app.ts",
        lineCount: 50,
        charCount: 2000,
        isActive: true,
      }),
      openTabs: [
        makeFile({
          path: "data/large.csv",
          languageId: "csv",
          lineCount: 1500, // above 1000-line fallback threshold
          charCount: 40000, // below 50k charCount threshold — lineCount fallback catches it
        }),
      ],
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("data-file");
  });

  it("does not trigger data-file for medium JSON configs via lineCount", () => {
    const snapshot = makeSnapshot({
      openTabs: [
        makeFile({
          path: "eslint.config.json",
          languageId: "json",
          lineCount: 500, // below 1000-line fallback
          charCount: 20000, // below 50k charCount
        }),
      ],
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).not.toContain("data-file");
  });

  it("does not trigger data-file for small JSON files", () => {
    const snapshot = makeSnapshot({
      openTabs: [
        makeFile({
          path: "tsconfig.json",
          languageId: "json",
          lineCount: 30,
          charCount: 1000,
        }),
      ],
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).not.toContain("data-file");
  });

  // ─── Tier 2: Language mismatch ────────────────────────────────

  it("detects language mismatch in tabs", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "src/app.ts",
        languageId: "typescript",
        lineCount: 50,
        charCount: 2000,
        isActive: true,
      }),
      openTabs: [
        makeFile({ path: "src/app.ts", languageId: "typescript", isActive: true }),
        makeFile({ path: "script.py", languageId: "python" }),
        makeFile({ path: "main.go", languageId: "go" }),
        makeFile({ path: "lib.rs", languageId: "rust" }),
      ],
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).toContain("language-mismatch");
    const pattern = result.wastePatterns!.find(
      (w) => w.ruleId === "language-mismatch"
    );
    expect(pattern!.severity).toBe("info");
  });

  it("does not trigger language-mismatch with fewer than 3 mismatched tabs", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "src/app.ts",
        languageId: "typescript",
        lineCount: 50,
        charCount: 2000,
        isActive: true,
      }),
      openTabs: [
        makeFile({ path: "src/app.ts", languageId: "typescript", isActive: true }),
        makeFile({ path: "script.py", languageId: "python" }),
        makeFile({ path: "other.ts", languageId: "typescript" }),
      ],
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).not.toContain("language-mismatch");
  });

  it("does not trigger language-mismatch when all tabs share language", () => {
    const snapshot = makeSnapshot({
      activeFile: makeFile({
        path: "src/app.ts",
        languageId: "typescript",
        lineCount: 50,
        charCount: 2000,
        isActive: true,
      }),
      openTabs: [
        makeFile({ path: "src/app.ts", languageId: "typescript", isActive: true }),
        makeFile({ path: "src/b.ts", languageId: "typescript" }),
        makeFile({ path: "src/c.ts", languageId: "typescript" }),
        makeFile({ path: "src/d.ts", languageId: "typescript" }),
      ],
    });

    const result = detectWaste(snapshot, {});

    const ruleIds = result.wastePatterns!.map((w) => w.ruleId);
    expect(ruleIds).not.toContain("language-mismatch");
  });

});
