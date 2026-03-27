import * as vscode from "vscode";
import type { WorkspaceMatch } from "../core/types.js";
import { extractImportPaths } from "../core/import-patterns.js";

const MAX_RESULTS = 20;
const IMPORT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.js"];

// Shared exclude pattern for all findFiles calls — skip vendored/generated/env directories
const EXCLUDED_DIRS = [
  "**/node_modules/**",
  "**/venv/**",
  "**/.venv/**",
  "**/env/**",
  "**/__pycache__/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  "**/vendor/**",
  "**/target/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/coverage/**",
  "**/.tox/**",
  "**/.mypy_cache/**",
  "**/.pytest_cache/**",
  "**/bower_components/**",
  "**/.cargo/**",
  "**/site-packages/**",
].join(",");

const EXCLUDE_PATTERN = `{${EXCLUDED_DIRS}}`;

// Secondary check: reject paths that slipped through (e.g., nested venv, vendor dirs)
const EXCLUDED_SEGMENTS = new Set([
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
]);

function isExcludedPath(relativePath: string): boolean {
  const segments = relativePath.split("/");
  return segments.some((seg) => EXCLUDED_SEGMENTS.has(seg));
}

/**
 * Searches the workspace for files related to the current prompt but not currently open.
 * Platform layer — imports vscode. Used only by the @preflight chat participant.
 */
export async function searchWorkspace(options: {
  keywords: string[];
  openTabPaths: Set<string>;
  activeFileContent: string | null;
  activeFilePath: string | null;
  token: vscode.CancellationToken;
}): Promise<WorkspaceMatch[]> {
  const { keywords, openTabPaths, activeFileContent, activeFilePath, token } = options;
  const seen = new Set<string>(openTabPaths);
  const matches: WorkspaceMatch[] = [];

  // Strategy 1: Import scanning
  if (activeFileContent && activeFilePath) {
    const importMatches = await scanImports(activeFileContent, activeFilePath, seen, token);
    for (const m of importMatches) {
      if (matches.length >= MAX_RESULTS) break;
      matches.push(m);
      seen.add(m.path);
    }
  }

  if (token.isCancellationRequested) return matches;

  // Strategy 2: Filename search
  const filenameMatches = await searchByFilename(keywords, seen, token);
  for (const m of filenameMatches) {
    if (matches.length >= MAX_RESULTS) break;
    matches.push(m);
    seen.add(m.path);
  }

  if (token.isCancellationRequested) return matches;

  // Strategy 3: Test pair detection
  if (activeFilePath) {
    const testPairMatches = await findTestPairs(activeFilePath, seen, token);
    for (const m of testPairMatches) {
      if (matches.length >= MAX_RESULTS) break;
      matches.push(m);
      seen.add(m.path);
    }
  }

  if (token.isCancellationRequested) return matches;

  // Strategy 4: Nearby folder search
  const nearbyMatches = await searchNearbyFolders(matches, seen, token);
  for (const m of nearbyMatches) {
    if (matches.length >= MAX_RESULTS) break;
    matches.push(m);
    seen.add(m.path);
  }

  if (token.isCancellationRequested) return matches;

  // Strategy 5: Content search
  const contentMatches = await searchFileContents(keywords, seen, token);
  for (const m of contentMatches) {
    if (matches.length >= MAX_RESULTS) break;
    matches.push(m);
    seen.add(m.path);
  }

  return matches;
}

// ─── Strategy 1: Import Scanning ──────────────────────────────────

async function scanImports(
  fileContent: string,
  filePath: string,
  seen: Set<string>,
  token: vscode.CancellationToken
): Promise<WorkspaceMatch[]> {
  const importPaths = extractImportPaths(fileContent);
  if (importPaths.length === 0) return [];

  const activeDir = vscode.Uri.file(filePath).with({
    path: filePath.substring(0, filePath.lastIndexOf("/")),
  });

  const matches: WorkspaceMatch[] = [];

  for (const importPath of importPaths) {
    if (token.isCancellationRequested) break;

    const resolved = await resolveImportPath(activeDir.path, importPath, token);
    if (resolved && !seen.has(resolved) && !isExcludedPath(resolved)) {
      matches.push({
        path: resolved,
        reason: "import",
        keyword: importPath,
        confidence: "high",
      });
    }
  }

  return matches;
}

async function resolveImportPath(
  activeDir: string,
  importPath: string,
  token: vscode.CancellationToken
): Promise<string | null> {
  // Resolve the import path relative to the active file's directory
  const basePath = resolveRelativePath(activeDir, importPath);

  for (const ext of IMPORT_EXTENSIONS) {
    if (token.isCancellationRequested) return null;

    const candidate = basePath + ext;
    const pattern = new vscode.RelativePattern(
      vscode.workspace.workspaceFolders?.[0] ?? "",
      toWorkspaceRelative(candidate)
    );

    try {
      const files = await vscode.workspace.findFiles(pattern, undefined, 1, token);
      if (files.length > 0) {
        return vscode.workspace.asRelativePath(files[0]);
      }
    } catch {
      // findFiles can throw on cancellation
    }
  }

  return null;
}

function resolveRelativePath(baseDir: string, relativePath: string): string {
  const parts = baseDir.split("/");
  const segments = relativePath.split("/");

  for (const seg of segments) {
    if (seg === "..") {
      parts.pop();
    } else if (seg !== ".") {
      parts.push(seg);
    }
  }

  return parts.join("/");
}

function toWorkspaceRelative(absolutePath: string): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return absolutePath;
  const folderPath = folder.uri.fsPath;
  if (absolutePath.startsWith(folderPath)) {
    return absolutePath.substring(folderPath.length + 1);
  }
  return absolutePath;
}

