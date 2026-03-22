import type { TokenEstimate } from "../../core/types.js";

interface Props {
  estimate: TokenEstimate;
}

export function TokenDisplay({ estimate }: Props) {
  const lowK = (estimate.low / 1000).toFixed(1);
  const highK = (estimate.high / 1000).toFixed(1);

  return (
    <div style={{ marginBottom: "12px" }}>
      <h4
        style={{ margin: "8px 0 4px", fontSize: "11px", opacity: 0.7, textTransform: "uppercase" }}
      >
        Prompt Estimate
      </h4>
      <p style={{ margin: "4px 0", fontSize: "13px" }}>
        ~{lowK}k &ndash; {highK}k tokens
      </p>
      <p style={{ margin: "2px 0", fontSize: "11px", opacity: 0.6 }}>
        Confidence: {estimate.confidence}
      </p>
    </div>
  );
}
