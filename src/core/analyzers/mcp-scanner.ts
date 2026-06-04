import type { AnalysisResult, ContextSnapshot, InstructionFileIssue } from "../types.js";
import { shannonEntropy } from "./secret-scanner.js";

const MAX_FINDINGS_PER_CONFIG = 20;

// ─── Shared Patterns (from integrity-scanner + secret-scanner) ───

/* eslint-disable no-misleading-character-class */
const HIDDEN_UNICODE = /[\u200B\u200C\u200D\u2060\u00AD\u034F\u17B4\u17B5\u180E\u2062\u2063\u2064]/;
/* eslint-enable no-misleading-character-class */
const TAG_CHARS = /[\u{E0001}-\u{E007F}]/u;
const BIDI_OVERRIDES = /[\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069\u061C\u200E\u200F]/;
const SUSPICIOUS_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+(instructions|rules|guidelines)/i,
  /disregard\s+(all\s+)?(above|previous|prior)\s+(instructions|rules)/i,
  /(?:new|override|replace)\s+instructions?\s*:/i,
  /^\s*system\s*:/im,
];

const PROVIDER_PREFIXES: Array<{ label: string; pattern: RegExp }> = [
  { label: "AWS Access Key", pattern: /(?:AKIA|ASIA)[0-9A-Z]{16}/ },
  { label: "GitHub Token", pattern: /gh[porsut]_[a-zA-Z0-9]{36}/ },
  { label: "Stripe Key", pattern: /[spr]k_live_[a-zA-Z0-9]{24,}/ },
  { label: "Google API Key", pattern: /AIza[0-9A-Za-z\-_]{35}/ },
  { label: "Slack Token", pattern: /xox[bpras]-[a-zA-Z0-9-]+/ },
  { label: "OpenAI API Key", pattern: /sk-proj-[A-Za-z0-9]{20,}/ },
  { label: "GitLab Token", pattern: /glpat-[A-Za-z0-9_-]{20,}/ },
];

const SECRET_KEY_NAMES =
  /password|passwd|pwd|secret|token|api_key|apikey|auth_key|private_key|access_key|secret_key/i;

const ENV_REF_PATTERN = /^\$\{.*\}$|^%\w+%$/;
const PLACEHOLDER_PATTERN =
  /^(changeme|change_me|example|test|dummy|fake|xxx|placeholder|none|null|undefined|TODO|FIXME|your[-_])$/i;

const ENTROPY_THRESHOLD = 4.5;
const MIN_ENTROPY_LENGTH = 8;

// ─── Main Scanner ────────────────────────────────────────────────

/**
 * Scans MCP config files for security issues:
 *   1. Embedded secrets in env/url/headers
 *   2. Tool description poisoning (unicode, bidi, injection)
 *   3. Unknown/untrusted server connections
 *   4. Risky config patterns
 */
export function scanMcpConfigs(
  context: ContextSnapshot,
  _partial: Partial<AnalysisResult>
): Partial<AnalysisResult> {
  const instructionFileIssues: InstructionFileIssue[] = [];

  for (const config of context.mcpConfigFiles ?? []) {
    if (!config.content) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(config.content);
    } catch {
      continue; // Malformed JSON — skip
    }

    const servers =
      (parsed.mcpServers as Record<string, Record<string, unknown>> | undefined) ??
      (parsed.servers as Record<string, Record<string, unknown>> | undefined);
    if (!servers || typeof servers !== "object") continue;

    for (const [serverName, serverConfig] of Object.entries(servers)) {
      if (!serverConfig || typeof serverConfig !== "object") continue;
      if (instructionFileIssues.length >= MAX_FINDINGS_PER_CONFIG) break;

      scanMcpSecrets(config.path, serverName, serverConfig, instructionFileIssues);
      scanMcpToolDescriptions(config.path, serverName, serverConfig, instructionFileIssues);
      scanMcpServers(config.path, serverName, serverConfig, instructionFileIssues);
      scanMcpRiskyConfig(config.path, serverName, serverConfig, instructionFileIssues);
    }
  }

  return { instructionFileIssues };
}

// ─── 1. Embedded Secrets ─────────────────────────────────────────

function scanMcpSecrets(
  filePath: string,
  serverName: string,
  serverConfig: Record<string, unknown>,
  issues: InstructionFileIssue[]
): void {
  // Check env values
  const env = serverConfig.env as Record<string, string> | undefined;
  if (env && typeof env === "object") {
    for (const [key, value] of Object.entries(env)) {
      if (typeof value !== "string") continue;
      if (ENV_REF_PATTERN.test(value)) continue;
      if (PLACEHOLDER_PATTERN.test(value)) continue;

      // Check known provider prefixes
      for (const { label, pattern } of PROVIDER_PREFIXES) {
        if (pattern.test(value)) {
          issues.push(makeIssue(filePath, "mcp-embedded-secret", "error", serverName, key, label));
          break;
        }
      }

      // Check keyword + value
      if (SECRET_KEY_NAMES.test(key) && value.length > 0) {
        if (!issues.some((i) => i.id === `mcp-embedded-secret-${serverName}-${key}-${filePath}`)) {
          issues.push(
            makeIssue(
              filePath,
              "mcp-embedded-secret",
              "warning",
              serverName,
              key,
              "Hardcoded secret in env"
            )
          );
        }
      }

      // Check high entropy
      if (value.length >= MIN_ENTROPY_LENGTH && shannonEntropy(value) > ENTROPY_THRESHOLD) {
        if (!issues.some((i) => i.id === `mcp-embedded-secret-${serverName}-${key}-${filePath}`)) {
          issues.push(
            makeIssue(
              filePath,
              "mcp-embedded-secret",
              "warning",
              serverName,
              key,
              "High-entropy env value"
            )
          );
        }
      }
    }
  }

  // Check URL for embedded credentials
  const url = serverConfig.url as string | undefined;
  if (typeof url === "string" && /:\/\/[^/]*:.*@/.test(url)) {
    issues.push(
      makeIssue(filePath, "mcp-embedded-secret", "error", serverName, "url", "Credentials in URL")
    );
  }

  // Check headers for tokens
  const headers = serverConfig.headers as Record<string, string> | undefined;
  if (headers && typeof headers === "object") {
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value !== "string") continue;
      if (/^(Bearer|Token|Basic)\s+\S+/i.test(value)) {
        issues.push(
          makeIssue(
            filePath,
            "mcp-embedded-secret",
            "warning",
            serverName,
            key,
            "Auth token in headers"
          )
        );
      }
    }
  }
}

