import type { RiskLevel } from "../../core/types.js";

const COLORS: Record<RiskLevel, string> = {
  low: "#4caf50",
  medium: "#ff9800",
  high: "#f44336",
};

const LABELS: Record<RiskLevel, string> = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
};

interface Props {
  level: RiskLevel;
}

export function RiskBadge({ level }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 0",
        marginBottom: "8px",
        borderBottom: "1px solid var(--vscode-widget-border)",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: "10px",
          height: "10px",
          borderRadius: "50%",
          backgroundColor: COLORS[level],
        }}
      />
      <span style={{ fontWeight: "bold", fontSize: "13px" }}>Prompt Risk: {LABELS[level]}</span>
    </div>
  );
}
