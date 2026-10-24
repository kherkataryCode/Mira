import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { devices, notificationDeliveries } from '../db/schema.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_ATTEMPTS = 3;

export interface PushConfig {
  enabled: boolean;
  accessToken?: string | undefined;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/**
 * Sends pending push deliveries through the Expo Push Service, which relays to APNs
 * using the APNs key configured in your Expo/EAS project. When push is not configured,
 * deliveries are marked "skipped" with a visible reason instead of pretending success.
 */
export async function sendPendingPushes(db: Db, cfg: PushConfig, fetchImpl: typeof fetch = fetch): Promise<{ sent: number; failed: number; skipped: number }> {
  const pending = await db
    .select()
    .from(notificationDeliveries)
    .where(and(eq(notificationDeliveries.channel, 'push'), eq(notificationDeliveries.status, 'pending'), lt(notificationDeliveries.attempts, MAX_ATTEMPTS)))
    .limit(100);
  if (!pending.length) return { sent: 0, failed: 0, skipped: 0 };

  if (!cfg.enabled) {
    await db
      .update(notificationDeliveries)
      .set({ status: 'skipped', error: 'Server push is not configured (PUSH_ENABLED=false)' })
      .where(inArray(notificationDeliveries.id, pending.map((p) => p.id)));
    return { sent: 0, failed: 0, skipped: pending.length };
  }

  const userIds = [...new Set(pending.map((p) => p.userId))];
  const deviceRows = await db
    .select()
    .from(devices)
    .where(and(inArray(devices.userId, userIds), isNull(devices.disabledAt)));
  const byUser = new Map<string, typeof deviceRows>();
  for (const d of deviceRows) byUser.set(d.userId, [...(byUser.get(d.userId) ?? []), d]);

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const delivery of pending) {
    const targets = byUser.get(delivery.userId) ?? [];
    if (!targets.length) {
      skipped++;
      await db.update(notificationDeliveries).set({ status: 'skipped', error: 'No registered device' }).where(eq(notificationDeliveries.id, delivery.id));
      continue;
    }
    const messages = targets.map((d) => ({
      to: d.pushToken,
      title: delivery.title,
      body: delivery.body ?? undefined,
      sound: 'default',
      data: { deliveryId: delivery.id, reminderId: delivery.reminderId },
    }));
    try {
      const res = await fetchImpl(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(cfg.accessToken ? { authorization: `Bearer ${cfg.accessToken}` } : {}),
        },
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Push service HTTP ${res.status}`);
      const json = (await res.json()) as { data?: ExpoTicket[] };
      const tickets = json.data ?? [];
      const okCount = tickets.filter((t) => t.status === 'ok').length;
      for (const [i, t] of tickets.entries()) {
        if (t.details?.error === 'DeviceNotRegistered' && targets[i]) {
          await db.update(devices).set({ disabledAt: new Date() }).where(eq(devices.id, targets[i].id));
        }
      }
      if (okCount > 0) {
        sent++;
        await db
          .update(notificationDeliveries)
          .set({ status: 'sent', sentAt: new Date(), attempts: delivery.attempts + 1, error: null })
          .where(eq(notificationDeliveries.id, delivery.id));
      } else {
        throw new Error(tickets[0]?.details?.error ?? tickets[0]?.message ?? 'Push rejected');
      }
    } catch (err) {
      const attempts = delivery.attempts + 1;
      const final = attempts >= MAX_ATTEMPTS;
      if (final) failed++;
      await db
        .update(notificationDeliveries)
        .set({
          attempts,
          status: final ? 'failed' : 'pending',
          error: (err instanceof Error ? err.message : 'Push failed').slice(0, 200),
        })
        .where(eq(notificationDeliveries.id, delivery.id));
    }
  }
  return { sent, failed, skipped };
}
