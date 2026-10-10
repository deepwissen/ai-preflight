import { describe, it, expect, beforeEach } from "vitest";
import { EventBus } from "@deepwissen/preflight-core";
import { registerCommands } from "../../src/platform/commands.js";
import { state, reset, Uri, TabInputText } from "vscode";

function setWorkspace(root = "/ws"): void {
  (state as any).workspaceFolders = [{ uri: Uri.file(root), name: "ws", index: 0 }];
}
const fakeBridge = { captureNow: () => ({}) } as any;
const ctx = () => ({ subscriptions: [] as unknown[] }) as any;
const handler = (id: string) =>
  (state as any).registered.find((c: { id: string }) => c.id === id)!.callback;

beforeEach(() => reset());

describe("registerCommands — registration", () => {
  it("registers all seven commands", () => {
    registerCommands(ctx(), new EventBus(), fakeBridge, []);
    const ids = (state as any).registered.map((c: { id: string }) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "ai-preflight.analyze",
        "ai-preflight.togglePanel",
        "ai-preflight.exportContext",
        "ai-preflight.openFiles",
        "ai-preflight.copyFileRefs",
        "ai-preflight.closeWasteTabs",
        "ai-preflight.createFocusedView",
      ])
    );
    expect(ids).toHaveLength(7);
  });

  it("pushes a disposable per command into context.subscriptions", () => {
    const c = ctx();
    registerCommands(c, new EventBus(), fakeBridge, []);
    expect(c.subscriptions).toHaveLength(7);
  });
});

describe("registerCommands — deterministic handlers", () => {
  beforeEach(() => {
    reset();
    registerCommands(ctx(), new EventBus(), fakeBridge, []);
  });

  it("togglePanel focuses the sidebar panel", async () => {
    await handler("ai-preflight.togglePanel")();
    expect((state as any).executed.map((e: { command: string }) => e.command)).toContain(
      "ai-preflight.panel.focus"
    );
  });

  it("openFiles opens each path within the workspace", async () => {
    setWorkspace();
    await handler("ai-preflight.openFiles")(["src/a.ts", "src/b.ts"]);
    expect((state as any).shown.map((s: { uri: Uri }) => s.uri.path)).toEqual([
      "/ws/src/a.ts",
      "/ws/src/b.ts",
    ]);
  });

  it("openFiles is a no-op without a workspace folder", async () => {
    await handler("ai-preflight.openFiles")(["a.ts"]);
    expect((state as any).shown).toHaveLength(0);
  });

  it("copyFileRefs writes #file: references and notifies", async () => {
    await handler("ai-preflight.copyFileRefs")(["src/a.ts", "src/b.ts"]);
    expect(await (await import("vscode")).env.clipboard.readText()).toBe(
      "#file:src/a.ts #file:src/b.ts"
    );
    expect((state as any).infoMessages[0]).toContain("2 #file reference");
  });

  it("closeWasteTabs delegates to the close-waste action", async () => {
    setWorkspace();
    (state as any).tabGroups = [
      { tabs: [{ input: new TabInputText(Uri.file("/ws/waste.ts")), isActive: false }] },
    ];
    await handler("ai-preflight.closeWasteTabs")(["waste.ts"]);
    expect((state as any).closedTabs).toHaveLength(1);
  });
});
