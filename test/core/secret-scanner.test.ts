import { describe, it, expect } from "vitest";
import { scanSecrets, shannonEntropy } from "../../src/core/analyzers/secret-scanner.js";
import type { ContextSnapshot, FileInfo } from "../../src/core/types.js";

function makeSnapshot(overrides: Partial<ContextSnapshot> = {}): ContextSnapshot {
  return {
    timestamp: Date.now(),
    activeFile: null,
    selection: null,
    openTabs: [],
    referencedFiles: [],
    terminalContent: null,
    clipboardSize: null,
    chatHistoryLength: 0,
    aiInstructionFiles: [],
    toolProfile: null,
    ignoreFiles: [],
    ...overrides,
  };
}

function makeFile(overrides: Partial<FileInfo> = {}): FileInfo {
  return {
    path: "src/config.ts",
    languageId: "typescript",
    lineCount: 50,
    charCount: 2000,
    isActive: true,
    isDirty: false,
    commentLineCount: 0,
    hasConflictMarkers: false,
    ...overrides,
  };
}

function langFromPath(path: string): string {
  if (path.endsWith(".yml") || path.endsWith(".yaml")) return "yaml";
  if (path.endsWith(".properties")) return "properties";
  if (path.endsWith(".env") || path.startsWith(".env")) return "dotenv";
  if (path.endsWith(".toml")) return "toml";
  if (path.endsWith(".ini")) return "ini";
  return "typescript";
}

function fileWithContent(content: string, path = "src/config.ts"): FileInfo {
  return makeFile({
    path,
    languageId: langFromPath(path),
    content,
    lineCount: content.split("\n").length,
    charCount: content.length,
  });
}

