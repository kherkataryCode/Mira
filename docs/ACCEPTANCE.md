# Acceptance checklist — implementation & evidence

Legend: ✅ implemented and tested here · 🟡 implemented, not fully verifiable in the build sandbox · ⬜ not done (see notes). Original checklist: [spec/ACCEPTANCE_CHECKLIST.md](spec/ACCEPTANCE_CHECKLIST.md).

## Product

| Requirement | Status | Where | Evidence |
|---|---|---|---|
| Dashboard uses persisted data, meaningful empty states, reorder/hide widgets | ✅ | `routes/home.ts`, `app/(app)/page.tsx` | E2E vertical slice; reload persists |
| Chat: dedicated screen, streaming, cancel, retry, copy, persisted history, safe errors, demo label, provider indicator | ✅ | `routes/chat.ts`, `chat/page.tsx`, mobile `chat.tsx` | `chat.test.ts`; E2E chat, stop/retry |
| Consequential actions need confirmation | ✅ | `services/assistant.ts`, `EntryConfirm` | `chat.test.ts` “never auto-creates”; E2E confirm |
| Voice: permission, listening state, stop/cancel, editable transcript, TTS with mute | ✅ web / 🟡 iOS | `useSpeech.ts`, mobile `voice.ts` | E2E denied + transcript (web); iOS needs a dev build |
| Tasks: CRUD, complete/reopen, due, priority, tags, project, filters, search, recurring, history | ✅ | `services/tasks.ts`, `tasks/page.tsx` | `tasks-reminders.test.ts`; E2E |
| Natural-language entry with preview and ambiguity confirmation | ✅ | `shared/nlparse.ts`, `QuickAdd` | `nlparse.test.ts` (incl. spec example), E2E |
| Reminders: one-time/recurring, timezone, snooze/dismiss/complete, advance, delivery status | ✅ | `services/reminders.ts`, `reminders/page.tsx` | concurrency + snooze tests |
| Default timezone Asia/Kolkata, user-changeable | ✅ | `shared/defaults.ts`, Settings | E2E settings |
| Scheduler authoritative, not LLM-dependent | ✅ | `apps/worker` | real worker delivered a reminder |
| Daily brief from real records only, configurable schedule/sections, on-demand with limits | ✅ | `services/brief.ts`, worker | `news-learning.test.ts`, `jobs.test.ts` |
| Microlearning: explanation, example, takeaway, quiz, progress, spaced review, no “mastery” claim | ✅ | `routes/learning.ts`, `shared/srs.ts` | tests + E2E quiz |
| News: user sources, keywords, importance tiers, dedupe, timestamps, links, stale/error states, scheduled only | ✅ / 🟡 live fetch | `services/news.ts` | parsing/dedupe/SSRF tests; no internet fetch tested |
| Notes: CRUD, search, tags, link to task/lesson | ✅ | `routes/notes.ts` | isolation tests |
| Export + account deletion | ✅ | `routes/settings.ts`, `routes/auth.ts` | tests |
| Settings: profile, tz, schedule, notifications, provider order/budgets, news, topics, theme, sessions, devices | ✅ | `settings/page.tsx` | E2E |
| Owner-only System Health, no secrets, “snapshot not guarantee” | ✅ | `routes/health.ts` | `authorization.test.ts` |

## Responsive design

| Viewport | Status |
|---|---|
| 320×568, 390×844, 844×390, 412×915 (Android), 768×1024, 1280×800, 1920×1080 | ✅ no horizontal overflow across 7 pages; screenshots in `design/screenshots/` |
| Safe-area insets, `dvh`, keyboard (`interactive-widget=resizes-content`), focus rings, 44 px targets | ✅ web; 🟡 iOS keyboard behaviour needs a device |
| Short-landscape compaction | ✅ (`globals.css`) |
| Accessibility | ✅ axe WCAG 2 A/AA: no serious/critical violations on 8 pages |

## Security

| Requirement | Status | Evidence |
|---|---|---|
| Auth + per-resource authorization with two users | ✅ | `authorization.test.ts` |
| Session expiry/revocation, rate limits, validation | ✅ | `auth.test.ts` |
| Secrets absent from source/bundle/logs/errors | ✅ | env-only config, log redaction, `redact` tests, gitleaks in CI |
| Prompt injection / tool permissions | ✅ | model has no tools; data delimited; proposals need confirmation |
| SSRF, XSS, CSRF, SQLi, IDOR, open redirect | ✅ | see [THREAT_MODEL.md](THREAT_MODEL.md) |
| Backup/restore | 🟡 | documented; drill must be run on your deployment |

## Reliability / cost

| Requirement | Status |
|---|---|
| Separate worker, durable queue | ✅ pg-boss |
| Idempotent, bounded, retryable, observable jobs | ✅ `job_runs`, tests |
| Timezones and DST | ✅ tests |
| Provider failure classification, bounded retries | ✅ `gateway.test.ts` |
| Budgets, output/history limits, timeouts | ✅ |
| No LLM for deterministic work | ✅ |
| Free-tier limitations documented | ✅ README §6 |

## Delivery

| Requirement | Status |
|---|---|
| `render.yaml` matches paths/commands/health checks/env | ✅ build commands verified from a clean copy; 🟡 not run through Render's validator or deployed |
| CI: lint, typecheck, tests, build, E2E, audit, secret scan, CodeQL | ✅ written; 🟡 not executed on GitHub |
| iOS build/push prerequisites documented | ✅ `docs/IOS.md` |
| Known limitations and unrun checks listed | ✅ README |
