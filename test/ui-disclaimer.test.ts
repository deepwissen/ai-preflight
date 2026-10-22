import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DETECTION_DISCLAIMER } from "@deepwissen/preflight-core";

// There is no webview render harness here, so enforce the recall disclaimer at
// the source level: the panel must import and render it, and it must never be
// removed — a clean/positive panel that reads as "no secrets present" is the leak.
describe("webview — recall disclaimer is wired (structural)", () => {
  const app = readFileSync(new URL("../src/ui/app.tsx", import.meta.url), "utf8");

  it("app.tsx imports DETECTION_DISCLAIMER from the engine", () => {
    expect(app).toMatch(
      /import\s*\{[^}]*DETECTION_DISCLAIMER[^}]*\}\s*from\s*"@deepwissen\/preflight-core"/
    );
  });

  it("app.tsx renders it (always, so no clean view ships without it)", () => {
    expect(app).toContain("{DETECTION_DISCLAIMER}");
  });

  it("the engine disclaimer states a clean scan is not proof of no secrets", () => {
    expect(DETECTION_DISCLAIMER).toMatch(/does NOT mean none are present/i);
  });
});