describe("scanSecrets", () => {
  // ─── No-op cases ──────────────────────────────────────────────

  it("returns empty when no active file", () => {
    const result = scanSecrets(makeSnapshot(), {});
    expect(result.secretFindings).toHaveLength(0);
  });

  it("returns empty when active file has no content", () => {
    const result = scanSecrets(
      makeSnapshot({ activeFile: makeFile({ content: undefined }) }),
      {}
    );
    expect(result.secretFindings).toHaveLength(0);
  });

  it("returns empty for test files", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('const key = "AKIAIOSFODNN7EXAMPLE1";', "src/auth.test.ts"),
      }),
      {}
    );
    expect(result.secretFindings).toHaveLength(0);
  });

  it("returns empty for clean file", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('const x = 1;\nconst y = "hello";\n'),
      }),
      {}
    );
    expect(result.secretFindings).toHaveLength(0);
  });

  // ─── Layer 1: Provider Prefixes ────────────────────────────────

  it("detects AWS access key (AKIA)", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('const key = "AKIAIOSFODNN7EXAMPLE1";'),
      }),
      {}
    );
    expect(result.secretFindings!.length).toBeGreaterThanOrEqual(1);
    const finding = result.secretFindings![0];
    expect(finding.ruleId).toBe("aws-access-key");
    expect(finding.layer).toBe(1);
    expect(finding.severity).toBe("error");
    expect(finding.lineNumber).toBe(1);
  });

  it("detects AWS session key (ASIA)", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('AccessKeyId: "ASIAIOSFODNN7EXAMPLE1"'),
      }),
      {}
    );
    const finding = result.secretFindings!.find((f) => f.ruleId === "aws-access-key");
    expect(finding).toBeDefined();
  });

  it("detects GitHub personal access token", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent(
          'const token = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";'
        ),
      }),
      {}
    );
    expect(result.secretFindings![0].ruleId).toBe("github-token");
    expect(result.secretFindings![0].severity).toBe("error");
  });

  it("detects Stripe live key", () => {
    // Build key dynamically to avoid GitHub push protection blocking this test file
    const prefix = "sk" + "_" + "live" + "_";
    const key = prefix + "a".repeat(24);
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent(`stripe_key = "${key}";`),
      }),
      {}
    );
    expect(result.secretFindings!.some((f) => f.ruleId === "stripe-key")).toBe(true);
  });

  it("detects Google API key", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent(
          'const key = "AIzaSyA-abcdefghijklmnopqrstuvwxyz12345";'
        ),
      }),
      {}
    );
    expect(result.secretFindings!.some((f) => f.ruleId === "google-api-key")).toBe(true);
  });

  it("detects Slack token", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('token = "xoxb-123456789012-abcdefghij";'),
      }),
      {}
    );
    expect(result.secretFindings!.some((f) => f.ruleId === "slack-token")).toBe(true);
  });

  it("detects OpenAI API key", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent(
          'const key = "sk-proj-abcdefghijklmnopqrstuvwxyz";'
        ),
      }),
      {}
    );
    expect(result.secretFindings!.some((f) => f.ruleId === "openai-key")).toBe(true);
  });

  it("detects GitLab token", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('token = "glpat-abcdefghijklmnopqrst";'),
      }),
      {}
    );
    expect(result.secretFindings!.some((f) => f.ruleId === "gitlab-token")).toBe(true);
  });

  it("detects private key block", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent("-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----"),
      }),
      {}
    );
    expect(result.secretFindings!.some((f) => f.ruleId === "private-key-block")).toBe(true);
  });

  it("does NOT detect AWS key in comment line", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('// const key = "AKIAIOSFODNN7EXAMPLE1";'),
      }),
      {}
    );
    expect(result.secretFindings).toHaveLength(0);
  });

  it("does NOT detect AWS key in hash comment", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('# key = "AKIAIOSFODNN7EXAMPLE1"'),
      }),
      {}
    );
    expect(result.secretFindings).toHaveLength(0);
  });

  // ─── Layer 2: Keyword + Assignment ─────────────────────────────

  it("detects password = literal string", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('db_password = "Summer2026!"'),
      }),
      {}
    );
    const finding = result.secretFindings!.find((f) => f.layer === 2);
    expect(finding).toBeDefined();
    expect(finding!.ruleId).toBe("keyword-secret");
    expect(finding!.label).toBe("Hardcoded secret");
  });

  it("detects pwd variant", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('ml_ref_pwd: "admin123"'),
      }),
      {}
    );
    expect(result.secretFindings!.some((f) => f.layer === 2)).toBe(true);
  });

  it("detects api_key assignment", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('STRIPE_API_KEY = "sk_test_123456"'),
      }),
      {}
    );
    expect(result.secretFindings!.some((f) => f.layer === 2)).toBe(true);
  });

  it("detects secret with colon assignment (YAML)", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('jwt_secret: "my-super-secret-key"', "config.yml"),
      }),
      {}
    );
    expect(result.secretFindings!.some((f) => f.layer === 2)).toBe(true);
  });

  it("does NOT trigger on empty password", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('password = ""'),
      }),
      {}
    );
    expect(result.secretFindings!.filter((f) => f.layer === 2)).toHaveLength(0);
  });

  it("does NOT trigger on placeholder 'changeme'", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('password = "changeme"'),
      }),
      {}
    );
    expect(result.secretFindings!.filter((f) => f.layer === 2)).toHaveLength(0);
  });

  it("does NOT trigger on placeholder 'TODO'", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('secret = "TODO"'),
      }),
      {}
    );
    expect(result.secretFindings!.filter((f) => f.layer === 2)).toHaveLength(0);
  });

  it("does NOT trigger on env var reference", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('password = "process.env.DB_PASSWORD"'),
      }),
      {}
    );
    expect(result.secretFindings!.filter((f) => f.layer === 2)).toHaveLength(0);
  });

  it("does NOT trigger on template variable", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('secret = "${SECRET_KEY}"'),
      }),
      {}
    );
    expect(result.secretFindings!.filter((f) => f.layer === 2)).toHaveLength(0);
  });

  it("does NOT trigger on angle-bracket placeholder", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('password = "<your-password-here>"'),
      }),
      {}
    );
    expect(result.secretFindings!.filter((f) => f.layer === 2)).toHaveLength(0);
  });

  // ─── Layer 2b: Unquoted values in YAML/config ──────────────────

  it("detects unquoted password in YAML", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent("ml_ref_password: vale", "config.yml"),
      }),
      {}
    );
    expect(result.secretFindings!.some((f) => f.layer === 2)).toBe(true);
  });

  it("detects unquoted db_password in YAML", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent("db_password: Summer2026!", "application.yml"),
      }),
      {}
    );
    expect(result.secretFindings!.some((f) => f.layer === 2)).toBe(true);
  });

  it("detects unquoted secret in .properties", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: makeFile({
          path: "application.properties",
          languageId: "properties",
          content: "spring.datasource.password=dbpass123",
          lineCount: 1,
          charCount: 36,
          isActive: true,
        }),
      }),
      {}
    );
    expect(result.secretFindings!.some((f) => f.layer === 2)).toBe(true);
  });

  it("detects unquoted token in .env file", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: makeFile({
          path: ".env",
          languageId: "dotenv",
          content: "AUTH_TOKEN=my-secret-token-value",
          lineCount: 1,
          charCount: 31,
          isActive: true,
        }),
      }),
      {}
    );
    expect(result.secretFindings!.some((f) => f.layer === 2)).toBe(true);
  });

  it("does NOT detect unquoted value in .ts file (would false positive on code)", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent("const password = getPassword()"),
      }),
      {}
    );
    expect(result.secretFindings!.filter((f) => f.layer === 2)).toHaveLength(0);
  });

  // ─── Layer 3: Shannon Entropy ──────────────────────────────────

  it("detects high-entropy string", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('const config = "a8K3mZp9Qw2LxNvB7yH4jR6tF5gE1cD";'),
      }),
      {}
    );
    expect(result.secretFindings!.some((f) => f.layer === 3)).toBe(true);
  });

  it("does NOT trigger on low-entropy string", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('const msg = "hello world this is a test message";'),
      }),
      {}
    );
    expect(result.secretFindings!.filter((f) => f.layer === 3)).toHaveLength(0);
  });

  it("does NOT trigger on URL", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('const url = "https://api.example.com/v2/users/auth";'),
      }),
      {}
    );
    expect(result.secretFindings!.filter((f) => f.layer === 3)).toHaveLength(0);
  });

  it("does NOT trigger on file path", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('const path = "/usr/local/bin/something-here";'),
      }),
      {}
    );
    expect(result.secretFindings!.filter((f) => f.layer === 3)).toHaveLength(0);
  });

  it("does NOT trigger on short string", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('const x = "aB3$kM9";'), // 7 chars, below threshold
      }),
      {}
    );
    expect(result.secretFindings!.filter((f) => f.layer === 3)).toHaveLength(0);
  });

  it("does NOT trigger on container image reference", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent(
          'image: "cr.l5d.io/linkerd/proxy:stable-2.14.0"',
          "deployment.yml"
        ),
      }),
      {}
    );
    expect(result.secretFindings!.filter((f) => f.layer === 3)).toHaveLength(0);
  });

  it("does NOT trigger on AWS ARN", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent(
          'role = "arn:aws:iam::123456789012:oidc-provider/oidc.eks.us-east-1.amazonaws.com"'
        ),
      }),
      {}
    );
    expect(result.secretFindings!.filter((f) => f.layer === 3)).toHaveLength(0);
  });

  it("does NOT trigger on ECR image URI", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent(
          'image: "602401143452.dkr.ecr.us-east-1.amazonaws.com/amazon-k8s-cni:v1.15.1"',
          "values.yml"
        ),
      }),
      {}
    );
    expect(result.secretFindings!.filter((f) => f.layer === 3)).toHaveLength(0);
  });

  it("does NOT trigger on version number string", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('version = "1.23.456.789-beta"'),
      }),
      {}
    );
    expect(result.secretFindings!.filter((f) => f.layer === 3)).toHaveLength(0);
  });

  it("does NOT double-report line already caught by Layer 1", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('key = "AKIAIOSFODNN7EXAMPLE1";'),
      }),
      {}
    );
    // Should have exactly 1 finding (Layer 1), not 2
    const findings = result.secretFindings!.filter(
      (f) => f.lineNumber === 1
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].layer).toBe(1);
  });

  // ─── Layer 4: Connection Strings ───────────────────────────────

  it("detects MongoDB connection string", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('const uri = "mongodb://admin:pass123@host:27017/mydb";'),
      }),
      {}
    );
    expect(result.secretFindings!.some((f) => f.layer === 4)).toBe(true);
  });

  it("detects PostgreSQL connection string", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('db_url = "postgresql://user:secret@localhost:5432/app";'),
      }),
      {}
    );
    expect(result.secretFindings!.some((f) => f.layer === 4)).toBe(true);
  });

  it("detects JDBC connection string", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent(
          'url = "jdbc:mysql://host:3306/db?user=root&password=pass";'
        ),
      }),
      {}
    );
    expect(result.secretFindings!.some((f) => f.layer === 4)).toBe(true);
  });

  it("detects .NET connection string", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent(
          '"ConnectionString": "Server=myhost;Database=mydb;User=sa;Password=secret123"'
        ),
      }),
      {}
    );
    expect(result.secretFindings!.some((f) => f.layer === 4)).toBe(true);
  });

  it("detects Redis connection string", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('redis_url = "redis://user:pass@redis-host:6379/0";'),
      }),
      {}
    );
    expect(result.secretFindings!.some((f) => f.layer === 4)).toBe(true);
  });

  // ─── Integration ──────────────────────────────────────────────

  it("generates secret-in-content waste pattern when secrets found", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('password = "hunter2"'),
      }),
      {}
    );
    expect(result.wastePatterns!.some((w) => w.ruleId === "secret-in-content")).toBe(true);
  });

  it("does NOT generate waste pattern when no secrets found", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('const x = 1;'),
      }),
      {}
    );
    expect(result.wastePatterns ?? []).toHaveLength(0);
  });

  it("caps findings at MAX_FINDINGS_PER_FILE", () => {
    const lines = Array.from(
      { length: 20 },
      (_, i) => `password_${i} = "secret-value-${i}!@#"`
    ).join("\n");
    const result = scanSecrets(
      makeSnapshot({ activeFile: fileWithContent(lines) }),
      {}
    );
    expect(result.secretFindings!.length).toBeLessThanOrEqual(10);
  });

  it("redacts matched values in preview", () => {
    const result = scanSecrets(
      makeSnapshot({
        activeFile: fileWithContent('key = "AKIAIOSFODNN7EXAMPLE1"'),
      }),
      {}
    );
    const preview = result.secretFindings![0].matchPreview;
    expect(preview).toContain("****");
    expect(preview).not.toContain("AKIAIOSFODNN7EXAMPLE1");
  });
});

