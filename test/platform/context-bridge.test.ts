import { describe, it, expect, beforeEach } from "vitest";
import { EventBus } from "@deepwissen/preflight-core";
import { ContextBridge } from "../../src/platform/context-bridge.js";
import { state, reset, Uri, TabInputText } from "vscode";

function setWorkspace(root = "/ws"): void {
  (state as any).workspaceFolders = [{ uri: Uri.file(root), name: "ws", index: 0 }];
}
function doc(path: string, text: string, opts: { languageId?: string; isDirty?: boolean } = {}) {
  return {
    uri: Uri.file(path),
    languageId: opts.languageId ?? "typescript",
    isDirty: opts.isDirty ?? false,
    lineCount: text.split("\n").length,
    getText: () => text,
  };
}
function editor(document: ReturnType<typeof doc>, selection: unknown = { isEmpty: true }) {
  return { document, selection, revealRange() {} } as any;
}
function capture() {
  return new ContextBridge(new EventBus()).captureNow();
}

beforeEach(() => {
  reset();
  setWorkspace();
});

describe("ContextBridge.capture — active file", () => {
  it("captures a small active file with content, comments, and relative path", () => {
    const text = "// a comment\nconst x = 1;\n";
    (state as any).activeTextEditor = editor(doc("/ws/src/a.ts", text));
    const snap = capture();
    expect(snap.activeFile?.path).toBe("src/a.ts");
    expect(snap.activeFile?.content).toBe(text);
    expect(snap.activeFile?.charCount).toBe(text.length);
    expect(snap.activeFile?.commentLineCount).toBe(1);
    expect(snap.activeFile?.isActive).toBe(true);
    expect(snap.selection).toBeNull();
  });

  it("omits content for a file larger than 100 KB (exfil surface cap)", () => {
    const big = "a".repeat(100_001);
    (state as any).activeTextEditor = editor(doc("/ws/big.ts", big));
    const snap = capture();
    expect(snap.activeFile?.content).toBeUndefined();
    expect(snap.activeFile?.charCount).toBe(100_001);
  });

  it("flags merge-conflict markers", () => {
    const conflicted = "<<<<<<< HEAD\na\n=======\nb\n>>>>>>> branch\n";
    (state as any).activeTextEditor = editor(doc("/ws/c.ts", conflicted));
    expect(capture().activeFile?.hasConflictMarkers).toBe(true);
  });

  it("returns a null active file when no editor is open", () => {
    (state as any).activeTextEditor = null;
    const snap = capture();
    expect(snap.activeFile).toBeNull();
    expect(snap.openTabs).toEqual([]);
  });
});

describe("ContextBridge.capture — selection", () => {
  it("captures a non-empty selection line count", () => {
    const text = "l1\nl2\nl3";
    (state as any).activeTextEditor = editor(doc("/ws/s.ts", text), {
      isEmpty: false,
      start: { line: 0, character: 0 },
      end: { line: 1, character: 0 },
    });
    const snap = capture();
    expect(snap.selection).not.toBeNull();
    expect(snap.selection?.lineCount).toBe(2);
  });
});

describe("ContextBridge.capture — budget thresholds", () => {
  it("uses default bands when unconfigured", () => {
    (state as any).activeTextEditor = null;
    expect(capture().budgetThresholds).toEqual({ heavy: 25_000, bloated: 75_000 });
  });

  it("honors ai-preflight.budget.* overrides", () => {
    (state as any).config["ai-preflight.budget.heavyTokens"] = 10_000;
    (state as any).config["ai-preflight.budget.bloatedTokens"] = 50_000;
    (state as any).activeTextEditor = null;
    expect(capture().budgetThresholds).toEqual({ heavy: 10_000, bloated: 50_000 });
  });
});

describe("ContextBridge.capture — open tabs", () => {
  it("lists open text tabs with active flags", () => {
    const a = doc("/ws/a.ts", "x");
    const b = doc("/ws/b.ts", "y");
    (state as any).textDocuments = [a, b];
    (state as any).activeTextEditor = editor(a);
    (state as any).tabGroups = [
      {
        tabs: [
          { input: new TabInputText(Uri.file("/ws/a.ts")), isActive: true },
          { input: new TabInputText(Uri.file("/ws/b.ts")), isActive: false },
        ],
      },
    ];
    const snap = capture();
    expect(snap.openTabs.map((t) => t.path)).toEqual(["a.ts", "b.ts"]);
    expect(snap.openTabs[0].isActive).toBe(true);
    expect(snap.openTabs[1].isActive).toBe(false);
  });
});

describe("ContextBridge.capture — agent config detection (proactive)", () => {
  it("always carries an agentConfigFiles field on the snapshot", () => {
    (state as any).activeTextEditor = null;
    const snap = new ContextBridge(new EventBus()).captureNow() as any;
    expect(Array.isArray(snap.agentConfigFiles)).toBe(true);
  });

  it("detects a workspace .claude/settings.json and loads its content", async () => {
    (state as any).findFilesImpl = async (include: unknown) =>
      String(include).includes("/.claude/settings.json")
        ? [Uri.file("/ws/.claude/settings.json")]
        : [];
    (state as any).openTextDocumentImpl = async (uri: Uri) => ({
      uri,
      languageId: "json",
      isDirty: false,
      lineCount: 1,
      getText: () => `{ "permissions": { "allow": ["Bash(*)"] } }`,
    });

    const bridge = new ContextBridge(new EventBus());
    bridge.activate();
    await new Promise((r) => setTimeout(r, 25)); // let initAndCapture's detection settle
    const snap = bridge.captureNow() as any;
    bridge.deactivate();

    const cfg = snap.agentConfigFiles.find((f: any) => f.path === ".claude/settings.json");
    expect(cfg).toBeDefined();
    expect(cfg.content).toContain("Bash(*)");
  });
});
