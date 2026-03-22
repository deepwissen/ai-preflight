import type { OutcomeInsights as OutcomeInsightsType } from "../../core/types.js";

interface Props {
  insights?: OutcomeInsightsType;
}

export function OutcomeInsights({ insights }: Props) {
  if (!insights || insights.summary.totalAnalyses < 5) return null;

  const { summary, correlations } = insights;

  return (
    <div style={{ marginBottom: "12px" }}>
      <details>
        <summary
          style={{
            fontSize: "11px",
            opacity: 0.7,
            textTransform: "uppercase",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          Outcome Insights ({summary.sessionCount} sessions)
        </summary>
        <div style={{ padding: "4px 0" }}>
          <p style={{ fontSize: "12px", margin: "4px 0" }}>
            {summary.totalAnalyses} analyses | {summary.totalSignals} signals
          </p>
          <div style={{ fontSize: "11px", margin: "4px 0", opacity: 0.8 }}>
            Risk: {summary.riskDistribution.low} low, {summary.riskDistribution.medium} med,{" "}
            {summary.riskDistribution.high} high
          </div>
          {correlations.map((c) => (
            <div
              key={c.label}
              style={{
                fontSize: "11px",
                padding: "4px 0",
                borderTop: "1px solid var(--vscode-widget-border)",
              }}
            >
              <strong>{c.label}</strong>: {c.description}
              <span style={{ opacity: 0.5 }}> (n={c.sampleSize})</span>
            </div>
          ))}
          {correlations.length === 0 && (
            <div style={{ fontSize: "11px", opacity: 0.5, padding: "4px 0" }}>
              Not enough data for correlations yet
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
