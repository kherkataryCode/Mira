# Changelog

## 0.3.0 — 2026-10-25

- **Brief me** opens a new chat with a short briefing: to-dos, reminders, a few cyber news bullets and the concept of the day, with links to the full lesson and the news page. It makes no AI call, so it costs nothing.
- The home dashboard is now four boxes (to-dos, reminders, cyber news, learning) showing the items themselves, plus quick add. The AI brief hero is gone.
- Mira pop-ups: an animated Mira appears at random spots with cheeky nudges (idle, reading, too many to-dos). You can mute her from the bubble or in Settings.
- New artwork palettes and styles, loading animations and skeletons.
- Notes are now Markdown documents: templates, a formatting toolbar, live preview and .md download.

## 0.2.0 — 2026-10-25 — Mira

- Renamed the assistant to **Mira** (web, iOS, prompts, notifications).
- Daily briefings posted into a per-day chat thread: morning (plan + concept of the day + security insight + logical question), evening (top cybersecurity news + tomorrow), and on demand (button or “give me my daily summary”).
- Cybersecurity news: default advisory feeds, deterministic relevance scoring, exploitation status from source text, AI briefs grounded in feed text only, no repeats within a day.
- Learning restricted to selected topics; new cybersecurity and OT curriculum with steps, architecture views, insights and scenario questions; topic-locked, schema-validated AI lessons with curated links.
- Mira's voice: natural female server voice (OpenAI TTS) on web and iOS, with best-female-device-voice fallback and a voice picker.
- Fixed tab-indented `render.yaml` and CI workflow that did not parse.

## 0.1.0 — 2026-10-24

Initial implementation.

- Web app (Next.js 16): home dashboard, chat with voice, tasks, reminders, learning, news, notes, settings, owner system health; editorial dark design; responsive from 320 px to 1920 px.
- iOS app (Expo SDK 58): home, tasks, chat with on-device speech recognition, learning, reminders with local + push notifications, news, notes, settings.
- API (Fastify 5): session auth with Argon2id, CSRF/CORS/CSP, rate limits, strict validation, all product endpoints, NDJSON chat streaming, multi-provider AI gateway (Anthropic, OpenAI, Kimi/Moonshot, optional OpenClaw) with budgets, retries, fallback and demo mode.
- Worker (pg-boss): reminder dispatch, push sending, briefs, learning nudges, news scans, retention cleanup — idempotent and observable.
- PostgreSQL schema (21 tables) with migrations and seed curriculum.
- Tests: unit, integration, worker, Playwright E2E + responsive matrix + axe accessibility.
- Render Blueprint, GitHub Actions CI, Dependabot, docs.
