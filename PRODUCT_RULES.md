# AI Preflight — Product Rules

This is the single source of truth for what the product measures, how it scores, and what it suggests. Every UI element maps to a rule defined here. If a behavior isn't in this document, it shouldn't be in the product.

---

## Current Scope (v0.1)

### What's Shipped

| Capability | Description |
|------------|-------------|
| Context visibility | Show active file, selection, open tabs |
| Token estimation | Approximate token range with per-file breakdown |
| Risk scoring | LOW / MEDIUM / HIGH based on token size + waste |
| Waste detection | 17 pattern rules across 3 tiers |
| Suggestions | Actionable text with 1-click fixes |
| Status bar | Risk indicator with top reason |
| Tool-aware analysis | Auto-detect AI tool, context window usage, instruction/ignore file checks |
| Chat participant | `@preflight` in Copilot Chat with prompt-aware analysis |
| Positive signals | Detect and display good practices |
| Outcome intelligence | Session tracking, re-prompt correlation |
| Dismissal tracking | Auto-expiring, persisted suggestion dismissals |
| Export context | Copy context summary to clipboard |

### Not Yet Built

| Excluded | Why |
|----------|-----|
| Prompt interception | Not possible without Copilot cooperation |
| Cloud sync | Local-only, no backend |
| Org policy engine | No multi-user features yet |
| Secret scanning | Scope landmine, integrate later if needed |
| MCP server | Wait for ecosystem stability |
| Custom user rules | Ship with defaults first |
| Telemetry | None — opt-in only if ever added |

---

## Context Definition

### What counts as "context" in Phase 1

The product observes what the developer is likely sending to an AI assistant. Phase 1 captures:

| Source | How captured | Included in estimates |
|--------|-------------|----------------------|
| Active file | `vscode.window.activeTextEditor` | Full file char count |
| Selected text | `editor.selection` | Selection char count (replaces file in estimate) |
| Open tabs | `vscode.window.tabGroups` | 30% of each tab's char count (heuristic) |
| Referenced files | Text parsing of prompt | Full file char count |

### What is NOT captured in Phase 1

| Source | Why not |
|--------|---------|
| Terminal buffer | VS Code API doesn't expose it passively. Only captured if user shares explicitly. |
| Clipboard content | Privacy — we don't read clipboard automatically |
| Chat history | No API access to Copilot chat. Phase 2 via @advisor participant. |
| Diagnostics / Problems | Could be useful but adds complexity. Defer. |
| Recent edits / undo history | No clear signal for AI context. Defer. |
| Git diff | Useful but not core observability. Defer. |

### Selection Override Rule

When the developer has text selected, the estimate uses **selection size instead of full file size**. Rationale: AI assistants typically send the selection as context, not the entire file.

---

## Risk Scoring Model

### How risk level is calculated

Risk is determined by **token estimate midpoint** combined with **waste pattern count**.

```
Step 1: Calculate token midpoint
  midpoint = totalChars / 4

Step 2: Classify token band
  < 2,000 tokens   → LOW
  2,000–8,000      → MEDIUM
  > 8,000          → HIGH

Step 3: Boost risk if waste is present
  If waste patterns found AND token band is LOW  → bump to MEDIUM
  If waste patterns ≥ 2 AND token band is MEDIUM → bump to HIGH
  Otherwise → keep token band as risk level
```

### Risk level definitions

