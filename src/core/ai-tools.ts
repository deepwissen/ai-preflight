import type { AiToolId } from "./types.js";

/**
 * AI tool registry — pure data, no VS Code imports.
 * Contains context window sizes, instruction file patterns,
 * ignore files, and model variants for each supported AI tool.
 */

export interface AiToolModel {
  id: string;
  displayName: string;
  contextWindowTokens: number;
}

export interface AiToolDefinition {
  id: AiToolId;
  displayName: string;
  provider: string;
  contextWindowTokens: number;
  instructionFiles: string[];
  ignoreFiles: string[];
  tabsAffectContext: boolean;
  models?: AiToolModel[];
}

export const AI_TOOLS: Record<AiToolId, AiToolDefinition> = {
  "claude-code": {
    id: "claude-code",
    displayName: "Claude Code",
    provider: "Anthropic",
    contextWindowTokens: 150_000,
    instructionFiles: ["CLAUDE.md"],
    ignoreFiles: [".claudeignore"],
    tabsAffectContext: false,
    models: [
      { id: "opus", displayName: "Claude Opus", contextWindowTokens: 200_000 },
      { id: "sonnet", displayName: "Claude Sonnet", contextWindowTokens: 200_000 },
      { id: "haiku", displayName: "Claude Haiku", contextWindowTokens: 100_000 },
    ],
  },
  cursor: {
    id: "cursor",
    displayName: "Cursor",
    provider: "Anysphere",
    contextWindowTokens: 200_000,
    instructionFiles: [".cursorrules", ".cursor/rules"],
    ignoreFiles: [".cursorignore"],
    tabsAffectContext: true,
  },
  copilot: {
    id: "copilot",
    displayName: "GitHub Copilot",
    provider: "Microsoft/GitHub",
    contextWindowTokens: 115_000,
    instructionFiles: [".github/copilot-instructions.md"],
    ignoreFiles: [],
    tabsAffectContext: true,
    models: [
      { id: "gpt-4o", displayName: "GPT-4o", contextWindowTokens: 128_000 },
      { id: "gemini", displayName: "Gemini", contextWindowTokens: 64_000 },
      { id: "claude-sonnet", displayName: "Claude Sonnet", contextWindowTokens: 200_000 },
    ],
  },
  windsurf: {
    id: "windsurf",
    displayName: "Windsurf",
    provider: "Codeium",
    contextWindowTokens: 120_000,
    instructionFiles: [".windsurfrules"],
    ignoreFiles: [".codeiumignore"],
    tabsAffectContext: true,
  },
  "amazon-q": {
    id: "amazon-q",
    displayName: "Amazon Q",
    provider: "AWS",
    contextWindowTokens: 75_000,
    instructionFiles: [".amazonq/rules"],
    ignoreFiles: [],
    tabsAffectContext: false,
  },
  gemini: {
    id: "gemini",
    displayName: "Gemini",
    provider: "Google",
    contextWindowTokens: 1_000_000,
    instructionFiles: ["GEMINI.md"],
    ignoreFiles: [],
    tabsAffectContext: true,
  },
  chatgpt: {
    id: "chatgpt",
    displayName: "ChatGPT",
    provider: "OpenAI",
    contextWindowTokens: 127_000,
    instructionFiles: [],
    ignoreFiles: [],
    tabsAffectContext: false,
  },
};

/**
 * Returns the effective context window size, considering an optional model override.
 */
export function getContextWindowTokens(toolId: AiToolId, modelId?: string): number {
  const tool = AI_TOOLS[toolId];
  if (!tool) return 0;
  if (modelId && tool.models) {
    const model = tool.models.find((m) => m.id === modelId);
    if (model) return model.contextWindowTokens;
  }
  return tool.contextWindowTokens;
}
