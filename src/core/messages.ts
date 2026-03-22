import type { AnalysisResult } from "./types.js";

/**
 * Shared message protocol between extension host and webview.
 *
 * Both sidebar-provider.ts and app.tsx must use these types.
 * This prevents silent breakage when the AnalysisResult shape changes.
 */

// ─── Extension → Webview ──────────────────────────────────────────

export interface AnalysisUpdateMessage {
  type: "analysis-update";
  data: AnalysisResult;
}

// ─── Webview → Extension ──────────────────────────────────────────

export interface DismissSuggestionMessage {
  type: "dismiss-suggestion";
  id: string;
}

export interface ExecuteActionMessage {
  type: "execute-action";
  command: string;
  args?: Record<string, unknown>;
}

// ─── Union type for all messages ──────────────────────────────────

export type ExtensionToWebviewMessage = AnalysisUpdateMessage;

export type WebviewToExtensionMessage = DismissSuggestionMessage | ExecuteActionMessage;
