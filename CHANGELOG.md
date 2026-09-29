# Changelog

## 0.8.1

### Secret scanner — fewer false positives, wider coverage

- **Fixed entropy-layer false positives on descriptive/structured text.** High-entropy quoted strings that contain whitespace (prose, SPARQL, RDF `@prefix rdf: <http://…> .`, `print("ONTOLOGY EXAMPLE: …")`) or a `://` URI (namespaces, endpoints) are no longer flagged as secrets. Contiguous token secrets are still detected.
- **Fixed a Markdown blind spot.** A leading `#` is a heading in Markdown/prose (`.md`, `.markdown`, `.mdx`), not a comment — so a secret on a heading line is now scanned. HTML comments (`<!-- … -->`) are still skipped, and `#` remains a comment in code files.

## 0.8.0

### Secret scanner — accuracy & coverage

- **Fixed false positives** in the entropy layer: Subresource-Integrity / checksum digests (`sha256-…`, `sha512-…`) and base64 `data:` URIs are no longer flagged as secrets.
- **New detection rules:** npm authentication tokens (`npm_…`) and credentials embedded directly in URLs (`scheme://user:password@host`).
- **Fixed a config-file bug:** a leading `//` is no longer treated as a comment in config formats (`.npmrc`, `.ini`, `.properties`, `.env`), where it is part of the value — this had been silently hiding secrets in `.npmrc` auth lines.
- Result: 100% detection with 0 false positives on an independent adversarial corpus.

### Tooling — gitleaks secret scanning

