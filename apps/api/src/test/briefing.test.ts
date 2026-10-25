import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestApp, createTestApp, ndjson, registerUser, type TestContext, type TestUser } from './helpers.js';
import { AiError, USER_MESSAGES, type ProviderAdapter, type StreamEvent } from '../ai/types.js';
import { generateLesson, renderNewsSection } from '../services/briefing.js';
import { getPreferences } from '../services/prefs.js';
import { AiGateway } from '../ai/gateway.js';

let ctx: TestContext;
let u: TestUser;

/** Marks feeds fresh so briefings don't try to reach the Internet in tests. */
async function freshFeeds(userId: string) {
  await ctx.handle.pool.query('update news_sources set last_success_at = now() where user_id = $1', [userId]);
}

async function addNews(userId: string, title: string, summary: string, relevance: number, exploitation = 'not-reported', hoursAgo = 2) {
  const { rows } = await ctx.handle.pool.query(
    `insert into news_items (user_id, source_name, url, canonical_url, title_key, title, summary, category, importance, published_at, relevance, exploitation)
     values ($1, 'CISA — ICS Advisories', $2, $2, $3, $3, $4, 'advisory', 'important', now() - make_interval(hours => $5), $6, $7) returning id`,
    [userId, `https://example.test/${encodeURIComponent(title)}`, title, summary, hoursAgo, relevance, exploitation],
  );
  return rows[0].id as string;
}

beforeAll(async () => {
  ctx = await createTestApp();
  u = await registerUser(ctx.app, 'Sandeep');
  await freshFeeds(u.id);
});
afterAll(async () => closeTestApp(ctx));

describe('on-demand briefing', () => {
  it('“Brief me” opens a new chat with a short briefing and only relevant, recent news', async () => {
    await u.call({ method: 'POST', url: '/tasks', payload: { title: 'Finish OT security report', dueAt: new Date(Date.now() + 60_000).toISOString(), priority: 'high' } });
    await addNews(u.id, 'Siemens PLC vulnerability actively exploited', 'CISA reports the flaw is being exploited in the wild.', 90, 'exploited');
    await addNews(u.id, 'Phone maker launches new model', 'Bigger battery and new colours.', 5);
    await addNews(u.id, 'Old Fortinet advisory', 'Patch released for a critical vulnerability.', 80, 'not-reported', 24 * 10);

    const res = await u.call({ method: 'POST', url: '/briefings/now', payload: {} });
    expect(res.statusCode).toBe(201);
    const { conversationId } = res.json();
    const convo = (await u.call({ method: 'GET', url: `/chat/conversations/${conversationId}` })).json();
    expect(convo.conversation.kind).toBe('chat');
    const msg = convo.messages.at(-1);
    expect(msg.kind).toBe('briefing');
    const md: string = msg.content;
    for (const part of ['**✅ To-dos**', 'Finish OT security report', '**⏰ Reminders**', '**🛡️ Cyber news**', '**💡 Concept:', '**Takeaway:**', '](/learn/', '[📰 All cyber news](/news)']) {
      expect(md, part).toContain(part);
    }
    expect(md).toMatch(/- \[Siemens PLC vulnerability actively exploited\]\(https:\/\/example\.test\/[^)]+\) · 🔥 _exploited_/);
    expect(md).not.toContain('Phone maker');
    expect(md).not.toContain('Old Fortinet advisory');
    expect(md).not.toContain('**Architecture view**');
    expect(md.length).toBeLessThan(2500);

    const today = (await u.call({ method: 'GET', url: '/briefings/today' })).json();
    expect(today.conversationId).toBeNull();
    expect(today.sent.map((s: { slot: string }) => s.slot)).toEqual(['ondemand']);
  });

  it('rotates the concept of the day and does not repeat stories already sent today', async () => {
    const res = await u.call({ method: 'POST', url: '/briefings/now', payload: {} });
    const chats = (await u.call({ method: 'GET', url: '/chat/conversations' })).json().conversations.filter((c: { title: string }) => c.title.startsWith('Briefing ·'));
    expect(chats.length).toBe(2);
    const contentOf = async (id: string) => ((await u.call({ method: 'GET', url: `/chat/conversations/${id}` })).json().messages.at(-1).content as string);
    const b = await contentOf(res.json().conversationId);
    const a = await contentOf(chats.find((c: { id: string }) => c.id !== res.json().conversationId).id);
    const concept = (md: string) => /Concept: (.+?)\*\*/.exec(md)?.[1];
    expect(concept(a)).toBeTruthy();
    expect(concept(a)).not.toEqual(concept(b));
    expect(b).not.toContain('Siemens PLC vulnerability actively exploited');
    expect(b).toContain('No new stories from your sources');
  });

  it('answers "give me my daily summary" in chat with the briefing', async () => {
    const res = await u.call({ method: 'POST', url: '/chat/send', payload: { content: 'give me my daily summary', clientMessageId: 'brief-intent-0001' } });
    const events = ndjson(res.body);
    expect(events[0]!.type).toBe('meta');
    expect(events.at(-1)).toMatchObject({ type: 'done', provider: 'mira-briefing' });
    expect(events.find((e) => e.type === 'delta')!.text).toContain('**💡 Concept:');
  });

  it('keeps learning inside the selected topics', async () => {
    await u.call({ method: 'PATCH', url: '/preferences', payload: { learningTopics: ['appsec'] } });
    const list = (await u.call({ method: 'GET', url: '/learn/lessons' })).json();
    expect(new Set(list.lessons.map((l: { topic: string }) => l.topic))).toEqual(new Set(['appsec']));
    expect(list.topics).toEqual(['appsec']);
    const off = await u.call({ method: 'PATCH', url: '/preferences', payload: { learningTopics: ['finance'] } });
    expect(off.statusCode).toBe(400);
    const res = await u.call({ method: 'POST', url: '/briefings/now', payload: { slot: 'morning' } });
    const conv = (await u.call({ method: 'GET', url: `/chat/conversations/${res.json().conversationId}` })).json();
    const md: string = conv.messages.at(-1).content;
    expect(md).toContain('Concept: Injection and input validation');
    expect(md).not.toContain('## A. Top Cybersecurity News');
    await u.call({ method: 'PATCH', url: '/preferences', payload: { learningTopics: ['cybersecurity', 'ot-security'] } });
  });

  it('isolates daily threads between users', async () => {
    const other = await registerUser(ctx.app, 'Other');
    const mine = (await u.call({ method: 'GET', url: '/briefings/today' })).json().conversationId;
    expect((await other.call({ method: 'GET', url: `/chat/conversations/${mine}` })).statusCode).toBe(404);
  });

  it('reports natural voice as unavailable without an OpenAI key', async () => {
    expect((await u.call({ method: 'GET', url: '/voice/status' })).json().natural).toBe(false);
    expect((await u.call({ method: 'POST', url: '/voice/speak', payload: { text: 'Hello' } })).statusCode).toBe(404);
  });

  it('says so when there is no news, instead of inventing any', () => {
    const md = renderNewsSection([], 'Asia/Kolkata', { sources: 5, failing: 1, checkedAt: new Date() });
    expect(md).toContain('No new cybersecurity stories');
    expect(md).toContain('1 source(s) failed');
  });
});

