# Changelog

## 0.1.0 — 2026-10-24

Initial implementation.

- Web app (Next.js 16): home dashboard, chat with voice, tasks, reminders, learning, news, notes, settings, owner system health; editorial dark design; responsive from 320 px to 1920 px.
- iOS app (Expo SDK 58): home, tasks, chat with on-device speech recognition, learning, reminders with local + push notifications, news, notes, settings.
- API (Fastify 5): session auth with Argon2id, CSRF/CORS/CSP, rate limits, strict validation, all product endpoints, NDJSON chat streaming, multi-provider AI gateway (Anthropic, OpenAI, Kimi/Moonshot, optional OpenClaw) with budgets, retries, fallback and demo mode.
- Worker (pg-boss): reminder dispatch, push sending, briefs, learning nudges, news scans, retention cleanup — idempotent and observable.
- PostgreSQL schema (21 tables) with migrations and seed curriculum.
- Tests: unit, integration, worker, Playwright E2E + responsive matrix + axe accessibility.
- Render Blueprint, GitHub Actions CI, Dependabot, docs.
