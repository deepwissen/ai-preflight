# AI Preflight

**See what your AI coding assistant sees — before you hit send.**

AI Preflight is a VS Code extension that gives you visibility into the context being sent to your AI tool. It estimates token usage, detects waste, identifies risks, and suggests fixes — so you get better AI responses with fewer wasted tokens.

Works with **GitHub Copilot, Cursor, Claude Code, Windsurf, Amazon Q, Gemini, and ChatGPT**.

![VS Code](https://img.shields.io/badge/VS%20Code-1.95+-blue) ![License](https://img.shields.io/badge/license-MIT-green)

---

## Why?

When you use an AI coding assistant, it silently gathers context — your open files, selections, tabs, terminal output — and sends it as part of your prompt. You have no visibility into:

- **How much** context is being sent (and what it costs in tokens)
- **Whether** that context is noisy, wasteful, or irrelevant
- **What's missing** that would help the AI give a better answer

AI Preflight makes this invisible layer visible — and actionable.

---

## Features

### Always-On Status Bar

A persistent indicator in the bottom-right corner shows your current context risk level (LOW / MEDIUM / HIGH) with the top reason — like "lock file open" or "large data file". Click to open the full panel.

### Sidebar Panel

A dedicated panel showing:

- **Risk level** with color-coded badge
- **Token estimate** with per-file breakdown showing what's consuming the budget
- **Context window usage** — percentage of your AI tool's context window in use (e.g., "~68k of 75k tokens")
- **Waste patterns** detected with severity
- **Positive signals** — things you're doing right
- **Actionable suggestions** with 1-click fixes — close tabs, create instruction files, select a function, and more

### @preflight Chat Participant

Type `@preflight` in GitHub Copilot Chat followed by your prompt to get **prompt-aware analysis**:

```
@preflight refactor the auth service
```

Returns:
- **Task type** classification (debugging, refactoring, coding, etc.)
- **Relevant files** — which open files match your intent
- **Missing context** — files mentioned in your prompt that aren't open
- **Low-relevance files** — open tabs unlikely related to your task, with wasted token estimates
- **Scope hints** — warnings when prompts are too broad or too vague
- **Workspace search** — finds related files you haven't opened yet:
  - **Imported by active file** — follows import paths from your current file
  - **Filename matches** — searches the workspace for files matching your prompt keywords
  - **Test companions** — finds matching test or source files
  - **Nearby files** — sibling files in the same directory as matched files
  - **Content matches** — files containing your prompt keywords
  - Results are ranked by relevance and grouped into **strongly related** and **possibly related** with actionable tips

### Security: Sensitive File Detection

Detects 30+ file patterns that may contain secrets or private keys — and warns before they're sent to AI:

| Category | Patterns Detected |
|----------|------------------|
| **SSH Keys** | `id_rsa`, `id_ed25519`, `id_ecdsa`, `id_dsa` (and `.pub` variants) |
| **Certificates** | `.pem`, `.key`, `.p12`, `.pfx`, `.jks`, `.crt`, `.csr` |
| **Credentials** | `credentials.json`, `serviceAccountKey.json`, `firebase-adminsdk*.json`, `.npmrc`, `.pypirc`, `.netrc`, `.git-credentials` |
| **Infrastructure** | `terraform.tfstate`, `kubeconfig` |
| **Environment** | `.env`, `.env.local`, `.env.production`, etc. |
| **Docker Compose** | `docker-compose.yml` (excludes `.example`, `.sample`, `.override` variants) |

### Security: Data Flow Transparency

When sensitive files are detected, AI Preflight tells you **which company** will receive your data and **how much**:

```
⚠ Sensitive files in context (~15k tokens) will be sent to Anysphere (Cursor)
```

| AI Tool | Provider Shown |
|---------|---------------|
| Claude Code | Anthropic |
| Cursor | Anysphere |
| GitHub Copilot | Microsoft/GitHub |
| Windsurf | Codeium |
| Amazon Q | AWS |
| Gemini | Google |
| ChatGPT | OpenAI |

### Security: Integrity Scanner

Scans AI instruction files (`.cursorrules`, `CLAUDE.md`, etc.) for supply-chain attacks:

- **Hidden unicode** — zero-width characters used to hide malicious instructions
- **Bidirectional overrides** — text reordering attacks (CVE-2021-42574)
- **Prompt injection** — "ignore previous instructions", role hijacking, data exfiltration patterns
- **Compound attack detection** — multiple techniques on same line auto-escalated to error severity

### Tool-Aware Analysis

Auto-detects which AI tool you're using and adapts analysis:

- **Context window limits** per tool and model
- **Instruction file checks** — missing `.cursorrules`, `CLAUDE.md`, `.github/copilot-instructions.md`, etc.
- **Instruction file quality** — warns on empty, too-short, or too-long instruction files
- **Ignore file checks** — missing `.cursorignore`, `.copilotignore`, etc.
- **Tab suppression** — skips tab-related warnings for tools that don't use tabs as context
- **Truncation risk** — warns when context is likely to be cut off
- **Injection surface warning** — alerts when large context + instruction files increase attack surface

### Waste Detection

20+ rules that run automatically on every context change:

| Category | Examples |
|----------|----------|
| **Security** | Sensitive files (SSH keys, certs, credentials), `.env` files, data flow warnings |
| **High severity** | Lock files open, generated files, files > 1,000 lines |
| **Medium severity** | Too many tabs (10+), tabs spanning unrelated modules, no selection on large files, unsaved changes |
| **Low severity** | High comment ratio, duplicate tabs, merge conflict markers, language mismatch, mixed test + production files |

### 1-Click Fixes

Many suggestions include an executable action — close sensitive files, close unrelated tabs, save the file, create a missing `.cursorrules`, select the current function instead of the whole file, and more. One click, problem solved.

### Outcome Intelligence

After 5+ analysis sessions, AI Preflight starts showing insights about your patterns — like how often high-risk sessions lead to re-prompts. Helps you build better habits over time.

---

## Quick Start

1. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=KiranChanda.ai-preflight)
2. Open any project — analysis starts automatically
3. Check the **status bar** for your risk level
4. Open the **sidebar** (`Cmd+Shift+I` / `Ctrl+Shift+I`) for full details
5. Try `@preflight fix the auth bug` in Copilot Chat for prompt-aware analysis

