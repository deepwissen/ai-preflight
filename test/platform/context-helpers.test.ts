import { describe, it, expect } from "vitest";
import {
  countCommentLines,
  isInstructionFile,
  isMcpConfigFile,
} from "../../src/platform/context-helpers.js";

describe("countCommentLines", () => {
  it("counts // line comments", () => {
    expect(countCommentLines("// a\nconst x = 1;\n// b", "typescript")).toBe(2);
  });

  it("counts a multi-line /* */ block including its interior", () => {
    const src = "/*\n * doc\n * more\n */\ncode();";
    expect(countCommentLines(src, "typescript")).toBe(4);
  });

  it("counts a single-line /* */ block as one", () => {
    expect(countCommentLines("/* inline */\ncode();", "typescript")).toBe(1);
  });

  it("treats # as a comment only in hash-comment languages", () => {
    expect(countCommentLines("# a\nx = 1", "python")).toBe(1);
    expect(countCommentLines("# not a comment\nx = 1", "typescript")).toBe(0);
  });

  it("does not count code after a closed block on the same conceptual line", () => {
    // trailing code after */ still counts the block line, not the code line
    const src = "/* x */\nreal();\n// y";
    expect(countCommentLines(src, "typescript")).toBe(2);
  });

  it("returns 0 for all-code input", () => {
    expect(countCommentLines("const a = 1;\nfn();", "typescript")).toBe(0);
  });

  it("handles an unterminated block to end of file", () => {
    expect(countCommentLines("/*\nstill\nopen", "typescript")).toBe(3);
  });
});

describe("isInstructionFile", () => {
  it("recognizes known instruction files by name", () => {
    expect(isInstructionFile("CLAUDE.md")).toBe(true);
    expect(isInstructionFile("repo/.cursorrules")).toBe(true);
    expect(isInstructionFile(".github/copilot-instructions.md")).toBe(true);
    expect(isInstructionFile("sub/GEMINI.md")).toBe(true);
    expect(isInstructionFile(".windsurfrules")).toBe(true);
  });
  it("recognizes rules directories", () => {
    expect(isInstructionFile(".cursor/rules/style.md")).toBe(true);
    expect(isInstructionFile(".amazonq/rules/foo.md")).toBe(true);
  });
  it("rejects ordinary files", () => {
    expect(isInstructionFile("src/app.ts")).toBe(false);
    expect(isInstructionFile("README.md")).toBe(false);
  });
});

describe("isMcpConfigFile", () => {
  it("recognizes MCP config names", () => {
    expect(isMcpConfigFile(".mcp.json")).toBe(true);
    expect(isMcpConfigFile("sub/mcp.json")).toBe(true);
    expect(isMcpConfigFile("claude_desktop_config.json")).toBe(true);
    expect(isMcpConfigFile("proj/.vscode/mcp.json")).toBe(true);
    expect(isMcpConfigFile(".cursor/mcp.json")).toBe(true);
  });
  it("rejects ordinary JSON", () => {
    expect(isMcpConfigFile("package.json")).toBe(false);
    expect(isMcpConfigFile("tsconfig.json")).toBe(false);
  });
});
