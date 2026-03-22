import * as vscode from "vscode";
import type { AnalysisResult } from "../core/types.js";
import type {
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
} from "../core/messages.js";
import { EventBus } from "../core/event-bus.js";
import { executeAction } from "./action-executor.js";

/**
 * Provides the webview panel for the AI Preflight sidebar.
 * Listens for analysis results and pushes them to the webview.
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private extensionUri: vscode.Uri,
    private eventBus: EventBus
  ) {
    this.eventBus.on("analysis:complete", (result) => {
      this.update(result);
    });
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    // Handle messages from webview (typed protocol)
    webviewView.webview.onDidReceiveMessage(async (message: WebviewToExtensionMessage) => {
      if (message.type === "dismiss-suggestion") {
        this.eventBus.emit("suggestion:dismissed", message.id);
      } else if (message.type === "execute-action") {
        await executeAction(message.command, message.args);
        this.eventBus.emit("action:executed", message.command);
      }
    });
  }

  /** Push updated analysis result to the webview. */
  update(result: AnalysisResult): void {
    const message: ExtensionToWebviewMessage = {
      type: "analysis-update",
      data: result,
    };
    this.view?.webview.postMessage(message);

    // Update sidebar badge — shows warning count for HIGH/MEDIUM risk
    if (this.view) {
      const warningCount = result.wastePatterns.filter(w => w.severity === "warning").length;
      if (result.riskLevel === "high" && warningCount > 0) {
        this.view.badge = { tooltip: "High risk — check context", value: warningCount };
      } else if (result.riskLevel === "medium" && warningCount > 0) {
        this.view.badge = { tooltip: "Medium risk", value: warningCount };
      } else {
        this.view.badge = undefined;
      }
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js")
    );

    const nonce = getNonce();

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
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