### Commands

| Command | Keybinding | Description |
|---------|-----------|-------------|
| `AI Preflight: Analyze Context` | — | Run analysis manually |
| `AI Preflight: Toggle Panel` | `Cmd+Shift+I` | Show/hide the sidebar |
| `AI Preflight: Export Context to Clipboard` | — | Copy context summary |

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `ai-preflight.aiTool` | `auto` | Your AI tool (auto-detect, or set manually) |
| `ai-preflight.aiModel` | — | Optional model override for context window limits |

---

## Privacy

**All analysis is local. No code leaves your machine. Ever.**

- No network requests
- No telemetry
- No API keys required
- No data sharing

See [PRIVACY.md](PRIVACY.md) for the full privacy contract.

---

## Contributing

```bash
git clone https://github.com/deepwissen/ai-preflight.git
cd ai-preflight
npm install
```

| Script | Description |
|--------|-------------|
| `npm run dev` | Watch mode — rebuilds on changes |
| `npm run build` | Production build |
| `npm test` | Run all tests |
| `npm run typecheck` | TypeScript strict mode check |

Press **F5** in VS Code to launch the Extension Development Host for testing.

See [DEV_SETUP.md](DEV_SETUP.md) for architecture details and coding conventions.

---

## Feedback

Found a bug? Have a feature request? [Open an issue on GitHub](https://github.com/deepwissen/ai-preflight/issues).

---

## License

[MIT](LICENSE) — Copyright (c) 2026 Deep Wissen
