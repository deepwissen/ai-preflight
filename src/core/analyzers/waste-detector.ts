import type {
  AnalysisResult,
  ContextSnapshot,
  WastePattern,
  Suggestion,
} from "../types.js";

const DEFAULT_MAX_FILE_LINES = 1000;
const DEFAULT_MAX_FILE_CHARS = 40_000; // ~10k tokens — catches minified/single-line files
const DEFAULT_MAX_SELECTION_LINES = 500;
const DEFAULT_MAX_OPEN_TABS = 10;
const DEFAULT_MIN_LINES_FOR_SELECTION_HINT = 500;
const DEFAULT_MIN_MODULES_FOR_UNRELATED = 4;
const DEFAULT_DATA_FILE_MIN_CHARS = 50_000;
const DEFAULT_MIN_LANG_MISMATCH_TABS = 3;
const DEFAULT_MIN_LINES_FOR_COMMENT_CHECK = 50;
const DEFAULT_MAX_COMMENT_RATIO = 0.4;

const GENERATED_FILE_PATTERNS = /\.(map|min\.js|min\.css|bundle\.\w+|chunk\.\w+)$|(^|\/)(?:dist|build|node_modules)\//;
const LOCK_FILE_PATTERNS = /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Gemfile\.lock|Cargo\.lock|poetry\.lock|composer\.lock)$/;
const ENV_FILE_PATTERNS = /^\.env(\.local|\.development|\.production|\.staging|\.test)?$/;
const TEST_FILE_PATTERNS = /\.(test|spec)\.(ts|tsx|js|jsx)$|__tests__\//;
const DATA_FILE_PATTERNS = /\.(csv|tsv|json|xml|yaml|yml|sql)$/;

/**
 * Detects common patterns that waste tokens or degrade AI responses.
 * Rule-based — no ML. Each rule is transparent and configurable.
 */
