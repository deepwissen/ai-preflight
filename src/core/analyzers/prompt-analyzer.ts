import type { ContextSnapshot, AnalysisResult, PromptAnalysis, TaskType } from "../types.js";

/**
 * Analyzes a user's prompt text against their current IDE context.
 * Pure function — no VS Code imports. Used only by the @preflight chat participant.
 *
 * Design principle: precision over recall.
 * Only surface findings backed by high-confidence signals (explicit file refs,
 * path refs, module patterns). Generic words never drive warnings.
 */
export function analyzePrompt(
  promptText: string,
  context: ContextSnapshot,
  _result: AnalysisResult
): PromptAnalysis {
  const trimmed = promptText.trim();

  if (!trimmed) {
    return emptyAnalysis();
  }

  const taskType = classifyTaskType(trimmed);
  const { high: highConfidence, all: allKeywords } = extractIntentKeywords(trimmed);
  const matchingFiles = findMatchingFiles(allKeywords, context);
  const matchingSet = new Set(matchingFiles);
  const missingFiles = findMissingFiles(trimmed, context);
  const lowRelevanceFiles = findLowRelevanceFiles(highConfidence, context, matchingSet);
  const scopeHint = detectScopeHint(trimmed);
  const tokenSplit = computeTokenSplit(matchingFiles, lowRelevanceFiles, context);

  return {
    taskType,
    intentKeywords: allKeywords,
    matchingFiles,
    missingFiles,
    unnecessaryFiles: lowRelevanceFiles,
    scopeHint,
    relevantTokenEstimate: tokenSplit.relevant,
    wastedTokenEstimate: tokenSplit.wasted,
  };
}

function emptyAnalysis(): PromptAnalysis {
  return {
    taskType: null,
    intentKeywords: [],
    matchingFiles: [],
    missingFiles: [],
    unnecessaryFiles: [],
    scopeHint: null,
    relevantTokenEstimate: { low: 0, high: 0 },
    wastedTokenEstimate: { low: 0, high: 0 },
  };
}

// ─── Task Classification ─────────────────────────────────────────

const TASK_PATTERNS: Array<{ type: TaskType; keywords: RegExp }> = [
  { type: "testing", keywords: /\b(test|spec|assert|expect|mock|stub|coverage)\b/i },
  {
    type: "debugging",
    keywords: /\b(fix|bug|error|fail|broken|crash|issue|debug|trace|root cause)\b/i,
  },
  {
    type: "refactoring",
    keywords: /\b(refactor|rename|extract|move|clean|simplify|restructure)\b/i,
  },
  {
    type: "architecture",
    keywords: /\b(architect|design|pattern|system|scale|structure|approach)\b/i,
  },
  {
    type: "explanation",
    keywords: /\b(explain|what does|how does|why does|understand|describe)\b/i,
  },
  { type: "coding", keywords: /\b(implement|create|add|build|write|generate|make)\b/i },
];

function classifyTaskType(promptText: string): TaskType | null {
  for (const pattern of TASK_PATTERNS) {
    if (pattern.keywords.test(promptText)) {
      return pattern.type;
    }
  }
  return null;
}

// ─── Intent Keyword Extraction ───────────────────────────────────
//
// Keywords are split into two tiers:
//   high-confidence: explicit file refs, path refs, module patterns
//   low-confidence:  remaining significant words
//
// Only high-confidence keywords drive missing-context and low-relevance warnings.
// All keywords are used for matching (finding relevant files).

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "shall",
  "can",
  "need",
  "must",
  "i",
  "me",
  "my",
  "we",
  "our",
  "you",
  "your",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "as",
  "into",
  "about",
  "between",
  "through",
  "after",
  "before",
  "above",
  "below",
  "up",
  "down",
  "and",
  "but",
  "or",
  "not",
  "no",
  "so",
  "if",
  "then",
  "than",
  "too",
  "very",
  "just",
  "also",
  "how",
  "what",
  "when",
  "where",
  "why",
  "all",
  "each",
  "every",
  "both",
  "few",
  "more",
  "most",
  "some",
  "any",
  "other",
  "new",
  "old",
  "like",
  "use",
  "file",
  "files",
  "code",
  "please",
  "help",
  "want",
  "using",
  "function",
  "method",
  "class",
  "type",
  "interface",
  "variable",
  "change",
  "changes",
  "changed",
  "work",
  "works",
  "working",
  "first",
  "second",
  "last",
  "next",
  "current",
  "same",
]);

const ACTION_WORDS = new Set([
  "refactor",
  "fix",
  "add",
  "create",
  "build",
  "write",
  "implement",
  "generate",
  "explain",
  "debug",
  "test",
  "update",
  "move",
  "rename",
  "extract",
  "clean",
  "simplify",
  "restructure",
  "describe",
  "make",
]);

