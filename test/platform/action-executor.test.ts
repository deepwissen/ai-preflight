import { describe, it, expect, beforeEach } from "vitest";
import { executeAction } from "../../src/platform/action-executor.js";
// Resolves to test/mocks/vscode.ts via the vitest alias.
import { state, reset, Uri, TabInputText } from "vscode";

interface Doc {
  uri: Uri;
  languageId: string;
  isDirty: boolean;
  lineCount: number;
  getText: () => string;
  save?: () => Promise<boolean>;
}

function tab(path: string, isActive = false): { input: TabInputText; isActive: boolean } {
  return { input: new TabInputText(Uri.file(path)), isActive };
}
function setWorkspace(root = "/ws"): void {
  (state as any).workspaceFolders = [{ uri: Uri.file(root), name: "ws", index: 0 }];
}
function closedPaths(): string[] {
  return (state as any).closedTabs.map((t: { input: TabInputText }) => t.input.uri.path);
}

beforeEach(() => reset());

describe("executeAction — file creation guard (security, through the real dispatch)", () => {
  it("writes an instruction file within the workspace", async () => {
    setWorkspace();
    await executeAction("ai-preflight.action.createInstructionFile", { files: ["AGENTS.md"] });
    expect(state.written).toHaveLength(1);
    expect(state.written[0].uri.path).toBe("/ws/AGENTS.md");
    expect(state.written[0].content).toContain("AI Instructions");
    expect(state.shown).toHaveLength(1);
  });

  it("REJECTS a traversal filename and writes nothing", async () => {
    setWorkspace();
    await executeAction("ai-preflight.action.createInstructionFile", {
      files: ["../../etc/evil.md"],
    });
    expect(state.written).toHaveLength(0);
    expect(state.shown).toHaveLength(0);
  });

  it("creates the default ignore file, and rejects a traversal name", async () => {
    setWorkspace();
    await executeAction("ai-preflight.action.createIgnoreFile", {});
    expect(state.written[0].uri.path).toBe("/ws/.claudeignore");

    reset();
    setWorkspace();
    await executeAction("ai-preflight.action.createIgnoreFile", { fileName: "../x" });
    expect(state.written).toHaveLength(0);
  });

  it("no-ops when there is no workspace folder", async () => {
    await executeAction("ai-preflight.action.createInstructionFile", { files: ["AGENTS.md"] });
    expect(state.written).toHaveLength(0);
  });
});

describe("executeAction — tab management", () => {
  it("closes duplicate tabs, keeping the first", async () => {
    setWorkspace();
    (state as any).tabGroups = [{ tabs: [tab("/ws/a.ts"), tab("/ws/a.ts"), tab("/ws/b.ts")] }];
    await executeAction("ai-preflight.action.closeDuplicates");
    expect(state.closedTabs).toHaveLength(1);
    expect(closedPaths()).toEqual(["/ws/a.ts"]);
  });

  it("closes only the tabs named in a waste-cleanup action", async () => {
    setWorkspace();
    (state as any).tabGroups = [
      { tabs: [tab("/ws/keep.ts"), tab("/ws/waste1.ts"), tab("/ws/waste2.ts")] },
    ];
    await executeAction("ai-preflight.action.closeWasteTabs", {
      paths: ["waste1.ts", "waste2.ts"],
    });
    expect(closedPaths().sort()).toEqual(["/ws/waste1.ts", "/ws/waste2.ts"]);
  });

  it("closes a single tab by exact relative path", async () => {
    setWorkspace();
    (state as any).tabGroups = [{ tabs: [tab("/ws/src/a.ts"), tab("/ws/src/b.ts")] }];
    await executeAction("ai-preflight.action.closeTab", { path: "src/b.ts" });
    expect(closedPaths()).toEqual(["/ws/src/b.ts"]);
  });

  it("closes test files but never the active tab", async () => {
    setWorkspace();
    (state as any).tabGroups = [
      { tabs: [tab("/ws/a.test.ts"), tab("/ws/a.ts", true), tab("/ws/b.spec.ts")] },
    ];
    await executeAction("ai-preflight.action.closeTestFiles");
    expect(closedPaths().sort()).toEqual(["/ws/a.test.ts", "/ws/b.spec.ts"]);
  });
});

describe("executeAction — robustness", () => {
  it("ignores an unknown command without throwing", async () => {
    await expect(executeAction("ai-preflight.action.bogus")).resolves.toBeUndefined();
    expect(state.written).toHaveLength(0);
    expect(state.closedTabs).toHaveLength(0);
  });
});
