# Deploying Mira on Railway

Mira runs as three Railway services plus one Postgres database, all built from this repo.

| Service | Build command | Start command | Pre-deploy command |
|---|---|---|---|
| `api` | `npm ci && npm run build:libs` | `npm run start -w @friday/api` | `npm run db:migrate && npm run db:seed` |
| `worker` | `npm ci && npm run build:libs && npm run build -w @friday/worker` | `npm run start -w @friday/worker` | — |
| `web` | `npm ci && npm run build -w @friday/shared && npm run build -w @friday/web` | `npm run start -w @friday/web` | — |

The pre-deploy step on `api` applies `0001_mira_briefings.sql` (briefings, the daily chat thread, the lesson fields and the default cyber feeds) and refreshes the curated cyber/OT lessons. **If you skip it, briefings and the new learning content will not work.**

## Variables

**`api` and `worker`** (shared variables are easiest):

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
DEMO_MODE=false
OPENAI_API_KEY=sk-...           # chat fallback + Mira's natural voice
ANTHROPIC_API_KEY=sk-ant-...    # optional, primary chat model
MIRA_VOICE_ENABLED=true
OPENAI_TTS_VOICE=nova           # or shimmer / coral
OWNER_EMAIL=you@example.com
ALLOW_REGISTRATION=false        # after creating your account
```

**`api` only:**

```
WEB_ORIGINS=https://<web-domain>.up.railway.app
COOKIE_SECURE=true
TRUST_PROXY_HOPS=1
```

**`web` only:**

```
API_INTERNAL_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}
```

## After deploying

1. Open `https://<api-domain>/health/ready`. `briefings.chat` should be listed among the worker jobs.
2. Sign in on the web app, go to **Settings → Learning & news**, pick your topics, and set the **Evening news** time under **Daily briefings & schedule**, and your timezone.
3. In Chat, press **Briefing** (or type "give me my briefing") to generate today's briefing right away. After that, morning and evening briefings arrive in the day's thread automatically.
4. In **Settings → Mira’s voice**, press **Test Mira’s voice**. If it sounds robotic, check that `OPENAI_API_KEY` and `MIRA_VOICE_ENABLED=true` are set on `api`.

For iOS, point `EXPO_PUBLIC_API_URL` at the `api` domain before building (see `IOS.md`).
