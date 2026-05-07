import type { AnalysisResult, ContextSnapshot, SecretFinding, WastePattern } from "../types.js";

const MAX_FINDINGS_PER_FILE = 10;
const ENTROPY_THRESHOLD = 4.5;
const MIN_ENTROPY_LENGTH = 8;
const MOVE_TO_ENV = "Move to environment variables or a secrets manager before prompting";

// ─── Layer 1: Known Provider Prefixes ────────────────────────────

const PROVIDER_PREFIXES: Array<{ id: string; label: string; pattern: RegExp }> = [
  { id: "aws-access-key", label: "AWS Access Key", pattern: /(?:AKIA|ASIA)[0-9A-Z]{16}/ },
  { id: "github-token", label: "GitHub Token", pattern: /gh[porsut]_[a-zA-Z0-9]{36}/ },
  { id: "stripe-key", label: "Stripe Key", pattern: /[spr]k_live_[a-zA-Z0-9]{24,}/ },
  { id: "google-api-key", label: "Google API Key", pattern: /AIza[0-9A-Za-z\-_]{35}/ },
  { id: "slack-token", label: "Slack Token", pattern: /xox[bpras]-[a-zA-Z0-9-]+/ },
  { id: "openai-key", label: "OpenAI API Key", pattern: /sk-proj-[A-Za-z0-9]{20,}/ },
  { id: "gitlab-token", label: "GitLab Token", pattern: /glpat-[A-Za-z0-9_-]{20,}/ },
  {
    id: "private-key-block",
    label: "Private Key",
    pattern: /-----BEGIN[A-Z ]*PRIVATE KEY-----/,
  },
];

// ─── Layer 2: Keyword + Assignment ───────────────────────────────

// Quoted values — works in any language
const KEYWORD_PATTERN =
  /\b(\w*(?:password|passwd|pwd|pass|secret|token|api_key|apikey|auth_key|private_key|access_key|secret_key|conn_str|connection_string))\s*[:=]>?\s*["'`]([^"'`\n]{1,200})["'`]/i;

// Unquoted values — for YAML, .properties, .ini, .env, TOML, config files
const KEYWORD_UNQUOTED_PATTERN =
  /\b(\w*(?:password|passwd|pwd|pass|secret|token|api_key|apikey|auth_key|private_key|access_key|secret_key|conn_str|connection_string))\s*[:=]\s*(\S+)\s*$/i;

const UNQUOTED_VALUE_LANGUAGES = new Set([
  "yaml",
  "properties",
  "ini",
  "toml",
  "dotenv",
  "plaintext",
  "shellscript",
  "dockerfile",
]);

const PLACEHOLDER_PATTERNS = [
  /^$/,
  /^(changeme|change_me|example|test|dummy|fake|xxx|placeholder|none|null|undefined)$/i,
  /^(TODO|FIXME|CHANGEME|REPLACE_ME)/i,
  /^your[-_]/i,
  /^<.*>$/,
  /^\$\{/,
  /^process\.env\b/,
  /^os\.environ\b/,
  /^ENV\[/,
  /^%\w+%$/,
  /^System\.getenv\b/,
  /^\.\.\./,
];

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((p) => p.test(value.trim()));
}

// ─── Layer 4: Connection Strings ─────────────────────────────────

const CONNECTION_STRING_PATTERNS: Array<{ id: string; label: string; pattern: RegExp }> = [
  {
    id: "connection-string-uri",
    label: "Connection String",
    pattern: /\b(mongodb|postgres|postgresql|mysql|redis|amqp|mssql)\+?\w*:\/\/[^\s"'`]{5,}/i,
  },
  {
    id: "connection-string-jdbc",
    label: "JDBC Connection String",
    pattern: /\bjdbc:(postgresql|mysql|sqlserver|oracle):\/\/[^\s"'`]{5,}/i,
  },
  {
    id: "connection-string-dotnet",
    label: ".NET Connection String",
    pattern: /Server\s*=\s*[^;]+;.*Password\s*=\s*[^;]+/i,
  },
];

// ─── Layer 5: Context Filtering ──────────────────────────────────

const COMMENT_LINE = /^\s*(\/\/|#|\/\*|\*\/?\s|\*\s|<!--|--\s|%\s|;\s)/;
const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx|js|jsx)$|__tests__\//;

function shouldSkipLine(line: string): boolean {
  return COMMENT_LINE.test(line);
}

function shouldSkipFile(path: string, contentLength: number): boolean {
  if (contentLength > 100_000) return true;
  if (TEST_FILE_PATTERN.test(path)) return true;
  return false;
}

// ─── Layer 3: Shannon Entropy ────────────────────────────────────

export function shannonEntropy(str: string): number {
  if (str.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of str) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }
  let entropy = 0;
  const len = str.length;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

