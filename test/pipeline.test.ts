import { describe, it, expect } from "vitest";
import { runPipeline, type ContextSnapshot, type FileInfo } from "@deepwissen/preflight-core";
import { createPipeline } from "../src/pipeline.js";

function snapshot(path: string, content: string): ContextSnapshot {
  const activeFile: FileInfo = {
    path,
    languageId: "json",
    lineCount: content.split("\n").length,
    charCount: content.length,
    isActive: true,
    isDirty: false,
    commentLineCount: 0,
    hasConflictMarkers: false,
    content,
  };
  return {
    timestamp: 0,
    activeFile,
    selection: null,
    openTabs: [],
    aiInstructionFiles: [],
    mcpConfigFiles: [],
    toolProfile: null,
    ignoreFiles: [],
    referencedFiles: [],
    terminalContent: null,
    clipboardSize: null,
    chatHistoryLength: 0,
  } as ContextSnapshot;
}

// Verifies the agent-autonomy scanner is wired into the extension's pipeline and
// its findings flow through runPipeline (which concatenates instructionFileIssues).
describe("createPipeline — agent-autonomy wiring (OWASP LLM06)", () => {
  it("surfaces an agent finding for an over-permissioned Claude config", () => {
    const result = runPipeline(
      snapshot(".claude/settings.json", `{ "permissions": { "allow": ["Bash(*)"] } }`),
      createPipeline()
    );
    const hit = result.instructionFileIssues.find((i) => i.issue === "agent-broad-command-allow");
    expect(hit).toBeDefined();
    expect(hit?.severity).toBe("error");
  });

  it("does not flag a scoped allow (false-positive guard)", () => {
    const result = runPipeline(
      snapshot(".claude/settings.json", `{ "permissions": { "allow": ["Bash(git status)", "Read(*)"] } }`),
      createPipeline()
    );
    expect(
      result.instructionFileIssues.find((i) => i.issue === "agent-broad-command-allow")
    ).toBeUndefined();
  });

  it("the pipeline includes 10 analyzer steps", () => {
    expect(createPipeline()).toHaveLength(10);
  });
});
