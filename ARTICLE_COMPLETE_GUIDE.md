# AI Preflight: Context Security for AI-Assisted Development

## The Problem

Every AI coding tool reads your open files. Active editor. Open tabs. Instruction files. All of it becomes the prompt. All of it leaves your machine.

Nobody shows you what's included. Nobody tells you how much. Nobody tells you where it goes.

Three problems hide in that invisible layer.

**Your secrets leak through prompts, not commits.**
That `.env` with your database password — in context. That `credentials.json` from a debug session — still in a tab. That `.aws/cli/cache/abc123.json` with temporary STS tokens — forgotten since yesterday. Three prompts later, all of it is on a third-party server. Pre-commit hooks catch secrets after you commit. GitGuardian catches them after you push. Nothing catches secrets in the 30 seconds between opening a file and prompting the AI.

**Your context is full of noise, and you don't know it.**
You're debugging an auth function. You have 12 tabs open — a lock file burning 15k tokens, a 2,500-line legacy file the AI reads top to bottom, three test files from yesterday, a generated `.map` file. Your AI spends half its context window on code that has nothing to do with your prompt. The response is vague, generic, unhelpful. You re-prompt. Same result. The problem isn't the AI. The problem is the context you're feeding it.

**Your instruction files could be weaponized.**
`.cursorrules`, `CLAUDE.md`, `copilot-instructions.md` — your AI follows them blindly. Attackers hide invisible unicode characters, bidirectional overrides, and prompt injection payloads inside them. The file looks clean. It isn't. Research shows attack success rates of 85% across every major coding agent.

**You don't know which company receives your code.**
Cursor sends to Anysphere. Copilot sends to Microsoft. Claude Code sends to Anthropic. Most developers know their tool's name. Few know the company behind it. Fewer know how much context — 10k tokens? 50k? 150k? — leaves with every prompt.

---

## What We Built

AI Preflight is a VS Code extension that sits between your editor and your AI tool. It scans your context before every prompt and shows you what your AI is about to read.

Everything runs locally. No code leaves your machine through AI Preflight. No telemetry. No network requests. No API keys.

### Sensitive File Detection

We built three detection layers — because filename scanning alone isn't enough.

**By filename** — `.env`, `id_rsa`, `credentials.json`, `terraform.tfstate`, lock files, certificates. 30+ patterns covering SSH keys, cloud credentials, infrastructure state, and package manager tokens.

**By directory path** — `.aws/credentials`, `.aws/cli/cache/*.json`, `.docker/config.json`, `.kube/config`, `.azure/accessTokens.json`. Cloud CLI directories where real tokens live in files with innocent names.

**By framework config** — `application.properties` (Spring Boot), `appsettings.json` (.NET), `wp-config.php` (WordPress), `secrets.yml` (Rails/Ansible). The files every developer opens but no scanner watches.

60+ patterns total. One click closes the tab.

### Content-Based Secret Scanner

Filenames and paths aren't enough. A password hardcoded in `config.yaml` or an AWS key pasted in `utils.ts` has an innocent filename but dangerous content.

We scan the active file's content using four detection layers:

**Known provider prefixes** — AWS keys (`AKIA`), GitHub tokens (`ghp_`), Stripe, Google, Slack, OpenAI, GitLab, PEM private keys. These prefixes are unique to their provider — near-zero false positives.

**Keyword + assignment** — any key ending in `password`, `pwd`, `secret`, `token`, `api_key`, followed by a hardcoded value. Works with any prefix — `ml_ref_password`, `db_pwd`, `jwt_secret`. Skips placeholders, env references, template variables, and encrypted vault values.

**Shannon entropy** — catches secrets that no keyword scanner can. The string looks random? The math flags it. Doesn't matter what the variable is called. Skips URLs, file paths, container images, and version numbers.

**Connection strings** — MongoDB, PostgreSQL, MySQL, Redis, JDBC, .NET formats with embedded credentials.

### Data Flow Transparency

When sensitive files are in context, we tell the developer exactly what's about to happen:

*"Sensitive files (~15k tokens) will be sent to Anysphere (Cursor)"*

Not a generic warning. The company name. The data size. Seven AI tools mapped to their providers — Anthropic, Anysphere, Microsoft/GitHub, Codeium, AWS, Google, OpenAI.

### Instruction File Integrity Scanner

AI instruction files — `.cursorrules`, `CLAUDE.md`, `copilot-instructions.md` — are followed blindly by AI tools. They're executable instructions.

We scan them for hidden unicode characters (invisible to humans, parsed by AI), bidirectional overrides (code looks normal, reads differently), prompt injection patterns, and compound attacks (multiple techniques on the same line — auto-escalated to critical).

### Token Estimation

