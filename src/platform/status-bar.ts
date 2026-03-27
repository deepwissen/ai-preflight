import * as vscode from "vscode";
import type { AnalysisResult, RiskLevel } from "../core/types.js";
import { EventBus } from "../core/event-bus.js";

/**
 * Status bar indicator showing prompt risk level at a glance.
 * Click opens the sidebar panel.
 *
 * Shows: "$(icon) Preflight: LEVEL — reason"
 * Background: red for HIGH, yellow for MEDIUM, none for LOW.
 */
export class StatusBar {
  private item: vscode.StatusBarItem;

  constructor(private eventBus: EventBus) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = "ai-preflight.togglePanel";
    this.item.tooltip = "AI Preflight — click to open panel";
    this.setRisk("low");
    this.item.show();

    this.eventBus.on("analysis:complete", (result) => {
      this.update(result);
    });
  }

  update(result: AnalysisResult): void {
    const reason = getTopReason(result);
    this.setRisk(result.riskLevel, reason);

    // Set sidebar badge
    if (result.riskLevel === "high") {
      this.setBadge("!", "High risk — check AI Preflight");
    } else if (result.riskLevel === "medium") {
      this.setBadge("\u00b7", "Medium risk");
    } else {
      this.clearBadge();
    }
  }

  setRisk(level: RiskLevel, reason?: string): void {
    const labels: Record<RiskLevel, string> = {
      low: "$(pass) Preflight: LOW",
      medium: "$(warning) Preflight: MED",
      high: "$(error) Preflight: HIGH",
    };

    const backgrounds: Record<RiskLevel, vscode.ThemeColor | undefined> = {
      low: undefined,
      medium: new vscode.ThemeColor("statusBarItem.warningBackground"),
      high: new vscode.ThemeColor("statusBarItem.errorBackground"),
    };

    this.item.text = reason ? `${labels[level]} — ${reason}` : labels[level];
    this.item.backgroundColor = backgrounds[level];
  }

  private setBadge(value: string, _tooltip: string): void {
    try {
      // vscode.window.tabGroups isn't needed — use the views badge API
      void vscode.commands.executeCommand("setContext", "ai-preflight.riskBadge", value);
      // View badge via the webview view — stored for when sidebar resolves
      // Note: viewBadge is set on the WebviewView instance in sidebar-provider
    } catch {
      // Badge API may not be available in older VS Code versions
    }
  }

  private clearBadge(): void {
    void vscode.commands.executeCommand("setContext", "ai-preflight.riskBadge", "");
  }

  dispose(): void {
    this.item.dispose();
  }
}

/**
 * Picks the single most important reason to show in the status bar.
 * Keeps it short — max ~30 chars.
 */
function getTopReason(result: AnalysisResult): string | undefined {
  // Priority 1: truncation risk
  if (result.contextWindowUsage && result.contextWindowUsage.estimatedUsagePercent > 90) {
    return `${result.contextWindowUsage.estimatedUsagePercent}% context window`;
  }

  // Priority 2: first warning-severity waste pattern
  const warning = result.wastePatterns.find((w) => w.severity === "warning");
  if (warning) {
    const reasons: Record<string, string> = {
      "large-file": "large file open",
      "lock-file": "lock file open",
      "env-file": "env file open",
      "generated-file": "generated file open",
      "too-many-tabs": `${result.contextSummary.openTabCount} tabs open`,
      "data-file": "data file open",
      "no-selection-large-file": "no selection on large file",
      "conflict-markers": "conflict markers",
      "truncation-risk": "near context limit",
    };
    return reasons[warning.ruleId] ?? warning.ruleId;
  }

  return undefined;
}
