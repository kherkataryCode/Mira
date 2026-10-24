# Optional OpenClaw integration

**Disabled by default.** Friday works fully without it.

## What it does

When enabled, OpenClaw is added to the AI provider chain as a **text-only** generator. Friday sends it the system prompt and bounded chat history, and expects text back. It receives **no tools**: no shell, filesystem, browser or network capabilities, and no ability to create, change or delete data. Any task or reminder suggestion still goes through Friday's deterministic parser and the user's explicit **Confirm**.

## Contract

```
POST {OPENCLAW_URL}
Authorization: Bearer {OPENCLAW_TOKEN}
Content-Type: application/json

{"system": "...", "messages": [{"role": "user", "content": "..."}], "max_tokens": 800}

→ 200 {"text": "..."}
```

Put a small adapter in front of your OpenClaw deployment if its native API differs.

## Configure

```
OPENCLAW_ENABLED=true
OPENCLAW_URL=https://openclaw.example.com/friday
OPENCLAW_TOKEN=<long random secret>
```

Friday **fails closed**: the URL must be HTTPS on the default port, must not resolve to private/loopback/metadata addresses, and redirects are refused. Responses over 100 KB or not matching the contract are rejected. Timeouts follow `AI_TIMEOUT_MS`.

## Disable quickly

Set `OPENCLAW_ENABLED=false` (or remove the URL/token) and restart the API.

## Status

Implemented against the contract above; not tested against a real OpenClaw deployment.
