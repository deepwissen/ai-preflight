# Contributing to AI Preflight

Thank you for considering contributing to AI Preflight. Every contribution helps make AI-assisted development safer.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+ (or npm 10+)
- VS Code 1.95+

### Setup

```bash
git clone https://github.com/deepwissen/ai-preflight.git
cd ai-preflight
pnpm install
pnpm build
```

### Development

```bash
pnpm dev          # Watch mode — rebuilds on changes
pnpm test         # Run all tests
pnpm test:watch   # Run tests in watch mode
```

Press **F5** in VS Code to launch the Extension Development Host for manual testing.

### Project Structure

```
src/
├── core/              # Pure logic — no VS Code imports
│   ├── analyzers/     # Detection engines (waste, secrets, integrity, MCP)
│   ├── types.ts       # All type definitions
│   ├── pipeline.ts    # Analysis pipeline orchestrator
│   └── event-bus.ts   # Typed event system
├── platform/          # VS Code integration
│   ├── context-bridge.ts    # IDE state capture
│   ├── sidebar-provider.ts  # Webview panel
│   ├── status-bar.ts        # Status bar indicator
│   ├── chat-participant.ts  # @preflight chat
│   └── action-executor.ts   # 1-click fix actions
└── ui/                # Preact webview components
    └── components/    # Sidebar UI components
```

**Key rule:** Files in `src/core/` must NEVER import `vscode`. All VS Code API access goes through `src/platform/`.

## How to Contribute

### Reporting Bugs

- Use the [Bug Report template](https://github.com/deepwissen/ai-preflight/issues/new?template=bug_report.md)
- Include: VS Code version, extension version, steps to reproduce, expected vs actual behavior

### Suggesting Features

- Use the [Feature Request template](https://github.com/deepwissen/ai-preflight/issues/new?template=feature_request.md)
- Describe the problem you're solving, not just the solution you want

### Submitting Code

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Ensure all checks pass:
   ```bash
   pnpm test          # All tests pass
   pnpm typecheck     # TypeScript strict mode — 0 errors
   pnpm lint          # ESLint — 0 errors
   pnpm format:check  # Prettier — all files pass
   ```
5. Commit with a descriptive message
6. Open a Pull Request against `main`

### Adding Detection Rules

If you're adding a new waste detection rule, secret pattern, or MCP scan:

1. Add the detection logic in the appropriate analyzer (`src/core/analyzers/`)
2. Add tests in `test/core/` — cover positive cases, negative cases, and edge cases
3. Add the rule ID to the status bar reasons map (`src/platform/status-bar.ts`)
4. Add UI rendering if needed (`src/ui/components/context-list.tsx`, `src/platform/chat-participant.ts`)
5. Update `CHANGELOG.md`

## Coding Standards

### Naming

- Files: `kebab-case.ts`
- Interfaces: `PascalCase`
- Functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`

### Rules

- No VS Code imports in `src/core/`
- Every detection rule needs tests
- No network requests — ever
- No telemetry — ever
- No data collection — ever

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

## Questions?

Open a [Discussion](https://github.com/deepwissen/ai-preflight/discussions) or reach out via [GitHub Issues](https://github.com/deepwissen/ai-preflight/issues).
