import * as vscode from "vscode";
import type {
  AnalysisResult,
  AnalyzerStep,
  PromptAnalysis,
  WastePattern,
  WorkspaceMatch,
} from "../core/types.js";
import { ContextBridge } from "./context-bridge.js";
import { runPipeline } from "../core/pipeline.js";
import type { createDismissalTracker } from "../core/dismissal-tracker.js";
import { analyzePrompt, extractIntentKeywords } from "../core/analyzers/prompt-analyzer.js";
import { searchWorkspace } from "./workspace-searcher.js";
import {
  rankWorkspaceMatches,
  groupWorkspaceMatches,
  formatMatchReason,
} from "../core/analyzers/workspace-ranker.js";

type DismissalTracker = ReturnType<typeof createDismissalTracker>;

/**
 * Registers @preflight as a chat participant in GitHub Copilot Chat.
 * Users type "@preflight refactor auth" to get prompt-aware context analysis.
 */
export function registerChatParticipant(
  context: vscode.ExtensionContext,
  contextBridge: ContextBridge,
  pipelineSteps: AnalyzerStep[],
  dismissalTracker: DismissalTracker
): void {
  const participant = vscode.chat.createChatParticipant(
    "ai-preflight.preflight",
    async (request, _chatContext, response, token) => {
      const snapshot = contextBridge.captureNow();
      const result = runPipeline(snapshot, pipelineSteps);
      result.suggestions = dismissalTracker.apply(result.suggestions);

      let promptAnalysis: PromptAnalysis | null = null;

      if (request.prompt.trim()) {
        // Extract keywords for workspace search
        const { high: highKeywords, all: allKeywords } = extractIntentKeywords(request.prompt);

        // Build set of open tab paths
        const openTabPaths = new Set<string>();
        for (const tab of snapshot.openTabs) {
          openTabPaths.add(tab.path);
        }
        if (snapshot.activeFile) {
          openTabPaths.add(snapshot.activeFile.path);
        }

        // Workspace search — wrapped in try/catch so prompt analysis still runs on failure
        let ranked: WorkspaceMatch[] = [];
        try {
          const activeEditor = vscode.window.activeTextEditor;
          const activeFileContent = activeEditor?.document.getText() ?? null;
          const activeFilePath = activeEditor?.document.uri.fsPath ?? null;

          const workspaceMatches = await searchWorkspace({
            keywords: highKeywords.length > 0 ? highKeywords : allKeywords,
            openTabPaths,
            activeFileContent,
            activeFilePath,
            token,
          });

          ranked = rankWorkspaceMatches(workspaceMatches);
        } catch {
          // Workspace search failed — continue with prompt analysis without workspace matches
        }

        promptAnalysis = analyzePrompt(request.prompt, snapshot, result, ranked);
      }

      renderResponse(response, result, promptAnalysis);
    }
  );

  participant.iconPath = new vscode.ThemeIcon("search-fuzzy");

  context.subscriptions.push(participant);
}

const CLOSEABLE_WASTE_RULES = new Set(["lock-file", "env-file", "data-file", "generated-file"]);

function collectWasteTabPaths(wastePatterns: WastePattern[], extraPaths?: string[]): string[] {
  const paths = new Set<string>();
  for (const wp of wastePatterns) {
    if (CLOSEABLE_WASTE_RULES.has(wp.ruleId)) paths.add(wp.source);
  }
  if (extraPaths) for (const p of extraPaths) paths.add(p);
  return [...paths];
}

