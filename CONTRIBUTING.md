# Contributing

1. Use Node 22 (`.node-version`) and `npm ci`.
2. Start PostgreSQL with `docker compose up -d postgres`.
3. Make your change with tests. Every behaviour change needs a test; every config change needs a docs update.
4. Run `npm run check` (lint, typecheck, unit + integration tests, builds) and, for UI changes, `npm run test:e2e`.
5. Schema changes: edit `apps/api/src/db/schema.ts`, run `npm run db:generate`, commit the generated SQL. Never edit or delete applied migrations.
6. Keep business logic in `packages/shared` or the API — not duplicated across web and mobile.
7. Don't add dependencies without checking they are maintained and necessary.
8. Never commit secrets, real user data or screenshots containing private data.