/** An AI provider that answers per request type, to exercise AI-written lessons and briefs. */
function jsonProvider(answer: (system: string) => string): ProviderAdapter {
  return {
    id: 'anthropic',
    model: 'test',
    pricing: { input: 0, output: 0 },
    async *stream(req): AsyncGenerator<StreamEvent> {
      if (req.signal.aborted) throw new AiError('cancelled', USER_MESSAGES.cancelled);
      yield { type: 'text', text: answer(req.system) };
      yield { type: 'done', usage: { input: 1, output: 1 }, model: 'test' };
    },
  };
}

const VALID_LESSON = {
  title: 'Allowlisting industrial protocols',
  summary: 'Only permit the industrial protocols and function codes each zone needs.',
  explanation: 'Protocol allowlisting restricts which industrial protocols, commands and function codes may cross a firewall, so a compromised host cannot send write commands to controllers it should only read from.',
  steps: ['List required protocols per zone.', 'Allow read function codes only where writes are not needed.', 'Block and alert on everything else.'],
  diagram: 'HMI --read--> [DPI firewall] --> PLC\nEWS --write--> [DPI firewall] --> PLC (approved window only)',
  example: 'A deep-packet-inspection firewall blocks Modbus write commands from the historian, which only ever needs to read values from the PLC.',
  takeaway: 'Allow the commands a system needs, not just the port it uses.',
  insight: { title: 'Separate read and write paths', body: 'Most OT systems only need to read from controllers; writes should be rare and controlled.', bullets: ['Restrict writes to engineering workstations.', 'Alert on write commands outside maintenance windows.', 'Review firewall rules with operations.'] },
  question: 'Your firewall logs a Modbus write to a PLC from the historian server. What would you check and preserve before blocking it?',
  quiz: [{ q: 'Which host usually needs write access to PLCs?', options: ['Historian', 'Engineering workstation', 'Email server', 'Printer'], answer: 1, why: 'Engineering changes come from the EWS.' }],
};

