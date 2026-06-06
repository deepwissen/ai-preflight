# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.6.x   | Yes       |
| 0.5.x   | Security fixes only |
| < 0.5   | No        |

## Reporting a Vulnerability

If you discover a security vulnerability in AI Preflight, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, email: **deepwissen@gmail.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Impact assessment (what an attacker could do)
- Suggested fix (if you have one)

### What to expect

- **Acknowledgment** within 48 hours
- **Assessment** within 5 business days
- **Fix timeline** communicated within 10 business days
- **Credit** in the release notes (unless you prefer anonymity)

### Scope

The following are in scope:
- Secrets leaking through the extension itself
- False negatives in security detection (patterns that should be caught but aren't)
- Vulnerabilities in instruction file / MCP config scanning
- Dependency vulnerabilities
- Any code that could be exploited to execute arbitrary commands

The following are out of scope:
- Detection accuracy suggestions (use GitHub Issues instead)
- Feature requests (use GitHub Issues instead)
- Issues in VS Code itself

## Security Architecture

AI Preflight is designed with security as a core principle:

- **100% local analysis** — no code leaves your machine through AI Preflight
- **Zero network requests** — no outbound connections, no telemetry, no analytics
- **No API keys** — nothing to configure, nothing to leak
- **No data collection** — IDE state is analyzed in-memory and never persisted externally
- **Open source** — every detection rule is auditable

## Dependency Management

- Dependencies are monitored via GitHub Dependabot
- Security audits run on every PR via `npm audit`
- License compliance checked on every PR
- CodeQL SAST analysis runs on every PR

## Release Verification

Every release includes:
- SHA256 digest on the `.vsix` asset
- Automated CI validation (lint, typecheck, test, security audit) before publish
- GitHub Actions provenance on release artifacts