export function detectWaste(
  context: ContextSnapshot,
  partial: Partial<AnalysisResult>
): Partial<AnalysisResult> {
  const wastePatterns: WastePattern[] = [];
  const suggestions: Suggestion[] = [];
  let priority = (partial.suggestions?.length ?? 0) + 1;

  // Rule: Generated/non-code file
  if (
    context.activeFile &&
    GENERATED_FILE_PATTERNS.test(context.activeFile.path)
  ) {
    wastePatterns.push({
      ruleId: "generated-file",
      source: context.activeFile.path,
      description: `${context.activeFile.path} is a generated file`,
      severity: "warning",
      suggestion: "Open the source file instead of generated output",
    });
    suggestions.push({
      id: "avoid-generated",
      text: `${context.activeFile.path} is generated — open the source file instead`,
      priority: priority++,
      dismissed: false,
    });
  }

  // Rule: Large active file (by line count OR char count)
  if (
    context.activeFile &&
    (context.activeFile.lineCount > DEFAULT_MAX_FILE_LINES ||
      context.activeFile.charCount > DEFAULT_MAX_FILE_CHARS)
  ) {
    wastePatterns.push({
      ruleId: "large-file",
      source: context.activeFile.path,
      description: context.activeFile.lineCount > DEFAULT_MAX_FILE_LINES
        ? `File is ${context.activeFile.lineCount} lines`
        : `File is ${Math.round(context.activeFile.charCount / 1000)}k characters`,
      severity: "warning",
      suggestion: "Select the specific function instead of the whole file",
    });
    suggestions.push({
      id: "narrow-file",
      text: `${context.activeFile.path} is too large — select the relevant function instead`,
      priority: priority++,
      dismissed: false,
      action: {
        command: "ai-preflight.action.selectFunction",
        label: "Select",
      },
    });
  }

  // Rule: Lock file open (active or in tabs)
  const lockFileInTabs = context.openTabs.find(
    (t) => LOCK_FILE_PATTERNS.test(fileName(t.path))
  );
  const lockFile =
    (context.activeFile && LOCK_FILE_PATTERNS.test(fileName(context.activeFile.path)))
      ? context.activeFile.path
      : lockFileInTabs?.path;
  if (lockFile) {
    wastePatterns.push({
      ruleId: "lock-file",
      source: lockFile,
      description: `${fileName(lockFile)} is a lock file`,
      severity: "warning",
      suggestion: "Lock files are auto-generated — close this tab",
    });
    suggestions.push({
      id: "close-lock-file",
      text: `${fileName(lockFile)} adds thousands of lines of noise — close it`,
      priority: priority++,
      dismissed: false,
      action: {
        command: "ai-preflight.action.closeTab",
        args: { path: lockFile },
        label: "Close",
      },
    });
  }

  // Rule: Env file open (privacy risk)
  const envFileInTabs = context.openTabs.find(
    (t) => ENV_FILE_PATTERNS.test(fileName(t.path))
  );
  const envFile =
    (context.activeFile && ENV_FILE_PATTERNS.test(fileName(context.activeFile.path)))
      ? context.activeFile.path
      : envFileInTabs?.path;
  if (envFile) {
    wastePatterns.push({
      ruleId: "env-file",
      source: envFile,
      description: `${fileName(envFile)} may contain secrets`,
      severity: "warning",
      suggestion: "Close .env files before prompting — secrets may leak to AI",
    });
    suggestions.push({
      id: "close-env-file",
      text: `${fileName(envFile)} may contain API keys or secrets — close it before prompting`,
      priority: priority++,
      dismissed: false,
      action: {
        command: "ai-preflight.action.closeTab",
        args: { path: envFile },
        label: "Close",
      },
    });
  }

  // Rule: Large selection
  if (
    context.selection &&
    context.selection.lineCount > DEFAULT_MAX_SELECTION_LINES
  ) {
    wastePatterns.push({
      ruleId: "large-selection",
      source: "selection",
      description: `Selection is ${context.selection.lineCount} lines`,
      severity: "info",
      suggestion: "Narrow your selection to the relevant code block",
    });
    suggestions.push({
      id: "narrow-selection",
      text: `Selection is ${context.selection.lineCount} lines — consider narrowing to the relevant block`,
      priority: priority++,
      dismissed: false,
    });
  }

  // Rule: Too many open tabs
  if (context.openTabs.length > DEFAULT_MAX_OPEN_TABS) {
    wastePatterns.push({
      ruleId: "many-tabs",
      source: "tabs",
      description: `${context.openTabs.length} tabs open`,
      severity: "info",
      suggestion: "Close irrelevant tabs to reduce potential context noise",
    });
    suggestions.push({
      id: "close-tabs",
      text: `${context.openTabs.length} tabs open — close irrelevant ones to reduce context noise`,
      priority: priority++,
      dismissed: false,
      action: {
        command: "ai-preflight.action.closeTabs",
        label: "Close",
      },
    });
  }

  // Rule: AI instruction files missing
  if (context.aiInstructionFiles.length === 0) {
    wastePatterns.push({
      ruleId: "ai-instructions-missing",
      source: "workspace",
      description: "No AI instruction files found in workspace",
      severity: "info",
      suggestion: "Add AI instruction files for a quality boost",
    });
    suggestions.push({
      id: "add-ai-instructions",
      text: "Add AI instruction files (.cursorrules, CLAUDE.md, etc.) for a quality boost",
      priority: priority++,
      dismissed: false,
    });
  }

  // Rule: Unsaved file
  if (context.activeFile && context.activeFile.isDirty) {
    wastePatterns.push({
      ruleId: "unsaved-file",
      source: context.activeFile.path,
      description: `${context.activeFile.path} has unsaved changes`,
      severity: "warning",
      suggestion: "Save before prompting — AI may see stale version",
    });
    suggestions.push({
      id: "save-file",
      text: `${context.activeFile.path} has unsaved changes — save before prompting`,
      priority: priority++,
      dismissed: false,
      action: {
        command: "ai-preflight.action.saveFile",
        label: "Save",
      },
    });
  }

  // Rule: Test + production files mixed
  // Only trigger when many test files are open alongside prod — don't punish TDD (1-2 test files)
  const testTabs = context.openTabs.filter((t) =>
    TEST_FILE_PATTERNS.test(t.path)
  );
  const prodTabs = context.openTabs.filter(
    (t) => !TEST_FILE_PATTERNS.test(t.path)
  );
  if (
    testTabs.length >= 3 &&
    prodTabs.length > 0 &&
    context.openTabs.length >= 5
  ) {
    wastePatterns.push({
      ruleId: "test-prod-mixed",
      source: "tabs",
      description: "Test and production files open together",
      severity: "info",
      suggestion: "Close test files when working on implementation",
    });
    suggestions.push({
      id: "separate-test-prod",
      text: "Test and production files are mixed — close test files when working on implementation",
      priority: priority++,
      dismissed: false,
      action: {
        command: "ai-preflight.action.closeTestFiles",
        label: "Close",
      },
    });
  }

  // Rule: Unrelated tabs (4+ distinct modules)
  if (context.openTabs.length >= DEFAULT_MIN_MODULES_FOR_UNRELATED) {
    const modules = new Set(
      context.openTabs.map((t) => {
        const parts = t.path.split("/");
        if (parts.length >= 3) {
          return `${parts[0]}/${parts[1]}`;
        }
        return parts.length >= 2 ? parts[0] : ".";
      })
    );
    if (modules.size >= DEFAULT_MIN_MODULES_FOR_UNRELATED) {
      wastePatterns.push({
        ruleId: "unrelated-tabs",
        source: "tabs",
        description: `Tabs span ${modules.size} distinct modules`,
        severity: "info",
        suggestion: "Focus on one module — close unrelated tabs",
      });
      suggestions.push({
        id: "focus-module",
        text: `Open tabs span ${modules.size} modules — focus on one module and close unrelated tabs`,
        priority: priority++,
        dismissed: false,
        action: {
          command: "ai-preflight.action.focusModule",
          label: "Focus",
        },
      });
    }
  }

  // Rule: No selection on large file
  if (
    context.activeFile &&
    context.activeFile.lineCount >= DEFAULT_MIN_LINES_FOR_SELECTION_HINT &&
    context.selection === null
  ) {
    wastePatterns.push({
      ruleId: "no-selection-large-file",
      source: context.activeFile.path,
      description: `${context.activeFile.path} is ${context.activeFile.lineCount} lines with no selection`,
      severity: "warning",
      suggestion: "Select the relevant function before prompting",
    });
    suggestions.push({
      id: "select-function",
      text: `${context.activeFile.path} is ${context.activeFile.lineCount} lines — select the relevant function before prompting`,
      priority: priority++,
      dismissed: false,
      action: {
        command: "ai-preflight.action.selectFunction",
        label: "Select",
      },
    });
  }

  // Rule: High comment ratio (may indicate commented-out code or excessive boilerplate)
  if (
    context.activeFile &&
    context.activeFile.lineCount > DEFAULT_MIN_LINES_FOR_COMMENT_CHECK &&
    context.activeFile.commentLineCount / context.activeFile.lineCount >
      DEFAULT_MAX_COMMENT_RATIO
  ) {
    const pct = Math.round(
      (context.activeFile.commentLineCount / context.activeFile.lineCount) * 100
    );
    wastePatterns.push({
      ruleId: "high-comment-ratio",
      source: context.activeFile.path,
      description: `${pct}% of ${context.activeFile.path} is comments`,
      severity: "info",
      suggestion: "High comment ratio adds token overhead — consider trimming commented-out code",
    });
    suggestions.push({
      id: "trim-comments",
      text: `${pct}% of ${context.activeFile.path} is comments — trim commented-out code if present`,
      priority: priority++,
      dismissed: false,
    });
  }

  // Rule: Duplicate tabs
  const pathCounts = new Map<string, number>();
  for (const tab of context.openTabs) {
    pathCounts.set(tab.path, (pathCounts.get(tab.path) ?? 0) + 1);
  }
  const duplicatePath = [...pathCounts.entries()].find(
    ([, count]) => count >= 2
  );
  if (duplicatePath) {
    wastePatterns.push({
      ruleId: "duplicate-tab",
      source: duplicatePath[0],
      description: `${fileName(duplicatePath[0])} is open in ${duplicatePath[1]} editor groups`,
      severity: "info",
      suggestion: "Close duplicate tabs — they double context",
    });
    suggestions.push({
      id: "close-duplicate",
      text: `${fileName(duplicatePath[0])} is open in ${duplicatePath[1]} groups — close duplicates to reduce context`,
      priority: priority++,
      dismissed: false,
      action: {
        command: "ai-preflight.action.closeDuplicates",
        label: "Close",
      },
    });
  }

  // Rule: Git conflict markers
  if (context.activeFile && context.activeFile.hasConflictMarkers) {
    wastePatterns.push({
      ruleId: "git-conflict-markers",
      source: context.activeFile.path,
      description: `${context.activeFile.path} contains merge conflict markers`,
      severity: "warning",
      suggestion: "Resolve merge conflicts before asking AI",
    });
    suggestions.push({
      id: "resolve-conflicts",
      text: `${context.activeFile.path} has merge conflict markers — resolve them before asking AI`,
      priority: priority++,
      dismissed: false,
    });
  }

  // Rule: Binary/data files open
  // Use charCount OR lineCount fallback (inactive tabs estimate charCount as lineCount*40,
  // which underestimates data files with long lines like CSV)
  const DATA_FILE_MIN_LINES = 1000;
  const isLargeDataFile = (t: { path: string; charCount: number; lineCount: number }) =>
    DATA_FILE_PATTERNS.test(fileName(t.path)) &&
    (t.charCount > DEFAULT_DATA_FILE_MIN_CHARS || t.lineCount > DATA_FILE_MIN_LINES);

  const dataFileInTabs = context.openTabs.find((t) => !t.isActive && isLargeDataFile(t));
  const dataFile =
    context.activeFile && isLargeDataFile(context.activeFile)
      ? context.activeFile.path
      : dataFileInTabs?.path;
  if (dataFile) {
    const dataCharCount =
      dataFile === context.activeFile?.path
        ? context.activeFile.charCount
        : dataFileInTabs!.charCount;
    wastePatterns.push({
      ruleId: "data-file",
      source: dataFile,
      description: `${fileName(dataFile)} is ${Math.round(dataCharCount / 1000)}k characters`,
      severity: "warning",
      suggestion: "Data files burn tokens — close them",
    });
    suggestions.push({
      id: "close-data-file",
      text: `${fileName(dataFile)} is a large data file (${Math.round(dataCharCount / 1000)}k chars) — close it to save tokens`,
      priority: priority++,
      dismissed: false,
      action: {
        command: "ai-preflight.action.closeTab",
        args: { path: dataFile },
        label: "Close",
      },
    });
  }

  // Rule: Language mismatch
  if (context.activeFile && context.activeFile.languageId) {
    const mismatchTabs = context.openTabs.filter(
      (t) =>
        !t.isActive &&
        t.languageId &&
        t.languageId !== context.activeFile!.languageId
    );
    if (mismatchTabs.length >= DEFAULT_MIN_LANG_MISMATCH_TABS) {
      wastePatterns.push({
        ruleId: "language-mismatch",
        source: "tabs",
        description: `${mismatchTabs.length} tabs in different languages than ${context.activeFile.languageId}`,
        severity: "info",
        suggestion: "Close tabs with unrelated languages",
      });
      suggestions.push({
        id: "close-mismatched-langs",
        text: `${mismatchTabs.length} open tabs use different languages — close tabs with unrelated languages`,
        priority: priority++,
        dismissed: false,
        action: {
          command: "ai-preflight.action.closeMismatchedLangs",
          label: "Close",
        },
      });
    }
  }

  return { wastePatterns, suggestions };
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}
