import type { AnalysisResult, ContextSnapshot, WastePattern } from "../types.js";

/**
 * Trap-file scanner (text/code half of the "agent-ingested data" feature).
 *
 * Flags content that is *safe to read* but *not safe to auto-process* — the
 * shape of the July incident, where a data file carried executable traps and a
 * processor opened it automatically. Two detectors, routed by file type:
 *   (a) Unsafe deserialization CALLS in source code (pickle/torch/yaml/…)
 *   (b) Trap MARKERS in data/config files (template exprs, external references)
 *
 * Scope: the active file only (its content is already captured). Detect-and-
 * explain — never modifies files, never touches the network.
 */

const MAX_TRAP_FINDINGS = 10;
const MAX_FILE_CHARS = 100_000;

const NOT_AUTO_PROCESS =
  "Safe to read, but NOT safe to auto-process — review before any automated tool/agent ingests it";
const UNSAFE_DESERIALIZE =
  "Deserializing untrusted data can execute arbitrary code — use a safe loader (e.g. yaml.safe_load, torch.load(weights_only=True))";

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

// ─── File-type routing ───────────────────────────────────────────

const SOURCE_LANGS = new Set([
  "python",
  "javascript",
  "typescript",
  "javascriptreact",
  "typescriptreact",
]);

function isSourceCode(path: string, languageId: string): boolean {
  return /\.(py|ipynb|js|jsx|ts|tsx|mjs|cjs)$/i.test(path) || SOURCE_LANGS.has(languageId);
}

function isDataFile(path: string, languageId: string): boolean {
  return /\.(json|ya?ml)$/i.test(path) || languageId === "json" || languageId === "yaml";
}

// ─── (a) Unsafe deserialization calls (source code) ──────────────

const DESERIALIZE_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "pickle.load", re: /\b(?:c?pickle|_pickle)\.loads?\s*\(/ },
  { label: "torch.load", re: /\btorch\.load\s*\(/ },
  { label: "joblib.load", re: /\bjoblib\.load\s*\(/ },
  { label: "dill.load", re: /\bdill\.loads?\s*\(/ },
  { label: "marshal.load", re: /\bmarshal\.loads?\s*\(/ },
  { label: "numpy allow_pickle", re: /\b(?:numpy|np)\.load\s*\([^)]*allow_pickle\s*=\s*True/ },
];

// yaml.load / yaml.unsafe_load without a safe loader.
const YAML_UNSAFE = /\byaml\.unsafe_load\s*\(/;
const YAML_LOAD = /\byaml\.load\s*\(/;
const SAFE_LOADER = /safe_?loader|SafeLoader|CSafeLoader/i;

// ─── (b) Trap markers in data files ──────────────────────────────

// Template expression NOT preceded by "$" (so GitHub Actions ${{ }} / shell are excluded).
const TEMPLATE_EXPR = /(?<!\$)\{\{\s*[^}]+\}\}/;
// Indirect/external data references — "the real payload lives elsewhere".
const EXTERNAL_REF = /\breference:\/\/|\b\w+cache::|::(?:https?|s3|gs|gcs|az):\/\//i;
// Paths where {{ }} is legitimate templating (Helm, Ansible, GitHub Actions…).
const TEMPLATE_CONTEXT =
  /(^|\/)(templates?|charts?|roles|playbooks?|ansible)(\/|$)|\.github\/workflows\/|helm/i;

export function detectTraps(
  context: ContextSnapshot,
  _partial: Partial<AnalysisResult>
): Partial<AnalysisResult> {
  const wastePatterns: WastePattern[] = [];
  const file = context.activeFile;
  if (!file?.content || file.content.length > MAX_FILE_CHARS) return { wastePatterns };

  const lines = file.content.split("\n");
  const name = baseName(file.path);
  const seen = new Set<string>();

  const addOnce = (ruleId: string, description: string, suggestion: string): void => {
    if (seen.has(ruleId) || wastePatterns.length >= MAX_TRAP_FINDINGS) return;
    seen.add(ruleId);
    wastePatterns.push({ ruleId, source: file.path, description, severity: "warning", suggestion });
  };

  if (isSourceCode(file.path, file.languageId)) {
    scanDeserialization(name, lines, addOnce);
  }
  if (isDataFile(file.path, file.languageId)) {
    scanDataTraps(file.path, name, file.languageId, lines, addOnce);
  }

  return { wastePatterns };
}

type AddOnce = (ruleId: string, description: string, suggestion: string) => void;

function scanDeserialization(name: string, lines: string[], add: AddOnce): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { label, re } of DESERIALIZE_PATTERNS) {
      if (re.test(line)) {
        add(
          "trap-unsafe-deserialization",
          `${label} in ${name} line ${i + 1} — deserializes data that could execute code`,
          UNSAFE_DESERIALIZE
        );
        break;
      }
    }
    if (YAML_UNSAFE.test(line) || (YAML_LOAD.test(line) && !SAFE_LOADER.test(line))) {
      add(
        "trap-unsafe-deserialization",
        `unsafe yaml.load in ${name} line ${i + 1} — can construct arbitrary Python objects`,
        UNSAFE_DESERIALIZE
      );
    }
  }
}

function scanDataTraps(
  path: string,
  name: string,
  languageId: string,
  lines: string[],
  add: AddOnce
): void {
  const isJson = /\.json$/i.test(path) || languageId === "json";
  // In JSON a "{{ }}" is always suspect (no native templating); in YAML, only
  // when the file isn't part of a known templating system.
  const templateSuspect = isJson || !TEMPLATE_CONTEXT.test(path);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (EXTERNAL_REF.test(line)) {
      add(
        "trap-external-reference",
        `${name} line ${i + 1} points data elsewhere (external/indirect reference) — the real payload isn't in this file`,
        NOT_AUTO_PROCESS
      );
    }

    if (templateSuspect && TEMPLATE_EXPR.test(line)) {
      add(
        "trap-data-template",
        `${name} line ${i + 1} has a template expression ({{…}}) in a data field — may be evaluated when the file is processed`,
        NOT_AUTO_PROCESS
      );
    }
  }
}