| Level | Color | Status Bar | Meaning |
|-------|-------|------------|---------|
| LOW | Green (#4caf50) | `$(pass) AI: LOW` | Context is small and clean. No action needed. |
| MEDIUM | Yellow (#ff9800) | `$(warning) AI: MED` | Context is moderate or has minor waste. Review suggested. |
| HIGH | Red (#f44336) | `$(error) AI: HIGH` | Context is large or has significant waste. Action recommended. |

### Scoring is deterministic

The same context snapshot must always produce the same risk level. No randomness. No ML. No probability. A developer should be able to predict the risk level by looking at their context.

---

## Token Estimation Rules

### Heuristic

```
lowEstimate  = totalChars / 5    (generous — assumes efficient tokenization)
highEstimate = totalChars / 3    (conservative — assumes verbose tokenization)
midpoint     = totalChars / 4    (used for risk classification)
```

### Confidence levels

| Confidence | Condition |
|------------|-----------|
| LOW | Terminal content or clipboard is included (uncertain content) |
| MEDIUM | Only active file and/or selection (default) |
| HIGH | Multiple tabs + referenced files present (good coverage) |

### Display format

Always show as a **range**, never a single number:

```
~2.0k – 3.3k tokens
Confidence: medium
```

---

## Waste Detection Rules

### Rule definitions

Each rule has: trigger condition, severity, and a specific suggestion.

#### Original Rules (Phase 1)

| Rule ID | Trigger | Severity | Suggestion text |
|---------|---------|----------|-----------------|
| `large-terminal` | Terminal content > 200 lines | warning | "Terminal output is {N} lines — include only the stack trace or last 20 lines" |
| `generated-file` | Active file matches generated patterns (`.map`, `.min.js`, `dist/`, etc.) | warning | "Open the source file instead of generated output" |
| `large-file` | Active file > 1,000 lines or > 40,000 chars | warning | "{filename} is {N} lines — select the relevant function instead" |
| `lock-file` | Lock file open (package-lock.json, pnpm-lock.yaml, etc.) | warning | "Lock files are auto-generated — close this tab" |
| `env-file` | `.env` file open (any variant) | warning | "Close .env files before prompting — secrets may leak to AI" |
| `large-selection` | Selection > 500 lines | info | "Selection is {N} lines — consider narrowing to the relevant block" |
| `many-tabs` | Open tabs > 10 | info | "{N} tabs open — close irrelevant ones to reduce context noise" |

#### Tier 1 — High Impact (Phase 1b)

| Rule ID | Trigger | Severity | Suggestion text |
|---------|---------|----------|-----------------|
| `ai-instructions-missing` | No `.cursorrules`, `CLAUDE.md`, `.github/copilot-instructions.md`, or `.cursorignore` in workspace | info | "Add AI instruction files for a quality boost" |
| `unsaved-file` | Active file has unsaved changes (`isDirty`) | warning | "Save before prompting — AI may see stale version" |
| `test-prod-mixed` | Test files (`.test.ts`, `.spec.ts`, `__tests__/`) open alongside source files (3+ tabs total) | info | "Close test files when working on implementation" |
| `unrelated-tabs` | Open tabs span 4+ distinct modules (by first 2 path segments) | info | "Focus on one module — close unrelated tabs" |
| `no-selection-large-file` | File is 500+ lines with no text selected | warning | "Select the relevant function before prompting" |

#### Tier 2 — Medium Impact (Phase 1b)

| Rule ID | Trigger | Severity | Suggestion text |
|---------|---------|----------|-----------------|
| `commented-code` | Active file > 50 lines with > 30% comment lines | info | "Remove commented-out code before prompting" |
| `duplicate-tab` | Same file open in multiple editor groups | info | "Close duplicate tabs — they double context" |
| `git-conflict-markers` | Active file contains `<<<<<<<`, `=======`, `>>>>>>>` | warning | "Resolve merge conflicts before asking AI" |
| `data-file` | Large CSV, JSON, XML, YAML, SQL data file open (> 50,000 chars) | warning | "Data files burn tokens — close them" |
| `language-mismatch` | 3+ open tabs in different language than active file | info | "Close tabs with unrelated languages" |

**Total: 17 waste detection rules.**

### Severity definitions

| Severity | UI treatment |
|----------|-------------|
| `warning` | Yellow warning icon, higher priority in suggestion list |
| `info` | Blue info icon, lower priority in suggestion list |

### Rule evaluation

- All rules run on every context update
- Rules are **independent** — each evaluates separately
- Multiple rules can trigger simultaneously
- Rules are **not** cumulative (each pattern is reported individually)

### Suggestion priority

Suggestions are ordered by priority (1 = highest). Within the same severity, order by rule evaluation order.

### Suggestion dismissal

- User can dismiss a suggestion with the X button
- Dismissed suggestions do not reappear for the same context snapshot
- If context changes (new file, new selection), dismissed suggestions can reappear if the pattern still matches

---

## Exact UI Mapping

### Status bar

| State | Text | Background |
|-------|------|------------|
| Low risk | `$(pass) AI: LOW` | Default |
| Medium risk | `$(warning) AI: MED` | Warning background |
| High risk | `$(error) AI: HIGH` | Error background |

Click action: focus the AI Preflight sidebar panel.

### Sidebar sections (top to bottom)

1. **Risk Badge** — colored dot + "Prompt Risk: {LEVEL}"
2. **Context Sources** — list of waste patterns (if any), or "No context issues detected"
3. **Prompt Estimate** — "~{low}k – {high}k tokens" + "Confidence: {level}"
4. **Suggestions** — dismissible cards with suggestion text (only if waste patterns exist)

### Empty state

When no editor is active:

```
Waiting for context...
```

Subtitle: Open a file to start analyzing.

---

## Known Improvements Backlog

Identified issues and improvements to address in future iterations, organized by priority.

### High Priority — Functional Bugs & Gaps

| # | Issue | Impact | Details |
|---|-------|--------|---------|
| 1 | **Pipeline array merge overwrites** | Data loss risk | `pipeline.ts` uses `{ ...partial, ...result }` which silently replaces arrays. Fix: merge arrays by concatenation in the pipeline runner. |
| 3 | **Webview loses state when hidden** | Poor UX | Switching sidebar panels and back shows "Waiting for context..." until next event. Fix: call `setState({ result })` after updates, `getState()` on mount. |

### Medium Priority — Quality & Maintainability

| # | Issue | Impact | Details |
|---|-------|--------|---------|
| 6 | **Token estimator confidence logic** | Spec mismatch | Uses `\|\|` (OR) for high confidence but `PRODUCT_RULES.md` says "multiple tabs + referenced files present" (AND). Fix: change to `&&`. |
| 7 | ~~**`test-large-file.ts` in repo root**~~ | **FIXED** | Deleted. |
| 8 | **`detectAiInstructionFiles` silently swallows errors** | Silent failure | If `findFiles` throws, cache stays `[]` forever, always showing missing-instructions warning. Fix: add try-catch inside the async method. |
| 9 | **No Preact error boundary** | Crash = blank panel | A render error crashes the entire sidebar with no recovery. Fix: add error boundary component with friendly fallback UI. |
| 10 | ~~**Stale documentation**~~ | **FIXED** | All docs updated to reflect current feature set and 247 tests. |
| 11 | **CI doesn't enforce coverage** | Quality gap | Vitest config defines 80%/80%/70% thresholds but CI runs `pnpm test` without `--coverage`. Fix: add `pnpm test -- --coverage` to CI workflow. |
| 12 | **No `activate()` error handling** | Extension crash | If `contextBridge.activate()` throws, entire extension fails. Fix: wrap in try-catch with graceful degradation. |
| 13 | ~~**Dead types in codebase**~~ | **FIXED** | Removed unused types. |

### Low Priority — Polish & Extensibility

| # | Issue | Impact | Details |
|---|-------|--------|---------|
| 14 | **`togglePanel` doesn't toggle** | UX mismatch | Named "Toggle Panel" but only opens/focuses, never closes. Fix: check visibility and close if visible. |
| 15 | **`onStartupFinished` is eager** | Startup overhead | Extension activates on every startup even if sidebar is never opened. Fix: use `onView:ai-preflight.panel` with `onCommand` fallback. |
| 16 | **`Math.random()` for CSP nonce** | Security hygiene | Not cryptographically secure. Fix: use `crypto.randomBytes(16).toString('hex')`. |
| 17 | **Hardcoded risk badge colors** | Accessibility | Colors `#4caf50`, `#ff9800`, `#f44336` fail in high-contrast themes. Fix: use VS Code theme variables or add high-contrast mode detection. |
| 18 | **No `once()` on EventBus** | Missing feature | Common pattern for one-time initialization events. Fix: add `once()` method. |
| 19 | **Comment counting is language-agnostic** | False positives | Counts JSDoc as waste, doesn't handle Python docstrings or HTML comments. Fix: make language-aware or exclude JSDoc. |
| 20 | **Inline styles in Preact components** | Maintenance burden | Creates new objects on every render, prevents CSS pseudo-classes. Fix: move to `<style>` block or CSS classes. |
| 21 | ~~**Missing marketplace metadata**~~ | **FIXED** | Published to VS Code Marketplace as `KiranChanda.ai-preflight`. Repository URL added. |
| 22 | **`Cmd+Shift+I` conflicts with DevTools** | Keybinding clash | Conflicts with "Toggle Developer Tools" in some configurations. Fix: consider alternative keybinding. |
| 23 | **No webview message validation** | Robustness | `onDidReceiveMessage` doesn't validate `message.id` type or value. Fix: add input validation. |
| 24 | **Coverage excludes platform and UI** | Incomplete metrics | Vitest coverage configured for `src/core/**/*.ts` only. Fix: extend or add separate integration test coverage. |

---

## Feature Roadmap: Agentic Engineering Patterns

Inspired by [Simon Willison's Agentic Engineering Patterns](https://simonwillison.net/guides/agentic-engineering-patterns/). These are product features and process improvements derived from proven agentic engineering practices.

### Phase 2 Features — Directly Applicable

#### 1. Session Learning & Compound Loop — SHIPPED

**Status:** Implemented as Outcome Intelligence (`outcome-tracker.ts`). Tracks analysis sessions, correlates with user signals (re-prompts, undos, repeated edits). Shows insights after 5+ analyses. Persisted to workspace state.

#### 2. Test Awareness Check

**Pattern source:** "First Run the Tests" + "Red/Green TDD"

> "If the code has never been executed it's pure luck if it actually works when deployed to production."

**Feature:** New waste detection rule that checks whether test files exist for the active source file and whether they've been run recently.

| Rule ID | Trigger | Severity | Suggestion |
|---------|---------|----------|------------|
| `tests-not-run` | Source file modified more recently than its corresponding test file, or no test file exists | info | "Run tests before prompting — AI works better with passing test context" |

**Detection heuristic:**
- For `src/auth/service.ts`, look for `test/auth/service.test.ts` or `src/auth/__tests__/service.test.ts`
- Compare `mtime` of source vs test file
- Only trigger if test file is >1 hour stale relative to source

#### 3. Prompt Template Suggestions

**Pattern source:** "Hoard Things You Know How to Do"

> "Working code examples provide stronger evidence than theoretical knowledge."

**Feature:** When detecting specific context patterns, suggest proven prompt templates that produce better AI responses.

| Context Pattern | Suggested Template |
|-----------------|-------------------|
| Large file, no selection | "Select a function, then: 'Explain this function and suggest improvements'" |
| Test file active | "Prompt: 'Add edge case tests for [function] covering null inputs and error paths'" |
| Multiple related files open | "Prompt: 'Given these files, refactor [X] to use [pattern]'" |
| Merge conflict markers | "Prompt: 'Resolve this merge conflict keeping the intent of both changes'" |

**UI:** New "Prompt Tips" section below Suggestions, showing context-aware templates. Dismissible per-session.

#### 4. Context Walkthrough Export — SHIPPED

**Status:** Implemented as `AI Preflight: Export Context to Clipboard` command.

#### 5. Positive Context Signals — SHIPPED

**Status:** Implemented as `positive-signals.ts` analyzer. Detects clean context, good selection, AI instructions present, focused workspace. Displayed with green checkmarks in sidebar and @preflight chat output.

#### 6. Review Gate Reminder

**Pattern source:** Anti-patterns — "Don't file PRs with unreviewed code"

> "Your job is to deliver code that works."

**Feature:** After detecting that AI-generated code was recently inserted (via `onDidChangeTextDocument` heuristics or git diff analysis), show a reminder:

| Trigger | Suggestion |
|---------|------------|
| Large paste (500+ chars) into a file | "Review pasted code before committing — verify it works" |
| File changed significantly since last save | "Run tests to verify recent changes" |

