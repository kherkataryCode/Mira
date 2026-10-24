import type { Db } from '../db/client.js';
import { auditEvents } from '../db/schema.js';

/** Records security-relevant actions. Never put secrets or message content in `meta`. */
export async function audit(
  db: Db,
  event: { userId: string | null; action: string; target?: string; meta?: Record<string, unknown>; ip?: string },
): Promise<void> {
  await db.insert(auditEvents).values({
    userId: event.userId,
    action: event.action,
    target: event.target ?? null,
    meta: event.meta ?? null,
    ip: event.ip ?? null,
  });
}
