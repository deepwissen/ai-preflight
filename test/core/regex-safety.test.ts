import { describe, it, expect } from "vitest";

/**
 * Regression guard for the regex-injection / ReDoS fix in workspace-searcher.
 *
 * workspace-searcher builds a RegExp from keywords derived from prompt text and
 * workspace file names — both of which can contain regex metacharacters (e.g.
 * "foo(1).ts"). Unescaped, that throws a SyntaxError or enables pathological
 * backtracking. The fix escapes keywords before RegExp construction.
 *
 * Since workspace-searcher imports `vscode` (unavailable under vitest), we mirror
 * the exact escape + bounded-keyword construction here — the same pattern as
 * excluded-paths.test.ts. Keep in sync with src/platform/workspace-searcher.ts.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Mirrors: filteredKeywords.map(k => `\\b${escapeRegExp(k)}\\b`) joined with "|"
function buildKeywordRegex(keywords: string[]): RegExp {
  const bounded = keywords.map((k) => `\\b${escapeRegExp(k)}\\b`);
  return new RegExp(bounded.join("|"), "i");
}

describe("escapeRegExp", () => {
  it("escapes all regex metacharacters", () => {
    expect(escapeRegExp("a.b*c+d?")).toBe("a\\.b\\*c\\+d\\?");
    expect(escapeRegExp("(group)")).toBe("\\(group\\)");
    expect(escapeRegExp("[set]")).toBe("\\[set\\]");
    expect(escapeRegExp("a|b")).toBe("a\\|b");
    expect(escapeRegExp("back\\slash")).toBe("back\\\\slash");
  });

  it("leaves ordinary identifiers untouched", () => {
    expect(escapeRegExp("useAuth")).toBe("useAuth");
    expect(escapeRegExp("login_service")).toBe("login_service");
  });
});

describe("bounded keyword RegExp (mirrors line 393: \\b<esc>\\b)", () => {
  it("does not throw on keywords containing metacharacters", () => {
    const nasty = ["foo(1).ts", "a+b*", "[abc]", "name|other", "c++", "$var", "(a"];
    for (const kw of nasty) {
      expect(() => buildKeywordRegex([kw])).not.toThrow();
    }
  });

  it("does not let a metachar keyword match unrelated text (no injection)", () => {
    // Unescaped, "a|.*" would match everything; escaped, it cannot.
    expect(buildKeywordRegex(["a|.*"]).test("totally unrelated text")).toBe(false);
  });

  it("matches an identifier-style filename keyword by word boundary", () => {
    const re = buildKeywordRegex(["my-config.prod.json"]);
    expect(re.test("edit my-config.prod.json please")).toBe(true);
    expect(re.test("my-configXprodXjson")).toBe(false); // dots are literal
  });
});

describe("attribution RegExp (mirrors line 430: new RegExp(escapeRegExp(k), i))", () => {
  it("treats a metachar keyword as a literal, not a pattern", () => {
    const re = new RegExp(escapeRegExp("foo(1)"), "i");
    expect(re.test("open foo(1) now")).toBe(true); // literal match
    expect(re.test("foo1")).toBe(false); // not a group/quantifier
  });

  it("cannot inject a wildcard", () => {
    const re = new RegExp(escapeRegExp("a|.*"), "i");
    expect(re.test("totally unrelated text")).toBe(false);
    expect(re.test("literal a|.* here")).toBe(true);
  });
});
