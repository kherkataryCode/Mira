import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { preferencesPatchSchema, preferencesSchema } from '@friday/shared';
import {
  briefs,
  conversations,
  devices,
  lessonProgress,
  messages,
  newsItems,
  newsSources,
  notes,
  notificationDeliveries,
  projects,
  quizAttempts,
  reminders,
  tasks,
  users,
} from '../db/schema.js';
import { authUser } from '../auth/plugin.js';
import { parse } from '../util/validate.js';
import { getPreferences, savePreferences } from '../services/prefs.js';
import { audit } from '../services/audit.js';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  app.get('/preferences', async (req) => {
    const me = authUser(req);
    return { preferences: await getPreferences(app.db, me.id) };
  });

  app.patch('/preferences', async (req) => {
    const me = authUser(req);
    const patch = parse(preferencesPatchSchema, req.body);
    const current = await getPreferences(app.db, me.id);
    const next = parse(preferencesSchema, { ...current, ...patch });
    await savePreferences(app.db, me.id, next);
    return { preferences: next };
  });

  /** Full JSON export of the user's data (no secrets, no other users' data). */
  app.get('/account/export', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    const me = authUser(req);
    const by = <T extends { userId: unknown }>(t: T) => eq(t.userId as never, me.id);
    const [user] = await app.db
      .select({ id: users.id, email: users.email, displayName: users.displayName, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, me.id));
    const data = {
      exportedAt: new Date().toISOString(),
      user,
      preferences: await getPreferences(app.db, me.id),
      projects: await app.db.select().from(projects).where(by(projects)),
      tasks: await app.db.select().from(tasks).where(by(tasks)),
      reminders: await app.db.select().from(reminders).where(by(reminders)),
      notifications: await app.db.select().from(notificationDeliveries).where(by(notificationDeliveries)),
      notes: await app.db.select().from(notes).where(by(notes)),
      conversations: await app.db.select().from(conversations).where(by(conversations)),
      messages: await app.db.select().from(messages).where(by(messages)),
      learningProgress: await app.db.select().from(lessonProgress).where(by(lessonProgress)),
      quizAttempts: await app.db.select().from(quizAttempts).where(by(quizAttempts)),
      newsSources: await app.db.select().from(newsSources).where(by(newsSources)),
      newsItems: await app.db.select().from(newsItems).where(by(newsItems)),
      briefs: await app.db.select().from(briefs).where(by(briefs)),
      devices: await app.db.select({ id: devices.id, platform: devices.platform, createdAt: devices.createdAt }).from(devices).where(by(devices)),
    };
    await audit(app.db, { userId: me.id, action: 'account.exported', ip: req.ip });
    return reply
      .header('content-disposition', `attachment; filename="friday-export-${new Date().toISOString().slice(0, 10)}.json"`)
      .header('cache-control', 'no-store')
      .send(data);
  });
}
