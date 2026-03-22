import type { PositiveSignal } from "../../core/types.js";

interface Props {
  signals: PositiveSignal[];
}

export function PositiveSignals({ signals }: Props) {
  if (signals.length === 0) return null;

  return (
    <div style={{ marginBottom: "12px" }}>
      <h4
        style={{
          margin: "8px 0 4px",
          fontSize: "11px",
          opacity: 0.7,
          textTransform: "uppercase",
        }}
      >
        What's Working
      </h4>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {signals.map((s) => (
          <li
            key={s.id}
            style={{
              padding: "4px 8px",
              marginBottom: "3px",
              fontSize: "12px",
              backgroundColor: "var(--vscode-textBlockQuote-background)",
              borderRadius: "3px",
              borderLeft: "3px solid #4caf50",
            }}
          >
            <span style={{ fontWeight: "bold" }}>{s.label}</span>
            <span style={{ opacity: 0.7 }}> — {s.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
