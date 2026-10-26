import { PassThrough } from 'node:stream';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { LIMITS, chatSendSchema, classifyScope, conversationBulkSchema, conversationUpdateSchema, isBriefingRequest, scopeRedirect, type Proposal } from '@friday/shared';
import { conversations, messages } from '../db/schema.js';
import { authUser, type AuthUser } from '../auth/plugin.js';
import { conflict, notFound } from '../util/errors.js';
import { parse } from '../util/validate.js';
import { getPreferences } from '../services/prefs.js';
import { buildContext, proposalsFor, systemPrompt } from '../services/assistant.js';
import { postBriefing } from '../services/briefing.js';
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

      const lastUserText = turns.findLast((t) => t.role === 'user')?.content ?? '';
      const context = await buildContext(app.db, me.id, me.displayName, prefs, proposals, lastUserText);
      // Tell the UI which of the user's records informed this answer.
      const used = [
        ...(context.briefing ? [`From ${context.briefing.label}`] : []),
        ...(context.events?.length ? ['Calendar'] : []),
        ...(context.todayTasks.length ? ['Tasks'] : []),
        ...(context.nextReminders.length ? ['Reminders'] : []),
      ];
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
      write({ type: 'done', provider: result.provider, model: result.model, demo: result.demo, context: used });
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

    if (isBriefingRequest(body.content)) {
      return streamBriefing(reply, me, conversation.id, assistant!.id, userMsg.id);
    }
    // Scope policy, enforced here (not just in the prompt): clearly unrelated requests get a
    // short redirect without spending AI credit. Mixed requests go to the model, which answers the supported part.
    const scope = proposals.length ? { scope: 'in' as const, topic: null } : classifyScope(body.content);
    if (scope.scope === 'out') {
      const text = scopeRedirect(scope.topic!);
      await app.db.update(messages).set({ content: text, status: 'complete', provider: 'mira-scope', model: 'policy' }).where(eq(messages.id, assistant!.id));
      await app.db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversation.id));
      void reply.header('cache-control', 'no-store').type('application/x-ndjson').send(
        [
          { type: 'meta', conversationId: conversation.id, userMessageId: userMsg.id, assistantMessageId: assistant!.id, proposals: [] },
          { type: 'delta', text },
          { type: 'done', provider: 'mira-scope', model: 'policy', demo: false, redirected: true },
        ].map((e) => JSON.stringify(e)).join('\n') + '\n',
      );
      return reply;
    }
    return streamReply(reply, me, conversation.id, assistant!.id, { conversationId: conversation.id, userMessageId: userMsg.id }, proposals, userMsg.id);
  });

  /** On-demand briefing typed in chat: Mira replies with today's briefing in this conversation. */
  async function streamBriefing(reply: FastifyReply, me: AuthUser, conversationId: string, assistantId: string, userMessageId: string) {
    const out = new PassThrough();
    const write = (event: Record<string, unknown>) => {
      if (!out.writableEnded) out.write(`${JSON.stringify(event)}\n`);
    };
    void reply.header('cache-control', 'no-store').header('x-accel-buffering', 'no').type('application/x-ndjson').send(out);
    write({ type: 'meta', conversationId, userMessageId, assistantMessageId: assistantId, proposals: [] });
    try {
      const posted = await postBriefing(app.db, app.ai, me.id, 'ondemand', { conversationId, messageId: assistantId, collectNews: true });
      write({ type: 'delta', text: posted.markdown });
      write({ type: 'done', provider: 'mira-briefing', model: 'briefing', demo: false });
    } catch (err) {
      logUnexpected(app, err);
      await app.db.update(messages).set({ status: 'error', errorCode: 'briefing_failed' }).where(eq(messages.id, assistantId));
      write({ type: 'error', code: 'briefing_failed', message: 'Mira could not prepare the briefing. Please try again.', partial: false });
    } finally {
      out.end();
    }
    return reply;
  }

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

  /** History: newest first, pinned on top; search covers titles and message text. */
  app.get<{ Querystring: { q?: string; archived?: string } }>('/chat/conversations', async (req) => {
    const me = authUser(req);
    const q = (req.query.q ?? '').trim().slice(0, 100);
    const archived = req.query.archived === '1';
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = await app.db
      .select({
        id: conversations.id,
        title: conversations.title,
        updatedAt: conversations.updatedAt,
        kind: conversations.kind,
        localDate: conversations.localDate,
        pinned: conversations.pinned,
        folder: conversations.folder,
        archived: sql<boolean>`${conversations.archivedAt} is not null`,
        preview: sql<string | null>`(select left(regexp_replace(m.content, '[#*_>\`\\[\\]]', '', 'g'), 140) from messages m where m.conversation_id = ${conversations.id} and m.role = 'assistant' and m.status = 'complete' order by m.created_at desc limit 1)`,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.userId, me.id),
          archived ? isNotNull(conversations.archivedAt) : isNull(conversations.archivedAt),
          q
            ? or(
                sql`${conversations.title} ilike ${like}`,
                sql`exists (select 1 from messages m where m.conversation_id = ${conversations.id} and m.content ilike ${like})`,
              )
            : undefined,
        ),
      )
      .orderBy(desc(conversations.pinned), desc(conversations.updatedAt))
      .limit(100);
    return { conversations: rows };
  });

  app.patch<IdParams>('/chat/conversations/:id', async (req) => {
    const me = authUser(req);
    await ownedConversation(me.id, req.params.id);
    const body = parse(conversationUpdateSchema, req.body);
    const { archived, ...rest } = body;
    const [row] = await app.db
      .update(conversations)
      .set({ ...rest, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) })
      .where(eq(conversations.id, req.params.id))
      .returning({ id: conversations.id, title: conversations.title, pinned: conversations.pinned, folder: conversations.folder });
    return { conversation: row };
  });

  /** Multi-select actions. Only the caller's own conversations are touched. */
  app.post('/chat/conversations/bulk', async (req) => {
    const me = authUser(req);
    const { ids, action } = parse(conversationBulkSchema, req.body);
    const mine = and(eq(conversations.userId, me.id), inArray(conversations.id, ids));
    const done =
      action === 'delete'
        ? await app.db.delete(conversations).where(mine).returning({ id: conversations.id })
        : await app.db.update(conversations).set({ archivedAt: action === 'archive' ? new Date() : null }).where(mine).returning({ id: conversations.id });
    return { count: done.length };
  });

  /** Markdown export of one conversation. */
  app.get<IdParams>('/chat/conversations/:id/export', async (req, reply) => {
    const me = authUser(req);
    const c = await ownedConversation(me.id, req.params.id);
    const rows = await app.db
      .select({ role: messages.role, content: messages.content, createdAt: messages.createdAt })
      .from(messages)
      .where(and(eq(messages.conversationId, c.id), eq(messages.userId, me.id), eq(messages.status, 'complete')))
      .orderBy(asc(messages.createdAt))
      .limit(1000);
    const md = [`# ${c.title}`, '', ...rows.flatMap((m) => [`## ${m.role === 'user' ? 'You' : 'Mira'} · ${m.createdAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`, '', m.content, ''])].join('\n');
    return reply.type('text/markdown; charset=utf-8').header('content-disposition', `attachment; filename="mira-chat-${c.id.slice(0, 8)}.md"`).send(md);
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
        kind: messages.kind,
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
