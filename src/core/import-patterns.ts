/**
 * Shared import path extraction patterns.
 * Used by prompt-analyzer (missing context detection) and tool-aware-analyzer (context gap detection).
 * Also used by workspace-searcher for import graph traversal.
 */

export const IMPORT_PATTERNS = [
  // TypeScript/JavaScript: import ... from './foo'
  /(?:import\s+(?:[\s\S]*?)\s+from\s+['"])(\.\.?\/[^'"]+)['"]/g,
  // require('./foo')
  /require\s*\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g,
];

/**
 * Extracts relative import paths from source text.
 * Returns deduplicated array of raw import paths (e.g., './utils/helpers').
 */
export function extractImportPaths(sourceText: string): string[] {
  const paths = new Set<string>();
  for (const pattern of IMPORT_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(sourceText)) !== null) {
      paths.add(match[1]);
    }
  }
  return [...paths];
}
