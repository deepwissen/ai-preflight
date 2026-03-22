import type { Suggestion, SuggestionAction, WasteAnnotation } from "../../core/types.js";

interface Props {
  suggestions: Suggestion[];
  onDismiss: (id: string) => void;
  onAction?: (action: SuggestionAction) => void;
  toolAnnotations?: Record<string, WasteAnnotation>;
}

export function Suggestions({ suggestions, onDismiss, onAction, toolAnnotations }: Props) {
  const visible = suggestions.filter(
    (s) => !s.dismissed && !toolAnnotations?.[s.id]?.suppressed
  );

  if (visible.length === 0) return null;

  return (
    <div style={{ marginBottom: "12px" }}>
      <h4 style={{ margin: "8px 0 4px", fontSize: "11px", opacity: 0.7, textTransform: "uppercase" }}>
        Suggestions
      </h4>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {visible.map((s) => (
          <li
            key={s.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              padding: "6px 8px",
              marginBottom: "4px",
              fontSize: "12px",
              backgroundColor: "var(--vscode-textBlockQuote-background)",
              borderRadius: "3px",
            }}
          >
            <span style={{ flex: 1 }}>{s.text}</span>
            {s.action && onAction && (
              <button
                onClick={() => onAction(s.action!)}
                style={{
                  background: "var(--vscode-button-background)",
                  color: "var(--vscode-button-foreground)",
                  border: "none",
                  borderRadius: "3px",
                  cursor: "pointer",
                  padding: "2px 8px",
                  fontSize: "11px",
                  marginLeft: "8px",
                  flexShrink: 0,
                }}
              >
                {s.action.label}
              </button>
            )}
            <button
              onClick={() => onDismiss(s.id)}
              style={{
                background: "none",
                border: "none",
                color: "var(--vscode-foreground)",
                cursor: "pointer",
                opacity: 0.5,
                padding: "0 4px",
                fontSize: "14px",
                marginLeft: "8px",
                flexShrink: 0,
              }}
              title="Dismiss"
            >
              &times;
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
