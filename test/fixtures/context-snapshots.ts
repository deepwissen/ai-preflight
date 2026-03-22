import type { ContextSnapshot } from "../../src/core/types.js";

/**
 * Reusable test fixtures for common context scenarios.
 * Use these in tests and for demo/debugging purposes.
 */

/** Clean, small context — should produce LOW risk. */
export const CLEAN_SMALL: ContextSnapshot = {
  timestamp: 1710000000000,
  activeFile: {
    path: "src/utils/helpers.ts",
    languageId: "typescript",
    lineCount: 45,
    charCount: 1800,
    isActive: true,
    isDirty: false,
    commentLineCount: 0,
    hasConflictMarkers: false,
  },
  selection: null,
  openTabs: [
    { path: "src/utils/helpers.ts", languageId: "typescript", lineCount: 45, charCount: 1800, isActive: true, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
    { path: "src/index.ts", languageId: "typescript", lineCount: 30, charCount: 1200, isActive: false, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
  ],
  referencedFiles: [],
  terminalContent: null,
  clipboardSize: null,
  chatHistoryLength: 0,
  aiInstructionFiles: [{ path: ".cursorrules", lineCount: 20, toolId: "cursor" as const }],
  toolProfile: null,
  ignoreFiles: [],
};

/** Medium-sized context with a selection — should produce MEDIUM risk. */
export const MEDIUM_WITH_SELECTION: ContextSnapshot = {
  timestamp: 1710000000000,
  activeFile: {
    path: "src/services/auth-service.ts",
    languageId: "typescript",
    lineCount: 350,
    charCount: 14000,
    isActive: true,
    isDirty: false,
    commentLineCount: 0,
    hasConflictMarkers: false,
  },
  selection: {
    lineCount: 80,
    charCount: 3200,
    text: "export class AuthService {\n  // ... 80 lines of auth logic\n}",
  },
  openTabs: [
    { path: "src/services/auth-service.ts", languageId: "typescript", lineCount: 350, charCount: 14000, isActive: true, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
    { path: "test/auth-service.test.ts", languageId: "typescript", lineCount: 200, charCount: 8000, isActive: false, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
    { path: "src/types/auth.ts", languageId: "typescript", lineCount: 60, charCount: 2400, isActive: false, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
  ],
  referencedFiles: [
    { path: "test/auth-service.test.ts", languageId: "typescript", lineCount: 200, charCount: 8000, isActive: false, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
  ],
  terminalContent: null,
  clipboardSize: null,
  chatHistoryLength: 2,
  aiInstructionFiles: [{ path: ".cursorrules", lineCount: 20, toolId: "cursor" as const }],
  toolProfile: null,
  ignoreFiles: [],
};

/** Large, noisy context — should produce HIGH risk with multiple waste patterns. */
export const NOISY_LARGE: ContextSnapshot = {
  timestamp: 1710000000000,
  activeFile: {
    path: "src/services/scenario-store.ts",
    languageId: "typescript",
    lineCount: 1500,
    charCount: 60000,
    isActive: true,
    isDirty: false,
    commentLineCount: 0,
    hasConflictMarkers: false,
  },
  selection: null,
  openTabs: Array.from({ length: 14 }, (_, i) => ({
    path: `src/file-${i}.ts`,
    languageId: "typescript",
    lineCount: 200,
    charCount: 8000,
    isActive: i === 0,
    isDirty: false,
    commentLineCount: 0,
    hasConflictMarkers: false,
  })),
  referencedFiles: [
    { path: "test/scenario-store.test.ts", languageId: "typescript", lineCount: 400, charCount: 16000, isActive: false, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
  ],
  terminalContent: {
    source: "terminal" as const,
    lineCount: 450,
    charCount: 18000,
    preview: "FAIL src/services/scenario-store.test.ts\n  ● ScenarioStore › should save\n    Error: Expected...",
  },
  clipboardSize: null,
  chatHistoryLength: 3,
  aiInstructionFiles: [{ path: ".cursorrules", lineCount: 20, toolId: "cursor" as const }],
  toolProfile: null,
  ignoreFiles: [],
};

/** Large selection inside a huge file — tests selection override. */
export const LARGE_SELECTION: ContextSnapshot = {
  timestamp: 1710000000000,
  activeFile: {
    path: "src/legacy/monolith.ts",
    languageId: "typescript",
    lineCount: 3000,
    charCount: 120000,
    isActive: true,
    isDirty: false,
    commentLineCount: 0,
    hasConflictMarkers: false,
  },
  selection: {
    lineCount: 600,
    charCount: 24000,
    text: "// 600 lines of selected code",
  },
  openTabs: [
    { path: "src/legacy/monolith.ts", languageId: "typescript", lineCount: 3000, charCount: 120000, isActive: true, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
  ],
  referencedFiles: [],
  terminalContent: null,
  clipboardSize: null,
  chatHistoryLength: 0,
  aiInstructionFiles: [{ path: ".cursorrules", lineCount: 20, toolId: "cursor" as const }],
  toolProfile: null,
  ignoreFiles: [],
};

/** Empty context — no file open. */
export const EMPTY: ContextSnapshot = {
  timestamp: 1710000000000,
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
};

/** Mixed test and production files — triggers test-prod-mixed rule. */
export const MIXED_TEST_PROD: ContextSnapshot = {
  timestamp: 1710000000000,
  activeFile: {
    path: "src/services/user-service.ts",
    languageId: "typescript",
    lineCount: 200,
    charCount: 8000,
    isActive: true,
    isDirty: false,
    commentLineCount: 0,
    hasConflictMarkers: false,
  },
  selection: null,
  openTabs: [
    { path: "src/services/user-service.ts", languageId: "typescript", lineCount: 200, charCount: 8000, isActive: true, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
    { path: "src/models/user.ts", languageId: "typescript", lineCount: 80, charCount: 3200, isActive: false, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
    { path: "test/user-service.test.ts", languageId: "typescript", lineCount: 150, charCount: 6000, isActive: false, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
    { path: "test/user-model.test.ts", languageId: "typescript", lineCount: 100, charCount: 4000, isActive: false, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
    { path: "test/integration.test.ts", languageId: "typescript", lineCount: 120, charCount: 4800, isActive: false, isDirty: false, commentLineCount: 0, hasConflictMarkers: false },
  ],
  referencedFiles: [],
  terminalContent: null,
  clipboardSize: null,
  chatHistoryLength: 0,
  aiInstructionFiles: [{ path: ".cursorrules", lineCount: 20, toolId: "cursor" as const }],
  toolProfile: null,
  ignoreFiles: [],
};
