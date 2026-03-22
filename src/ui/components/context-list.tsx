import type { AnalysisResult } from "../../core/types.js";

interface Props {
  result: AnalysisResult;
}

export function ContextList({ result }: Props) {
  const { contextSummary } = result;

  return (
    <div style={{ marginBottom: "12px" }}>
      <h4
        style={{ margin: "8px 0 4px", fontSize: "11px", opacity: 0.7, textTransform: "uppercase" }}
      >
        Context Sources
      </h4>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {/* Active file */}
        {contextSummary.activeFileName && (
          <li style={{ padding: "2px 0", fontSize: "12px" }}>
            {"\u{1F4C4}"} {contextSummary.activeFileName}
            {contextSummary.selectionLines
              ? ` (${contextSummary.selectionLines} lines selected)`
              : ""}
          </li>
        )}

        {/* Open tabs — always show count */}
        <li style={{ padding: "2px 0", fontSize: "12px" }}>
          {"\u{1F4D1}"} {contextSummary.openTabCount} tab
          {contextSummary.openTabCount !== 1 ? "s" : ""} open
          {contextSummary.openTabCount > 10 && (
            <span style={{ color: "var(--vscode-editorWarning-foreground)" }}> — too many</span>
          )}
        </li>

        {/* Tab names (collapsed if many) */}
        {contextSummary.openTabCount > 0 && contextSummary.openTabCount <= 8 && (
          <li style={{ padding: "2px 0 2px 20px", fontSize: "11px", opacity: 0.6 }}>
            {contextSummary.openTabNames.join(", ")}
          </li>
        )}
        {contextSummary.openTabCount > 8 && (
          <li style={{ padding: "2px 0 2px 20px", fontSize: "11px", opacity: 0.6 }}>
            {contextSummary.openTabNames.slice(0, 6).join(", ")}
            {` + ${contextSummary.openTabCount - 6} more`}
          </li>
        )}
      </ul>

      {/* Waste patterns */}
      {result.wastePatterns.filter((wp) => !result.toolAnnotations?.[wp.ruleId]?.suppressed)
        .length > 0 && (
        <>
          <h4
            style={{
              margin: "10px 0 4px",
              fontSize: "11px",
              opacity: 0.7,
              textTransform: "uppercase",
            }}
          >
            Issues
          </h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {result.wastePatterns
              .filter((wp) => !result.toolAnnotations?.[wp.ruleId]?.suppressed)
              .map((wp) => (
                <li
                  key={wp.ruleId}
                  style={{
                    padding: "2px 0",
                    fontSize: "12px",
                    color:
                      wp.severity === "warning"
                        ? "var(--vscode-editorWarning-foreground)"
                        : "inherit",
                  }}
                >
                  {wp.severity === "warning" ? "\u26a0" : "\u2139"} {wp.description}
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}