describe('AI-written content stays grounded and on-topic', () => {
  it('stores a generated lesson only for the requested topic and with a curated link', async () => {
    const ai = new AiGateway({ db: ctx.handle.db, adapters: [jsonProvider(() => JSON.stringify(VALID_LESSON))], demoMode: false, maxAttempts: 1, globalMonthlyBudgetUsd: 100 });
    const prefs = await getPreferences(ctx.handle.db, u.id);
    const l = await generateLesson(ctx.handle.db, ai, u.id, prefs, 'ot-security', []);
    expect(l?.topic).toBe('ot-security');
    expect(l?.ownerUserId).toBe(u.id);
    expect(l?.learnMore?.url).toBe('https://csrc.nist.gov/pubs/sp/800/82/r3/final');
  });

  it('rejects off-topic or malformed AI lessons', async () => {
    const offTopic = {
      ...VALID_LESSON,
      title: 'Baking sourdough bread',
      explanation: 'Sourdough uses a starter culture of wild yeast and bacteria to leaven the dough over many hours of fermentation.',
      steps: ['Feed the starter.', 'Mix flour and water.', 'Bake hot.'],
      example: 'A baker in Pune feeds her starter every morning and bakes two loaves each weekend for her family.',
      insight: { title: 'Keep the starter warm', body: 'A warm kitchen speeds up fermentation and improves the rise.', bullets: ['Use a jar with a loose lid.', 'Feed it daily.', 'Discard half before feeding.'] },
      question: 'Your loaf came out flat and dense after a cold night. What would you change before the next bake?',
    };
    for (const reply of [JSON.stringify(offTopic), 'not json', JSON.stringify({ title: 'x' })]) {
      const ai = new AiGateway({ db: ctx.handle.db, adapters: [jsonProvider(() => reply)], demoMode: false, maxAttempts: 1, globalMonthlyBudgetUsd: 100 });
      const prefs = await getPreferences(ctx.handle.db, u.id);
      expect(await generateLesson(ctx.handle.db, ai, u.id, prefs, 'ot-security', [])).toBeNull();
    }
  });

  it('uses AI news briefs only for the stories it was given', async () => {
    const c2 = await createTestApp({
      env: { DEMO_MODE: 'false' },
      adapters: [
        jsonProvider((system) =>
          system.includes('summarise cybersecurity news')
            ? JSON.stringify([
                { id: 'not-a-real-id', brief: 'Invented story that must be ignored.', affected: null, action: 'Ignore this one please.' },
                { id: '__ID__', brief: 'A PLC flaw lets attackers change logic remotely.', affected: 'Model X firmware before 2.1', action: 'Restrict access to the PLC and plan the firmware update.' },
              ])
            : JSON.stringify(VALID_LESSON),
        ),
      ],
    });
    const v = await registerUser(c2.app, 'Grounded');
    await c2.handle.pool.query('update news_sources set last_success_at = now() where user_id = $1', [v.id]);
    const { rows } = await c2.handle.pool.query(
      `insert into news_items (user_id, source_name, url, canonical_url, title_key, title, summary, category, importance, published_at, relevance)
       values ($1, 'CISA', 'https://example.test/plc', 'https://example.test/plc', 'plc flaw', 'PLC firmware vulnerability', 'Vulnerability in Model X firmware before 2.1.', 'advisory', 'important', now(), 90) returning id`,
      [v.id],
    );
    // Make the fake provider answer with the real id.
    const realId = rows[0].id as string;
    (c2.app.ai as unknown as { opts: { adapters: ProviderAdapter[] } }).opts.adapters[0]!.stream = jsonProvider((system) =>
      system.includes('summarise cybersecurity news')
        ? JSON.stringify([
            { id: 'not-a-real-id', brief: 'Invented story that must be ignored.', affected: null, action: 'Ignore this one please.' },
            { id: realId, brief: 'A PLC flaw lets attackers change logic remotely.', affected: 'Model X firmware before 2.1', action: 'Restrict access to the PLC and plan the firmware update.' },
          ])
        : JSON.stringify(VALID_LESSON),
    ).stream;
    const res = await v.call({ method: 'POST', url: '/briefings/now', payload: { slot: 'evening' } });
    const conv = (await v.call({ method: 'GET', url: `/chat/conversations/${res.json().conversationId}` })).json();
    const md: string = conv.messages.at(-1).content;
    expect(md).toContain('A PLC flaw lets attackers change logic remotely.');
    expect(md).toContain('**Affected:** Model X firmware before 2.1');
    expect(md).not.toContain('Invented story');
    expect(md).toContain('## Tomorrow');
    await closeTestApp(c2);
  });
});