// ─── Adversarial hardening (v0.7.0) ─────────────────────────────
// Regression guards for findings from the cross-engine adversarial corpus:
// two entropy-layer false positives + two coverage gaps.
describe("scanSecrets — adversarial hardening", () => {
  const scan = (content: string, path = "src/config.ts") =>
    scanSecrets(makeSnapshot({ activeFile: fileWithContent(content, path) }), {});

  // False positives that the entropy layer used to flag.
  it("does NOT flag Subresource-Integrity / checksum digests", () => {
    const r = scan('integrity: "sha256-a8K3mZp9Qw2LxNvB7yH4jR6tF5gE1cD0uP2qXrJ8vK="');
    expect(r.secretFindings).toHaveLength(0);
  });

  it("does NOT flag sha512 integrity digests", () => {
    const r = scan('"integrity": "sha512-9xK3mZp7Qw2LxNvB4yH8jR6tF5gE1cD0aBcDeFgHiJkLmNoPqRsTuVwXyZ012345=="');
    expect(r.secretFindings).toHaveLength(0);
  });

  it("does NOT flag base64 data URIs", () => {
    const r = scan('const img = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ";');
    expect(r.secretFindings).toHaveLength(0);
  });

  // Coverage gaps that used to be missed.
  it("flags npm authentication tokens", () => {
    const r = scan(
      "//registry.npmjs.org/:_authToken=npm_9xK3mZp7Qw2LxNvB4yH8jR6tF5gE1cD0aBcD",
      ".npmrc"
    );
    expect(r.secretFindings.some((f) => f.ruleId === "npm-token")).toBe(true);
  });

  it("flags credentials embedded in a URL", () => {
    const r = scan('const u = "https://admin:Sup3rS3cr3tPw@internal.example.com/api";');
    expect(r.secretFindings.some((f) => f.ruleId === "url-embedded-credentials")).toBe(true);
  });

  it("flags credentials in non-http URL schemes too", () => {
    const r = scan('const r = "redis://user:pass99word@redis-host:6379/0";');
    expect(r.secretFindings.length).toBeGreaterThan(0);
  });

  // Markdown heading-line gap: "#" is a heading in Markdown, not a comment, so a
  // secret sitting on a heading line must still be scanned.
  it("flags a secret on a Markdown heading line", () => {
    const r = scan("# ghp_R8xQ2vN7wZ4kLpM1aB3cD5eF6gH9jK0mN2pQ", "README.md");
    expect(r.secretFindings.some((f) => f.ruleId === "github-token")).toBe(true);
  });

  it("flags a secret in Markdown prose", () => {
    const r = scan("Set your token: ghp_R8xQ2vN7wZ4kLpM1aB3cD5eF6gH9jK0mN2pQ", "docs/setup.md");
    expect(r.secretFindings.some((f) => f.ruleId === "github-token")).toBe(true);
  });

  it("still skips real HTML comments in Markdown", () => {
    const r = scan("<!-- old token was ghp_R8xQ2vN7wZ4kLpM1aB3cD5eF6gH9jK0mN2pQ -->", "README.md");
    expect(r.secretFindings).toHaveLength(0);
  });

  it("still treats leading # as a comment in code files", () => {
    // Regression: the Markdown change must not re-enable scanning of "#" comments
    // in ordinary source files.
    const r = scan('# const key = "ghp_R8xQ2vN7wZ4kLpM1aB3cD5eF6gH9jK0mN2pQ"', "src/app.py");
    expect(r.secretFindings).toHaveLength(0);
  });

  // Entropy-layer false positive: RDF/Turtle prefix declarations are high-entropy
  // structured text (URIs + punctuation + spaces), not secrets.
  it("does NOT flag RDF/Turtle @prefix declarations", () => {
    const rdf = [
      'rdf_content.append("@prefix : <http://example.org/> .")',
      'rdf_content.append("@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .")',
      'rdf_content.append("@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .")',
    ].join("\n");
    const r = scan(rdf, "advanced_knowledge_graph.py");
    expect(r.secretFindings).toHaveLength(0);
  });

  it("does NOT flag high-entropy strings that contain spaces (prose/markup)", () => {
    const r = scan('const q = "SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 100";');
    expect(r.secretFindings).toHaveLength(0);
  });

  it("still flags a genuine contiguous high-entropy token", () => {
    // Guard against over-correction: a real token (no spaces, no URI) still fires.
    // Neutral variable name so the entropy layer — not the keyword layer — is exercised.
    const r = scan('const blob = "a8K3mZp9Qw2LxNvB7yH4jR6tF5gE1cD0uP2qX";');
    expect(r.secretFindings.some((f) => f.ruleId === "high-entropy")).toBe(true);
  });
});

// ─── Shannon Entropy Unit Tests ────────────────────────────────

describe("shannonEntropy", () => {
  it("returns 0 for empty string", () => {
    expect(shannonEntropy("")).toBe(0);
  });

  it("returns 0 for single repeated character", () => {
    expect(shannonEntropy("aaaaaaa")).toBe(0);
  });

  it("returns 1.0 for two alternating characters", () => {
    expect(shannonEntropy("abababab")).toBeCloseTo(1.0, 1);
  });

  it("returns higher entropy for random-looking string", () => {
    const entropy = shannonEntropy("aB3$kM9!xZ2@pL7");
    expect(entropy).toBeGreaterThan(3.5);
  });

  it("returns lower entropy for dictionary word", () => {
    const entropy = shannonEntropy("password");
    expect(entropy).toBeLessThan(3.0);
  });

  it("returns high entropy for base64-like string", () => {
    const entropy = shannonEntropy("dGhpcyBpcyBhIHRlc3Qgc3RyaW5n");
    expect(entropy).toBeGreaterThan(3.5);
  });
});
