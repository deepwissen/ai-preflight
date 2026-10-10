import { describe, it, expect } from "vitest";
import {
  EXCLUDED_DIR_NAMES,
  EXCLUDE_PATTERN,
  buildKeywordRegex,
  escapeRegExp,
  isCodeFile,
  isExcludedPath,
  resolveRelativePath,
  testPairQuery,
} from "../../src/platform/search-helpers.js";

/**
 * Real-function tests for workspace-searcher's pure helpers. These replace the
 * former excluded-paths.test.ts and regex-safety.test.ts, which asserted against
 * hand-copied replicas and so could not catch a regression in the implementation.
 */

describe("escapeRegExp", () => {
  it("escapes every regex metacharacter", () => {
    expect(escapeRegExp(".*+?^${}()|[]\\")).toBe("\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\");
  });
  it("leaves ordinary identifiers untouched", () => {
    expect(escapeRegExp("getUser")).toBe("getUser");
  });
});

describe("buildKeywordRegex — regex-injection / ReDoS guard", () => {
  it("does not throw on keywords containing metacharacters", () => {
    expect(() => buildKeywordRegex(["foo(1).ts", "a+b", "["])).not.toThrow();
  });
  it("matches whole words, not substrings", () => {
    const re = buildKeywordRegex(["auth"]);
    expect(re.test("const auth = 1")).toBe(true);
    expect(re.test("unauthorized")).toBe(false); // \b boundaries
  });
  it("treats a metacharacter keyword literally", () => {
    const re = buildKeywordRegex(["a.c"]);
    expect(re.test("a.c")).toBe(true);
    expect(re.test("axc")).toBe(false); // the '.' is escaped, not a wildcard
  });
  it("is case-insensitive", () => {
    expect(buildKeywordRegex(["Login"]).test("user login handler")).toBe(true);
  });
});

describe("isExcludedPath", () => {
  it("excludes known vendored/generated segments anywhere in the path", () => {
    expect(isExcludedPath("node_modules/foo/index.js")).toBe(true);
    expect(isExcludedPath("src/venv/lib/x.py")).toBe(true);
    expect(isExcludedPath("a/b/site-packages/pkg/mod.py")).toBe(true);
    expect(isExcludedPath("project/dist/bundle.js")).toBe(true);
  });
  it("allows ordinary source paths", () => {
    expect(isExcludedPath("src/app.ts")).toBe(false);
    expect(isExcludedPath("lib/auth/login.ts")).toBe(false);
  });
  it("matches whole segments only, not substrings", () => {
    // a dir named like an excluded one but not exactly must pass
    expect(isExcludedPath("my_node_modules_backup/x.js")).toBe(false);
    expect(isExcludedPath("distribution/x.ts")).toBe(false);
  });
});

describe("EXCLUDE_PATTERN / EXCLUDED_DIR_NAMES single-source-of-truth", () => {
  it("the glob and the segment check cover the same dir set", () => {
    for (const name of EXCLUDED_DIR_NAMES) {
      expect(EXCLUDE_PATTERN).toContain(`**/${name}/**`);
      expect(isExcludedPath(`a/${name}/b`)).toBe(true);
    }
  });
});

describe("resolveRelativePath", () => {
  it("resolves ./ and ../ against the base dir", () => {
    expect(resolveRelativePath("/ws/src/feature", "./util")).toBe("/ws/src/feature/util");
    expect(resolveRelativePath("/ws/src/feature", "../shared/log")).toBe("/ws/src/shared/log");
    expect(resolveRelativePath("/ws/src/a/b", "../../c")).toBe("/ws/src/c");
  });
});

describe("isCodeFile", () => {
  it("recognizes code extensions", () => {
    for (const p of ["a.ts", "a.tsx", "a.py", "a.go", "a.rs", "a.java", "a.rb"]) {
      expect(isCodeFile(p)).toBe(true);
    }
  });
  it("rejects non-code and extensionless files", () => {
    expect(isCodeFile("README.md")).toBe(false);
    expect(isCodeFile("data.json")).toBe(false);
    expect(isCodeFile("Makefile")).toBe(false);
  });
});

describe("testPairQuery", () => {
  it("maps a source file to its test variants", () => {
    const q = testPairQuery("src/auth/login.ts");
    expect(q.isTestFile).toBe(false);
    expect(q.searchPattern).toBe("**/login.{test,spec}.{ts,tsx,js,jsx}");
    expect(q.keyword).toBe("login");
  });
  it("maps a test file back to its source", () => {
    const q = testPairQuery("test/login.test.ts");
    expect(q.isTestFile).toBe(true);
    expect(q.searchPattern).toBe("**/login.{ts,tsx,js,jsx}");
    expect(q.keyword).toBe("login");
  });
  it("handles .spec. the same as .test.", () => {
    const q = testPairQuery("x/button.spec.tsx");
    expect(q.isTestFile).toBe(true);
    expect(q.keyword).toBe("button");
  });
});
