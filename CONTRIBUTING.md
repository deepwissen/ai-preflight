# Contributing to AI Preflight

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/deepwissen/ai-preflight.git
cd ai-preflight
npm install
```

### Run locally

Press **F5** in VS Code to launch the Extension Development Host.

### Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Watch mode — rebuilds on changes |
| `npm run build` | Production build |
| `npm test` | Run all tests |
| `npm run typecheck` | TypeScript strict mode check |
| `npm run lint` | ESLint |
| `npm run format` | Prettier auto-fix |

## How to Contribute

### Reporting Bugs

[Open an issue](https://github.com/deepwissen/ai-preflight/issues/new?template=bug_report.md) with:
- Steps to reproduce
- Expected vs actual behavior
- VS Code version and OS

### Suggesting Features

[Open an issue](https://github.com/deepwissen/ai-preflight/issues/new?template=feature_request.md) describing the use case and expected behavior.

### Submitting Code

1. Fork the repo
2. Create a branch from `main` (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run checks: `npm run build && npm test && npm run typecheck`
5. Commit with a clear message (see below)
6. Push and open a PR against `main`

### Commit Messages

Use clear, imperative messages:

```
Add truncation warning for large selections
Fix env file detection for .env.local variants
Update waste detection threshold for tab count
```

### Branch Naming

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feature/description` | `feature/git-diff-analysis` |
| Bug fix | `fix/description` | `fix/env-file-false-positive` |
| Chore | `chore/description` | `chore/update-dependencies` |

## Architecture Rules

### The One Rule

**`src/core/` must NEVER import from `vscode`.**

This keeps the core engine testable without VS Code mocks and portable to other platforms.

- **`src/core/`** — Pure TypeScript. All analyzers, types, and logic.
- **`src/platform/`** — VS Code API integration.
- **`src/ui/`** — Preact components for the sidebar webview.

### Adding a New Analyzer

1. Create `src/core/analyzers/my-analyzer.ts`
2. Export a function matching `AnalyzerStep` signature
3. Add it to the pipeline in `src/extension.ts`
4. Write tests in `test/core/my-analyzer.test.ts`

### Adding a New Waste Rule

Add to the `RULES` array in `src/core/analyzers/waste-detector.ts`. Each rule needs:
- Unique `ruleId`
- Trigger condition
- Severity (`warning` or `info`)
- Suggestion text

## Code Style

- TypeScript strict mode
- Prettier for formatting
- ESLint for linting
- No `any` types unless absolutely necessary
- Prefer pure functions in `src/core/`

## Pull Request Checklist

- [ ] All tests pass (`npm test`)
- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] Build succeeds (`npm run build`)
- [ ] New code has tests
- [ ] No new lint warnings

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
