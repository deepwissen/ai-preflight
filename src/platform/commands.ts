import * as vscode from "vscode";
import type { AnalyzerStep } from "../core/types.js";
import { runPipeline } from "../core/pipeline.js";
import { exportContext } from "../core/context-export.js";
import type { ContextBridge } from "./context-bridge.js";
import { EventBus } from "../core/event-bus.js";
import { executeAction } from "./action-executor.js";

interface DismissalApplier {
  apply(
    suggestions: import("../core/types.js").Suggestion[]
  ): import("../core/types.js").Suggestion[];
}

/**
 * Registers command palette actions for AI Preflight.
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  eventBus: EventBus,
  contextBridge: ContextBridge,
  pipelineSteps: AnalyzerStep[],
  dismissalTracker?: DismissalApplier
): void {
  // AI Preflight: Analyze Context
  context.subscriptions.push(
    vscode.commands.registerCommand("ai-preflight.analyze", () => {
      const snapshot = contextBridge.captureNow();
      const result = runPipeline(snapshot, pipelineSteps);
      if (dismissalTracker) {
        result.suggestions = dismissalTracker.apply(result.suggestions);
      }
      eventBus.emit("analysis:complete", result);

      // Ensure sidebar is visible
      vscode.commands.executeCommand("ai-preflight.panel.focus");
    })
  );

  // AI Preflight: Toggle Panel
  context.subscriptions.push(
    vscode.commands.registerCommand("ai-preflight.togglePanel", () => {
      vscode.commands.executeCommand("ai-preflight.panel.focus");
    })
  );

  // AI Preflight: Export Context
  context.subscriptions.push(
    vscode.commands.registerCommand("ai-preflight.exportContext", () => {
      const snapshot = contextBridge.captureNow();
      const result = runPipeline(snapshot, pipelineSteps);
      if (dismissalTracker) {
        result.suggestions = dismissalTracker.apply(result.suggestions);
      }
      const markdown = exportContext(snapshot, result);
      vscode.env.clipboard.writeText(markdown);
      vscode.window.showInformationMessage("AI Preflight report copied to clipboard");
    })
  );

  // AI Preflight: Open Files (internal — used by chat participant buttons)
  context.subscriptions.push(
    vscode.commands.registerCommand("ai-preflight.openFiles", async (paths: string[]) => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) return;
      for (const p of paths) {
        try {
          const uri = vscode.Uri.joinPath(folder.uri, p);
          await vscode.window.showTextDocument(uri, { preserveFocus: true, preview: false });
        } catch {
          // File may have been deleted or moved since analysis — skip it
        }
      }
    })
  );

  // AI Preflight: Copy #file References (internal — used by chat participant buttons)
  context.subscriptions.push(
    vscode.commands.registerCommand("ai-preflight.copyFileRefs", async (paths: string[]) => {
      const refs = paths.map((p) => `#file:${p}`).join(" ");
      await vscode.env.clipboard.writeText(refs);
      vscode.window.showInformationMessage(
        `Copied ${paths.length} #file reference(s) — paste into your Copilot prompt`
      );
    })
  );

  // AI Preflight: Close Waste Tabs (internal — used by chat participant buttons)
  context.subscriptions.push(
    vscode.commands.registerCommand("ai-preflight.closeWasteTabs", async (paths: string[]) => {
      await executeAction("ai-preflight.action.closeWasteTabs", { paths });
    })
  );

  // AI Preflight: Create Focused View (internal — used by chat participant buttons)
  context.subscriptions.push(
    vscode.commands.registerCommand("ai-preflight.createFocusedView", async (files: string[]) => {
      await executeAction("ai-preflight.action.createFocusedView", { files });
    })
  );
}