- Added `.gitleaks.toml` (with an allowlist for the scanner's own dummy test fixtures), a CI workflow (`.github/workflows/gitleaks.yml`) that runs on every push/PR, a Husky pre-commit hook, and `scan:secrets` npm scripts.

### Tests

- Added `budget.ts` unit tests (0 → 100% coverage) and regex-injection safety tests. Suite is now 570 tests.

## 0.7.0

### Added

- **Context-budget bands** — context is now classified into `lean` / `heavy` / `bloated` bands based on absolute token count (independent of the tool's context-window limit), surfacing output-quality degradation ("context rot") before truncation is a concern. Configurable via `ai-preflight.budget.heavyTokens` (default 25k) and `ai-preflight.budget.bloatedTokens` (default 75k).

### Security

- **Regex-injection / ReDoS hardening** — workspace content search now escapes keyword input before building `RegExp` patterns. Keywords derived from prompt text and workspace file names could previously contain regex metacharacters, causing `SyntaxError` crashes or pathological backtracking.
- **Secret test fixtures excluded from Git** — added the secret-scanner's real-looking test fixtures (`test/.env`, `test/id_rsa`, `test/credentials.json`, `test/server.pem`, `test/terraform.tfstate`, `test/.npmrc`, `test/docker-compose.yml`) to `.gitignore` so they cannot be accidentally committed.

## 0.6.0

### Added

- **MCP config security scanner** — scans `.mcp.json`, `mcp.json`, `.vscode/mcp.json`, `.cursor/mcp.json`, `claude_desktop_config.json` for security issues before AI agents connect:
  - Embedded secrets: provider prefixes (AWS, GitHub, Stripe, OpenAI, Slack, GitLab), keyword secrets in env, credentials in URLs, auth tokens in headers, high-entropy env values
  - Tool description poisoning: hidden unicode, bidi overrides, prompt injection patterns, compound attack detection (auto-escalated to error)
  - Untrusted servers: non-HTTPS external connections, embedded credentials in URLs
  - Risky configs: ambiguous transport (command + url both defined)
- **Active-file MCP detection** — any open JSON file containing `mcpServers` is scanned even if filename doesn't match known patterns
- **JSONC support** — MCP configs with `//` comments are now parsed correctly
- **MCP Security** section in sidebar panel and @preflight chat output
- **Status bar labels** for MCP findings (secret in MCP config, suspicious MCP tool, untrusted MCP server)

### Fixed

- **Close button reliability** — tab close actions now collect tabs before closing to avoid mid-iteration mutation
- **Sidebar refresh after actions** — forced re-capture 300ms after action execution ensures sidebar updates immediately
- **Close tab fallback** — filename-only matching when exact path doesn't match (handles workspace path format differences)

## 0.5.3

### Fixed

- **Reduced entropy false positives** — container images (`registry.io/image:tag`), AWS ARNs (`arn:aws:...`), ECR URIs, domain/path combos, and version numbers no longer flagged as high-entropy secrets
- **Improved unquoted config detection** — file extension fallback (`.yml`, `.yaml`, `.properties`, `.env`, `.cfg`, `.conf`) ensures passwords are caught even when VS Code assigns unexpected languageId
- Added support for Ansible, CloudFormation, and conf languageIds

## 0.5.2

### Fixed

- **Unquoted secret detection** — keyword scanner now catches unquoted values in YAML, `.properties`, `.env`, `.ini`, TOML, and shell files (e.g., `db_password: Summer2026!`, `AUTH_TOKEN=my-secret`). Unquoted matching only activates for config-like languages to avoid false positives in code files.

## 0.5.1

### Added

- **Content-based secret scanner** — scans the active file's content for hardcoded secrets using 4 detection layers:
  - **Layer 1: Known provider prefixes** (severity: error) — AWS keys (`AKIA`/`ASIA`), GitHub tokens (`ghp_`), Stripe live keys, Google API keys (`AIza`), Slack tokens (`xox`), OpenAI keys (`sk-proj-`), GitLab tokens (`glpat-`), PEM private key blocks
  - **Layer 2: Keyword + assignment** (severity: warning) — detects any key ending in `password`, `pwd`, `passwd`, `pass`, `secret`, `token`, `api_key`, `apikey`, `auth_key`, `private_key`, `access_key`, `secret_key`, `conn_str`, `connection_string` followed by a hardcoded string value. Skips placeholders, env var references, and template variables.
  - **Layer 3: Shannon entropy** (severity: warning) — flags quoted strings with entropy >4.5 bits/char and >8 chars. Catches secrets regardless of key name. Skips URLs, file paths, and low-entropy text.
  - **Layer 4: Connection strings** (severity: warning) — detects `mongodb://`, `postgres://`, `mysql://`, `redis://`, `amqp://`, `mssql://`, JDBC, and .NET `Server=...;Password=...` patterns
- **Context filtering** — skips comment lines, test files, files >100KB, caps at 10 findings per file
- **Secret-based risk escalation** — Layer 1 findings (provider keys) set risk floor to HIGH; any secret finding escalates LOW to MEDIUM
- **Secrets Detected** section in sidebar panel and @preflight chat output
- **Status bar** shows "AWS Access Key exposed" or "hardcoded secret found" when secrets detected

## 0.5.0

### Added

- **Path-based sensitive directory detection** — detects cloud CLI config directories that contain real credentials regardless of filename:
  - AWS: `.aws/credentials`, `.aws/config`, `.aws/cli/cache/*.json` (STS tokens)
  - Azure: `.azure/accessTokens.json`, `.azure/azureProfile.json`
  - Docker: `.docker/config.json` (registry auth tokens)
  - Kubernetes: `.kube/config` (cluster credentials)
  - GCP: `.config/gcloud/application_default_credentials.json`, `.config/gcloud/credentials.db`
  - SSH: `.ssh/config`
- **Framework config detection** — detects application config files where secrets commonly end up:
  - Spring Boot: `application.properties`, `application.yml`
  - .NET: `appsettings.json`, `appsettings.Production.json` (and all environment variants)
  - WordPress: `wp-config.php`
  - Rails/Ansible: `secrets.yml`, `vault.yml`
  - Apache: `.htpasswd`
  - AWS CLI: `accessKeys.csv`, `.boto`, `.s3cfg`

### Changed

- Sensitive file detection expanded from 38 to 60+ patterns across three detection layers (filename, directory path, framework config)

## 0.4.0

### Added

- **Sensitive file detection** — detects 30+ file patterns that may contain secrets or private keys:
  - SSH keys (`id_rsa`, `id_ed25519`, `id_ecdsa`, `id_dsa` and `.pub` variants)
  - Certificates and encryption (`.pem`, `.key`, `.p12`, `.pfx`, `.jks`, `.crt`, `.csr`)
  - Credentials (`credentials.json`, `serviceAccountKey.json`, `firebase-adminsdk*.json`, `.npmrc`, `.pypirc`, `.netrc`, `.git-credentials`)
  - Infrastructure state (`terraform.tfstate`, `kubeconfig`)
  - Docker Compose files (excludes `.example`, `.sample`, and `.override` variants)
- **Data flow awareness** — when sensitive files are in context, explicitly names the provider and quantifies data:
  - "Sensitive files in context (~15k tokens) will be sent to **Anysphere** (Cursor)"
  - Supports all 7 AI tools with correct provider names (Anthropic, Anysphere, Microsoft/GitHub, Codeium, AWS, Google, OpenAI)
- **Security-aware risk escalation** — `sensitive-file` and `env-file` independently escalate risk to MEDIUM regardless of token band
- **Injection surface warning** — warns when context is >70% full with instruction files present, increasing prompt injection surface area
- **Provider field** on AI tool registry for all 7 supported tools
- **Status bar labels** for all new warning rules (`sensitive-file`, `data-flow-warning`, `unsaved-file`, `git-conflict-markers`)
- **1-click close** for sensitive files in both sidebar and @preflight chat output

### Fixed

- Status bar key mismatch: `conflict-markers` corrected to `git-conflict-markers`
- Token display shows exact count below 1k instead of `~0k tokens`
- Docker-compose.override.yml no longer flagged as sensitive (standard dev pattern)

## 0.3.1

- Clean build for Marketplace update

## 0.3.0

### Added

- **Integrity scanner** for AI instruction files — detects supply-chain attacks before they execute:
  - Hidden unicode characters (zero-width spaces, tag characters, invisible formatters)
  - Bidirectional override characters (Trojan Source attack, CVE-2021-42574)
  - Suspicious prompt injection patterns ("ignore previous instructions", role hijacking, data exfiltration)
  - **Compound attack detection** — multiple techniques on same line auto-escalated to error severity
- **Integrity-based risk floor** — error findings set minimum HIGH risk, warning findings set minimum MEDIUM
- **Integrity alerts** in @preflight chat output with severity-based icons
- **Stale cache fix** — re-scans instruction files on save so edits are reflected immediately

## 0.2.1

- Exclude vendored and generated directories from workspace search
- Resolve picomatch security vulnerabilities
- Skip dev dependencies in security audit

## 0.2.0

### Added

- **Workspace search in @preflight** — finds related files not currently open using five search strategies:
  - Import graph traversal from the active file
  - Filename matching against prompt keywords
  - Test/source pair detection (e.g., `auth.ts` finds `auth.test.ts`)
  - Nearby folder search for sibling files
  - Content search for keyword matches inside files
- **Ranked results** — workspace matches scored by relevance (import > filename > test pair > nearby > content) with confidence tiers
- **Grouped output** — results split into "strongly related" and "possibly related" with actionable tips
- **Human-friendly labels** — match reasons displayed as "Imported by active file", "Test companion", etc.
- **Noise filtering** — minimum score threshold filters weak signals; word-boundary matching prevents partial keyword matches; non-code files excluded from nearby results

### Changed

- Shared import pattern extraction (DRY refactor between prompt-analyzer and tool-aware-analyzer)
- @preflight chat handler is now async with cancellation token support

## 0.1.3

- Initial public release
- Sidebar panel with token estimation, waste detection, and suggestions
- @preflight chat participant with task classification and context-intent matching
- Tool-aware analysis for 7 AI coding assistants
- 17 waste detection rules
- 1-click action fixes
- Outcome intelligence after 5+ sessions