function renderResponse(
  response: vscode.ChatResponseStream,
  result: AnalysisResult,
  promptAnalysis?: PromptAnalysis | null
): void {
  // Risk badge
  const riskIcon =
    result.riskLevel === "low"
      ? "$(pass)"
      : result.riskLevel === "medium"
        ? "$(warning)"
        : "$(error)";
  response.markdown(`## ${riskIcon} Prompt Risk: **${result.riskLevel.toUpperCase()}**\n\n`);

  // Token estimate
  const lowK = (result.tokenEstimate.low / 1000).toFixed(1);
  const highK = (result.tokenEstimate.high / 1000).toFixed(1);
  response.markdown(
    `**Prompt Estimate:** ~${lowK}k – ${highK}k tokens (${result.tokenEstimate.confidence} confidence)\n\n`
  );

  // Context window usage
  if (result.contextWindowUsage) {
    const u = result.contextWindowUsage;
    const usedK = (u.estimatedTokens / 1000).toFixed(1);
    const totalK = (u.contextWindowTokens / 1000).toFixed(0);
    response.markdown(
      `**Context Window — ${u.toolDisplayName}:** ~${usedK}k of ${totalK}k tokens (${u.estimatedUsagePercent}%)\n\n`
    );
  }

  // Context sources
  response.markdown("### Context Sources\n");
  if (result.contextSummary.activeFileName) {
    response.markdown(`- **Active file:** \`${result.contextSummary.activeFileName}\`\n`);
  }
  if (result.contextSummary.selectionLines) {
    response.markdown(`- **Selection:** ${result.contextSummary.selectionLines} lines\n`);
  }
  if (result.contextSummary.openTabCount > 0) {
    response.markdown(
      `- **Open tabs:** ${result.contextSummary.openTabCount} (${result.contextSummary.openTabNames.join(", ")})\n`
    );
  }
  response.markdown("\n");

  // Token breakdown
  if (result.tokenBreakdown.length > 0) {
    response.markdown("### Token Breakdown\n");
    const sorted = [...result.tokenBreakdown].sort((a, b) => b.percentage - a.percentage);
    for (const entry of sorted) {
      if (entry.percentage === 0) continue;
      const eLow = (entry.estimatedTokens.low / 1000).toFixed(1);
      const eHigh = (entry.estimatedTokens.high / 1000).toFixed(1);
      response.markdown(
        `- \`${entry.path}\` (${entry.source}): ~${eLow}k–${eHigh}k tokens (${entry.percentage}%)\n`
      );
    }
    response.markdown("\n");
  }

  // Waste patterns
  if (result.wastePatterns.length > 0) {
    response.markdown("### Waste Detected\n");
    for (const wp of result.wastePatterns) {
      const icon = wp.severity === "warning" ? "$(warning)" : "$(info)";
      response.markdown(`- ${icon} **${wp.ruleId}:** ${wp.description}\n`);
    }
    response.markdown("\n");

    const wasteTabPaths = collectWasteTabPaths(
      result.wastePatterns,
      promptAnalysis?.unnecessaryFiles
    );
    if (wasteTabPaths.length > 0) {
      response.button({
        title: `Close ${wasteTabPaths.length} Waste Tab(s)`,
        command: "ai-preflight.closeWasteTabs",
        arguments: [wasteTabPaths],
      });
    }
  }

  // Positive signals
  if (result.positiveSignals.length > 0) {
    response.markdown("### What's Working\n");
    for (const ps of result.positiveSignals) {
      response.markdown(`- $(pass) **${ps.label}** — ${ps.description}\n`);
    }
    response.markdown("\n");
  }

  // Suggestions
  const active = result.suggestions.filter((s) => !s.dismissed);
  if (active.length > 0) {
    response.markdown("### Suggestions\n");
    for (const s of active) {
      response.markdown(`${s.priority}. ${s.text}\n`);
    }
    response.markdown("\n");
  }

  // ─── Prompt-Aware Analysis ("For This Task" section) ───────────
  if (promptAnalysis && promptAnalysis.intentKeywords.length > 0) {
    response.markdown("---\n\n### For This Task\n\n");

    // Task type
    if (promptAnalysis.taskType) {
      response.markdown(`**Task type:** ${promptAnalysis.taskType}\n\n`);
    }

    // Context-intent match
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (promptAnalysis.matchingFiles.length > 0) {
      response.markdown("$(pass) **Likely relevant files:** ");
      for (let i = 0; i < promptAnalysis.matchingFiles.length; i++) {
        const f = promptAnalysis.matchingFiles[i];
        if (workspaceFolder) {
          const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, f);
          response.anchor(fileUri, f.split("/").pop() ?? f);
          response.reference(fileUri);
        } else {
          response.markdown(`\`${f.split("/").pop()}\``);
        }
        if (i < promptAnalysis.matchingFiles.length - 1) {
          response.markdown(", ");
        }
      }
      response.markdown("\n");
      if (workspaceFolder) {
        response.button({
          title: "Copy #file References",
          command: "ai-preflight.copyFileRefs",
          arguments: [promptAnalysis.matchingFiles],
        });
        if (promptAnalysis.workspaceMatches.length === 0) {
          response.button({
            title: "Create Focused View",
            command: "ai-preflight.createFocusedView",
            arguments: [promptAnalysis.matchingFiles],
          });
        }
      }
    } else {
      response.markdown(
        "$(warning) **No matching files found** — open files don't appear to match your prompt\n"
      );
    }
    response.markdown("\n");

    // Missing context
    if (promptAnalysis.missingFiles.length > 0) {
      response.markdown("$(info) **Possible missing dependencies:**\n");
      for (const f of promptAnalysis.missingFiles) {
        response.markdown(`  - ${f}\n`);
      }
      response.markdown("\n");
    }

    // Low relevance context
    if (promptAnalysis.unnecessaryFiles.length > 0) {
      const names = promptAnalysis.unnecessaryFiles
        .map((f) => `\`${f.split("/").pop()}\``)
        .join(", ");
      response.markdown(`$(info) **Low relevance to prompt:** ${names}\n`);
      if (promptAnalysis.wastedTokenEstimate.high > 0) {
        const wLow = (promptAnalysis.wastedTokenEstimate.low / 1000).toFixed(1);
        const wHigh = (promptAnalysis.wastedTokenEstimate.high / 1000).toFixed(1);
        response.markdown(`  (~${wLow}k–${wHigh}k tokens unlikely related to this task)\n`);
      }
      response.markdown("\n");
    }

    // Workspace matches — found in workspace but not open
    if (promptAnalysis.workspaceMatches.length > 0) {
      const { strong, possible } = groupWorkspaceMatches(promptAnalysis.workspaceMatches);

      if (strong.length > 0) {
        response.markdown("$(search) **Found in workspace (strongly related):**\n");
        for (const m of strong) {
          response.markdown("  - ");
          if (workspaceFolder) {
            const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, m.path);
            response.anchor(fileUri, m.path);
            response.reference(fileUri);
          } else {
            response.markdown(`\`${m.path}\``);
          }
          response.markdown(` — ${formatMatchReason(m)}\n`);
        }
        response.markdown("\n");
      }

      if (possible.length > 0) {
        response.markdown("$(search) **Found in workspace (possibly related):**\n");
        for (const m of possible) {
          response.markdown("  - ");
          if (workspaceFolder) {
            const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, m.path);
            if (m.contentMatch && m.contentMatch.lineNumber != null) {
              const location = new vscode.Location(
                fileUri,
                new vscode.Position(m.contentMatch.lineNumber - 1, 0)
              );
              response.anchor(location, m.path);
            } else {
              response.anchor(fileUri, m.path);
            }
            response.reference(fileUri);
          } else {
            response.markdown(`\`${m.path}\``);
          }
          if (m.contentMatch && m.contentMatch.preview) {
            response.markdown(` — ${formatMatchReason(m)} (line ${m.contentMatch.lineNumber})\n`);
            response.markdown(`    > ${m.contentMatch.preview}\n`);
          } else {
            response.markdown(` — ${formatMatchReason(m)}\n`);
          }
        }
        response.markdown("\n");
      }

      // Action buttons and tips
      if (strong.length > 0 && workspaceFolder) {
        const strongPaths = strong.map((m) => m.path);
        response.button({
          title: "Copy #file References",
          command: "ai-preflight.copyFileRefs",
          arguments: [strongPaths],
        });
        response.button({
          title: "Open All Strongly Related Files",
          command: "ai-preflight.openFiles",
          arguments: [strongPaths],
        });
        const focusedFiles = [...promptAnalysis.matchingFiles, ...strongPaths];
        if (focusedFiles.length > 0) {
          response.button({
            title: "Create Focused View",
            command: "ai-preflight.createFocusedView",
            arguments: [focusedFiles],
          });
        }
        response.markdown(
          `\n$(lightbulb) **Tip:** Paste the copied \`#file\` references into your Copilot prompt to include these files as context\n\n`
        );
      } else if (strong.length > 0) {
        response.markdown(
          `$(lightbulb) **Tip:** Add these files to your prompt with \`#file:path\` to include them as Copilot context\n\n`
        );
      } else if (possible.length > 0) {
        response.markdown(
          `$(lightbulb) **Tip:** ${possible.length} possibly related file(s) found — add with \`#file:path\` if they'd help with this task\n\n`
        );
      }
    }

    // Task-relevant tokens
    if (promptAnalysis.relevantTokenEstimate.high > 0) {
      const rLow = (promptAnalysis.relevantTokenEstimate.low / 1000).toFixed(1);
      const rHigh = (promptAnalysis.relevantTokenEstimate.high / 1000).toFixed(1);
      response.markdown(`**Task-relevant tokens:** ~${rLow}k–${rHigh}k\n\n`);
    }

    // Scope hint
    if (promptAnalysis.scopeHint) {
      response.markdown(`$(lightbulb) ${promptAnalysis.scopeHint}\n\n`);
    }
  }
}