Developers have no idea how many tokens their context consumes. A 2,500-line file? That's ~15k tokens. Twelve open tabs? That could be 40k. Are you near your tool's limit? Nobody tells you.

We estimate token count for the entire context — active file, selection, open tabs — and show a range with confidence level. A per-file breakdown shows which files are burning the most tokens, sorted by percentage. Context window usage shows where you stand against your tool's specific limit — 75k for Amazon Q, 150k for Claude Code, 200k for Cursor.

When you're above 90%, you get a truncation risk warning. Your AI response may be cut off. Reduce context or start fresh.

### Waste Detection and Suggestions

20+ rules that run automatically on every context change. Lock files burning thousands of tokens. Generated code in `dist/` and `node_modules/`. Too many open tabs. Unsaved files the AI might see a stale version of. Merge conflict markers confusing the AI. Duplicate tabs doubling your token cost. Test files mixed with production code.

Every waste pattern comes with a suggestion — not just "there's a problem" but "here's what to do about it." And most suggestions come with a one-click fix button. Close the lock file. Save the unsaved changes. Select a function instead of the whole 2,500-line file. Create a missing instruction file with a boilerplate template.

We also detect what you're doing right — clean context, focused selection, instruction files active, tabs concentrated in related modules. Positive signals alongside the warnings. Because a tool that only criticizes creates alert fatigue.

After 5+ sessions, outcome intelligence kicks in — tracking re-prompt rates, undo patterns, and repeated edits, correlating them with risk levels to show you: "High-risk sessions have 2.3x more re-prompts." Better context leads to better AI responses. The data proves it.

### Prompt-Aware Analysis

Type `@preflight refactor the auth service` in Copilot Chat. It classifies your task, matches open files against your prompt, finds missing dependencies, identifies irrelevant tabs wasting tokens, and searches your workspace for files you should open — using import graphs, filename matching, test pair detection, and content search.

### Risk Scoring

A single glanceable indicator — LOW, MEDIUM, HIGH — in the status bar. Escalates automatically based on waste patterns, security-sensitive files, integrity findings, and hardcoded secrets. Color-coded with the top reason in human-readable text.

---

## How to Use It

### Install

Search "AI Preflight" in the VS Code Extensions panel. Install. Done.

No setup. No config. No API keys. Analysis starts automatically when you open a project.

### The Status Bar

Bottom-right corner of VS Code. Always visible.

- Green: `Preflight: LOW` — context is clean
- Yellow: `Preflight: MED — sensitive file open` — something needs attention
- Red: `Preflight: HIGH — AWS Access Key exposed` — act before prompting

Click it to open the full sidebar panel.

### The Sidebar Panel

`Cmd+Shift+I` (Mac) or `Ctrl+Shift+I` (Windows/Linux).

Shows everything: risk level, token estimate, per-file token breakdown, context window usage, detected waste patterns, integrity alerts, hardcoded secrets, positive signals, and actionable suggestions with one-click fix buttons.

### @preflight Chat

Type `@preflight` followed by your prompt in GitHub Copilot Chat.

```
@preflight refactor the auth service
```

Returns prompt-aware analysis — which files match your intent, which are missing, which are wasting tokens, and files in your workspace you should open. Includes task classification, scope hints, and action buttons.

### One-Click Fixes

Most warnings include an action button — Close, Save, Select, Create, Focus. One click fixes the problem. Close a sensitive tab, save an unsaved file, create a missing instruction file, narrow your selection to a function.

### Settings

| Setting | What It Does |
|---------|-------------|
| `ai-preflight.aiTool` | Set your AI tool (auto-detected by default) |
| `ai-preflight.aiModel` | Override model for context window limits |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+I` | Toggle sidebar panel |
| `Cmd+Shift+P` → "Analyze Context" | Manual analysis trigger |
| `Cmd+Shift+P` → "Export Context" | Copy context report to clipboard |

---

## What Makes It Different

Every security scanner in the market operates on committed code — git history, staged files, pushed branches. They catch secrets after the damage is done.

AI Preflight operates on your live editor state — what's open right now, what your AI is about to read, before you prompt. That's a different problem. A different moment. A different gap.

And it does it without ever touching your code. Local-only. No telemetry. No network requests. No data collection.

The tool that checks your security should never compromise it.

---

## What's Next

Content scanning improvements — broader coverage, fewer false positives, smarter context filtering. Team-level analytics. Session logging for audit trails. More AI tool integrations as the ecosystem evolves.

The attack surface between developers and AI tools is growing. We're building the observability layer to keep up.

---

*AI Preflight is free and open source. MIT licensed.*

*VS Code Marketplace: Search "AI Preflight"*
*GitHub: [github.com/deepwissen/ai-preflight](https://github.com/deepwissen/ai-preflight)*
