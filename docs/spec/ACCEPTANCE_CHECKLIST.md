# Friday Acceptance Checklist

## Product
- [ ] Dashboard uses real persisted data and meaningful empty states.
- [ ] Chat supports loading, cancel/retry, safe errors, and demo mode.
- [ ] Tasks can be created, edited, completed, reopened, filtered, and searched.
- [ ] Reminders support recurrence/timezones and delivery status.
- [ ] Daily brief summarizes actual records and sourced news.
- [ ] Learning lessons, quizzes, progress, and review schedule persist.
- [ ] News items include timestamps, sources, links, deduplication, and stale/error states.
- [ ] Notes, preferences, export, and account deletion are implemented.
- [ ] Settings expose provider order/budgets and notification preferences.
- [ ] Owner-only System Health exposes no secrets/private data.

## Responsive design
- [ ] 320×568 portrait.
- [ ] 390×844 portrait.
- [ ] 844×390 landscape.
- [ ] 768×1024 tablet.
- [ ] 1280×800 laptop.
- [ ] 1920×1080 desktop.
- [ ] Android-sized viewport.
- [ ] No horizontal overflow, clipped controls, or fixed-height content loss.
- [ ] Safe-area insets, keyboard, focus, and 44×44 touch targets verified.

## Security
- [ ] Auth and per-resource authorization tested with two users.
- [ ] Session expiry/revocation, rate limiting, input validation tested.
- [ ] Secrets absent from source, frontend bundle, logs, and errors.
- [ ] Prompt injection and agent-tool permissions tested.
- [ ] SSRF, XSS, CSRF, SQL injection, IDOR, and open redirects considered/tested.
- [ ] Logs redact secrets/private content.
- [ ] Backup/restore and account export/deletion tested.

## Reliability / cost
- [ ] Worker is separate from web/API and suitable for production scheduling.
- [ ] Jobs are idempotent, bounded, retryable, and observable.
- [ ] Timezones and daylight-saving behavior tested.
- [ ] Provider failures classified and retries bounded.
- [ ] Budgets, output limits, history limits, and request timeouts configured.
- [ ] No LLM calls for deterministic CRUD/scheduling.
- [ ] Render free-tier limitations documented.

## Delivery
- [ ] Root `render.yaml` matches actual source paths, commands, health checks, and environment variables.
- [ ] CI runs lint, typecheck, tests, build, and security checks.
- [ ] Local setup and Render deployment verified from a clean checkout.
- [ ] iOS build/push prerequisites documented.
- [ ] Known limitations and unrun checks listed honestly.
