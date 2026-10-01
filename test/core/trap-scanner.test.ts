import { describe, it, expect } from "vitest";
import { detectTraps } from "../../src/core/analyzers/trap-scanner.js";
import type { ContextSnapshot, FileInfo } from "../../src/core/types.js";

function langFromPath(path: string): string {
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
  if (path.endsWith(".js")) return "javascript";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".yaml") || path.endsWith(".yml")) return "yaml";
  return "plaintext";
}

function makeSnapshot(content: string, path: string): ContextSnapshot {
  const file: FileInfo = {
    path,
    languageId: langFromPath(path),
    lineCount: content.split("\n").length,
    charCount: content.length,
    isActive: true,
    isDirty: false,
    commentLineCount: 0,
    hasConflictMarkers: false,
    content,
  };
  return {
    timestamp: Date.now(),
    activeFile: file,
    selection: null,
    openTabs: [],
    referencedFiles: [],
    terminalContent: null,
    clipboardSize: null,
    chatHistoryLength: 0,
    aiInstructionFiles: [],
    mcpConfigFiles: [],
    toolProfile: null,
    ignoreFiles: [],
  };
}

const scan = (content: string, path: string) =>
  detectTraps(makeSnapshot(content, path), {}).wastePatterns!;
const ruleIds = (content: string, path: string) => scan(content, path).map((w) => w.ruleId);

describe("detectTraps — unsafe deserialization (source code)", () => {
  it("flags pickle.load", () => {
    expect(ruleIds("import pickle\ndata = pickle.load(f)", "src/loader.py")).toContain(
      "trap-unsafe-deserialization"
    );
  });

  it("flags torch.load", () => {
    expect(ruleIds("model = torch.load('model.pt')", "src/model.py")).toContain(
      "trap-unsafe-deserialization"
    );
  });

  it("flags numpy.load with allow_pickle=True", () => {
    expect(ruleIds("arr = np.load('a.npy', allow_pickle=True)", "src/a.py")).toContain(
      "trap-unsafe-deserialization"
    );
  });

  it("flags yaml.load without a safe loader", () => {
    expect(ruleIds("cfg = yaml.load(open('c.yml'))", "src/c.py")).toContain(
      "trap-unsafe-deserialization"
    );
  });

  // FP guards
  it("does NOT flag yaml.load WITH SafeLoader", () => {
    expect(ruleIds("cfg = yaml.load(f, Loader=yaml.SafeLoader)", "src/c.py")).not.toContain(
      "trap-unsafe-deserialization"
    );
  });

  it("does NOT flag yaml.safe_load", () => {
    expect(ruleIds("cfg = yaml.safe_load(f)", "src/c.py")).not.toContain(
      "trap-unsafe-deserialization"
    );
  });

  it("does NOT flag numpy.load without allow_pickle", () => {
    expect(ruleIds("arr = np.load('a.npy')", "src/a.py")).toHaveLength(0);
  });

  it("does NOT flag clean source", () => {
    expect(ruleIds("def add(a, b):\n    return a + b", "src/math.py")).toHaveLength(0);
  });
});

describe("detectTraps — data-file traps", () => {
  it("flags a template expression in JSON", () => {
    expect(ruleIds('{ "value": "{{ 7 * 7 }}" }', "data/config.json")).toContain(
      "trap-data-template"
    );
  });

  it("flags a template expression in a plain YAML data file", () => {
    expect(ruleIds("name: {{ inject_me }}", "data/records.yaml")).toContain("trap-data-template");
  });

  it("flags an external/indirect reference (reference://)", () => {
    expect(ruleIds('{ "data": "reference://bucket/real-data.h5" }', "data/index.json")).toContain(
      "trap-external-reference"
    );
  });

  it("flags fsspec chained cache references", () => {
    expect(ruleIds("path: simplecache::s3://bucket/key", "data/ref.yaml")).toContain(
      "trap-external-reference"
    );
  });

  // FP guards
  it("does NOT flag GitHub Actions ${{ }} expressions", () => {
    const yml = "jobs:\n  build:\n    steps:\n      - run: echo ${{ secrets.TOKEN }}";
    expect(ruleIds(yml, ".github/workflows/ci.yml")).not.toContain("trap-data-template");
  });

  it("does NOT flag {{ }} inside a Helm templates/ directory", () => {
    expect(ruleIds("image: {{ .Values.image }}", "chart/templates/deploy.yaml")).not.toContain(
      "trap-data-template"
    );
  });

  it("does NOT flag clean JSON", () => {
    expect(ruleIds('{ "name": "app", "version": "1.0.0" }', "package.json")).toHaveLength(0);
  });
});

describe("detectTraps — scope & robustness", () => {
  it("ignores files with no content", () => {
    const snap = makeSnapshot("", "src/x.py");
    snap.activeFile!.content = undefined;
    expect(detectTraps(snap, {}).wastePatterns).toHaveLength(0);
  });

  it("does not scan unrelated file types for data traps", () => {
    // A .txt file is neither source nor data — no traps.
    expect(ruleIds("name: {{ inject }}", "notes.txt")).toHaveLength(0);
  });

  it("emits at most one finding per trap category per file", () => {
    const py = "a = pickle.load(f)\nb = pickle.load(g)\nc = torch.load(h)";
    // Multiple deserialization calls collapse to a single category finding.
    const ids = ruleIds(py, "src/multi.py");
    expect(ids.filter((r) => r === "trap-unsafe-deserialization")).toHaveLength(1);
  });

  it("findings are warning severity with the not-auto-process framing", () => {
    const w = scan('{ "v": "{{ x }}" }', "data/c.json");
    expect(w[0].severity).toBe("warning");
    expect(w.some((x) => /auto-process/i.test(x.suggestion))).toBe(true);
  });
});
