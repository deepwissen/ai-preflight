import type { BudgetBand, ContextWindowUsage } from "../../core/types.js";

interface Props {
  usage: ContextWindowUsage | null;
}

const BAND_META: Record<BudgetBand, { label: string; color: string; hint: string }> = {
  lean: {
    label: "Lean",
    color: "var(--vscode-testing-iconPassed)",
    hint: "focused context",
  },
  heavy: {
    label: "Heavy",
    color: "var(--vscode-editorWarning-foreground)",
    hint: "quality degrades as context grows",
  },
  bloated: {
    label: "Bloated",
    color: "var(--vscode-editorError-foreground)",
    hint: "context rot — models stop using it all",
  },
};

export function ContextMeter({ usage }: Props) {
  if (!usage) return null;

  const band = BAND_META[usage.budgetBand];

  // Budget bar fills relative to the "bloated" threshold — shows how close the
  // absolute token count is to context-rot territory, independent of the window.
  const budgetPct = Math.min((usage.estimatedTokens / usage.budgetThresholds.bloated) * 100, 100);

  const tokensK = (usage.estimatedTokens / 1000).toFixed(1);
  const windowK = Math.round(usage.contextWindowTokens / 1000);
  const pct = usage.estimatedUsagePercent;

  return (
    <div style={{ marginBottom: "12px" }}>
      <h4
        style={{ margin: "8px 0 4px", fontSize: "11px", opacity: 0.7, textTransform: "uppercase" }}
      >
        Context Budget — {usage.toolDisplayName}
      </h4>

      <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "4px" }}>
        <span style={{ fontSize: "13px", fontWeight: 600, color: band.color }}>{band.label}</span>
        <span style={{ fontSize: "11px", opacity: 0.7 }}>
          ~{tokensK}k tokens — {band.hint}
        </span>
      </div>

      <div
        style={{
          height: "6px",
          backgroundColor: "var(--vscode-editorWidget-background)",
          borderRadius: "3px",
          overflow: "hidden",
          marginBottom: "4px",
        }}
      >
        <div
          style={{
            width: `${budgetPct}%`,
            height: "100%",
            backgroundColor: band.color,
            borderRadius: "3px",
            transition: "width 0.3s ease",
          }}
        />
      </div>

      {/* Secondary: physical fit / truncation risk against the actual window. */}
      <div style={{ fontSize: "11px", opacity: 0.55 }}>
        {pct}% of {windowK}k window {pct > 90 ? "— may truncate" : "— fits"}
      </div>
    </div>
  );
}
