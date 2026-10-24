import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import {
  parseNaturalEntry,
  parseRequestSchema,
  projectCreateSchema,
  taskCreateSchema,
  taskListQuerySchema,
  taskUpdateSchema,
} from '@friday/shared';
import { projects, taskEvents, tasks } from '../db/schema.js';
import { authUser } from '../auth/plugin.js';
import { notFound } from '../util/errors.js';
import { parse } from '../util/validate.js';
import { createTask, getTask, listTasks, updateTask } from '../services/tasks.js';
import { getPreferences } from '../services/prefs.js';

type IdParams = { Params: { id: string } };

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  app.get('/tasks', async (req) => {
    const me = authUser(req);
    const query = parse(taskListQuerySchema, req.query);
    const prefs = await getPreferences(app.db, me.id);
    return listTasks(app.db, me.id, query, prefs.timezone);
  });

  app.post('/tasks', async (req, reply) => {
    const me = authUser(req);
    const task = await createTask(app.db, me.id, parse(taskCreateSchema, req.body));
    return reply.code(201).send({ task });
  });

  app.get<IdParams>('/tasks/:id', async (req) => {
    const me = authUser(req);
    const task = await getTask(app.db, me.id, req.params.id);
    const history = await app.db
      .select({ kind: taskEvents.kind, detail: taskEvents.detail, createdAt: taskEvents.createdAt })
      .from(taskEvents)
      .where(and(eq(taskEvents.taskId, task.id), eq(taskEvents.userId, me.id)))
      .orderBy(desc(taskEvents.createdAt))
      .limit(50);
    return { task, history };
  });

  app.patch<IdParams>('/tasks/:id', async (req) => {
    const me = authUser(req);
    const patch = parse(taskUpdateSchema, req.body);
    const prefs = await getPreferences(app.db, me.id);
    return { task: await updateTask(app.db, me.id, req.params.id, patch, prefs.timezone) };
  });

  app.delete<IdParams>('/tasks/:id', async (req) => {
    const me = authUser(req);
    const deleted = await app.db
      .delete(tasks)
      .where(and(eq(tasks.id, req.params.id), eq(tasks.userId, me.id)))
      .returning({ id: tasks.id });
    if (!deleted.length) throw notFound('Task');
    return { ok: true };
  });

  /** Deterministic natural-language preview; nothing is saved until the client confirms. */
  app.post('/parse', async (req) => {
    const me = authUser(req);
    const { text } = parse(parseRequestSchema, req.body);
    const prefs = await getPreferences(app.db, me.id);
    return { preview: parseNaturalEntry(text, prefs.timezone), timezone: prefs.timezone };
  });

  app.get('/projects', async (req) => {
    const me = authUser(req);
    return { projects: await app.db.select().from(projects).where(eq(projects.userId, me.id)).orderBy(projects.name) };
  });

  app.post('/projects', async (req, reply) => {
    const me = authUser(req);
    const body = parse(projectCreateSchema, req.body);
    const [project] = await app.db.insert(projects).values({ userId: me.id, name: body.name, color: body.color ?? null }).returning();
    return reply.code(201).send({ project });
  });

  app.delete<IdParams>('/projects/:id', async (req) => {
    const me = authUser(req);
    const deleted = await app.db
      .delete(projects)
      .where(and(eq(projects.id, req.params.id), eq(projects.userId, me.id)))
      .returning({ id: projects.id });
    if (!deleted.length) throw notFound('Project');
    return { ok: true };
  });
}
