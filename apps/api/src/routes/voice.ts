import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import { and, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { speakableText } from '@friday/shared';
import { aiUsage } from '../db/schema.js';
import { authUser } from '../auth/plugin.js';
import { HttpError } from '../util/errors.js';
import { parse } from '../util/validate.js';
import { getPreferences } from '../services/prefs.js';

const speakSchema = z.object({ text: z.string().min(1).max(20000) }).strict();

/** Short-lived audio clips for clients that can only stream via GET (the iOS audio player). */
interface Clip {
  userId: string;
  audio: Buffer;
  expires: number;
}
const CLIP_TTL_MS = 10 * 60_000;
const MAX_CLIPS = 100;
const clips = new Map<string, Clip>();
function putClip(userId: string, audio: Buffer): string {
  const now = Date.now();
  for (const [k, c] of clips) if (c.expires < now) clips.delete(k);
  while (clips.size >= MAX_CLIPS) clips.delete(clips.keys().next().value as string);
  const id = randomUUID();
  clips.set(id, { userId, audio, expires: now + CLIP_TTL_MS });
  return id;
}

/** How Mira sounds. Steerable models follow this; others ignore it. */
const MIRA_VOICE_STYLE =
  'You are Mira, a warm, calm, confident woman speaking naturally to one person. Conversational pace, gentle and friendly, clear diction, slight smile in the voice. Read security terms and acronyms clearly.';

export async function voiceRoutes(app: FastifyInstance): Promise<void> {
  const cfg = app.config;
  const client = cfg.OPENAI_API_KEY && cfg.MIRA_VOICE_ENABLED ? new OpenAI({ apiKey: cfg.OPENAI_API_KEY, maxRetries: 1, timeout: 30_000 }) : null;

  app.get('/voice/status', { preHandler: app.authenticate }, async () => ({
    natural: Boolean(client) && !cfg.DEMO_MODE,
    voice: client ? cfg.OPENAI_TTS_VOICE : null,
  }));

  async function synthesize(userId: string, text: string): Promise<Buffer> {
    if (!client || cfg.DEMO_MODE) throw new HttpError(404, 'voice_unavailable', 'Natural voice is not configured; using the device voice.');
    const me = { id: userId };
    const input = speakableText(text, 4000);
    if (!input) throw new HttpError(400, 'bad_request', 'Nothing to speak');

    const prefs = await getPreferences(app.db, me.id);
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [spent] = await app.db
      .select({ usd: sql<string>`coalesce(sum(${aiUsage.costUsd}),0)` })
      .from(aiUsage)
      .where(and(eq(aiUsage.userId, me.id), gte(aiUsage.createdAt, monthStart)));
    if (Number(spent?.usd ?? 0) >= prefs.ai.monthlyBudgetUsd) throw new HttpError(402, 'budget', 'Your AI budget for this month is used up.');

    const started = Date.now();
    try {
      const res = await client.audio.speech.create({
        model: cfg.OPENAI_TTS_MODEL,
        voice: cfg.OPENAI_TTS_VOICE,
        input,
        instructions: MIRA_VOICE_STYLE,
        response_format: 'mp3',
      });
      const audio = Buffer.from(await res.arrayBuffer());
      await app.db.insert(aiUsage).values({
        userId: me.id,
        provider: 'openai',
        model: cfg.OPENAI_TTS_MODEL,
        purpose: 'tts',
        tokensIn: input.length,
        tokensOut: 0,
        costUsd: (input.length * cfg.OPENAI_TTS_USD_PER_MCHAR) / 1_000_000,
        outcome: 'ok',
        latencyMs: Date.now() - started,
      });
      return audio;
    } catch (err) {
      await app.db.insert(aiUsage).values({ userId: me.id, provider: 'openai', model: cfg.OPENAI_TTS_MODEL, purpose: 'tts', outcome: 'error', errorClass: 'tts', latencyMs: Date.now() - started });
      if (err instanceof HttpError) throw err;
      throw new HttpError(503, 'voice_failed', 'Mira’s natural voice is unavailable right now; using the device voice.');
    }
  }

  const limit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

  /** MP3 of Mira speaking the text. 404 when no natural voice is configured (clients fall back to the device voice). */
  app.post('/voice/speak', { preHandler: app.authenticate, ...limit }, async (req, reply) => {
    const me = authUser(req);
    const { text } = parse(speakSchema, req.body);
    const audio = await synthesize(me.id, text);
    return reply.header('cache-control', 'no-store').type('audio/mpeg').send(audio);
  });

  /** Same, as a short-lived clip URL for players that stream with GET. */
  app.post('/voice/clips', { preHandler: app.authenticate, ...limit }, async (req, reply) => {
    const me = authUser(req);
    const { text } = parse(speakSchema, req.body);
    const id = putClip(me.id, await synthesize(me.id, text));
    return reply.code(201).send({ url: `/voice/clips/${id}`, expiresInSeconds: CLIP_TTL_MS / 1000 });
  });

  app.get<{ Params: { id: string } }>('/voice/clips/:id', { preHandler: app.authenticate }, async (req, reply) => {
    const me = authUser(req);
    const clip = clips.get(req.params.id);
    if (!clip || clip.userId !== me.id || clip.expires < Date.now()) throw new HttpError(404, 'not_found', 'Clip not found or expired');
    return reply.header('cache-control', 'private, max-age=600').type('audio/mpeg').send(clip.audio);
  });
}
