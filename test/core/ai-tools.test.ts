import { describe, it, expect } from "vitest";
import { AI_TOOLS, getContextWindowTokens } from "../../src/core/ai-tools.js";
import type { AiToolId } from "../../src/core/types.js";

describe("AI_TOOLS registry", () => {
  it("contains all 7 tool definitions", () => {
    const ids: AiToolId[] = [
      "claude-code",
      "cursor",
      "copilot",
      "windsurf",
      "amazon-q",
      "gemini",
      "chatgpt",
    ];
    for (const id of ids) {
      expect(AI_TOOLS[id]).toBeDefined();
      expect(AI_TOOLS[id].id).toBe(id);
      expect(AI_TOOLS[id].displayName).toBeTypeOf("string");
      expect(AI_TOOLS[id].contextWindowTokens).toBeGreaterThan(0);
    }
  });

  it("every tool has instructionFiles and ignoreFiles arrays", () => {
    for (const tool of Object.values(AI_TOOLS)) {
      expect(Array.isArray(tool.instructionFiles)).toBe(true);
      expect(Array.isArray(tool.ignoreFiles)).toBe(true);
    }
  });

  it("tools with ignore files have at least one entry", () => {
    // These tools should have ignore files defined
    expect(AI_TOOLS["claude-code"].ignoreFiles).toContain(".claudeignore");
    expect(AI_TOOLS["cursor"].ignoreFiles).toContain(".cursorignore");
    expect(AI_TOOLS["windsurf"].ignoreFiles).toContain(".codeiumignore");
  });

  it("tools with instruction files have correct patterns", () => {
    expect(AI_TOOLS["claude-code"].instructionFiles).toContain("CLAUDE.md");
    expect(AI_TOOLS["cursor"].instructionFiles).toContain(".cursorrules");
    expect(AI_TOOLS["cursor"].instructionFiles).toContain(".cursor/rules");
    expect(AI_TOOLS["copilot"].instructionFiles).toContain(".github/copilot-instructions.md");
    expect(AI_TOOLS["windsurf"].instructionFiles).toContain(".windsurfrules");
    expect(AI_TOOLS["amazon-q"].instructionFiles).toContain(".amazonq/rules");
    expect(AI_TOOLS["gemini"].instructionFiles).toContain("GEMINI.md");
    expect(AI_TOOLS["chatgpt"].instructionFiles).toHaveLength(0);
  });

  it("haiku has a smaller context window than opus and sonnet", () => {
    const models = AI_TOOLS["claude-code"].models!;
    const haiku = models.find((m) => m.id === "haiku")!;
    const opus = models.find((m) => m.id === "opus")!;
    const sonnet = models.find((m) => m.id === "sonnet")!;
    expect(haiku.contextWindowTokens).toBeLessThan(opus.contextWindowTokens);
    expect(haiku.contextWindowTokens).toBeLessThan(sonnet.contextWindowTokens);
  });

  it("tabsAffectContext is false for CLI/paste tools", () => {
    expect(AI_TOOLS["claude-code"].tabsAffectContext).toBe(false);
    expect(AI_TOOLS["chatgpt"].tabsAffectContext).toBe(false);
    expect(AI_TOOLS["amazon-q"].tabsAffectContext).toBe(false);
  });

  it("tabsAffectContext is true for editor-integrated tools", () => {
    expect(AI_TOOLS["cursor"].tabsAffectContext).toBe(true);
    expect(AI_TOOLS["copilot"].tabsAffectContext).toBe(true);
    expect(AI_TOOLS["windsurf"].tabsAffectContext).toBe(true);
    expect(AI_TOOLS["gemini"].tabsAffectContext).toBe(true);
  });
});

describe("getContextWindowTokens", () => {
  it("returns default tool context window when no model specified", () => {
    expect(getContextWindowTokens("claude-code")).toBe(150_000);
    expect(getContextWindowTokens("cursor")).toBe(200_000);
    expect(getContextWindowTokens("copilot")).toBe(115_000);
    expect(getContextWindowTokens("gemini")).toBe(1_000_000);
  });

  it("returns model-specific context window when model exists", () => {
    expect(getContextWindowTokens("copilot", "gpt-4o")).toBe(128_000);
    expect(getContextWindowTokens("copilot", "gemini")).toBe(64_000);
    expect(getContextWindowTokens("copilot", "claude-sonnet")).toBe(200_000);
  });

  it("falls back to tool default when model ID is unknown", () => {
    expect(getContextWindowTokens("copilot", "unknown-model")).toBe(115_000);
    expect(getContextWindowTokens("claude-code", "unknown")).toBe(150_000);
  });

  it("falls back to tool default when tool has no models array", () => {
    expect(getContextWindowTokens("cursor", "some-model")).toBe(200_000);
  });

  it("returns claude model overrides", () => {
    expect(getContextWindowTokens("claude-code", "opus")).toBe(200_000);
    expect(getContextWindowTokens("claude-code", "sonnet")).toBe(200_000);
    expect(getContextWindowTokens("claude-code", "haiku")).toBe(100_000);
  });
});