const FILE_REFERENCE_RE =
  /\b([a-zA-Z][\w.-]*\.(?:ts|tsx|js|jsx|py|go|rs|java|rb|css|html|json|yaml|yml|md))\b/gi;
const PATH_REFERENCE_RE = /\b((?:src|lib|test|app|pkg|packages|modules)\/[\w/.-]+)\b/gi;
const MODULE_NAME_RE =
  /\b(?:the\s+)?(\w+)\s+(?:module|service|component|controller|handler|middleware|util|helper|model|view|store|hook|context|provider|factory|manager|router|api)\b/gi;

export function extractIntentKeywords(promptText: string): { high: string[]; all: string[] } {
  const highConfidence = new Set<string>();
  const allKeywords = new Set<string>();
  const lowerPrompt = promptText.toLowerCase();

  // High-confidence: explicit file references ("auth.ts" → "auth")
  let match: RegExpExecArray | null;
  const fileRe = new RegExp(FILE_REFERENCE_RE.source, FILE_REFERENCE_RE.flags);
  while ((match = fileRe.exec(promptText)) !== null) {
    const baseName = match[1].replace(/\.\w+$/, "").toLowerCase();
    highConfidence.add(baseName);
    allKeywords.add(baseName);
  }

  // High-confidence: path references ("src/auth/login" → "auth", "login")
  const pathRe = new RegExp(PATH_REFERENCE_RE.source, PATH_REFERENCE_RE.flags);
  while ((match = pathRe.exec(promptText)) !== null) {
    const segments = match[1].toLowerCase().split("/");
    for (const seg of segments) {
      if (seg.length > 2 && !STOP_WORDS.has(seg) && !ACTION_WORDS.has(seg)) {
        highConfidence.add(seg);
        allKeywords.add(seg);
      }
    }
  }

  // High-confidence: module name patterns ("the auth module" → "auth")
  const moduleRe = new RegExp(MODULE_NAME_RE.source, MODULE_NAME_RE.flags);
  while ((match = moduleRe.exec(promptText)) !== null) {
    const name = match[1].toLowerCase();
    if (!STOP_WORDS.has(name) && !ACTION_WORDS.has(name)) {
      highConfidence.add(name);
      allKeywords.add(name);
    }
  }

  // Low-confidence: remaining significant words (used for matching only, not warnings)
  const words = lowerPrompt
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w) && !ACTION_WORDS.has(w));

  for (const word of words) {
    allKeywords.add(word);
  }

  return { high: [...highConfidence], all: [...allKeywords] };
}

// ─── Context-Intent Matching ─────────────────────────────────────

function findMatchingFiles(intentKeywords: string[], context: ContextSnapshot): string[] {
  if (intentKeywords.length === 0) return [];

  const allFiles = [
    ...(context.activeFile ? [context.activeFile] : []),
    ...context.openTabs.filter((t) => !t.isActive),
  ];

  return allFiles
    .filter((file) => {
      const lowerPath = file.path.toLowerCase();
      return intentKeywords.some((kw) => lowerPath.includes(kw));
    })
    .map((f) => f.path);
}

// ─── Missing Context Detection ───────────────────────────────────
//
// Only high-confidence signals:
// 1. Files explicitly named in prompt ("fix auth.ts") but not open
// 2. Imports in selection text not in open tabs

