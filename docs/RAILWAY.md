# Deploying Mira on Railway

Mira deploys as two Railway services (`friday-api`, `friday-web`) plus Postgres (`friday-db`). Pushing to `main` redeploys both; no manual steps are needed.

On startup the API also:

- **applies pending migrations and refreshes the curated lessons** (`AUTO_MIGRATE`, on by default). The migrations run in one transaction, so a failure leaves the old schema in place and is logged as `auto-migrate failed`.
- **runs the scheduler** for morning and evening briefings, reminders and news collection (`EMBEDDED_WORKER`, on by default). A separate worker service is optional, and running both is safe.

## friday-api

Build: `npm ci --include=dev && npm run build -w @friday/shared && npm run build -w @friday/api`
Start: `npm run start -w @friday/api`

```
AI_GLOBAL_MONTHLY_BUDGET_USD="20"
ALLOW_REGISTRATION="false"
COOKIE_SECURE="true"
DATABASE_URL="${{friday-db.DATABASE_URL}}"
DEMO_MODE="false"
HOST="0.0.0.0"
NODE_ENV="production"
NODE_VERSION="22"
NPM_CONFIG_PRODUCTION="false"
PUSH_ENABLED="false"
TRUST_PROXY_HOPS="1"
WEB_ORIGINS="https://<web-domain>.up.railway.app"

# Groq through the OpenAI-compatible slot
MOONSHOT_API_KEY="gsk_..."
MOONSHOT_MODEL="openai/gpt-oss-20b"
MOONSHOT_BASE_URL="https://api.groq.com/openai/v1"
```

Optional:

- `OPENAI_API_KEY="sk-..."` and `MIRA_VOICE_ENABLED="true"` turn on Mira's natural server voice (OpenAI `nova`). Without them, Mira speaks with the best female voice on your device.
- `EMBEDDED_WORKER="false"` or `AUTO_MIGRATE="false"` turn those startup steps off, if you add a worker service or a pre-deploy step.

## friday-web

Build: `npm ci --include=dev && npm run build -w @friday/shared && npm run build -w @friday/web`
Start: `npm run start -w @friday/web`

```
API_INTERNAL_URL="https://<api-domain>.up.railway.app"
FRIDAY_HTTPS="true"
NEXT_TELEMETRY_DISABLED="1"
NODE_ENV="production"
NODE_VERSION="22"
NPM_CONFIG_PRODUCTION="false"
```

## After a deploy

1. The API deploy log should show `migrations applied` and `Mira scheduler started`.
2. Sign in on the web app. Under **Settings → Learning & news**, pick your topics. Under **Daily briefings & schedule**, set the **Evening news** time, and check that your timezone is right.
3. In Chat, press **Briefing** (or type "give me my daily summary") to generate today's briefing right away. After that, morning and evening briefings arrive in the day's thread automatically.
4. Under **Settings → Mira’s voice**, press **Test Mira’s voice**.

For iOS, set `EXPO_PUBLIC_API_URL` to the API domain before building (see `IOS.md`).
