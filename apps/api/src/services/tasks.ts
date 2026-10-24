import { and, asc, desc, eq, gte, ilike, isNotNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { nextOccurrence, type TaskCreate, type TaskUpdate } from '@friday/shared';
import type { Db } from '../db/client.js';
import { projects, taskEvents, tasks } from '../db/schema.js';
import { badRequest, notFound } from '../util/errors.js';
import { likeEscape } from '../util/validate.js';

export type TaskRow = typeof tasks.$inferSelect;

async function assertProjectOwned(db: Db, userId: string, projectId: string | null | undefined) {
  if (!projectId) return;
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  if (!rows.length) throw badRequest('Unknown project');
}

export async function createTask(db: Db, userId: string, input: TaskCreate): Promise<TaskRow> {
  await assertProjectOwned(db, userId, input.projectId);
  return db.transaction(async (tx) => {
    const [task] = await tx
      .insert(tasks)
      .values({
        userId,
        title: input.title,
        notes: input.notes ?? null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        allDay: input.allDay ?? false,
        priority: input.priority,
        tags: input.tags,
        projectId: input.projectId ?? null,
        recurrence: input.recurrence ?? { freq: 'none' },
      })
      .returning();
    if (!task) throw new Error('insert failed');
    await tx.insert(taskEvents).values({ taskId: task.id, userId, kind: 'created' });
    return task;
  });
}

export async function getTask(db: Db, userId: string, id: string): Promise<TaskRow> {
  const rows = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId))).limit(1);
  if (!rows[0]) throw notFound('Task');
  return rows[0];
}

export async function updateTask(db: Db, userId: string, id: string, patch: TaskUpdate, timezone: string): Promise<TaskRow> {
  const current = await getTask(db, userId, id);
  if (patch.projectId !== undefined) await assertProjectOwned(db, userId, patch.projectId);

  const set: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.notes !== undefined) set.notes = patch.notes;
  if (patch.dueAt !== undefined) set.dueAt = patch.dueAt ? new Date(patch.dueAt) : null;
  if (patch.allDay !== undefined) set.allDay = patch.allDay;
  if (patch.priority !== undefined) set.priority = patch.priority;
  if (patch.tags !== undefined) set.tags = patch.tags;
  if (patch.projectId !== undefined) set.projectId = patch.projectId;
  if (patch.recurrence !== undefined) set.recurrence = patch.recurrence;

  let kind: 'updated' | 'completed' | 'reopened' | 'recurred' = 'updated';
  const recurrence = patch.recurrence ?? current.recurrence;
  if (patch.status === 'done' && current.status === 'open') {
    const due = (set.dueAt as Date | null | undefined) ?? current.dueAt;
    const next = due && recurrence.freq !== 'none' ? nextOccurrence(due, recurrence, timezone, new Date(Math.max(Date.now(), due.getTime()))) : null;
    if (next) {
      // Recurring: roll forward to the next occurrence and stay open.
      set.dueAt = next;
      kind = 'recurred';
    } else {
      set.status = 'done';
      set.completedAt = new Date();
      kind = 'completed';
    }
  } else if (patch.status === 'open' && current.status === 'done') {
    set.status = 'open';
    set.completedAt = null;
    kind = 'reopened';
  }

  return db.transaction(async (tx) => {
    const [row] = await tx.update(tasks).set(set).where(and(eq(tasks.id, id), eq(tasks.userId, userId))).returning();
    if (!row) throw notFound('Task');
    const changed = Object.keys(patch).filter((k) => k !== 'status');
    await tx.insert(taskEvents).values({ taskId: id, userId, kind, detail: changed.length ? { fields: changed } : null });
    return row;
  });
}

export interface TaskQuery {
  status: 'open' | 'done' | 'all';
  view: 'today' | 'upcoming' | 'overdue' | 'all';
  q?: string | undefined;
  tag?: string | undefined;
  projectId?: string | undefined;
  priority?: TaskRow['priority'] | undefined;
  limit: number;
  offset: number;
}

export async function listTasks(db: Db, userId: string, query: TaskQuery, timezone: string, now = new Date()) {
  const where: SQL[] = [eq(tasks.userId, userId)];
  if (query.status !== 'all') where.push(eq(tasks.status, query.status));
  const local = DateTime.fromJSDate(now, { zone: timezone });
  const dayStart = local.startOf('day').toJSDate();
  const dayEnd = local.endOf('day').toJSDate();
  if (query.view === 'today') where.push(isNotNull(tasks.dueAt), lt(tasks.dueAt, dayEnd));
  if (query.view === 'upcoming') where.push(gte(tasks.dueAt, dayEnd));
  if (query.view === 'overdue') where.push(lt(tasks.dueAt, now), eq(tasks.status, 'open'));
  if (query.q) {
    const pattern = `%${likeEscape(query.q)}%`;
    where.push(or(ilike(tasks.title, pattern), ilike(tasks.notes, pattern))!);
  }
  if (query.tag) where.push(sql`${query.tag} = ANY(${tasks.tags})`);
  if (query.projectId) where.push(eq(tasks.projectId, query.projectId));
  if (query.priority) where.push(eq(tasks.priority, query.priority));

  const rows = await db
    .select()
    .from(tasks)
    .where(and(...where))
    .orderBy(
      asc(tasks.status),
      sql`${tasks.dueAt} asc nulls last`,
      sql`array_position(array['urgent','high','medium','low'], ${tasks.priority})`,
      desc(tasks.createdAt),
    )
    .limit(query.limit)
    .offset(query.offset);
  return { tasks: rows, dayStart: dayStart.toISOString() };
}
