import { PassThrough } from 'node:stream';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { and, asc, desc, eq, lt } from 'drizzle-orm';
import { LIMITS, chatSendSchema, type Proposal } from '@friday/shared';
import { conversations, messages } from '../db/schema.js';
import { authUser, type AuthUser } from '../auth/plugin.js';
import { conflict, notFound } from '../util/errors.js';
import { parse } from '../util/validate.js';
import { getPreferences } from '../services/prefs.js';
import { buildContext, proposalsFor, systemPrompt } from '../services/assistant.js';
import { AiError, USER_MESSAGES } from '../ai/index.js';
import type { GatewayProviderId } from '../ai/types.js';

type IdParams = { Params: { id: string } };

/** In-flight generations on this instance, so an explicit cancel can abort them. */
const active = new Map<string, AbortController>();

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);
  const chatLimit = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

  async function ownedConversation(userId: string, id: string) {
    const rows = await app.db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, userId))).limit(1);
    if (!rows[0]) throw notFound('Conversation');
    return rows[0];
  }

  /**
   * Streams one assistant reply as NDJSON events (meta, delta…, done | error) and
   * persists the final state whether it completes, fails, or is cancelled.
   */
  async function streamReply(
    reply: FastifyReply,
    me: AuthUser,
    conversationId: string,
    assistantId: string,
    meta: Record<string, unknown>,
    proposals: Proposal[],
    userMessageId: string,
  ) {
    const out = new PassThrough();
    const write = (event: Record<string, unknown>) => {
      if (!out.writableEnded) out.write(`${JSON.stringify(event)}\n`);
    };
    const controller = new AbortController();
    active.set(assistantId, controller);
    reply.raw.on('close', () => {
      if (!reply.raw.writableFinished) controller.abort();
    });

    void reply
      .header('cache-control', 'no-store')
      .header('x-accel-buffering', 'no')
      .type('application/x-ndjson')
      .send(out);
    write({ type: 'meta', ...meta, assistantMessageId: assistantId, proposals });

    let text = '';
    try {
      const prefs = await getPreferences(app.db, me.id);
      // Bounded history: the most recent complete turns, oldest first.
      const history = (
        await app.db
          .select({ id: messages.id, role: messages.role, content: messages.content, status: messages.status })
          .from(messages)
          .where(and(eq(messages.conversationId, conversationId), eq(messages.userId, me.id)))
          .orderBy(desc(messages.createdAt))
          .limit(LIMITS.chatHistoryMessages + 2)
      )
        .reverse()
        .filter((m) => m.id !== assistantId && (m.role === 'user' || m.status === 'complete'))
        .slice(-LIMITS.chatHistoryMessages);
      const lastUser = history.findLastIndex((m) => m.id === userMessageId);
      const turns = (lastUser >= 0 ? history.slice(0, lastUser + 1) : history).map((m) => ({ role: m.role, content: m.content }));
      while (turns.length && turns[0]!.role !== 'user') turns.shift();

      const context = await buildContext(app.db, me.id, me.displayName, prefs, proposals);
      const result = await app.ai.generate({
        userId: me.id,
        purpose: 'chat',
        system: systemPrompt(context, prefs),
        messages: turns,
        maxTokens: LIMITS.maxOutputTokens,
        signal: controller.signal,
        providerOrder: prefs.ai.providerOrder as GatewayProviderId[],
        userMonthlyBudgetUsd: prefs.ai.monthlyBudgetUsd,
        perProviderBudgetUsd: prefs.ai.perProviderBudgetUsd,
        context,
        onText: (t) => {
          text += t;
          write({ type: 'delta', text: t });
        },
      });
      await app.db
        .update(messages)
        .set({ content: result.text, status: 'complete', provider: result.provider, model: result.model, errorCode: null })
        .where(eq(messages.id, assistantId));
      write({ type: 'done', provider: result.provider, model: result.model, demo: result.demo });
    } catch (raw) {
      const err = raw instanceof AiError ? raw : new AiError('unavailable', USER_MESSAGES.unavailable);
      if (!(raw instanceof AiError)) logUnexpected(app, raw);
      const cancelled = err.kind === 'cancelled';
      await app.db
        .update(messages)
        .set({ content: text, status: cancelled ? 'cancelled' : 'error', errorCode: err.kind, provider: err.provider ?? null })
        .where(eq(messages.id, assistantId));
      write({ type: 'error', code: err.kind, message: err.message, partial: text.length > 0 });
    } finally {
      active.delete(assistantId);
      await app.db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
      out.end();
    }
    return reply;
  }

  app.post('/chat/send', chatLimit, async (req, reply) => {
    const me = authUser(req);
    const body = parse(chatSendSchema, req.body);
    const prefs = await getPreferences(app.db, me.id);

    const existing = await app.db
      .select({ id: messages.id, conversationId: messages.conversationId })
      .from(messages)
      .where(and(eq(messages.userId, me.id), eq(messages.clientMessageId, body.clientMessageId)))
      .limit(1);
    if (existing[0]) throw conflict('This message was already sent');

    const conversation = body.conversationId
      ? await ownedConversation(me.id, body.conversationId)
      : (await app.db.insert(conversations).values({ userId: me.id, title: body.content.slice(0, 60) }).returning())[0]!;

    const proposals = proposalsFor(body.content, prefs.timezone);
    const [userMsg] = await app.db
      .insert(messages)
      .values({
        conversationId: conversation.id,
        userId: me.id,
        role: 'user',
        content: body.content,
        clientMessageId: body.clientMessageId,
        viaVoice: body.viaVoice,
      })
      .onConflictDoNothing()
      .returning({ id: messages.id });
    if (!userMsg) throw conflict('This message was already sent');
    const [assistant] = await app.db
      .insert(messages)
      .values({ conversationId: conversation.id, userId: me.id, role: 'assistant', content: '', status: 'streaming', proposals })
      .returning({ id: messages.id });

    return streamReply(reply, me, conversation.id, assistant!.id, { conversationId: conversation.id, userMessageId: userMsg.id }, proposals, userMsg.id);
  });

  /** Regenerates a failed/cancelled (or any) assistant reply in place. */
  app.post<IdParams>('/chat/messages/:id/retry', chatLimit, async (req, reply) => {
    const me = authUser(req);
    const rows = await app.db.select().from(messages).where(and(eq(messages.id, req.params.id), eq(messages.userId, me.id))).limit(1);
    const msg = rows[0];
    if (!msg || msg.role !== 'assistant') throw notFound('Message');
    if (msg.status === 'streaming' && active.has(msg.id)) throw conflict('This reply is still being generated');
    const prev = await app.db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.conversationId, msg.conversationId), eq(messages.role, 'user'), lt(messages.createdAt, msg.createdAt)))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    if (!prev[0]) throw notFound('Message');
    await app.db.update(messages).set({ content: '', status: 'streaming', errorCode: null }).where(eq(messages.id, msg.id));
    return streamReply(reply, me, msg.conversationId, msg.id, { conversationId: msg.conversationId, userMessageId: prev[0].id }, msg.proposals ?? [], prev[0].id);
  });

  app.post<IdParams>('/chat/messages/:id/cancel', async (req) => {
    const me = authUser(req);
    const rows = await app.db.select({ id: messages.id }).from(messages).where(and(eq(messages.id, req.params.id), eq(messages.userId, me.id))).limit(1);
    if (!rows[0]) throw notFound('Message');
    const c = active.get(rows[0].id);
    c?.abort();
    return { cancelled: Boolean(c) };
  });

  app.get('/chat/conversations', async (req) => {
    const me = authUser(req);
    const rows = await app.db
      .select({ id: conversations.id, title: conversations.title, updatedAt: conversations.updatedAt })
      .from(conversations)
      .where(eq(conversations.userId, me.id))
      .orderBy(desc(conversations.updatedAt))
      .limit(50);
    return { conversations: rows };
  });

  app.get<IdParams>('/chat/conversations/:id', async (req) => {
    const me = authUser(req);
    const conversation = await ownedConversation(me.id, req.params.id);
    const rows = await app.db
      .select({
        id: messages.id,
        role: messages.role,
        content: messages.content,
        status: messages.status,
        provider: messages.provider,
        model: messages.model,
        proposals: messages.proposals,
        errorCode: messages.errorCode,
        viaVoice: messages.viaVoice,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(and(eq(messages.conversationId, conversation.id), eq(messages.userId, me.id)))
      .orderBy(asc(messages.createdAt))
      .limit(200);
    // A reply left "streaming" by a crashed instance is shown as an error that can be retried.
    const messagesOut = rows.map((m) => (m.status === 'streaming' && !active.has(m.id) ? { ...m, status: 'error' as const, errorCode: 'interrupted' } : m));
    return { conversation, messages: messagesOut };
  });

  app.delete<IdParams>('/chat/conversations/:id', async (req) => {
    const me = authUser(req);
    const deleted = await app.db
      .delete(conversations)
      .where(and(eq(conversations.id, req.params.id), eq(conversations.userId, me.id)))
      .returning({ id: conversations.id });
    if (!deleted.length) throw notFound('Conversation');
    return { ok: true };
  });

  app.get('/ai/status', async () => app.ai.describe());
}

function logUnexpected(app: FastifyInstance, err: unknown) {
  app.log.error({ err: err instanceof Error ? { name: err.name, message: err.message } : 'unknown' }, 'chat generation failed');
}
