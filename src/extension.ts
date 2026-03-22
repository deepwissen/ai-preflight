import * as vscode from "vscode";
import { EventBus } from "./core/event-bus.js";
import { runPipeline } from "./core/pipeline.js";
import { estimateTokens, detectWaste, scoreRisk, detectPositiveSignals, detectToolAwareIssues } from "./core/analyzers/index.js";
import { ContextBridge } from "./platform/context-bridge.js";
import { SidebarProvider } from "./platform/sidebar-provider.js";
import { StatusBar } from "./platform/status-bar.js";
import { registerCommands } from "./platform/commands.js";
import { createDismissalTracker } from "./core/dismissal-tracker.js";
import type { DismissalStore } from "./core/dismissal-tracker.js";
import { registerChatParticipant } from "./platform/chat-participant.js";
import { OutcomeTracker } from "./core/outcome-tracker.js";
import type { OutcomeStore } from "./core/outcome-tracker.js";
import type { AnalyzerStep, SessionRecord } from "./core/types.js";

const DISMISSAL_KEY = "ai-preflight.dismissedSuggestions";

/**
 * AI Preflight — extension entry point.
 *
 * Wiring order:
 * 1. Create event bus (communication backbone)
 * 2. Create core pipeline (analysis logic)
 * 3. Create platform components (VS Code integration)
 * 4. Connect context changes → pipeline → UI updates
 * 5. Activate context collection
 */
export function activate(context: vscode.ExtensionContext): void {
  try {
    activateInternal(context);
  } catch (err) {
    console.error("[AI Preflight] Activation failed:", err);
    vscode.window.showErrorMessage(
      "AI Preflight failed to activate. Check Output panel for details."
    );
  }
}

function activateInternal(context: vscode.ExtensionContext): void {
  // 1. Event bus
  const eventBus = new EventBus();

  // 2. Analysis pipeline
  const pipelineSteps: AnalyzerStep[] = [
    estimateTokens,
    detectWaste,
    scoreRisk,
    detectPositiveSignals,
    detectToolAwareIssues,
  ];

  // 3. Platform components
  const contextBridge = new ContextBridge(eventBus);
  const sidebarProvider = new SidebarProvider(context.extensionUri, eventBus);
  const statusBar = new StatusBar(eventBus);

  // Register sidebar webview
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "ai-preflight.panel",
      sidebarProvider
    )
  );

  // 4. Dismissal tracking (persisted across restarts)
  const dismissalStore: DismissalStore = {
    load: () => context.workspaceState.get<string[]>(DISMISSAL_KEY, []),
    save: (ids) => { void context.workspaceState.update(DISMISSAL_KEY, ids); },
  };
  const dismissalTracker = createDismissalTracker(dismissalStore);

  // 4b. Outcome tracking (persisted across restarts)
  const OUTCOME_KEY = "ai-preflight.outcomeSessions";
  const outcomeStore: OutcomeStore = {
    loadSessions: () => context.workspaceState.get<SessionRecord[]>(OUTCOME_KEY, []),
    saveSessions: (sessions) => { void context.workspaceState.update(OUTCOME_KEY, sessions); },
  };
  const outcomeTracker = new OutcomeTracker(outcomeStore);

  // Register commands (after dismissalTracker so commands apply dismissals)
  registerCommands(context, eventBus, contextBridge, pipelineSteps, dismissalTracker);

  // Register @preflight chat participant (works with GitHub Copilot Chat)
  registerChatParticipant(context, contextBridge, pipelineSteps, dismissalTracker);

  // 5. Connect: context changes → pipeline → dismissals → results
  let lastSnapshot: import("./core/types.js").ContextSnapshot | null = null;

  eventBus.on("context:updated", (snapshot) => {
    lastSnapshot = snapshot;
    const result = runPipeline(snapshot, pipelineSteps);
    result.suggestions = dismissalTracker.apply(result.suggestions);

    // Attach outcome insights when sufficient data exists
    const summary = outcomeTracker.getSessionSummary();
    if (summary.totalAnalyses >= 5) {
      result.outcomeInsights = {
        summary,
        correlations: outcomeTracker.getCorrelations(),
      };
    }

    eventBus.emit("analysis:complete", result);
  });

  // Record analyses and signals for outcome intelligence
  eventBus.on("analysis:complete", (result) => {
    outcomeTracker.recordAnalysis(result);
  });
  eventBus.on("outcome:signal", (signal) => {
    outcomeTracker.recordSignal(signal);
  });
  eventBus.on("action:executed", (command) => {
    outcomeTracker.recordAction(command);
  });

  // Re-run pipeline after dismissal so UI updates immediately
  eventBus.on("suggestion:dismissed", (id) => {
    dismissalTracker.dismiss(id);
    if (lastSnapshot) {
      const result = runPipeline(lastSnapshot, pipelineSteps);
      result.suggestions = dismissalTracker.apply(result.suggestions);
      eventBus.emit("analysis:complete", result);
    }
  });

  // 6. Start context collection
  contextBridge.activate();

  // Cleanup
  context.subscriptions.push({
    dispose: () => {
      outcomeTracker.endSession();
      contextBridge.deactivate();
      statusBar.dispose();
      eventBus.removeAllListeners();
    },
  });

  console.log("[AI Preflight] Activated");
}

export function deactivate(): void {
  console.log("[AI Preflight] Deactivated");
}
