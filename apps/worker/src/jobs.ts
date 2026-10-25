import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { localDate, type Preferences } from '@friday/shared';
import {
  collectNewsForUser,
  dispatchDueReminders,
  generateBrief,
  mergePreferences,
  postBriefing,
  schema,
  sendPendingPushes,
  type AiGateway,
  type BriefKind,
  type Db,
} from '@friday/api/lib';

const { jobRuns, users, userPreferences, notificationDeliveries, devices, newsSources, lessons, lessonProgress } = schema;

/** A scheduled slot is only run if we are within this window after its time (missed-run policy). */
export const MISSED_RUN_WINDOW_MS = 3 * 3_600_000;

export type RunOutcome = { status: 'succeeded'; detail: Record<string, unknown> } | { status: 'skipped' };

/**
 * Runs `fn` at most once to success per (job, key). A unique index on job_runs makes this safe
 * across worker restarts and multiple replicas; failed runs may be retried.
 */
export async function runOnce(db: Db, job: string, key: string, fn: () => Promise<Record<string, unknown>>): Promise<RunOutcome> {
  const claimed = await db
    .insert(jobRuns)
    .values({ job, key, status: 'running' })
    .onConflictDoUpdate({
      target: [jobRuns.job, jobRuns.key],
      set: { status: 'running', startedAt: new Date(), error: null },
      // Re-claim only failed runs, or runs stuck "running" for over 15 minutes (crashed worker).
      setWhere: or(eq(jobRuns.status, 'failed'), and(eq(jobRuns.status, 'running'), lt(jobRuns.startedAt, sql`now() - interval '15 minutes'`))),
    })
    .returning({ id: jobRuns.id });
  if (!claimed[0]) return { status: 'skipped' };
  try {
    const detail = await fn();
    await db.update(jobRuns).set({ status: 'succeeded', detail, finishedAt: new Date() }).where(eq(jobRuns.id, claimed[0].id));
    return { status: 'succeeded', detail };
  } catch (err) {
    const message = (err instanceof Error ? err.message : 'failed').slice(0, 300);
    await db.update(jobRuns).set({ status: 'failed', error: message, finishedAt: new Date() }).where(eq(jobRuns.id, claimed[0].id));
    throw err;
  }
}

/** True when local time `hm` has passed today but not by more than the missed-run window. */
export function slotIsDue(now: Date, timezone: string, hm: string): boolean {
  const [h, m] = hm.split(':').map(Number) as [number, number];
  const slot = DateTime.fromJSDate(now, { zone: timezone }).set({ hour: h, minute: m, second: 0, millisecond: 0 });
  const delta = now.getTime() - slot.toMillis();
  return delta >= 0 && delta <= MISSED_RUN_WINDOW_MS;
}

async function* usersWithPrefs(db: Db, pageSize = 200): AsyncGenerator<{ id: string; prefs: Preferences }> {
  let lastId: string | null = null;
  for (;;) {
    const rows: { id: string; data: Preferences | null }[] = await db
      .select({ id: users.id, data: userPreferences.data })
      .from(users)
      .leftJoin(userPreferences, eq(userPreferences.userId, users.id))
      .where(lastId ? sql`${users.id} > ${lastId}` : undefined)
      .orderBy(users.id)
      .limit(pageSize);
    for (const r of rows) yield { id: r.id, prefs: mergePreferences(r.data) };
    if (rows.length < pageSize) return;
    lastId = rows.at(-1)!.id;
  }
}

async function notify(db: Db, userId: string, kind: 'brief' | 'system', key: string, title: string, body: string, pushAllowed: boolean) {
  const hasDevice = pushAllowed
    ? (await db.select({ id: devices.id }).from(devices).where(and(eq(devices.userId, userId), isNull(devices.disabledAt))).limit(1)).length > 0
    : false;
  const rows: (typeof notificationDeliveries.$inferInsert)[] = [
    { userId, kind, occurrenceKey: key, channel: 'in_app', status: 'sent', title, body, sentAt: new Date() },
  ];
  if (hasDevice) rows.push({ userId, kind, occurrenceKey: key, channel: 'push', status: 'pending', title, body });
  await db.insert(notificationDeliveries).values(rows).onConflictDoNothing();
}

const BRIEF_SLOTS: { pref: 'morningBrief' | 'afternoonCheckIn' | 'eveningReview'; kind: BriefKind; label: string }[] = [
  { pref: 'morningBrief', kind: 'morning', label: 'Your morning brief is ready' },
  { pref: 'afternoonCheckIn', kind: 'checkin', label: 'Afternoon check-in' },
  { pref: 'eveningReview', kind: 'evening', label: 'Evening review' },
];

