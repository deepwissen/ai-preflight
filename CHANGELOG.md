# Changelog

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
