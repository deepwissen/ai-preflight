import { render } from "preact";
import { useState, useEffect } from "preact/hooks";
import type { AnalysisResult } from "../core/types.js";
import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from "../core/messages.js";
import { RiskBadge } from "./components/risk-badge.js";
import { ContextList } from "./components/context-list.js";
import { TokenDisplay } from "./components/token-display.js";
import { Suggestions } from "./components/suggestions.js";
import { PositiveSignals } from "./components/positive-signals.js";
import { ContextMeter } from "./components/context-meter.js";
import { TokenBreakdownPanel } from "./components/token-breakdown.js";
import { OutcomeInsights } from "./components/outcome-insights.js";

// VS Code webview API
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

function App() {
  const previousState = vscode.getState() as { result?: AnalysisResult } | null;
  const [result, setResult] = useState<AnalysisResult | null>(previousState?.result ?? null);

  useEffect(() => {
    const handler = (event: MessageEvent<ExtensionToWebviewMessage>) => {
      const message = event.data;
      if (message.type === "analysis-update") {
        setResult(message.data);
        vscode.setState({ result: message.data });
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  if (!result) {
    return <p style={{ opacity: 0.6 }}>Waiting for context...</p>;
  }

  return (
    <div>
      <RiskBadge level={result.riskLevel} />
      <ContextList result={result} />
      <TokenDisplay estimate={result.tokenEstimate} />
      <TokenBreakdownPanel breakdown={result.tokenBreakdown} />
      <ContextMeter usage={result.contextWindowUsage ?? null} />
      <PositiveSignals signals={result.positiveSignals} />
      <Suggestions
        suggestions={result.suggestions}
        toolAnnotations={result.toolAnnotations}
        onDismiss={(id) => {
          const msg: WebviewToExtensionMessage = { type: "dismiss-suggestion", id };
          vscode.postMessage(msg);
        }}
        onAction={(action) => {
          const msg: WebviewToExtensionMessage = {
            type: "execute-action",
            command: action.command,
            args: action.args,
          };
          vscode.postMessage(msg);
        }}
      />
      <OutcomeInsights insights={result.outcomeInsights} />
    </div>
  );
}

render(<App />, document.getElementById("root")!);
