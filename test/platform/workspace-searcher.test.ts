import { describe, it, expect, beforeEach } from "vitest";
import { searchWorkspace, findTestPairs } from "../../src/platform/workspace-searcher.js";
import { state, reset, Uri } from "vscode";

const tok = (cancelled = false) => ({ isCancellationRequested: cancelled }) as any;

function setWorkspace(root = "/ws"): void {
  (state as any).workspaceFolders = [{ uri: Uri.file(root), name: "ws", index: 0 }];
}
function search(opts: Partial<Parameters<typeof searchWorkspace>[0]>) {
  return searchWorkspace({
    keywords: [],
    openTabPaths: new Set<string>(),
    activeFileContent: null,
    activeFilePath: null,
    token: tok(),
    ...opts,
  });
}

beforeEach(() => {
  reset();
  setWorkspace();
});

describe("searchWorkspace — filename strategy", () => {
  it("returns filename matches and skips already-open files", async () => {
    (state as any).findFilesImpl = async (include: unknown) =>
      String(include).includes("login")
        ? [Uri.file("/ws/src/login.ts"), Uri.file("/ws/src/login-form.ts")]
        : [];

    const res = await search({ keywords: ["login"], openTabPaths: new Set(["src/login.ts"]) });
    const paths = res.map((m) => m.path);
    expect(paths).toContain("src/login-form.ts");
    expect(paths).not.toContain("src/login.ts"); // already open -> deduped
    expect(res.find((m) => m.path === "src/login-form.ts")?.reason).toBe("filename");
  });

  it("filters out results inside excluded directories", async () => {
    (state as any).findFilesImpl = async (include: unknown) =>
      String(include).includes("auth")
        ? [Uri.file("/ws/node_modules/auth/index.ts"), Uri.file("/ws/src/auth.ts")]
        : [];

    const res = await search({ keywords: ["auth"] });
    expect(res.map((m) => m.path)).toContain("src/auth.ts");
    expect(res.some((m) => m.path.includes("node_modules"))).toBe(false);
  });

  it("caps results at 20", async () => {
    (state as any).findFilesImpl = async (include: unknown) =>
      String(include).includes("widget")
        ? Array.from({ length: 30 }, (_, i) => Uri.file(`/ws/f${i}.ts`))
        : [];

    const res = await search({ keywords: ["widget"] });
    expect(res.length).toBeLessThanOrEqual(20);
  });
});

describe("searchWorkspace — cancellation", () => {
  it("returns early when the token is already cancelled", async () => {
    (state as any).findFilesImpl = async () => [Uri.file("/ws/src/x.ts")];
    const res = await search({ keywords: ["login"], token: tok(true) });
    expect(res).toEqual([]);
  });
});

describe("findTestPairs", () => {
  it("finds the test for a source file", async () => {
    (state as any).findFilesImpl = async (include: unknown) =>
      String(include).includes("login") ? [Uri.file("/ws/src/login.test.ts")] : [];

    const res = await findTestPairs("src/login.ts", new Set(), tok());
    expect(res).toHaveLength(1);
    expect(res[0].path).toBe("src/login.test.ts");
    expect(res[0].reason).toBe("test-pair");
  });

  it("skips a counterpart that is already in the seen set", async () => {
    (state as any).findFilesImpl = async () => [Uri.file("/ws/src/login.test.ts")];
    const res = await findTestPairs("src/login.ts", new Set(["src/login.test.ts"]), tok());
    expect(res).toHaveLength(0);
  });
});
