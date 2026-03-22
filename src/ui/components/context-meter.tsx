import type { ContextWindowUsage } from "../../core/types.js";

interface Props {
  usage: ContextWindowUsage | null;
}

export function ContextMeter({ usage }: Props) {
  if (!usage) return null;

  const pct = usage.estimatedUsagePercent;
  const color =
    pct > 80
      ? "var(--vscode-editorError-foreground)"
      : pct > 50
        ? "var(--vscode-editorWarning-foreground)"
        : "var(--vscode-testing-iconPassed)";

  const tokensK = (usage.estimatedTokens / 1000).toFixed(1);
  const windowK = Math.round(usage.contextWindowTokens / 1000);

  return (
    <div style={{ marginBottom: "12px" }}>
      <h4 style={{ margin: "8px 0 4px", fontSize: "11px", opacity: 0.7, textTransform: "uppercase" }}>
        Context Window — {usage.toolDisplayName}
      </h4>
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
            width: `${Math.min(pct, 100)}%`,
            height: "100%",
            backgroundColor: color,
            borderRadius: "3px",
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <div style={{ fontSize: "11px", opacity: 0.7 }}>
        ~{tokensK}k of {windowK}k tokens ({pct}%)
      </div>
    </div>
  );
}
