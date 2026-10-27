import { describe, it, expect } from "vitest";
import type { AnalysisResult } from "@deepwissen/preflight-core";
import { getNonce, buildWebviewHtml, badgeFor } from "../../src/platform/sidebar-helpers.js";

// badgeFor only reads riskLevel + wastePatterns; a partial result is sufficient.
function result(riskLevel: string, warningCount: number): AnalysisResult {
  const wastePatterns = Array.from({ length: warningCount }, () => ({ severity: "warning" }));
  return { riskLevel, wastePatterns } as unknown as AnalysisResult;
}

describe("getNonce", () => {
  it("is 32 lowercase hex chars", () => {
    expect(getNonce()).toMatch(/^[0-9a-f]{32}$/);
  });
  it("is unique per call", () => {
    expect(getNonce()).not.toBe(getNonce());
  });
});

describe("buildWebviewHtml — CSP nonce invariant", () => {
  const html = buildWebviewHtml("https://vscode-cdn/webview.js", "N0NCE123");

  it("locks the script behind a strict default-src 'none' policy", () => {
    expect(html).toContain("default-src 'none'");
  });
  it("puts the SAME nonce in the CSP and on the script tag", () => {
    expect(html).toContain("script-src 'nonce-N0NCE123'");
    expect(html).toContain('<script nonce="N0NCE123"');
  });
  it("references the provided script source", () => {
    expect(html).toContain('src="https://vscode-cdn/webview.js"');
  });
  // Regression: a webview <script type="module"> is a CORS/deferred module fetch
  // that newer VS Code enforces strictly, leaving the panel blank. It must be a
  // classic script (the bundle is IIFE, so no module semantics are needed).
  it("loads the bundle as a classic script, not a module", () => {
    expect(html).not.toContain('type="module"');
  });
  it("carries the real nonce through end to end", () => {
    const nonce = getNonce();
    const out = buildWebviewHtml("x.js", nonce);
    expect(out).toContain(`'nonce-${nonce}'`);
    expect(out).toContain(`nonce="${nonce}"`);
  });
});

describe("badgeFor", () => {
  it("shows a count badge for high risk with warnings", () => {
    expect(badgeFor(result("high", 2))).toEqual({
      tooltip: "High risk — check context",
      value: 2,
    });
  });
  it("shows a medium badge for medium risk with warnings", () => {
    expect(badgeFor(result("medium", 1))).toEqual({ tooltip: "Medium risk", value: 1 });
  });
  it("shows nothing when there are no warnings, even at high risk", () => {
    expect(badgeFor(result("high", 0))).toBeUndefined();
  });
  it("shows nothing for low risk", () => {
    expect(badgeFor(result("low", 3))).toBeUndefined();
  });
  it("shows nothing for medium risk with zero warnings", () => {
    expect(badgeFor(result("medium", 0))).toBeUndefined();
  });
});
