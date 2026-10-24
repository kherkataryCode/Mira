# API reference

Base URL: the API service (web clients go through `/api` on the web origin). JSON in/out. All inputs are validated with the Zod schemas in `packages/shared/src/schemas.ts` (unknown fields are rejected).

**Auth:** web uses the `friday_session` HttpOnly cookie (mutations also need header `x-friday-csrf: 1` and an allowed `Origin`); iOS uses `Authorization: Bearer <token>` (send `client: "mobile"` on login, or header `x-friday-client: mobile` on register).

**Errors:** `{ "error": "<code>", "message": "<safe text>", "details"?: [...] }` with 400/401/403/404/409/413/429/5xx. Every response carries `x-request-id`.

| Method | Path | Notes |
|---|---|---|
| GET | `/health/live`, `/health/ready` | Liveness; readiness checks the database |
| GET | `/system/health` | Owner only. Read-only snapshot, no secrets |
| POST | `/auth/register` | `{email, password(≥12), displayName, timezone?}` |
| POST | `/auth/login` | `{email, password, client: "web"|"mobile"}` → cookie or `{token}` |
| POST | `/auth/logout` | Revokes current session |
| GET | `/auth/me` | Current user |
| GET | `/auth/sessions` · DELETE `/auth/sessions/:id` · POST `/auth/sessions/revoke-others` | Session management |
| POST | `/account/delete` | `{password, confirm: "DELETE"}` — cascades all data |
| GET | `/account/export` | Full JSON export of your data |
| GET / PATCH | `/preferences` | Partial update, validated as a whole |
| GET | `/home` | Dashboard bundle (greeting, today, reminders, lesson, news, brief) |
| GET | `/briefs` · POST `/briefs/generate` | On-demand brief (5/hour) |
| POST | `/parse` | `{text}` → deterministic task/reminder preview (nothing saved) |
| GET / POST | `/tasks` | Query: `status`, `view` (today/upcoming/overdue/all), `q`, `tag`, `projectId`, `priority`, `limit`, `offset` |
| GET / PATCH / DELETE | `/tasks/:id` | GET includes history; PATCH `status: "done"` rolls recurring tasks forward |
| GET / POST / DELETE | `/projects`, `/projects/:id` | |
| GET / POST | `/reminders` | `?status=all` to include closed ones; includes `deliveryState`, `lastDelivery` |
| PATCH / DELETE | `/reminders/:id` | |
| POST | `/reminders/:id/snooze` `{minutes}` · `/dismiss` · `/complete` | |
| GET | `/notifications` · POST `/notifications/read-all` | In-app inbox |
| GET / POST / DELETE | `/devices`, `/devices/:id` | Push token registration |
| POST | `/chat/send` | `{content, clientMessageId, conversationId?, viaVoice?}` → **NDJSON stream**: `meta`, `delta`…, then `done` or `error` |
| POST | `/chat/messages/:id/retry` | Regenerates an assistant reply in place (stream) |
| POST | `/chat/messages/:id/cancel` | Aborts an in-flight reply |
| GET / DELETE | `/chat/conversations`, `/chat/conversations/:id` | |
| GET | `/ai/status` | Providers configured (ids/models only), demo flag |
| GET | `/learn/lessons` | `?topic=`, `?filter=saved|history`; quiz answers never included |
| GET | `/learn/lessons/:id` | Full lesson (quiz questions without answers) |
| POST | `/learn/lessons/:id/start` · `/save` `{saved}` · `/quiz` `{answers}` · `/review` `{quality 0-5}` | |
| GET | `/learn/review` · `/learn/stats` | Due reviews; progress counts |
| GET | `/news` | `?importance=`, `?saved=true`, `?category=`; includes staleness status |
| POST | `/news/:id/feedback` | `{saved?, hidden?}` |
| GET / POST | `/news/sources` | HTTPS public feeds only (SSRF-checked); GET includes suggestions |
| PATCH / DELETE | `/news/sources/:id` | |
| POST | `/news/refresh` | On-demand fetch, 3 per 10 minutes |

### Chat stream example

```
{"type":"meta","conversationId":"…","userMessageId":"…","assistantMessageId":"…","proposals":[{"kind":"reminder","title":"Call the dentist","remindAt":"2026-10-25T11:30:00.000Z","recurrence":{"freq":"none"},"needsConfirmation":[]}]}
{"type":"delta","text":"I can set "}
{"type":"done","provider":"anthropic","model":"claude-opus-5-5","demo":false}
```