export async function runBriefs(db: Db, ai: AiGateway | null, now = new Date()) {
  let generated = 0;
  for await (const u of usersWithPrefs(db)) {
    const date = localDate(now, u.prefs.timezone);
    for (const slot of BRIEF_SLOTS) {
      if (!u.prefs.scheduleEnabled[slot.pref] || !slotIsDue(now, u.prefs.timezone, u.prefs.schedule[slot.pref])) continue;
      const key = `${u.id}:${date}:${slot.kind}`;
      const res = await runOnce(db, 'brief.user', key, async () => {
        const brief = await generateBrief(db, ai, u.id, u.prefs, slot.kind, now);
        // The morning notification comes from the chat briefing (runChatBriefings) instead.
        if (slot.kind !== 'morning') await notify(db, u.id, 'brief', key, slot.label, brief.content.headline, u.prefs.notifications.push);
        return { briefId: brief.id };
      }).catch(() => ({ status: 'failed' as const }));
      if (res.status === 'succeeded') generated++;
    }
    if (u.prefs.scheduleEnabled.microlearning && slotIsDue(now, u.prefs.timezone, u.prefs.schedule.microlearning)) {
      const key = `${u.id}:${date}:learning`;
      await runOnce(db, 'learning.nudge', key, async () => {
        const [lesson] = await db
          .select({ title: lessons.title, minutes: lessons.minutes })
          .from(lessons)
          .leftJoin(lessonProgress, and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, u.id)))
          .where(sql`${lessonProgress.status} is distinct from 'completed'`)
          .limit(1);
        if (lesson) await notify(db, u.id, 'system', key, 'Time for a quick lesson', `${lesson.title} · ${lesson.minutes} min`, u.prefs.notifications.push);
        return { lesson: lesson?.title ?? null };
      }).catch(() => undefined);
    }
  }
  return { generated };
}

/**
 * Posts Mira's briefings into each user's daily chat thread:
 * morning (plan + concept of the day) and evening (cybersecurity news, fetched fresh first).
 */
export async function runChatBriefings(db: Db, ai: AiGateway | null, now = new Date()) {
  let posted = 0;
  for await (const u of usersWithPrefs(db)) {
    const date = localDate(now, u.prefs.timezone);
    const slots: { slot: 'morning' | 'evening'; on: boolean; at: string }[] = [
      { slot: 'morning', on: u.prefs.scheduleEnabled.morningBrief, at: u.prefs.schedule.morningBrief },
      { slot: 'evening', on: u.prefs.scheduleEnabled.eveningNews, at: u.prefs.schedule.eveningNews },
    ];
    for (const s of slots) {
      if (!s.on || !slotIsDue(now, u.prefs.timezone, s.at)) continue;
      const res = await runOnce(db, 'briefing.chat', `${u.id}:${date}:${s.slot}`, async () => {
        const p = await postBriefing(db, ai, u.id, s.slot, { now, collectNews: true, notify: true });
        return { messageId: p.messageId };
      }).catch(() => ({ status: 'failed' as const }));
      if (res.status === 'succeeded') posted++;
    }
  }
  return { posted };
}

export async function runNewsCollection(db: Db, now = new Date()) {
  const owners = new Set(
    (await db.selectDistinct({ userId: newsSources.userId }).from(newsSources).where(eq(newsSources.enabled, true))).map((r) => r.userId),
  );
  let added = 0;
  let runs = 0;
  for await (const u of usersWithPrefs(db)) {
    if (!owners.has(u.id) || !u.prefs.scheduleEnabled.newsScans) continue;
    const date = localDate(now, u.prefs.timezone);
    for (const hm of u.prefs.schedule.newsScans) {
      if (!slotIsDue(now, u.prefs.timezone, hm)) continue;
      const res = await runOnce(db, 'news.user', `${u.id}:${date}:${hm}`, async () => {
        const r = await collectNewsForUser(db, u.id, u.prefs, now);
        return { ...r };
      }).catch(() => ({ status: 'failed' as const }));
      if (res.status === 'succeeded') {
        runs++;
        added += Number(res.detail.added ?? 0);
      }
    }
  }
  return { runs, added };
}

export async function runCleanup(db: Db, retention = { conversationDays: 180, deliveryDays: 90, newsDays: 30, jobRunDays: 30, auditDays: 365 }) {
  const days = (n: number) => sql`now() - make_interval(days => ${n})`;
  const result = await db.transaction(async (tx) => {
    const conv = await tx.execute(sql`delete from conversations where updated_at < ${days(retention.conversationDays)}`);
    const deliveries = await tx.execute(sql`delete from notification_deliveries where created_at < ${days(retention.deliveryDays)}`);
    const sessions = await tx.execute(sql`delete from sessions where expires_at < now() - interval '7 days' or revoked_at < now() - interval '7 days'`);
    const news = await tx.execute(sql`delete from news_items where saved = false and fetched_at < ${days(retention.newsDays)}`);
    const runs = await tx.execute(sql`delete from job_runs where started_at < ${days(retention.jobRunDays)}`);
    const auditRows = await tx.execute(sql`delete from audit_events where created_at < ${days(retention.auditDays)}`);
    return {
      conversations: conv.rowCount ?? 0,
      deliveries: deliveries.rowCount ?? 0,
      sessions: sessions.rowCount ?? 0,
      news: news.rowCount ?? 0,
      jobRuns: runs.rowCount ?? 0,
      audit: auditRows.rowCount ?? 0,
    };
  });
  return result;
}

export { dispatchDueReminders, sendPendingPushes };
