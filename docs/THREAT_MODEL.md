# Threat model

Scope: a single owner (or small group) running Friday on Render with the web and iOS clients. This is a practical model, not a guarantee; residual risks are listed at the end.

## Assets

Personal data (tasks, reminders, notes, chats, learning history, news preferences) · session tokens · provider API keys and push credentials · database contents and backups · AI spend.

## Trust boundaries

1. Browser / iPhone ↔ internet ↔ web & API (untrusted clients).
2. Web server ↔ API (private network; web forwards only allow-listed headers).
3. API/worker ↔ PostgreSQL (private; least-privilege app role recommended).
4. API/worker ↔ AI providers, OpenClaw, RSS feeds (untrusted responses).
5. Model output ↔ application actions (model output is untrusted text).

## Threats and mitigations

| Threat | Mitigation | Where / test |
|---|---|---|
| Credential stuffing / brute force | Argon2id (m=19 MiB, t=2), per-IP login limit, 5-failure 15-min lockout, generic errors, constant-ish time for unknown users | `auth/password.ts`, `routes/auth.ts`; `auth.test.ts` |
| Session theft | 256-bit random tokens, only SHA-256 stored, HttpOnly + Secure + SameSite=Lax cookie (web), Keychain `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (iOS), revocation + expiry | `auth/plugin.ts`; revocation/expiry tests |
| CSRF | Cookie-authenticated mutations require a custom header (forces preflight) **and** an allow-listed `Origin`; SameSite=Lax | `auth/plugin.ts`; `auth.test.ts` |
| IDOR / cross-user access | Every query filters by `user_id`; foreign references (projects, tasks) verified as owned; 404 rather than 403 to avoid leaking existence | All routes; `authorization.test.ts` (two users, every resource) |
| Mass assignment | Zod `.strict()` schemas reject unknown fields (e.g. `role`, `userId`) | `schemas.ts`; tests |
| SQL injection | Drizzle parameterized queries; `LIKE` wildcards escaped; no raw SQL from input | `util/validate.ts`; search tests |
| XSS | React escaping, no `dangerouslySetInnerHTML`, feed HTML stripped to text, nonce-based CSP with `strict-dynamic`, API CSP `default-src 'none'` | `proxy.ts`, `news.ts` |
| SSRF via news feeds / OpenClaw | HTTPS only, default port, no credentials, DNS-resolved private/link-local/metadata addresses blocked, redirects re-validated, 2 MB / 10 s limits | `util/safe-fetch.ts`; SSRF tests |
| Open redirect after login | `next` parameter must be a same-site relative path | `AuthForm.tsx`; E2E |
| Prompt injection (feeds, user data) | Model has **no tools**; user data wrapped as `<user_data>` and labelled as data; actions come only from deterministic parsing + explicit user confirmation | `services/assistant.ts` |
| Clickjacking | `frame-ancestors 'none'`, `X-Frame-Options: DENY` | web + API headers |
| DoS / cost abuse | Global + per-route rate limits, 64 KB body limit, bounded history/output tokens, per-user/per-provider/global AI budgets, circuit breaker | `app.ts`, `gateway.ts` |
| IP spoofing to evade limits | `X-Forwarded-For` trusted for exactly `TRUST_PROXY_HOPS` hops; the web proxy forwards a single client IP | `app.ts`, `route.ts` |
| Secret leakage | Secrets only in env; startup validation never echoes values; logger redacts auth headers/cookies; shared `redact` utility; health page shows no secrets; no source maps in production web build | `config.ts`, `redact.ts`; tests |
| Data loss | Managed Postgres backups + documented restore drill; account export | `docs/BACKUP_RESTORE.md` |
| Duplicate notifications | Unique delivery index + row locks + `job_runs` idempotency | worker tests |

## Residual risks

- In-memory rate limiting does not coordinate across multiple API instances.
- No MFA/passkeys; password reset requires owner action.
- A compromised AI provider or OpenClaw endpoint can return misleading text (but cannot act).
- `style-src 'unsafe-inline'` is allowed for React style attributes.
- DNS rebinding between the SSRF check and connect is possible in theory (the check resolves, then `fetch` resolves again).
- Push content (reminder titles) passes through Expo's push service and Apple.
- The dev-only `drizzle-kit` dependency has a moderate advisory in its bundled esbuild dev server; it is not shipped to production.