// ─── Strategy 2: Filename Search ──────────────────────────────────

async function searchByFilename(
  keywords: string[],
  seen: Set<string>,
  token: vscode.CancellationToken
): Promise<WorkspaceMatch[]> {
  const matches: WorkspaceMatch[] = [];

  for (const keyword of keywords) {
    if (token.isCancellationRequested) break;
    if (keyword.length < 3) continue;

    try {
      const files = await vscode.workspace.findFiles(`**/*${keyword}*`, EXCLUDE_PATTERN, 10, token);

      for (const file of files) {
        const relativePath = vscode.workspace.asRelativePath(file);
        if (seen.has(relativePath)) continue;
        if (isExcludedPath(relativePath)) continue;

        matches.push({
          path: relativePath,
          reason: "filename",
          keyword,
          confidence: "medium",
        });
      }
    } catch {
      // findFiles can throw on cancellation
    }
  }

  return matches;
}

// ─── Strategy 3: Test Pair Detection ──────────────────────────────

export async function findTestPairs(
  activeFilePath: string,
  seen: Set<string>,
  token: vscode.CancellationToken
): Promise<WorkspaceMatch[]> {
  const matches: WorkspaceMatch[] = [];
  const fileName = activeFilePath.split("/").pop() ?? "";
  const baseName = fileName.replace(/\.\w+$/, "");

  // Detect if this is a test file
  const isTestFile = /\.(test|spec)\.\w+$/.test(fileName);

  let searchPattern: string;
  let keyword: string;

  if (isTestFile) {
    // Test → source: strip .test/.spec suffix
    const sourceName = baseName.replace(/\.(test|spec)$/, "");
    searchPattern = `**/${sourceName}.{ts,tsx,js,jsx}`;
    keyword = sourceName;
  } else {
    // Source → test: search for test/spec variants
    searchPattern = `**/${baseName}.{test,spec}.{ts,tsx,js,jsx}`;
    keyword = baseName;
  }

  try {
    const files = await vscode.workspace.findFiles(searchPattern, EXCLUDE_PATTERN, 5, token);
    for (const file of files) {
      const relativePath = vscode.workspace.asRelativePath(file);
      if (seen.has(relativePath)) continue;
      if (isExcludedPath(relativePath)) continue;

      matches.push({
        path: relativePath,
        reason: "test-pair",
        keyword,
        confidence: "high",
      });
    }
  } catch {
    // findFiles can throw on cancellation
  }

  return matches;
}

