/**
 * Pure, vscode-free helpers for context-bridge — the comment-line counter and
 * the instruction/MCP-config path detectors. Extracted so the logic that shapes
 * the ContextSnapshot can be unit-tested directly.
 */

// Languages where `#` starts a line comment.
const HASH_COMMENT_LANGUAGES = new Set([
  "python",
  "ruby",
  "shellscript",
  "yaml",
  "perl",
  "r",
  "coffeescript",
  "makefile",
  "dockerfile",
  "toml",
]);

/** Count comment lines, handling `//`, language-aware `#`, and `/* ... *\/` blocks. */
export function countCommentLines(text: string, languageId: string): number {
  const lines = text.split("\n");
  let count = 0;
  let inBlockComment = false;
  const hashIsComment = HASH_COMMENT_LANGUAGES.has(languageId);

  for (const line of lines) {
    const trimmed = line.trim();

    if (inBlockComment) {
      count++;
      if (trimmed.includes("*/")) {
        inBlockComment = false;
      }
      continue;
    }

    if (trimmed.startsWith("//")) {
      count++;
    } else if (hashIsComment && trimmed.startsWith("#")) {
      count++;
    } else if (trimmed.startsWith("/*")) {
      count++;
      if (!trimmed.includes("*/")) {
        inBlockComment = true;
      }
    }
  }

  return count;
}

/** Whether a relative path is a known AI instruction file (by name or rules dir). */
export function isInstructionFile(relativePath: string): boolean {
  const name = relativePath.split("/").pop() ?? "";
  const knownNames = [
    ".cursorrules",
    "copilot-instructions.md",
    "CLAUDE.md",
    ".windsurfrules",
    "GEMINI.md",
  ];
  if (knownNames.includes(name)) return true;
  if (relativePath.includes(".cursor/rules/")) return true;
  if (relativePath.includes(".amazonq/rules/")) return true;
  return false;
}

/** Whether a relative path is a known MCP server config. */
export function isMcpConfigFile(relativePath: string): boolean {
  const name = relativePath.split("/").pop() ?? "";
  return (
    name === ".mcp.json" ||
    name === "mcp.json" ||
    name === "claude_desktop_config.json" ||
    relativePath.includes(".vscode/mcp.json") ||
    relativePath.includes(".cursor/mcp.json")
  );
}
