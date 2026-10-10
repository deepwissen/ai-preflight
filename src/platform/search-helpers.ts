/**
 * Pure, vscode-free helpers for workspace-searcher. Kept separate so the
 * path-exclusion, regex-safety, import-resolution, and test-pair logic can be
 * unit-tested directly against the REAL functions (no replicas).
 */

// Single source of truth for excluded directories — both the findFiles glob and
// the post-filter segment check derive from this, so they can never drift apart.
export const EXCLUDED_DIR_NAMES = [
  "node_modules",
  "venv",
  ".venv",
  "env",
  "__pycache__",
  ".git",
  "dist",
  "build",
  "out",
  "vendor",
  "target",
  ".next",
  ".nuxt",
  "coverage",
  ".tox",
  ".mypy_cache",
  ".pytest_cache",
  "bower_components",
  ".cargo",
  "site-packages",
] as const;

/** Glob for vscode.workspace.findFiles exclude arg. */
export const EXCLUDE_PATTERN = `{${EXCLUDED_DIR_NAMES.map((n) => `**/${n}/**`).join(",")}}`;

const EXCLUDED_SEGMENTS = new Set<string>(EXCLUDED_DIR_NAMES);

/** Secondary guard: reject paths with any excluded dir segment that slipped the glob. */
export function isExcludedPath(relativePath: string): boolean {
  return relativePath.split("/").some((seg) => EXCLUDED_SEGMENTS.has(seg));
}

// Keywords come from prompt text and workspace file names, both of which can
// contain regex metacharacters (e.g. "foo(1).ts"). Escaping before RegExp
// construction prevents SyntaxError crashes and regex-injection / ReDoS.
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build a case-insensitive, word-bounded alternation regex from keywords. */
export function buildKeywordRegex(keywords: string[]): RegExp {
  const bounded = keywords.map((k) => `\\b${escapeRegExp(k)}\\b`);
  return new RegExp(bounded.join("|"), "i");
}

/** Resolve a relative import path against a base dir, honoring `.` and `..`. */
export function resolveRelativePath(baseDir: string, relativePath: string): string {
  const parts = baseDir.split("/");
  for (const seg of relativePath.split("/")) {
    if (seg === "..") {
      parts.pop();
    } else if (seg !== ".") {
      parts.push(seg);
    }
  }
  return parts.join("/");
}

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".rb",
]);

export function isCodeFile(filePath: string): boolean {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1) return false;
  return CODE_EXTENSIONS.has(filePath.substring(lastDot));
}

/**
 * Derive the find-the-counterpart query for a source/test file.
 * A test file searches for its source; a source file searches for its test.
 */
export function testPairQuery(activeFilePath: string): {
  isTestFile: boolean;
  searchPattern: string;
  keyword: string;
} {
  const fileName = activeFilePath.split("/").pop() ?? "";
  const baseName = fileName.replace(/\.\w+$/, "");
  const isTestFile = /\.(test|spec)\.\w+$/.test(fileName);

  if (isTestFile) {
    const sourceName = baseName.replace(/\.(test|spec)$/, "");
    return { isTestFile, searchPattern: `**/${sourceName}.{ts,tsx,js,jsx}`, keyword: sourceName };
  }
  return {
    isTestFile,
    searchPattern: `**/${baseName}.{test,spec}.{ts,tsx,js,jsx}`,
    keyword: baseName,
  };
}
