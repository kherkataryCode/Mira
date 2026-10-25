# Mira — personal AI assistant for web and iOS

**Plan. Learn. Stay informed. Be productive.**

Mira is a calm personal assistant: tasks and reminders you can type or say in plain language, a daily brief built from your real data, bite-sized lessons with spaced review, news from sources you choose, private notes, and a chat assistant that **proposes** actions but never takes them without your confirmation.

![Design concept](design/friday-web-ios-concept.png)

| Part | Stack | Path |
|---|---|---|
| Web app | Next.js 16 (App Router), React 19, Tailwind CSS 4 | `apps/web` |
| iOS app | Expo SDK 58, React Native 0.88, Expo Router | `apps/mobile` |
| API | Node 22, Fastify 5, Drizzle ORM, Zod 4 | `apps/api` |
| Worker | pg-boss 12 (PostgreSQL-backed cron + retries) | `apps/worker` |
| Shared | Schemas, NL date parser, recurrence, spaced repetition | `packages/shared` |
| Database | PostgreSQL 16 | `apps/api/drizzle` (migrations) |
| Hosting | Render Blueprint | `render.yaml` |

> **Status: a working, tested codebase — not a production service.** See [What was verified](#what-was-verified) and [Known limitations](#known-limitations). Nothing has been deployed by the author of this repository; deployment URLs, Apple signing and provider keys are yours to set up.

---

## Mira's daily briefings (what's new)

Mira is a cybersecurity-focused assistant. Every day she posts into that day's **chat thread** (look for the calendar icon in chat history):

| When | What | Setting |
|---|---|---|
| Morning (default 08:00) | Your reminders and to-dos for the day, **Concept of the Day** (how it works, architecture view, real-world example, learn-more link) and a **Security / OT Security Insight** with a logical question | Settings → Daily briefings → Morning briefing |
| Evening (default 18:00) | **Top Cybersecurity News** from the last 72 hours — date, brief, affected versions (only when the source states them), exploitation status, action, source link — plus tomorrow's reminders | Settings → Daily briefings → Evening cybersecurity news |
| Any time | Everything above in one briefing | **Briefing** button in Chat, **Today's briefing** on Home, or type “give me my daily summary” |

How it stays relevant and honest:

- **News** comes from cybersecurity feeds every user starts with (CISA advisories, CISA ICS advisories, The Hacker News, BleepingComputer, SecurityWeek — editable under News → Sources). Each story gets a deterministic relevance score; only security stories appear. Exploitation status is taken from the source text only. When an AI provider is connected, Mira rewrites each item's brief/affected/action **using only the feed text**; otherwise she shows the feed's own summary. If there is no news, she says so.
- **Learning** is restricted to the topics you pick in Settings (default: Cybersecurity fundamentals + OT / ICS security). The curated curriculum covers OT segmentation, egress filtering, remote access, patching, inventory, Zero Trust, MFA, DNS monitoring, incident response, ransomware readiness, cloud and application security. When you've seen them all and an AI provider is connected, Mira writes new lessons — the topic is chosen by code from your selection, output is schema-checked and rejected if off-topic, and links come from a curated reference list, never from the model.
- **Mira's voice:** with an OpenAI key, Mira speaks with a natural female voice (`gpt-4o-mini-tts`, voice `nova` by default — change `OPENAI_TTS_VOICE`, e.g. `shimmer` or `coral`). Without it, she uses the most natural female voice on your device; pick one under Settings → Mira's voice. On iPhone, download a Premium/Enhanced voice (Ava or Zoe) in iOS Settings → Accessibility → Spoken Content → Voices for the best result.

## Contents

1. [Quick start (demo mode, no API keys)](#1-quick-start-demo-mode-no-api-keys)
2. [Everyday commands](#2-everyday-commands)
3. [Configuration reference](#3-configuration-reference)
4. [Connecting AI providers](#4-connecting-ai-providers)
5. [Upload to GitHub](#5-upload-to-github)
6. [Deploy to Render](#6-deploy-to-render)
7. [iOS app, notifications and voice](#7-ios-app-notifications-and-voice)
8. [Troubleshooting](#8-troubleshooting)
9. [Rollback and restore](#9-rollback-and-restore)
10. [What was verified](#what-was-verified) · [Known limitations](#known-limitations)

More docs: [Architecture](docs/ARCHITECTURE.md) · [Threat model](docs/THREAT_MODEL.md) · [API reference](docs/API.md) · [iOS guide](docs/IOS.md) · [Railway deploy](docs/RAILWAY.md) · [Backup & restore](docs/BACKUP_RESTORE.md) · [OpenClaw](docs/OPENCLAW.md) · [Acceptance checklist](docs/ACCEPTANCE.md) · [Security policy](SECURITY.md)

---

## 1. Quick start (demo mode, no API keys)

**Prerequisites:** Node.js 22 (`.node-version`), npm 10, Docker Desktop (for PostgreSQL), Git.

```bash
git clone https://github.com/YOUR-USERNAME/mira-assistant.git
cd mira-assistant
npm ci                                   # installs every workspace from the lockfile
cp .env.example .env                     # DEMO_MODE=true by default
docker compose up -d postgres            # PostgreSQL 16 on localhost:5432 (+ friday_test DB)

npm run build:libs                       # build shared + API (the worker imports the API build)
npm run db:migrate                       # apply SQL migrations
DEMO_MODE=true npm run db:seed           # lessons + demo account
```

Start the three processes (three terminals):

```bash
npm run dev:api      # http://localhost:4000  (health: /health/ready)
npm run dev:worker   # scheduler: reminders, briefs, news, cleanup
npm run dev:web      # http://localhost:3000
```

Open <http://localhost:3000> and either create an account or sign in with the demo account:

- **Email:** `demo@friday.local`
- **Password:** `friday-demo-password`

Demo mode uses a rule-based assistant that is clearly labelled **“Demo response”** in the UI. Demo news items are labelled **“Demo sample — not real news.”** Nothing pretends to be real AI or real news.

Try: *“Remind me to call the dentist tomorrow at 5 PM”* in Chat or Quick add → a preview card appears → **Confirm** saves it.

## 2. Everyday commands

| Command | What it does |
|---|---|
| `npm run check` | build libs → lint → typecheck all workspaces → unit + integration tests → production builds |
| `npm test` | Vitest: shared (unit), API (integration against PostgreSQL), worker |
| `npm run test:e2e` | Playwright: builds must exist; starts API + web on ports 4100/3100 against `friday_e2e` |
| `npm run db:generate` | generate a new migration after editing `apps/api/src/db/schema.ts` |
| `npm run db:migrate` | apply migrations (needs `npm run build:libs` first) |
| `npm run dev:mobile` | start the Expo dev server for the iOS app |
| `npm run audit:prod` | `npm audit` for production dependencies |

Integration tests use `TEST_DATABASE_URL` (default `postgres://friday:friday@localhost:5432/friday_test`) and **drop and recreate** that database's schema on every run — never point it at real data. E2E uses `E2E_DATABASE_URL` (default `…/friday_e2e`; create it with `createdb -h localhost -U friday friday_e2e`).

## 3. Configuration reference

All configuration is via environment variables, validated at startup (`apps/api/src/config.ts`) — a misconfigured service refuses to start and lists the problem without echoing secret values. Copy `.env.example` → `.env` for local work. **Never commit `.env`.**

| Variable | Used by | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | api, worker | — | **Required.** `postgres://…` |
| `DATABASE_SSL` | api, worker | `false` | `true` for external connections requiring TLS |
| `DATABASE_POOL_MAX` | api | `5` | Keep low on small Render databases |
| `PORT` / `HOST` | api | `4000` / `0.0.0.0` | Render injects `PORT` |
| `WEB_ORIGINS` | api | `http://localhost:3000` | Comma-separated browser origins (CSRF + CORS allowlist) |
| `COOKIE_SECURE` | api | `false` | **Must be `true` in production** (startup enforces it) |
| `TRUST_PROXY_HOPS` | api | `0` | `1` on Render (one trusted proxy hop) |
| `RATE_LIMIT_PER_MIN` / `AUTH_RATE_LIMIT_PER_MIN` | api | `300` / `10` | Per-IP limits |
| `SESSION_TTL_DAYS` | api | `30` | |
| `ALLOW_REGISTRATION` | api | `true` | Set `false` after creating your account for a single-user deployment |
| `OWNER_EMAIL` | api | — | This email becomes owner (System Health). Otherwise the first account is owner |
| `DEMO_MODE` | api, worker, seed | `false` | Forces the labelled demo assistant; seeds the demo account |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` / `ANTHROPIC_EFFORT` | api, worker | — / `claude-opus-5-5` / `medium` | |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | api, worker | — | Model is required if the key is set |
| `MOONSHOT_API_KEY` / `MOONSHOT_MODEL` / `MOONSHOT_BASE_URL` | api, worker | — / — / `https://api.moonshot.ai/v1` | Kimi via OpenAI-compatible API |
| `*_INPUT_USD_PER_MTOK` / `*_OUTPUT_USD_PER_MTOK` | api | Anthropic `4`/`20`, others `0` | Used for **budget estimates** — set from your provider's current pricing page |
| `AI_TIMEOUT_MS` / `AI_MAX_ATTEMPTS` | api | `60000` / `2` | |
| `AI_GLOBAL_MONTHLY_BUDGET_USD` | api | `20` | Hard stop across all users |
| `OPENCLAW_ENABLED` / `OPENCLAW_URL` / `OPENCLAW_TOKEN` | api | `false` | See [docs/OPENCLAW.md](docs/OPENCLAW.md) |
| `PUSH_ENABLED` / `EXPO_ACCESS_TOKEN` | worker | `false` | Server push via Expo Push Service → APNs |
| `API_INTERNAL_URL` or `API_INTERNAL_HOSTPORT` | web | `http://localhost:4000` | Where the web server proxies `/api/*` |
| `MIRA_HTTPS` | web | — | `true` in production: HSTS + `upgrade-insecure-requests` |
| `EXPO_PUBLIC_API_URL` | mobile | `http://localhost:4000` | **Public** HTTPS API URL baked into the app |
| `IOS_BUNDLE_ID` / `EAS_PROJECT_ID` | mobile build | `com.example.mira` / — | See [docs/IOS.md](docs/IOS.md) |

User-level settings (timezone — default `Asia/Kolkata`, briefing schedule, provider order, budgets, topics, news keywords, voice) live in each user's preferences and are edited in **Settings**.

## 4. Connecting AI providers

Keys stay on the server. The web bundle and iOS app never see them.

1. Add one or more keys to `.env` (local) or the Render dashboard (production). For OpenAI and Moonshot also set the model name you want — check the provider's current model list.
2. Set `DEMO_MODE=false` and restart the API and worker.
3. In **Settings → AI providers & budget**, order the providers and set your monthly budget (and optional per-provider caps).
4. Test each provider: put it first in the order and send a chat message; the chat header shows *“Answering with <provider> · <model>”*.
5. Test failures: an invalid key shows a clear error after one attempt (no retry loop) and falls back to the next provider; **System Health** lists provider failures by type.

How the gateway behaves (see `apps/api/src/ai/gateway.ts` and its tests):

- **Classified errors:** auth, quota/billing, rate limit (honours `Retry-After`), transient/outage, invalid request, model unavailable, refusal, cancelled, budget.
- **Bounded retries** with exponential backoff + jitter for transient/rate-limit errors only; **no replay after partial output**; **fallback** to the next provider except for invalid requests, cancellations and budget stops; a **circuit breaker** pauses a provider for 60 s after 3 consecutive failures.
- **Budgets:** per-user monthly, per-provider monthly and a global monthly cap, enforced before each call using recorded token usage. Costs are *estimates* from the `*_USD_PER_MTOK` settings.
- **Deterministic first:** task/reminder parsing, CRUD, scheduling, news dedupe/ranking and the daily brief are plain code. The model only writes chat replies (and, if you enable it, the brief headline).
- **Anthropic** uses the official SDK with streaming and server-side refusal fallback (`fallbacks: "default"`); **OpenAI** and **Kimi/Moonshot** use the official OpenAI SDK.

## 5. Upload to GitHub

```bash
cd mira-assistant
git status                       # if this is already a repo, skip `git init`
git init -b main                 # only for a fresh folder
git add .
git status                       # check: no .env, keys, .p8/.pem files, database dumps
git commit -m "Initial Mira assistant"
git remote add origin https://github.com/YOUR-USERNAME/mira-assistant.git
git push -u origin main
```

Using the GitHub web UI instead: create an empty repository, then **Add file → Upload files** and drag the folder contents (excluding `node_modules`, `.next`, `dist`, `.env`).

Before pushing, confirm `.gitignore` covers `.env`, certificates and build output, and that `.env.example` holds placeholders only. If a secret was ever committed, **rotate it** — deleting the line is not enough. CI runs a gitleaks secret scan on every push.

## 6. Deploy to Render

`render.yaml` defines: `friday-web` (public Next.js), `friday-api` (Fastify), `friday-worker` (background scheduler) and `friday-db` (managed PostgreSQL 16).

1. Push the repository to GitHub.
2. In Render: **New → Blueprint**, pick the repository, review the four resources, and apply.
3. **Manual step:** in the dashboard set the `sync: false` variables:
   - `friday-api` → `WEB_ORIGINS` = the web service URL (e.g. `https://friday-web.onrender.com`), `OWNER_EMAIL`, and any provider keys/models.
   - `friday-worker` → the same provider keys/models (it generates briefs).
4. Deploy. The API's `preDeployCommand` runs migrations and seeds lessons before the new version takes traffic.
5. Check each service's logs and `https://<api>/health/ready`. Then smoke test: register → create a task → schedule a reminder 2 minutes ahead → confirm it shows **Delivered** and appears in the bell inbox → restart the worker and confirm no duplicate delivery → System Health shows recent job runs.
6. Create your account, then consider `ALLOW_REGISTRATION=false` for a single-user deployment.
7. Optional custom domain: add it to `friday-web` in Render (TLS is automatic) and update `WEB_ORIGINS`.

**Plans and cost.** Background workers and `preDeployCommand` are not available on Render's free plan, and free web services sleep when idle — reminders and briefs would be late or missed. The Blueprint uses `starter` services and a `basic-256mb` database as a reasonable minimum; check <https://render.com/pricing> for current prices. Render docs: [Blueprints](https://render.com/docs/blueprint-spec), [environment variables](https://render.com/docs/configure-environment-variables), [PostgreSQL](https://render.com/docs/databases), [health checks](https://render.com/docs/health-checks).

**For the iOS app** the API must be reachable over HTTPS. The `friday-api` service gets a public `onrender.com` URL; use that as `EXPO_PUBLIC_API_URL`. (Web traffic reaches the API through the web service's private-network proxy.)

## 7. iOS app, notifications and voice

```bash
cp apps/mobile/.env.example apps/mobile/.env      # set EXPO_PUBLIC_API_URL
npm run dev:mobile                                 # Expo dev server
```

- **Expo Go** runs most of the app (tasks, chat, learning, local notifications), but **voice input needs a development build** because speech recognition is a native module; the app says so instead of faking it.
- **Development build / TestFlight / App Store:** requires a Mac with Xcode or EAS Build, an Apple Developer Program membership, a bundle ID (`IOS_BUNDLE_ID`), and an EAS project (`EAS_PROJECT_ID`).
- **Server push:** upload an APNs key to your Expo project (`eas credentials`), set `PUSH_ENABLED=true` (and optionally `EXPO_ACCESS_TOKEN`) on the worker, then test on a **physical iPhone** — the Simulator does not receive APNs pushes.
- **Local notifications:** the Reminders screen asks for permission in context and mirrors your next 50 reminders on-device (iOS allows at most 64 pending per app).

Full step-by-step guide: [docs/IOS.md](docs/IOS.md).

## 8. Troubleshooting

| Symptom | Likely cause → fix |
|---|---|
| API exits on start with “Invalid environment configuration” | Read the listed variables; e.g. `COOKIE_SECURE must be true in production`, or a provider key without its model |
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL not running: `docker compose up -d postgres` |
| SSL errors connecting to the DB | Set `DATABASE_SSL=true` for external URLs; Render's internal URL works without it |
| Migration fails | Read the SQL error in the deploy log; take a backup before any manual change ([docs/BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md)) |
| Web shows “Origin not allowed” / 403 on every action | `WEB_ORIGINS` on the API must exactly equal the browser origin (scheme + host + port) |
| Web shows “Mira is temporarily unreachable” | Web can't reach the API: check `API_INTERNAL_URL` / `API_INTERNAL_HOSTPORT` and the API health check |
| 429 Too many requests | Per-IP limits; raise `RATE_LIMIT_PER_MIN` if many users share one IP |
| Chat says provider quota/billing reached | Top up or change the provider order; Mira won't retry quota errors |
| “AI budget used up” | Raise the monthly budget in Settings or `AI_GLOBAL_MONTHLY_BUDGET_USD` |
| Reminders late | Worker down or sleeping (free plan) — check System Health → worker heartbeat and `reminders.dispatch` |
| No phone alerts | Permission denied (iOS Settings → Mira), not a physical device, `PUSH_ENABLED=false`, missing APNs key in EAS, or wrong bundle ID |
| Voice button disabled on iPhone | Running in Expo Go — make a development build |
| Voice unavailable on the web | Browser lacks the Web Speech API (e.g. Firefox); typing still works |
| News never updates | No sources added, sources failing (see News → Sources), or `newsScans` disabled in Settings |

## 9. Rollback and restore

- **Code rollback:** Render → service → **Events/Deploys** → *Rollback* to a previous deploy (do this for api, worker and web together if they changed together).
- **Migrations** are forward-only. Before deploying a migration that drops or rewrites data, take a manual backup. To undo a schema change, write a new migration that reverses it.
- **Database restore:** see [docs/BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md) for `pg_dump`/`pg_restore` commands and Render's point-in-time recovery notes. Test a restore into a scratch database before you rely on it.

---

## What was verified

Run in the build environment (Linux, Node 22.22, PostgreSQL 16.4, Chromium 1243 headless), on the code in this repository:

| Check | Result |
|---|---|
| `eslint .` (all workspaces) | ✅ clean |
| TypeScript strict typecheck — shared, api, worker, web, mobile | ✅ 0 errors |
| Unit tests — shared (NL parsing, DST recurrence, SRS, news dedupe, redaction, schemas) | ✅ 23 passed |
| API integration tests against PostgreSQL — auth, sessions, CSRF, two-user isolation, rate limits, reminders idempotency under concurrent dispatchers, push retries, AI gateway failure modes, chat persist/cancel/retry, SSRF, feed parsing, learning, briefs | ✅ 58 passed |
| Worker tests — run-once idempotency, missed-run window, brief job, retention cleanup | ✅ 5 passed |
| Playwright E2E (real API + Next.js, demo provider) — vertical slice, chat + proposal confirm, voice denied/transcript, stop/retry, quiz, SSRF, settings, axe WCAG A/AA scan of 8 pages | ✅ 10 passed |
| Responsive matrix 320×568, 390×844, 844×390, 412×915 (Android), 768×1024, 1280×800, 1920×1080 × 7 pages — no horizontal overflow; chat composer and mic in viewport | ✅ 49 screenshots in `design/screenshots/` |
| `next build` (production) | ✅ |
| `expo export --platform ios` (Metro → Hermes bytecode) | ✅ |
| `expo-doctor` | ⚠️ 18/20 passed; the 2 others need network access to `exp.host`, which the build sandbox blocked |
| Real worker process with pg-boss cron delivered a reminder | ✅ |
| Each `render.yaml` build command from a clean copy with `NODE_ENV=production` | ✅ |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities (dev-only advisories exist in `drizzle-kit`'s bundled esbuild) |

**Not verified here:** an actual Render deployment, Render's Blueprint validator (render.com was unreachable from the sandbox — validate in the dashboard), real AI provider calls (no keys), real RSS fetching from the internet, an iOS build in Xcode/EAS, running on a real iPhone or Simulator, APNs push delivery, and the GitHub Actions workflow on GitHub's runners.

## Known limitations

- **Authentication** is email + password (Argon2id) with opaque, revocable sessions — no passkeys/OAuth yet, no password reset email (no email provider is configured). An owner can reset a password by deleting and recreating the account, or with SQL.
- **Rate limiting** is in-memory per API instance; run a single API instance or add a shared store before scaling out.
- **Times in forms** use the device's timezone, while displays and natural-language parsing use your Mira timezone setting.
- **Server push** goes through the Expo Push Service (which delivers via APNs with your key); a direct-APNs sender is not implemented.
- **Voice** uses on-device/OS speech recognition (Web Speech API in browsers, iOS speech framework in the app). No wake word, no background listening.
- **News** reads RSS/Atom feeds you add; it stores titles, links and short excerpts only and does not fetch full articles.
- **OpenClaw** is a text-only adapter with a documented request/response contract; it is untested against a real OpenClaw deployment.
- Not a medical, legal or financial advisor; lesson examples are illustrative.

## License

See [LICENSE](LICENSE) — **placeholder: the owner must choose a license.**
