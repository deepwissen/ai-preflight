# Changelog

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
