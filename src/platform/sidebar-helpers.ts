import { randomBytes } from "crypto";
import type { AnalysisResult } from "@deepwissen/preflight-core";

/** Cryptographically secure nonce for the webview CSP (32 hex chars). */
export function getNonce(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Build the webview HTML. The CSP nonce and the <script> nonce MUST be the same
 * value, or the script is blocked (or, worse, a mismatch is papered over by
 * loosening the policy). Taking the nonce as a parameter lets a test assert that
 * invariant directly.
 */
export function buildWebviewHtml(scriptSrc: string, nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <title>AI Preflight</title>
  <style>
    body {
      padding: 0 12px;
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    .loading {
      opacity: 0.6;
      padding: 16px 0;
    }
  </style>
</head>
<body>
  <div id="root">
    <p class="loading">Analyzing context...</p>
  </div>
  <script nonce="${nonce}" type="module" src="${scriptSrc}"></script>
</body>
</html>`;
}

/**
 * Decide the sidebar badge from an analysis result. A badge shows only when the
 * risk is high/medium AND there is at least one warning-severity waste pattern.
 */
export function badgeFor(result: AnalysisResult): { tooltip: string; value: number } | undefined {
  const warningCount = result.wastePatterns.filter((w) => w.severity === "warning").length;
  if (warningCount === 0) return undefined;
  if (result.riskLevel === "high") {
    return { tooltip: "High risk — check context", value: warningCount };
  }
  if (result.riskLevel === "medium") {
    return { tooltip: "Medium risk", value: warningCount };
  }
  return undefined;
}
