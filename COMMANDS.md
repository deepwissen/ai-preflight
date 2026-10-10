# AI Preflight — Command Reference

AI Preflight analyzes your IDE context **before** you prompt your AI coding tool.
Open the panel and it updates live as you switch files and tabs. All analysis is
local and detect-and-explain only.

## Command palette (`Cmd/Ctrl+Shift+P`)

| Command | Does |
|---|---|
| **AI Preflight: Analyze Context** (`ai-preflight.analyze`) | Run analysis now on the current IDE state, show result in the panel |
| **AI Preflight: Toggle Panel** (`ai-preflight.togglePanel`) | Open/focus the sidebar — keybinding **`Cmd/Ctrl+Shift+I`** |
| **AI Preflight: Export Context to Clipboard** (`ai-preflight.exportContext`) | Copy a Markdown report of context + findings to paste anywhere |

The remaining commands — **Open Files** (`ai-preflight.openFiles`), **Copy File
References** (`ai-preflight.copyFileRefs`), **Close Waste Tabs**
(`ai-preflight.closeWasteTabs`), **Create Focused View**
(`ai-preflight.createFocusedView`) — are internal, triggered by buttons in the
panel and chat, not meant to be run directly.

## Chat participant

```
@preflight
```

In the VS Code chat, type `@preflight` to get risk level, token usage, waste
patterns, and suggested files to add/remove — before you send your real prompt.

## The panel (sidebar view "AI Preflight")

Shows live: **risk level** · **token/budget estimate** · **waste patterns** ·
**positive signals** · **1-click fix buttons** (close waste tabs, create a focused
view, add an instruction/ignore file).

## Settings (`settings.json` → `ai-preflight.*`)

| Setting | Default | Use |
|---|---|---|
| `ai-preflight.aiTool` | `"auto"` | Your AI tool (sets context-window limits, tool-specific warnings) |
| `ai-preflight.aiModel` | `""` | Specific model within that tool |
| `ai-preflight.budget.heavyTokens` | `25000` | Flag context as "heavy" above this — lower = stricter |
| `ai-preflight.budget.bloatedTokens` | `75000` | Flag "bloated" (context-rot territory); must be > heavy |

## Feature by feature (how to use each)

- **Context budget / token estimate** — open the panel; tune with `budget.*`
  settings; watch the band (ok → heavy → bloated).
- **Waste detection** (large/lock/env/generated files, too many tabs, conflict
  markers, unsaved) — the panel lists them; click **Close Waste Tabs** /
  **Create Focused View**.
- **Risk level + status bar** — glance at the status bar
  (`Preflight: LOW/MED/HIGH — reason`); click it to open the panel.
- **Secret / trap / integrity / MCP** (same engine as `vet`) — surfaces
  automatically when the active file, an instruction file, or an MCP config
  contains an issue.
- **Instruction-file hygiene** — if none is found, the panel offers **Create
  Instruction File**; `.claudeignore`/`.cursorignore` via **Create Ignore File**.
- **Export** — `AI Preflight: Export Context to Clipboard`, then paste into your
  prompt or a ticket.

## Repo-maintenance scripts (for this project, not end users)

| Script | Does |
|---|---|
| `npm run scan:secrets` | gitleaks scan of the working tree |
| `npm run scan:secrets:history` | gitleaks scan of the full git history |
| `npm run package` | Build + `vsce package` the extension |
| `npm run publish` | `vsce publish` to the Marketplace |
| `npm run build` / `dev` | esbuild production / watch |
| `npm test` · `lint` · `format:check` · `typecheck` | Quality gates |

## Related

- **`vet`** — the CLI built on the same detection engine: a pre-PR gate for
  secrets, trap files, and risky tool configs. See that repo's `COMMANDS.md`.
- **`@deepwissen/preflight-core`** — the shared detection engine (a library, no
  commands) that both `ai-preflight` and `vet` consume.
