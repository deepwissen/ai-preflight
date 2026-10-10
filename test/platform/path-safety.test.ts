import { describe, it, expect } from "vitest";
import { resolveWithinRoot } from "../../src/platform/path-safety.js";

/**
 * Security tests for the workspace-containment guard behind action-executor's
 * file writes. The filename is attacker-controllable (it round-trips through the
 * webview message channel), so escaping the workspace root must be impossible.
 *
 * These exercise the REAL exported function — not a replica — so a regression in
 * src/platform/path-safety.ts fails the build. The same payload table is replayed
 * against the live vscode.Uri in the Tier-2 host smoke test to validate parity.
 */
const ROOT = "/home/user/project";

describe("resolveWithinRoot — rejects escapes", () => {
  const escapes: Array<[string, string]> = [
    ["parent traversal", "../../etc/passwd"],
    ["single parent", "../secrets.txt"],
    ["embedded traversal", "foo/../../../bar"],
    ["deep traversal to root", "../../../../../../etc/shadow"],
    ["traversal then descend", "a/b/../../../outside"],
  ];
  for (const [name, payload] of escapes) {
    it(`rejects ${name}: "${payload}"`, () => {
      expect(resolveWithinRoot(ROOT, payload)).toBeNull();
    });
  }

  it("rejects a name that normalizes above the root exactly", () => {
    // join("/home/user/project", "../../../x") => "/home/x" — outside
    expect(resolveWithinRoot(ROOT, "../../../x")).toBeNull();
  });

  it("does not treat a sibling-prefix dir as contained", () => {
    // "/home/user/project-evil" must NOT count as inside "/home/user/project"
    expect(resolveWithinRoot(ROOT, "../project-evil/x")).toBeNull();
  });
});

describe("resolveWithinRoot — allows legitimate names", () => {
  const allowed: Array<[string, string, string]> = [
    ["instruction file at root", "AGENTS.md", "/home/user/project/AGENTS.md"],
    ["nested path", "docs/AGENTS.md", "/home/user/project/docs/AGENTS.md"],
    ["ignore file", ".claudeignore", "/home/user/project/.claudeignore"],
    ["dotted dir", ".github/copilot-instructions.md", "/home/user/project/.github/copilot-instructions.md"],
    ["normalizes interior dot-segments", "docs/./rules.md", "/home/user/project/docs/rules.md"],
  ];
  for (const [name, input, expected] of allowed) {
    it(`allows ${name}: "${input}"`, () => {
      expect(resolveWithinRoot(ROOT, input)).toBe(expected);
    });
  }

  it("mirrors Uri.joinPath: a leading-slash name is joined, not treated as absolute", () => {
    // path.posix.join nests it under the root rather than escaping — stays contained.
    expect(resolveWithinRoot(ROOT, "/etc/passwd")).toBe("/home/user/project/etc/passwd");
  });
});

describe("resolveWithinRoot — edge cases", () => {
  it("treats '.' (root itself) as contained", () => {
    expect(resolveWithinRoot(ROOT, ".")).toBe(ROOT);
  });

  it("treats an empty name (root itself) as contained", () => {
    expect(resolveWithinRoot(ROOT, "")).toBe(ROOT);
  });

  it("strips a trailing slash on the root before comparing", () => {
    expect(resolveWithinRoot("/home/user/project/", "AGENTS.md")).toBe(
      "/home/user/project/AGENTS.md"
    );
  });

  it("contains writes when the workspace is at filesystem root", () => {
    expect(resolveWithinRoot("/", "AGENTS.md")).toBe("/AGENTS.md");
  });
});
