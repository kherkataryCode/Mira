import type { FastifyInstance } from 'fastify';
import { and, eq, max, sql, type SQL } from 'drizzle-orm';
import { newsFeedbackSchema, newsSourceCreateSchema } from '@friday/shared';
import { newsItems, newsSources } from '../db/schema.js';
import { authUser } from '../auth/plugin.js';
import { badRequest, conflict, notFound } from '../util/errors.js';
import { parse } from '../util/validate.js';
import { assertPublicHttpsUrl } from '../util/safe-fetch.js';
import { SUGGESTED_SOURCES, collectNewsForUser } from '../services/news.js';
import { getPreferences } from '../services/prefs.js';

type IdParams = { Params: { id: string } };
const IMPORTANCE = ['breaking', 'important', 'relevant', 'background'] as const;
const STALE_MS = 36 * 3_600_000;

export async function newsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  app.get<{ Querystring: { importance?: string; saved?: string; category?: string; limit?: string } }>('/news', async (req) => {
    const me = authUser(req);
    const where: SQL[] = [eq(newsItems.userId, me.id), eq(newsItems.hidden, false)];
    const imp = req.query.importance;
    if (imp && (IMPORTANCE as readonly string[]).includes(imp)) where.push(eq(newsItems.importance, imp as (typeof IMPORTANCE)[number]));
    if (req.query.saved === 'true') where.push(eq(newsItems.saved, true));
    if (req.query.category) where.push(eq(newsItems.category, String(req.query.category).slice(0, 40)));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
    const items = await app.db
      .select()
      .from(newsItems)
      .where(and(...where))
      .orderBy(sql`array_position(array['breaking','important','relevant','background'], ${newsItems.importance})`, sql`${newsItems.publishedAt} desc nulls last`)
      .limit(limit);
    const [status] = await app.db
      .select({ lastSuccessAt: max(newsSources.lastSuccessAt), sources: sql<number>`count(*)::int`, failing: sql<number>`count(*) filter (where ${newsSources.consecutiveFailures} > 0)::int` })
      .from(newsSources)
      .where(and(eq(newsSources.userId, me.id), eq(newsSources.enabled, true)));
    const last = status?.lastSuccessAt ?? null;
    return {
      items,
      status: {
        sources: status?.sources ?? 0,
        failingSources: status?.failing ?? 0,
        lastSuccessAt: last,
        stale: (status?.sources ?? 0) > 0 && (!last || Date.now() - new Date(last).getTime() > STALE_MS),
      },
    };
  });

  app.post<IdParams>('/news/:id/feedback', async (req) => {
    const me = authUser(req);
    const body = parse(newsFeedbackSchema, req.body);
    const [item] = await app.db
      .update(newsItems)
      .set(body)
      .where(and(eq(newsItems.id, req.params.id), eq(newsItems.userId, me.id)))
      .returning({ id: newsItems.id, saved: newsItems.saved, hidden: newsItems.hidden });
    if (!item) throw notFound('News item');
    return { item };
  });

  app.get('/news/sources', async (req) => {
    const me = authUser(req);
    const sources = await app.db.select().from(newsSources).where(eq(newsSources.userId, me.id)).orderBy(newsSources.name);
    const have = new Set(sources.map((s) => s.url));
    return { sources, suggestions: SUGGESTED_SOURCES.filter((s) => !have.has(s.url)) };
  });

  app.post('/news/sources', async (req, reply) => {
    const me = authUser(req);
    const body = parse(newsSourceCreateSchema, req.body);
    try {
      await assertPublicHttpsUrl(body.url);
    } catch (err) {
      throw badRequest(err instanceof Error ? err.message : 'URL not allowed');
    }
    const [source] = await app.db
      .insert(newsSources)
      .values({ userId: me.id, name: body.name, url: body.url, category: body.category })
      .onConflictDoNothing()
      .returning();
    if (!source) throw conflict('That source is already added');
    return reply.code(201).send({ source });
  });

  app.patch<IdParams>('/news/sources/:id', async (req) => {
    const me = authUser(req);
    const enabled = (req.body as { enabled?: unknown } | undefined)?.enabled;
    if (typeof enabled !== 'boolean') throw badRequest('enabled must be boolean');
    const [source] = await app.db
      .update(newsSources)
      .set({ enabled })
      .where(and(eq(newsSources.id, req.params.id), eq(newsSources.userId, me.id)))
      .returning();
    if (!source) throw notFound('Source');
    return { source };
  });

  app.delete<IdParams>('/news/sources/:id', async (req) => {
    const me = authUser(req);
    const deleted = await app.db
      .delete(newsSources)
      .where(and(eq(newsSources.id, req.params.id), eq(newsSources.userId, me.id)))
      .returning({ id: newsSources.id });
    if (!deleted.length) throw notFound('Source');
    return { ok: true };
  });

  /** On-demand refresh, tightly rate limited so it cannot become continuous polling. */
  app.post('/news/refresh', { config: { rateLimit: { max: 3, timeWindow: '10 minutes' } } }, async (req) => {
    const me = authUser(req);
    const prefs = await getPreferences(app.db, me.id);
    return collectNewsForUser(app.db, me.id, prefs);
  });
}
