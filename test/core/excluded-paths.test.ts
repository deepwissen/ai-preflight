import { describe, it, expect } from "vitest";

/**
 * Tests for the path exclusion logic used by workspace-searcher.
 * Since isExcludedPath is not exported, we replicate the logic here
 * to verify the EXCLUDED_SEGMENTS set works correctly.
 *
 * If the implementation changes, these tests should be updated to match.
 */

const EXCLUDED_SEGMENTS = new Set([
  "node_modules",
  "venv",
  ".venv",
  "env",
  "__pycache__",
  ".git",
  "dist",
  "build",
  "out",
  "vendor",
  "target",
  ".next",
  ".nuxt",
  "coverage",
  ".tox",
  ".mypy_cache",
  ".pytest_cache",
  "bower_components",
  ".cargo",
  "site-packages",
]);

function isExcludedPath(relativePath: string): boolean {
  const segments = relativePath.split("/");
  return segments.some((seg) => EXCLUDED_SEGMENTS.has(seg));
}

describe("isExcludedPath", () => {
  // ─── Python virtual environments ─────────────────────────────
  it("excludes venv paths", () => {
    expect(isExcludedPath("venv/lib/python3.11/site-packages/requests/api.py")).toBe(true);
  });

  it("excludes .venv paths", () => {
    expect(isExcludedPath(".venv/lib/python3.11/auth.py")).toBe(true);
  });

  it("excludes env paths", () => {
    expect(isExcludedPath("env/lib/utils.py")).toBe(true);
  });

  it("excludes __pycache__ paths", () => {
    expect(isExcludedPath("src/auth/__pycache__/auth.cpython-311.pyc")).toBe(true);
  });

  it("excludes site-packages deep paths", () => {
    expect(isExcludedPath("venv/lib/python3.11/site-packages/jwt/api_jwt.py")).toBe(true);
  });

  // ─── Node / JS ───────────────────────────────────────────────
  it("excludes node_modules paths", () => {
    expect(isExcludedPath("node_modules/express/index.js")).toBe(true);
  });

  it("excludes nested node_modules", () => {
    expect(isExcludedPath("packages/api/node_modules/lodash/index.js")).toBe(true);
  });

  it("excludes bower_components", () => {
    expect(isExcludedPath("bower_components/jquery/dist/jquery.js")).toBe(true);
  });

  // ─── Build / output dirs ─────────────────────────────────────
  it("excludes dist paths", () => {
    expect(isExcludedPath("dist/extension.js")).toBe(true);
  });

  it("excludes build paths", () => {
    expect(isExcludedPath("build/index.js")).toBe(true);
  });

  it("excludes out paths", () => {
    expect(isExcludedPath("out/compiled/main.js")).toBe(true);
  });

  it("excludes .next paths", () => {
    expect(isExcludedPath(".next/server/pages/index.js")).toBe(true);
  });

  it("excludes .nuxt paths", () => {
    expect(isExcludedPath(".nuxt/components/auth.js")).toBe(true);
  });

  // ─── Language-specific ───────────────────────────────────────
  it("excludes vendor paths (Go/PHP/Ruby)", () => {
    expect(isExcludedPath("vendor/github.com/pkg/errors/errors.go")).toBe(true);
  });

  it("excludes target paths (Rust/Java)", () => {
    expect(isExcludedPath("target/debug/deps/auth.rs")).toBe(true);
  });

  it("excludes .cargo paths", () => {
    expect(isExcludedPath(".cargo/registry/src/auth.rs")).toBe(true);
  });

  // ─── Tool / CI dirs ──────────────────────────────────────────
  it("excludes .git paths", () => {
    expect(isExcludedPath(".git/objects/pack/auth.idx")).toBe(true);
  });

  it("excludes coverage paths", () => {
    expect(isExcludedPath("coverage/lcov-report/index.html")).toBe(true);
  });

  it("excludes .tox paths", () => {
    expect(isExcludedPath(".tox/py311/lib/site-packages/auth.py")).toBe(true);
  });

  it("excludes .mypy_cache paths", () => {
    expect(isExcludedPath(".mypy_cache/3.11/auth.meta.json")).toBe(true);
  });

  it("excludes .pytest_cache paths", () => {
    expect(isExcludedPath(".pytest_cache/v/cache/auth.json")).toBe(true);
  });

  // ─── Should NOT exclude ──────────────────────────────────────
  it("allows normal source files", () => {
    expect(isExcludedPath("src/auth/auth-service.ts")).toBe(false);
  });

  it("allows test files", () => {
    expect(isExcludedPath("test/core/auth.test.ts")).toBe(false);
  });

  it("allows files with excluded words in filenames (not segments)", () => {
    // "build" is in the filename, not a directory segment
    expect(isExcludedPath("src/utils/build-config.ts")).toBe(false);
  });

  it("allows deep source paths", () => {
    expect(isExcludedPath("packages/api/src/auth/middleware/jwt.ts")).toBe(false);
  });

  it("allows root-level files", () => {
    expect(isExcludedPath("tsconfig.json")).toBe(false);
  });
});