// ─── Strategy 4: Nearby Folder Search ─────────────────────────────

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

function isCodeFile(filePath: string): boolean {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1) return false;
  return CODE_EXTENSIONS.has(filePath.substring(lastDot));
}

async function searchNearbyFolders(
  existingMatches: WorkspaceMatch[],
  seen: Set<string>,
  token: vscode.CancellationToken
): Promise<WorkspaceMatch[]> {
  const matches: WorkspaceMatch[] = [];

  // Collect unique directories from existing matches
  const dirs = new Set<string>();
  for (const m of existingMatches) {
    const lastSlash = m.path.lastIndexOf("/");
    if (lastSlash > 0) {
      dirs.add(m.path.substring(0, lastSlash));
    }
  }

  for (const dir of dirs) {
    if (token.isCancellationRequested) break;

    try {
      const files = await vscode.workspace.findFiles(`${dir}/*`, EXCLUDE_PATTERN, 10, token);

      for (const file of files) {
        const relativePath = vscode.workspace.asRelativePath(file);
        if (seen.has(relativePath)) continue;
        if (isExcludedPath(relativePath)) continue;
        if (!isCodeFile(relativePath)) continue;

        matches.push({
          path: relativePath,
          reason: "nearby",
          keyword: dir.split("/").pop() ?? dir,
          confidence: "low",
        });
        seen.add(relativePath);
      }
    } catch {
      // findFiles can throw on cancellation
    }
  }

  return matches;
}

// ─── Strategy 5: Content Search ───────────────────────────────────

const CONTENT_SEARCH_EXTENSIONS = "**/*.{ts,tsx,js,jsx,py,go,rs,java,rb}";
const CONTENT_SEARCH_MAX_FILES = 50;

async function searchFileContents(
  keywords: string[],
  seen: Set<string>,
  token: vscode.CancellationToken
): Promise<WorkspaceMatch[]> {
  const filteredKeywords = keywords.filter((k) => k.length >= 4);
  if (filteredKeywords.length === 0) return [];

  const matches: WorkspaceMatch[] = [];
  // Word-boundary regex to avoid partial matches (e.g., "auth" in "unauthorized")
  const boundedKeywords = filteredKeywords.map((k) => `\\b${k}\\b`);
  const regex = new RegExp(boundedKeywords.join("|"), "i");

  try {
    const files = await vscode.workspace.findFiles(
      CONTENT_SEARCH_EXTENSIONS,
      EXCLUDE_PATTERN,
      CONTENT_SEARCH_MAX_FILES,
      token
    );

    for (const file of files) {
      if (token.isCancellationRequested) break;
      if (matches.length >= 20) break;

      const relativePath = vscode.workspace.asRelativePath(file);
      if (seen.has(relativePath)) continue;
      if (isExcludedPath(relativePath)) continue;

      try {
        const doc = await vscode.workspace.openTextDocument(file);
        const text = doc.getText();

        const lineMatch = regex.exec(text);
        if (lineMatch) {
          // Find the line number of the match
          const beforeMatch = text.substring(0, lineMatch.index);
          const lineNumber = beforeMatch.split("\n").length;

          // Get the line content as preview
          const lines = text.split("\n");
          const preview = (lines[lineNumber - 1] ?? "").trim().substring(0, 120);

          matches.push({
            path: relativePath,
            reason: "content",
            keyword:
              filteredKeywords.find((k) => new RegExp(k, "i").test(lineMatch[0])) ??
              filteredKeywords[0],
            confidence: "low",
            contentMatch: {
              lineNumber,
              preview,
            },
          });
          seen.add(relativePath);
        }
      } catch {
        // openTextDocument can fail for binary files
      }
    }
  } catch {
    // findFiles can throw on cancellation
  }

  return matches;
}
