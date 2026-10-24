import type { FastifyInstance } from 'fastify';
import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { noteCreateSchema, noteUpdateSchema } from '@friday/shared';
import { lessons, notes, tasks } from '../db/schema.js';
import { authUser } from '../auth/plugin.js';
import { badRequest, notFound } from '../util/errors.js';
import { likeEscape, parse } from '../util/validate.js';
import type { Db } from '../db/client.js';

type IdParams = { Params: { id: string } };

async function assertLinks(db: Db, userId: string, taskId?: string | null, lessonId?: string | null) {
  if (taskId) {
    const t = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId))).limit(1);
    if (!t.length) throw badRequest('Unknown task');
  }
  if (lessonId) {
    const l = await db.select({ id: lessons.id }).from(lessons).where(eq(lessons.id, lessonId)).limit(1);
    if (!l.length) throw badRequest('Unknown lesson');
  }
}

export async function noteRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  app.get<{ Querystring: { q?: string; tag?: string } }>('/notes', async (req) => {
    const me = authUser(req);
    const where: SQL[] = [eq(notes.userId, me.id)];
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    if (q) {
      const p = `%${likeEscape(q)}%`;
      where.push(or(ilike(notes.title, p), ilike(notes.body, p))!);
    }
    if (req.query.tag) where.push(sql`${String(req.query.tag).slice(0, 32)} = ANY(${notes.tags})`);
    const rows = await app.db.select().from(notes).where(and(...where)).orderBy(desc(notes.pinned), desc(notes.updatedAt)).limit(100);
    return { notes: rows };
  });

  app.post('/notes', async (req, reply) => {
    const me = authUser(req);
    const body = parse(noteCreateSchema, req.body);
    await assertLinks(app.db, me.id, body.taskId, body.lessonId);
    const [note] = await app.db
      .insert(notes)
      .values({ userId: me.id, title: body.title, body: body.body, tags: body.tags, taskId: body.taskId ?? null, lessonId: body.lessonId ?? null, pinned: body.pinned })
      .returning();
    return reply.code(201).send({ note });
  });

  app.patch<IdParams>('/notes/:id', async (req) => {
    const me = authUser(req);
    const body = parse(noteUpdateSchema, req.body);
    await assertLinks(app.db, me.id, body.taskId, body.lessonId);
    const [note] = await app.db
      .update(notes)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(notes.id, req.params.id), eq(notes.userId, me.id)))
      .returning();
    if (!note) throw notFound('Note');
    return { note };
  });

  app.delete<IdParams>('/notes/:id', async (req) => {
    const me = authUser(req);
    const deleted = await app.db.delete(notes).where(and(eq(notes.id, req.params.id), eq(notes.userId, me.id))).returning({ id: notes.id });
    if (!deleted.length) throw notFound('Note');
    return { ok: true };
  });
}
