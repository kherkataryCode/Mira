# Backup and restore

PostgreSQL is the only source of truth (no persistent disk is used by the services).

## Render managed backups

Paid Render PostgreSQL plans include automated backups and point-in-time recovery; check your plan in the dashboard and the [Render PostgreSQL docs](https://render.com/docs/databases). Restoring creates or overwrites a database — follow Render's restore flow and then point `DATABASE_URL` at the restored instance if it is new.

## Manual logical backup

```bash
# External connection string from the Render dashboard (requires TLS)
pg_dump --format=custom --no-owner --no-acl "$EXTERNAL_DATABASE_URL" -f friday-$(date +%F).dump
```

Store dumps encrypted and outside the repository (`backups/` is git-ignored). Dumps contain personal data.

## Restore drill (do this before relying on backups)

```bash
createdb friday_restore_test
pg_restore --no-owner --no-acl -d friday_restore_test friday-YYYY-MM-DD.dump
psql friday_restore_test -c "select count(*) from users; select count(*) from tasks;"
```

Then point a local API at it (`DATABASE_URL=…/friday_restore_test npm run dev:api`) and sign in.

## Before risky migrations

1. Take a manual dump.
2. Deploy; the `preDeployCommand` runs migrations before traffic switches.
3. If something is wrong: roll back the code deploy, and write a corrective migration (migrations are forward-only). Restore from the dump only if data was lost.

## Per-user export / deletion

Users can download all their data (Settings → Export) and delete their account (Settings → Delete account), which cascades through every user-owned table. Audit rows keep a null user id.
