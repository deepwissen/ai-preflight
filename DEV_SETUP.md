# AI Preflight — Developer Setup Guide

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20 LTS | `brew install node@20` or [nodejs.org](https://nodejs.org) |
| npm | 10.x | Included with Node.js |
| VS Code | 1.95+ | [code.visualstudio.com](https://code.visualstudio.com) |

## Quick Start

```bash
# Clone the repository
git clone https://github.com/deepwissen/ai-preflight.git
cd ai-preflight

# Install dependencies
npm install

# Build the extension
npm run build

# Run tests
npm test
```

## Development Workflow

### Running the Extension

1. Open the `ai-preflight/` folder in VS Code
2. Press **F5** (or Run > Start Debugging)
3. A new VS Code window opens with the extension loaded
4. Look for the AI Preflight icon in the activity bar (left sidebar)
5. Click it to open the panel

### Watch Mode

```bash
npm run dev
```

This watches `src/` for changes and rebuilds automatically. After a rebuild, press `Ctrl+Shift+F5` in the Extension Development Host to reload.

### Running Tests

```bash
# Run once
npm test

# Watch mode (re-runs on file changes)
npm test:watch
```

Tests are in `test/core/` and use Vitest. They test the core engine without any VS Code dependency.

### Linting & Formatting

```bash
# Lint
npm run lint

# Format
npm run format

# Check formatting (CI uses this)
npm run format:check

# Type check
npm run typecheck
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Watch mode — rebuilds on changes |
| `npm run build` | Production build |
| `npm test` | Run all tests |
| `npm test:watch` | Run tests in watch mode |
| `npm run lint` | Run ESLint |
| `npm run format` | Run Prettier (auto-fix) |
| `npm run format:check` | Check formatting (no changes) |
| `npm run typecheck` | TypeScript type checking |
| `npm run package` | Build + create .vsix file |

## Project Structure

```
ai-preflight/
├── src/
│   ├── extension.ts                ← Entry point (wiring only)
│   │
│   ├── platform/                   ← VS Code-specific code
│   │   ├── context-bridge.ts       ← VS Code APIs → ContextSnapshot
│   │   ├── sidebar-provider.ts     ← Webview panel provider
│   │   ├── status-bar.ts           ← Status bar indicator
│   │   ├── commands.ts             ← Command palette handlers
│   │   ├── action-executor.ts      ← 1-click suggestion fixes
│   │   └── chat-participant.ts     ← @preflight chat participant
│   │
│   ├── core/                       ← Pure TypeScript (NO vscode imports)
│   │   ├── types.ts                ← All interfaces and constants
│   │   ├── event-bus.ts            ← Typed event emitter
│   │   ├── pipeline.ts             ← Analysis pipeline runner
│   │   ├── ai-tools.ts             ← AI tool registry (context windows, instruction files)
│   │   ├── dismissal-tracker.ts    ← Auto-expiring suggestion dismissals
│   │   ├── outcome-tracker.ts      ← Session correlation + outcome insights
│   │   └── analyzers/
│   │       ├── index.ts
│   │       ├── token-estimator.ts  ← Per-file token breakdown
│   │       ├── waste-detector.ts   ← 17 waste detection rules
│   │       ├── risk-scorer.ts      ← Risk level scoring
│   │       ├── positive-signals.ts ← Good practice detection
│   │       ├── tool-aware-analyzer.ts ← Tool-specific analysis (F1-F9)
│   │       └── prompt-analyzer.ts  ← Prompt-aware analysis for @preflight
│   │
│   └── ui/                         ← Preact components (sidebar)
│       ├── app.tsx
│       └── components/
│
├── test/                           ← 247 tests, 15 test files
│   ├── fixtures/
│   │   └── context-snapshots.ts    ← 6 reusable test scenarios
│   └── core/
│
├── package.json                    ← Extension manifest
├── tsconfig.json                   ← TypeScript config (strict)
├── esbuild.config.mjs              ← Bundler config
└── vitest.config.ts                ← Test config
```

## Architecture Rules

### The One Rule That Matters

**`src/core/` must NEVER import from `vscode`.**

This is the most important rule in the codebase. The core engine is pure TypeScript with zero platform dependencies. This is what makes it:
- Unit testable without VS Code mocks
- Portable to CLI, MCP server, or other IDEs later
- Fast to develop (no Extension Development Host needed for logic changes)

If you need VS Code APIs, put the code in `src/platform/`.

### Data Flow

```
VS Code event (file switch, selection change)
    ↓
context-bridge.ts captures IDE state → ContextSnapshot
    ↓
EventBus emits "context:updated"
    ↓
extension.ts runs pipeline(snapshot, steps)
    ↓
EventBus emits "analysis:complete" → AnalysisResult
    ↓
sidebar-provider.ts pushes to webview
status-bar.ts updates indicator
```

### Adding a New Analyzer

1. Create `src/core/analyzers/my-analyzer.ts`
2. Export a function matching `AnalyzerStep` type signature
3. Add it to the pipeline array in `src/extension.ts`
4. Write tests in `test/core/my-analyzer.test.ts`
5. Done — no other files need to change

```typescript
// src/core/analyzers/my-analyzer.ts
import type { AnalysisResult, ContextSnapshot } from "../types.js";

export function myAnalyzer(
  context: ContextSnapshot,
  partial: Partial<AnalysisResult>
): Partial<AnalysisResult> {
  // Your analysis logic here
  return {};
}
```

## Coding Conventions

### Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| Files | kebab-case | `token-estimator.ts` |
| Interfaces | PascalCase | `ContextSnapshot` |
| Functions | camelCase | `estimateTokens` |
| Constants | UPPER_SNAKE | `MAX_TERMINAL_LINES` |
| Events | colon-separated | `context:updated` |

### Imports Order

1. Node built-ins
2. VS Code API (`platform/` only)
3. Internal `core/` modules
4. Internal `ui/` modules

### Error Handling

- **`core/`** — Return null or empty results, never throw
- **`platform/`** — Try-catch at boundaries, log and degrade gracefully
- **`ui/`** — Show "unavailable" state, never crash the webview

## Debugging Tips

- **Extension logs:** Open Output panel → select "AI Preflight" channel
- **Webview debugging:** In Extension Development Host, run `Developer: Open Webview Developer Tools`
- **Event tracing:** Add `eventBus.on("context:updated", console.log)` in extension.ts temporarily
- **Test a single file:** `npm test -- token-estimator`

## CI Pipeline

Every PR runs:
1. `npm run lint` — ESLint
2. `npm run format:check` — Prettier
3. `npm run typecheck` — TypeScript strict
4. `npm test` — Vitest
5. `npm run build` — esbuild
6. `npm run package` — creates .vsix artifact

All steps must pass before merge.
