# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities privately via **GitHub Security Advisories** on this repository rather than opening a public issue.

- **Initial response target:** within 72 hours.
- **Scope:** Any bypass of the CSP / zero-network guarantees, HTML/script injection from untrusted PDFs, or redaction data leaks.

## Redaction Disclaimer

No automated tool can guarantee 100% redaction on malformed or exotic PDFs. Airgap PDF's **Safe mode** rasterizes affected pages and rebuilds the document cleanly, then runs an automated verifier. Always visually inspect redacted documents before sharing.
