import type { FastifyInstance } from 'fastify';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { localDate } from '@friday/shared';
import { briefings, conversations } from '../db/schema.js';
import { authUser } from '../auth/plugin.js';
import { parse } from '../util/validate.js';
import { getPreferences } from '../services/prefs.js';
import { postBriefing } from '../services/briefing.js';

const nowSchema = z.object({ slot: z.enum(['ondemand', 'morning', 'evening']).default('ondemand') }).strict();

export async function briefingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  /** Today's daily thread (if any) and what has been sent into it. */
  app.get('/briefings/today', async (req) => {
    const me = authUser(req);
    const prefs = await getPreferences(app.db, me.id);
    const date = localDate(new Date(), prefs.timezone);
    const [conv] = await app.db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.userId, me.id), eq(conversations.kind, 'daily'), eq(conversations.localDate, date)))
      .limit(1);
    const sent = await app.db
      .select({ slot: briefings.slot, createdAt: briefings.createdAt, messageId: briefings.messageId })
      .from(briefings)
      .where(and(eq(briefings.userId, me.id), eq(briefings.localDate, date)))
      .orderBy(asc(briefings.createdAt));
    return {
      localDate: date,
      conversationId: conv?.id ?? null,
      sent,
      schedule: {
        morning: prefs.scheduleEnabled.morningBrief ? prefs.schedule.morningBrief : null,
        evening: prefs.scheduleEnabled.eveningNews ? prefs.schedule.eveningNews : null,
      },
    };
  });

  /** "Brief me": a short briefing in a new chat. Scheduled slots go to today's daily thread. */
  app.post('/briefings/now', { config: { rateLimit: { max: 6, timeWindow: '1 hour' } } }, async (req, reply) => {
    const me = authUser(req);
    const { slot } = parse(nowSchema, req.body ?? {});
    let conversationId: string | undefined;
    if (slot === 'ondemand') {
      const prefs = await getPreferences(app.db, me.id);
      const title = `Briefing · ${DateTime.now().setZone(prefs.timezone).toFormat('ccc d LLL, h:mm a')}`;
      const [c] = await app.db.insert(conversations).values({ userId: me.id, title }).returning({ id: conversations.id });
      conversationId = c!.id;
    }
    const posted = await postBriefing(app.db, app.ai, me.id, slot, { collectNews: true, conversationId });
    return reply.code(201).send({ conversationId: posted.conversationId, messageId: posted.messageId });
  });
}
