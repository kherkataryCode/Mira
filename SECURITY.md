# Security policy

## Reporting a vulnerability

Please report privately to the repository owner (replace with your contact: `security@your-domain.example`). Do not open public issues for vulnerabilities. Include steps to reproduce and impact. We aim to acknowledge within 7 days.

## Supported versions

Only the latest `main` branch is supported.

## Practices in this repository

- Secrets only via environment variables; `.env` is git-ignored; `.env.example` contains placeholders only.
- Passwords hashed with Argon2id; session tokens stored as SHA-256 hashes; sessions are revocable.
- All input validated with strict Zod schemas; parameterized queries only.
- CSP with nonces on the web app; strict CORS and CSRF checks on the API.
- Outbound fetches of user-supplied URLs are SSRF-guarded.
- AI models have no tools and cannot change data; users confirm every action.
- CI runs dependency audit, gitleaks secret scanning and CodeQL.

If a secret is ever committed, **rotate it immediately** — removing it from history is not sufficient.

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for the threat model and residual risks.
