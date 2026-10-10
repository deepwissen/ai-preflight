import { describe, it, expect, beforeEach } from "vitest";
import { EventBus } from "@deepwissen/preflight-core";
import type { AnalysisResult } from "@deepwissen/preflight-core";
import { SidebarProvider } from "../../src/platform/sidebar-provider.js";
import { state, reset, Uri } from "vscode";

function result(riskLevel: string, warningCount: number): AnalysisResult {
  const wastePatterns = Array.from({ length: warningCount }, () => ({ severity: "warning" }));
  return { riskLevel, wastePatterns } as unknown as AnalysisResult;
}

// Minimal WebviewView that captures the message handler so tests can fire it.
function makeView() {
  let handler: ((m: unknown) => unknown) | undefined;
  const posted: any[] = [];
  return {
    badge: undefined as unknown,
    webview: {
      options: undefined as any,
      html: "",
      asWebviewUri: (u: Uri) => u,
      onDidReceiveMessage: (cb: (m: unknown) => unknown) => {
        handler = cb;
        return { dispose() {} };
      },
      postMessage: (m: unknown) => {
        posted.push(m);
        return Promise.resolve(true);
      },
    },
    posted,
    fire: (m: unknown) => handler!(m),
  };
}

function setWorkspace(root = "/ws"): void {
  (state as any).workspaceFolders = [{ uri: Uri.file(root), name: "ws", index: 0 }];
}

beforeEach(() => reset());

describe("SidebarProvider.resolveWebviewView — setup", () => {
  it("enables scripts and renders CSP-locked HTML", () => {
    const provider = new SidebarProvider(Uri.file("/ext"), new EventBus());
    const view = makeView();
    provider.resolveWebviewView(view as any);
    expect(view.webview.options.enableScripts).toBe(true);
    expect(view.webview.html).toContain("default-src 'none'");
    expect(view.webview.html).toContain("script-src 'nonce-");
  });
});

describe("SidebarProvider — webview -> extension message routing (trust boundary)", () => {
  it("routes dismiss-suggestion to a suggestion:dismissed event", async () => {
    const bus = new EventBus();
    let dismissed: unknown;
    bus.on("suggestion:dismissed", (id) => (dismissed = id));
    const view = makeView();
    new SidebarProvider(Uri.file("/ext"), bus).resolveWebviewView(view as any);

    await view.fire({ type: "dismiss-suggestion", id: "sug-1" });
    expect(dismissed).toBe("sug-1");
  });

  it("routes execute-action to executeAction AND emits action:executed", async () => {
    setWorkspace("/ws");
    const bus = new EventBus();
    let executed: unknown;
    bus.on("action:executed", (cmd) => (executed = cmd));
    const view = makeView();
    new SidebarProvider(Uri.file("/ext"), bus).resolveWebviewView(view as any);

    await view.fire({
      type: "execute-action",
      command: "ai-preflight.action.createIgnoreFile",
      args: {},
    });

    // executeAction actually ran (side effect visible in the vscode mock)
    expect(state.written).toHaveLength(1);
    expect(state.written[0].uri.path).toBe("/ws/.claudeignore");
    expect(executed).toBe("ai-preflight.action.createIgnoreFile");
  });

  it("ignores an unknown message type without throwing or acting", async () => {
    const bus = new EventBus();
    const view = makeView();
    new SidebarProvider(Uri.file("/ext"), bus).resolveWebviewView(view as any);
    await expect(view.fire({ type: "nonsense" })).resolves.toBeUndefined();
    expect(state.written).toHaveLength(0);
  });
});

describe("SidebarProvider.update — push + badge", () => {
  it("posts an analysis-update and sets a high-risk badge", () => {
    const provider = new SidebarProvider(Uri.file("/ext"), new EventBus());
    const view = makeView();
    provider.resolveWebviewView(view as any);

    provider.update(result("high", 2));
    expect(view.posted.at(-1).type).toBe("analysis-update");
    expect(view.badge).toEqual({ tooltip: "High risk — check context", value: 2 });
  });

  it("clears the badge when risk is low", () => {
    const provider = new SidebarProvider(Uri.file("/ext"), new EventBus());
    const view = makeView();
    provider.resolveWebviewView(view as any);
    provider.update(result("low", 5));
    expect(view.badge).toBeUndefined();
  });

  it("updates on an analysis:complete event from the bus", () => {
    const bus = new EventBus();
    const provider = new SidebarProvider(Uri.file("/ext"), bus);
    const view = makeView();
    provider.resolveWebviewView(view as any);
    bus.emit("analysis:complete", result("medium", 1));
    expect(view.badge).toEqual({ tooltip: "Medium risk", value: 1 });
  });
});
