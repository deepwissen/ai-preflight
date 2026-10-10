import * as vscode from "vscode";
import type { AnalysisResult } from "@deepwissen/preflight-core";
import type {
  ExtensionToWebviewMessage,
  WebviewToExtensionMessage,
} from "@deepwissen/preflight-core";
import { EventBus } from "@deepwissen/preflight-core";
import { executeAction } from "./action-executor.js";
import { badgeFor, buildWebviewHtml, getNonce } from "./sidebar-helpers.js";

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
      this.view.badge = badgeFor(result);
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js")
    );
    return buildWebviewHtml(scriptUri.toString(), getNonce());
  }
}
