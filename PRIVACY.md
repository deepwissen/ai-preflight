# AI Preflight — Privacy Contract

## Core Commitment

**All analysis is local. No code leaves your machine. Ever.**

---

## What AI Preflight Does

- Reads the active file name, line count, and character count via VS Code APIs
- Reads selected text length and content (truncated to 10,000 characters in memory)
- Reads the list of open tabs (file paths only)
- Detects which AI tool extensions are installed (extension IDs only)
- Checks for AI instruction files (`.cursorrules`, `CLAUDE.md`, etc.) — reads size, not content
- Estimates token counts using a local heuristic (no API calls)
- Evaluates waste detection rules locally
- Tracks analysis sessions locally for outcome insights (risk levels and suggestion IDs only)
- Displays results in a sidebar panel and @preflight chat participant

## What AI Preflight Does NOT Do

| Action | Status |
|--------|--------|
| Send code to any server | Never |
| Send telemetry or analytics | Never (v1 has zero telemetry) |
| Read clipboard automatically | Never (privacy boundary) |
| Read terminal buffer passively | Never (VS Code API limitation + privacy) |
| Store code content on disk | Never (only metadata like file paths and char counts) |
| Make network requests | Never (no internet access needed) |
| Access AI provider APIs | Never (no API keys, no tokens) |
| Share data between users | Never (local-only) |

## What Gets Stored Locally

Session data is stored in VS Code workspace state. These entries contain:

- Timestamp
- Token band (low/medium/high)
- Risk level
- Rule IDs triggered
- Suggestion IDs shown, accepted, or dismissed

They do **NOT** contain:

- File contents
- Code snippets
- Selection text
- File paths (beyond workspace-relative names)

## If Telemetry Is Ever Added

It will be:

- **Opt-in only** — never opt-out
- **Aggregate counts only** — never code content
- **Documented here** — this file will be updated before any telemetry ships
- **User-controllable** — a single setting to disable

## Open Source

This extension is MIT licensed. The source code is publicly auditable.
