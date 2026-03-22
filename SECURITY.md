# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public issue
2. Email the maintainers or use [GitHub's private vulnerability reporting](https://github.com/deepwissen/ai-preflight/security/advisories/new)
3. Include steps to reproduce and potential impact

We will acknowledge receipt within 48 hours and provide a fix timeline within 7 days.

## Security Design

AI Preflight is designed with security as a core principle:

- **Zero network requests** — all analysis runs locally
- **No telemetry** — nothing is sent anywhere
- **No API keys** — no external service access
- **No code storage** — only metadata (file paths, line counts) is processed
- **No clipboard access** — privacy boundary respected
- **.env file warnings** — actively warns users when sensitive files are in AI context