// ─── 2. Tool Description Poisoning ───────────────────────────────

function scanMcpToolDescriptions(
  filePath: string,
  serverName: string,
  serverConfig: Record<string, unknown>,
  issues: InstructionFileIssue[]
): void {
  const tools = serverConfig.tools as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(tools)) return;

  for (const tool of tools) {
    const toolName = (tool.name as string) ?? "unnamed";
    const descriptions = collectDescriptions(tool);

    for (const desc of descriptions) {
      let categories = 0;

      if (HIDDEN_UNICODE.test(desc) || TAG_CHARS.test(desc)) {
        categories++;
        issues.push(
          makeIssue(
            filePath,
            "mcp-suspicious-tool",
            "warning",
            serverName,
            toolName,
            "Hidden unicode in tool description"
          )
        );
      }

      if (BIDI_OVERRIDES.test(desc)) {
        categories++;
        issues.push(
          makeIssue(
            filePath,
            "mcp-suspicious-tool",
            "warning",
            serverName,
            toolName,
            "Bidi override in tool description"
          )
        );
      }

      for (const pattern of SUSPICIOUS_PATTERNS) {
        if (pattern.test(desc)) {
          categories++;
          issues.push(
            makeIssue(
              filePath,
              "mcp-suspicious-tool",
              "warning",
              serverName,
              toolName,
              "Suspicious instruction in tool description"
            )
          );
          break;
        }
      }

      // Compound attack — elevate to error
      if (categories >= 2) {
        const last = issues[issues.length - 1];
        if (last) {
          last.severity = "error";
          last.description += " [compound attack]";
        }
      }
    }
  }
}

function collectDescriptions(tool: Record<string, unknown>): string[] {
  const descs: string[] = [];
  if (typeof tool.description === "string") descs.push(tool.description);
  const schema = tool.inputSchema as Record<string, unknown> | undefined;
  if (schema && typeof schema.description === "string") descs.push(schema.description);
  // Check property descriptions in schema
  const props = schema?.properties as Record<string, Record<string, unknown>> | undefined;
  if (props && typeof props === "object") {
    for (const prop of Object.values(props)) {
      if (typeof prop?.description === "string") descs.push(prop.description);
    }
  }
  return descs;
}

// ─── 3. Unknown/Untrusted Servers ────────────────────────────────

const LOCALHOST_PATTERNS = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)$/i;

function scanMcpServers(
  filePath: string,
  serverName: string,
  serverConfig: Record<string, unknown>,
  issues: InstructionFileIssue[]
): void {
  const url = serverConfig.url as string | undefined;
  if (typeof url !== "string") return;

  let parsedHost: string;
  try {
    const u = new URL(url);
    parsedHost = u.hostname;
  } catch {
    return; // Invalid URL — skip
  }

  if (LOCALHOST_PATTERNS.test(parsedHost)) return; // Local is safe

  // Embedded credentials in URL
  if (/:\/\/[^/]*:.*@/.test(url)) {
    issues.push(
      makeIssue(
        filePath,
        "mcp-unknown-server",
        "error",
        serverName,
        "url",
        `Server "${serverName}" URL contains embedded credentials`
      )
    );
  }

  // Non-HTTPS external
  if (url.startsWith("http://")) {
    issues.push(
      makeIssue(
        filePath,
        "mcp-unknown-server",
        "warning",
        serverName,
        "url",
        `Server "${serverName}" uses non-HTTPS connection to external host ${parsedHost}`
      )
    );
  }
}

// ─── 4. Risky Config Patterns ────────────────────────────────────

function scanMcpRiskyConfig(
  filePath: string,
  serverName: string,
  serverConfig: Record<string, unknown>,
  issues: InstructionFileIssue[]
): void {
  const hasCommand = typeof serverConfig.command === "string";
  const hasUrl = typeof serverConfig.url === "string";

  if (hasCommand && hasUrl) {
    issues.push(
      makeIssue(
        filePath,
        "mcp-risky-config",
        "info",
        serverName,
        "transport",
        `Server "${serverName}" has both command and url — ambiguous transport`
      )
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function makeIssue(
  filePath: string,
  issue: InstructionFileIssue["issue"],
  severity: "info" | "warning" | "error",
  serverName: string,
  field: string,
  description: string
): InstructionFileIssue {
  return {
    id: `${issue}-${serverName}-${field}-${filePath}`,
    filePath,
    issue,
    severity,
    description: `${description} in server "${serverName}" of ${fileName(filePath)}`,
    suggestion:
      issue === "mcp-embedded-secret"
        ? "Move secrets to environment variables — use ${VAR} syntax in MCP config"
        : issue === "mcp-suspicious-tool"
          ? "Review tool description for hidden or malicious instructions"
          : issue === "mcp-unknown-server"
            ? "Verify this MCP server is trusted — use HTTPS for external connections"
            : "Review MCP server configuration",
  };
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}