const IMPORT_PATTERNS = [
  /(?:import\s+(?:[\s\S]*?)\s+from\s+['"])(\.\.?\/[^'"]+)['"]/g,
  /require\s*\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g,
];

function findMissingFiles(promptText: string, context: ContextSnapshot): string[] {
  const missing: string[] = [];

  // Build set of open file basenames
  const openBasenames = new Set<string>();
  for (const tab of context.openTabs) {
    const base = tab.path
      .split("/")
      .pop()
      ?.replace(/\.\w+$/, "")
      .toLowerCase();
    if (base) openBasenames.add(base);
  }
  if (context.activeFile) {
    const base = context.activeFile.path
      .split("/")
      .pop()
      ?.replace(/\.\w+$/, "")
      .toLowerCase();
    if (base) openBasenames.add(base);
  }

  // 1. Files explicitly mentioned in prompt but not open
  const fileRe = /\b([a-zA-Z][\w.-]*\.(?:ts|tsx|js|jsx|py|go|rs|java|rb))\b/gi;
  let match: RegExpExecArray | null;
  while ((match = fileRe.exec(promptText)) !== null) {
    const baseName = match[1].replace(/\.\w+$/, "").toLowerCase();
    if (!openBasenames.has(baseName)) {
      missing.push(match[1]);
    }
  }

  // 2. Imports from selection not in open tabs (reuses F8 logic)
  if (context.selection?.text) {
    for (const pattern of IMPORT_PATTERNS) {
      const re = new RegExp(pattern.source, pattern.flags);
      while ((match = re.exec(context.selection.text)) !== null) {
        const importPath = match[1];
        const baseName =
          importPath
            .split("/")
            .pop()
            ?.replace(/\.\w+$/, "") ?? "";
        if (baseName && !openBasenames.has(baseName)) {
          missing.push(importPath);
        }
      }
    }
  }

  // No step 3: we no longer generate "keyword (no related files open)" from generic words.
  // That was the #1 noise source. Only explicit file references and imports are flagged.

  return [...new Set(missing)];
}

// ─── Low Relevance Detection ─────────────────────────────────────
//
// Only flags tabs as low-relevance when high-confidence keywords exist.
// Generic words alone never trigger this — prevents false positives.

function findLowRelevanceFiles(
  highConfidenceKeywords: string[],
  context: ContextSnapshot,
  matchingFiles: Set<string>
): string[] {
  // No high-confidence keywords → we can't judge relevance → don't flag anything
  if (highConfidenceKeywords.length === 0) return [];

  const lowRelevance: string[] = [];

  for (const tab of context.openTabs) {
    if (tab.isActive) continue;
    if (matchingFiles.has(tab.path)) continue;

    const lowerPath = tab.path.toLowerCase();
    // Check against ALL keywords (including low-confidence) for matching
    // But this function is only called when high-confidence keywords exist
    const matchesAnyHighKeyword = highConfidenceKeywords.some((kw) => lowerPath.includes(kw));
    if (matchesAnyHighKeyword) continue;

    lowRelevance.push(tab.path);
  }

  return lowRelevance;
}

// ─── Scope Hint Detection ────────────────────────────────────────
//
// Raised threshold: 3+ task types always warns, 2 types only warns
// when combined with broad-scope language. Single task type = no warning.

function detectScopeHint(promptText: string): string | null {
  // Count distinct task types
  const taskMatches = new Set<string>();
  for (const pattern of TASK_PATTERNS) {
    const re = new RegExp(pattern.keywords.source, pattern.keywords.flags);
    if (re.test(promptText)) {
      taskMatches.add(pattern.type);
    }
  }

  if (taskMatches.size >= 3) {
    return `Prompt spans ${taskMatches.size} task types (${[...taskMatches].join(", ")}) — consider breaking into separate prompts`;
  }

  // 2 task types only warn with broad-scope language
  const broadIndicators = /\b(whole|entire|all|every|across|everything|migrate|overhaul)\b/i;
  if (taskMatches.size >= 2 && broadIndicators.test(promptText)) {
    return `Broad scope with multiple objectives — consider one task per prompt`;
  }

  // Very brief prompts (< 3 meaningful words)
  const meaningfulWords = promptText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  if (meaningfulWords.length < 3) {
    return "Prompt is very brief — adding more context helps AI understand intent";
  }

  // Conjunction-heavy (3+ "and")
  const andCount = (promptText.match(/\band\b/gi) ?? []).length;
  if (andCount >= 3) {
    return "Prompt has multiple objectives — consider one task per prompt";
  }

  return null;
}

// ─── Token Split ─────────────────────────────────────────────────

function computeTokenSplit(
  matchingFiles: string[],
  lowRelevanceFiles: string[],
  context: ContextSnapshot
): { relevant: { low: number; high: number }; wasted: { low: number; high: number } } {
  const fileMap = new Map<string, { charCount: number; isActive: boolean }>();
  if (context.activeFile) {
    fileMap.set(context.activeFile.path, {
      charCount: context.activeFile.charCount,
      isActive: true,
    });
  }
  for (const tab of context.openTabs) {
    if (!tab.isActive) {
      fileMap.set(tab.path, { charCount: tab.charCount, isActive: false });
    }
  }

  let relevantLow = 0,
    relevantHigh = 0;
  for (const path of matchingFiles) {
    const file = fileMap.get(path);
    if (file) {
      const chars = file.isActive ? file.charCount : Math.round(file.charCount * 0.3);
      relevantLow += Math.round(chars / 5);
      relevantHigh += Math.round(chars / 3);
    }
  }

  let wastedLow = 0,
    wastedHigh = 0;
  for (const path of lowRelevanceFiles) {
    const file = fileMap.get(path);
    if (file) {
      const chars = file.isActive ? file.charCount : Math.round(file.charCount * 0.3);
      wastedLow += Math.round(chars / 5);
      wastedHigh += Math.round(chars / 3);
    }
  }

  return {
    relevant: { low: relevantLow, high: relevantHigh },
    wasted: { low: wastedLow, high: wastedHigh },
  };
}
