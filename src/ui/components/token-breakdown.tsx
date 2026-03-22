import type { FileTokenBreakdown } from "../../core/types.js";

interface Props {
  breakdown: FileTokenBreakdown[];
}

const SOURCE_LABELS: Record<string, string> = {
  "active-file": "Active file",
  tab: "Tab",
  "selection-override": "Selection",
  "referenced-file": "Referenced",
  terminal: "Terminal",
};

export function TokenBreakdownPanel({ breakdown }: Props) {
  if (breakdown.length === 0) return null;

  const sorted = [...breakdown].sort(
    (a, b) => Math.abs(b.estimatedTokens.high) - Math.abs(a.estimatedTokens.high)
  );

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
          Token Breakdown ({breakdown.length} sources)
        </summary>
        <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 0 0" }}>
          {sorted.map((entry) => {
            const lowK = (entry.estimatedTokens.low / 1000).toFixed(1);
            const highK = (entry.estimatedTokens.high / 1000).toFixed(1);
            const fileName = entry.path.split("/").pop() ?? entry.path;
            const label = SOURCE_LABELS[entry.source] ?? entry.source;
            const isNegative = entry.estimatedTokens.low < 0;

            return (
              <li
                key={`${entry.source}-${entry.path}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "3px 8px",
                  fontSize: "12px",
                  opacity: isNegative ? 0.6 : 1,
                }}
              >
                <span style={{ flex: 1 }}>
                  {label}: {fileName}
                </span>
                <span style={{ flexShrink: 0, marginLeft: "8px" }}>
                  ~{lowK}k–{highK}k ({entry.percentage}%)
                </span>
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}
