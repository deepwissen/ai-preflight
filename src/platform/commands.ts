import * as vscode from "vscode";
import type { AnalyzerStep } from "../core/types.js";
import { runPipeline } from "../core/pipeline.js";
import { exportContext } from "../core/context-export.js";
import type { ContextBridge } from "./context-bridge.js";
import { EventBus } from "../core/event-bus.js";

interface DismissalApplier {
  apply(suggestions: import("../core/types.js").Suggestion[]): import("../core/types.js").Suggestion[];
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
      vscode.window.showInformationMessage(
        "AI Preflight report copied to clipboard"
      );
    })
  );
}