const QUOTED_STRING_PATTERN = /["'`]([^"'`\n]{8,200})["'`]/g;

function isUrlOrPath(value: string): boolean {
  return /^https?:\/\//.test(value) || /^file:\/\//.test(value) || /^\/[\w-]/.test(value);
}

// ─── Helpers ─────────────────────────────────────────────────────

function redact(value: string): string {
  if (value.length <= 8) return "****";
  return value.slice(0, 4) + "****" + value.slice(-4);
}

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

// ─── Main Scanner ────────────────────────────────────────────────

/**
 * Scans the active file's content for hardcoded secrets using 4 detection layers:
 *   Layer 1: Known provider prefixes (AWS, GitHub, Stripe, etc.) — severity: error
 *   Layer 2: Keyword + literal value (password, secret, token, etc.) — severity: warning
 *   Layer 3: Shannon entropy on quoted strings — severity: warning
 *   Layer 4: Connection strings (mongodb://, postgres://, etc.) — severity: warning
 *   Layer 5: Context filtering applied inline (skip comments, test files, placeholders)
 */
export function scanSecrets(
  context: ContextSnapshot,
  _partial: Partial<AnalysisResult>
): Partial<AnalysisResult> {
  const secretFindings: SecretFinding[] = [];
  const wastePatterns: WastePattern[] = [];

  const file = context.activeFile;
  if (!file?.content) return { secretFindings };
  if (shouldSkipFile(file.path, file.content.length)) return { secretFindings };

  const lines = file.content.split("\n");
  const flaggedLines = new Set<number>();

  for (let i = 0; i < lines.length && secretFindings.length < MAX_FINDINGS_PER_FILE; i++) {
    const line = lines[i];
    if (shouldSkipLine(line)) continue;

    // Layer 1: Provider prefixes
    for (const { id, label, pattern } of PROVIDER_PREFIXES) {
      const match = pattern.exec(line);
      if (match) {
        secretFindings.push({
          id: `${id}-${file.path}-${i + 1}`,
          filePath: file.path,
          lineNumber: i + 1,
          ruleId: id,
          layer: 1,
          severity: "error",
          label,
          description: `${label} found in ${fileName(file.path)} line ${i + 1}`,
          matchPreview: redact(match[0]),
          suggestion: MOVE_TO_ENV,
        });
        flaggedLines.add(i);
        break; // One finding per line for Layer 1
      }
    }

    // Layer 2: Keyword + assignment (quoted or unquoted for config files)
    if (!flaggedLines.has(i)) {
      const isConfigFile = UNQUOTED_VALUE_LANGUAGES.has(file.languageId);
      const kwMatch =
        KEYWORD_PATTERN.exec(line) ?? (isConfigFile ? KEYWORD_UNQUOTED_PATTERN.exec(line) : null);
      if (kwMatch) {
        const keyName = kwMatch[1];
        const value = kwMatch[2];
        if (!isPlaceholder(value)) {
          secretFindings.push({
            id: `keyword-${keyName}-${file.path}-${i + 1}`,
            filePath: file.path,
            lineNumber: i + 1,
            ruleId: "keyword-secret",
            layer: 2,
            severity: "warning",
            label: "Hardcoded secret",
            description: `Hardcoded ${keyName} in ${fileName(file.path)} line ${i + 1}`,
            matchPreview: `${keyName} = "${redact(value)}"`,
            suggestion: MOVE_TO_ENV,
          });
          flaggedLines.add(i);
        }
      }
    }

    // Layer 4: Connection strings
    if (!flaggedLines.has(i)) {
      for (const { id, label, pattern } of CONNECTION_STRING_PATTERNS) {
        const csMatch = pattern.exec(line);
        if (csMatch) {
          secretFindings.push({
            id: `${id}-${file.path}-${i + 1}`,
            filePath: file.path,
            lineNumber: i + 1,
            ruleId: id,
            layer: 4,
            severity: "warning",
            label,
            description: `${label} in ${fileName(file.path)} line ${i + 1}`,
            matchPreview: redact(csMatch[0]),
            suggestion: MOVE_TO_ENV,
          });
          flaggedLines.add(i);
          break;
        }
      }
    }
  }

  // Layer 3: Entropy scan on quoted strings (skip lines already flagged)
  for (let i = 0; i < lines.length && secretFindings.length < MAX_FINDINGS_PER_FILE; i++) {
    if (flaggedLines.has(i)) continue;
    if (shouldSkipLine(lines[i])) continue;

    QUOTED_STRING_PATTERN.lastIndex = 0;
    let qMatch: RegExpExecArray | null;
    while (
      (qMatch = QUOTED_STRING_PATTERN.exec(lines[i])) !== null &&
      secretFindings.length < MAX_FINDINGS_PER_FILE
    ) {
      const value = qMatch[1];
      if (isUrlOrPath(value)) continue;
      if (isPlaceholder(value)) continue;
      if (value.length < MIN_ENTROPY_LENGTH) continue;

      const entropy = shannonEntropy(value);
      if (entropy > ENTROPY_THRESHOLD) {
        secretFindings.push({
          id: `high-entropy-${file.path}-${i + 1}`,
          filePath: file.path,
          lineNumber: i + 1,
          ruleId: "high-entropy",
          layer: 3,
          severity: "warning",
          label: "High-entropy string",
          description: `Potential secret (entropy ${entropy.toFixed(1)}) in ${fileName(file.path)} line ${i + 1}`,
          matchPreview: redact(value),
          suggestion: MOVE_TO_ENV,
        });
        flaggedLines.add(i);
        break; // One entropy finding per line
      }
    }
  }

  // Generate waste pattern if any secrets found
  if (secretFindings.length > 0) {
    wastePatterns.push({
      ruleId: "secret-in-content",
      source: file.path,
      description: `${secretFindings.length} potential secret(s) found in ${fileName(file.path)}`,
      severity: "warning",
      suggestion: "Move secrets to environment variables or a secrets manager before prompting",
    });
  }

  return { secretFindings, wastePatterns };
}
