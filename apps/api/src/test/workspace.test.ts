import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { closeTestApp, createTestApp, ndjson, registerUser, type TestContext, type TestUser } from './helpers.js';

let ctx: TestContext;
let u: TestUser;
let other: TestUser;

const send = async (user: TestUser, content: string, conversationId?: string) =>
  ndjson((await user.call({ method: 'POST', url: '/chat/send', payload: { content, clientMessageId: `t-${Math.random().toString(36).slice(2, 12)}`, ...(conversationId ? { conversationId } : {}) } })).body);

beforeAll(async () => {
  ctx = await createTestApp();
  u = await registerUser(ctx.app, 'Kavya');
  other = await registerUser(ctx.app, 'Other');
  await ctx.handle.pool.query('update news_sources set last_success_at = now() where user_id = $1', [u.id]);
  await ctx.handle.pool.query(
    `insert into news_items (user_id, source_name, url, canonical_url, title_key, title, summary, category, importance, published_at, relevance, exploitation)
     values ($1, 'CISA', 'https://example.test/plc', 'https://example.test/plc', 'plc', 'Siemens PLC flaw exploited in the wild', 'CISA added it to KEV.', 'advisory', 'important', now() - interval '2 hours', 90, 'exploited')`,
    [u.id],
  );
});
afterAll(async () => closeTestApp(ctx));

describe('calendar: one record per thing, shared across views', () => {
  it('an event proposed in chat and confirmed shows in the calendar, with one linked reminder', async () => {
    const events = await send(u, 'Meeting with Raj tomorrow at 3pm for 30 minutes');
    const proposal = (events[0] as unknown as { proposals: { kind: string; startAt: string; endAt: string; title: string }[] }).proposals[0]!;
    expect(proposal.kind).toBe('event');
    expect(proposal.title).toMatch(/Raj/);
    expect(new Date(proposal.endAt).getTime() - new Date(proposal.startAt).getTime()).toBe(30 * 60_000);

    const created = await u.call({ method: 'POST', url: '/events', payload: { title: proposal.title, startAt: proposal.startAt, endAt: proposal.endAt, reminderMinutes: 10 } });
    expect(created.statusCode).toBe(201);
    const from = DateTime.now().startOf('day').toISO()!;
    const to = DateTime.now().plus({ days: 3 }).toISO()!;
    const cal = (await u.call({ method: 'GET', url: `/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` })).json();
    expect(cal.events.map((e: { title: string }) => e.title)).toContain(proposal.title);
    // The linked reminder is in the reminders list, and not shown twice on the calendar.
    const rems = (await u.call({ method: 'GET', url: '/reminders' })).json();
    expect(rems.reminders.filter((r: { title: string }) => r.title === proposal.title)).toHaveLength(1);
    expect(cal.reminders.filter((r: { title: string }) => r.title === proposal.title)).toHaveLength(0);

    // Overlap is reported, not blocked.
    const clash = await u.call({ method: 'POST', url: '/events', payload: { title: 'Dentist', startAt: proposal.startAt, endAt: proposal.endAt } });
    expect(clash.json().conflicts.map((c: { title: string }) => c.title)).toContain(proposal.title);

    // Deleting the event removes its reminder too.
    await u.call({ method: 'DELETE', url: `/events/${created.json().event.id}` });
    const after = (await u.call({ method: 'GET', url: '/reminders' })).json();
    expect(after.reminders.filter((r: { title: string }) => r.title === proposal.title)).toHaveLength(0);
  });

  it('expands recurring events and keeps other users out', async () => {
    const start = DateTime.now().plus({ days: 1 }).set({ hour: 9, minute: 0 });
    const res = await u.call({ method: 'POST', url: '/events', payload: { title: 'Standup', startAt: start.toISO(), endAt: start.plus({ minutes: 15 }).toISO(), recurrence: { freq: 'daily' } } });
    const id = res.json().event.id;
    const cal = (await u.call({ method: 'GET', url: `/calendar?from=${encodeURIComponent(start.startOf('day').toISO()!)}&to=${encodeURIComponent(start.plus({ days: 5 }).toISO()!)}` })).json();
    expect(cal.events.filter((e: { title: string }) => e.title === 'Standup').length).toBe(5);
    expect((await other.call({ method: 'GET', url: `/events/${id}` })).statusCode).toBe(404);
    expect((await other.call({ method: 'DELETE', url: `/events/${id}` })).statusCode).toBe(404);
  });

  it('a task completed in one place is completed everywhere', async () => {
    const due = DateTime.now().plus({ hours: 2 }).toISO();
    const t = (await u.call({ method: 'POST', url: '/tasks', payload: { title: 'Rotate VPN keys', dueAt: due } })).json().task;
    await u.call({ method: 'PATCH', url: `/tasks/${t.id}`, payload: { status: 'done' } });
    const cal = (await u.call({ method: 'GET', url: `/calendar?from=${encodeURIComponent(DateTime.now().startOf('day').toISO()!)}&to=${encodeURIComponent(DateTime.now().plus({ days: 1 }).toISO()!)}` })).json();
    expect(cal.tasks.find((x: { id: string }) => x.id === t.id).status).toBe('done');
    const home = (await u.call({ method: 'GET', url: '/home' })).json();
    expect(home.tasks.map((x: { id: string }) => x.id)).not.toContain(t.id);
  });
});

describe('briefing-aware chat', () => {
  it('answers about today’s briefing from the stored snapshot', async () => {
    await u.call({ method: 'POST', url: '/briefings/now', payload: {} });
    const events = await send(u, 'What was the main story in today’s briefing?');
    const text = events.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text).join('');
    expect(text).toContain('Siemens PLC flaw exploited in the wild');
    expect((events.at(-1) as unknown as { context: string[] }).context.join(' ')).toMatch(/today's briefing/);
  });

  it('retrieves yesterday’s dated snapshot, and says so when one is missing', async () => {
    const tz = (await u.call({ method: 'GET', url: '/preferences' })).json().preferences.timezone;
    const y = DateTime.now().setZone(tz).minus({ days: 1 }).toISODate();
    await ctx.handle.pool.query(
      `insert into briefings (user_id, local_date, slot, generated_by, snapshot) values ($1, $2, 'evening', 'deterministic', $3)`,
      [u.id, y, JSON.stringify({ stories: [{ id: 'x', title: 'Fortinet SSL-VPN patch released', source: 'SecurityWeek', url: 'https://example.test/f', exploitation: 'not-reported', summary: '' }], tasks: [], reminders: [], events: [], concept: null, word: null })],
    );
    const text = (await send(u, 'What was in yesterday’s briefing?')).filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text).join('');
    expect(text).toContain('Fortinet SSL-VPN patch released');
    const none = (await send(other, 'What was the main story in yesterday’s briefing?')).filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text).join('');
    expect(none).toContain('no news stories');
    expect(none).not.toContain('Fortinet');
  });
});

describe('scope policy (server-side)', () => {
  it('redirects clearly unrelated requests without calling the AI', async () => {
    const events = await send(u, 'Give me a recipe for butter chicken');
    expect(events.at(-1)).toMatchObject({ type: 'done', provider: 'mira-scope', redirected: true });
    const usage = await ctx.handle.pool.query("select count(*)::int as n from ai_usage where user_id = $1 and purpose = 'chat'", [u.id]);
    const before = usage.rows[0].n;
    await send(u, 'Write me a poem about the sea');
    const after = (await ctx.handle.pool.query("select count(*)::int as n from ai_usage where user_id = $1 and purpose = 'chat'", [u.id])).rows[0].n;
    expect(after).toBe(before);
  });

  it('answers mixed requests instead of rejecting them', async () => {
    const events = await send(u, 'Give me a recipe for pasta and also what tasks do I have today?');
    expect((events.at(-1) as { provider: string }).provider).not.toBe('mira-scope');
  });

  it('does not block in-topic questions', async () => {
    const events = await send(u, 'Explain how ransomware spreads through SMB');
    expect((events.at(-1) as { provider: string }).provider).not.toBe('mira-scope');
  });
});

describe('chat history', () => {
  it('searches message text, pins, archives and bulk-deletes only your own conversations', async () => {
    const found = (await u.call({ method: 'GET', url: '/chat/conversations?q=butter%20chicken' })).json().conversations;
    expect(found.length).toBe(1);
    const id = found[0].id;
    await u.call({ method: 'PATCH', url: `/chat/conversations/${id}`, payload: { pinned: true, title: 'Food question' } });
    const list = (await u.call({ method: 'GET', url: '/chat/conversations' })).json().conversations;
    expect(list[0]).toMatchObject({ id, pinned: true, title: 'Food question' });

    await u.call({ method: 'POST', url: '/chat/conversations/bulk', payload: { ids: [id], action: 'archive' } });
    expect((await u.call({ method: 'GET', url: '/chat/conversations' })).json().conversations.map((c: { id: string }) => c.id)).not.toContain(id);
    expect((await u.call({ method: 'GET', url: '/chat/conversations?archived=1' })).json().conversations.map((c: { id: string }) => c.id)).toContain(id);

    const exported = await u.call({ method: 'GET', url: `/chat/conversations/${id}/export` });
    expect(exported.headers['content-type']).toMatch(/markdown/);
    expect(exported.body).toContain('# Food question');

    const theirs = await other.call({ method: 'POST', url: '/chat/conversations/bulk', payload: { ids: [id], action: 'delete' } });
    expect(theirs.json().count).toBe(0);
    expect((await u.call({ method: 'POST', url: '/chat/conversations/bulk', payload: { ids: [id], action: 'delete' } })).json().count).toBe(1);
  });
});

describe('word of the day and layouts', () => {
  it('saves, quizzes and counts a learning streak', async () => {
    const today = (await u.call({ method: 'GET', url: '/words/today' })).json();
    expect(today.word.definition).toBeTruthy();
    expect(today.quiz.options).toHaveLength(3);
    expect(today.quiz).not.toHaveProperty('answer');
    await u.call({ method: 'POST', url: `/words/${today.word.word}/status`, payload: { status: 'saved' } });
    const q = (await u.call({ method: 'POST', url: `/words/${today.word.word}/quiz`, payload: { choice: 0 } })).json();
    expect(typeof q.answer).toBe('number');
    const home = (await u.call({ method: 'GET', url: '/home' })).json();
    expect(home.word.status).toBe('saved');
    expect(home.streak).toEqual({ days: 1, today: true });
  });

  it('persists the chosen layout, auto mode, density and sidebar', async () => {
    const prefs = (await u.call({ method: 'GET', url: '/preferences' })).json().preferences;
    const res = await u.call({ method: 'PATCH', url: '/preferences', payload: { dashboard: { ...prefs.dashboard, style: 'timeline', layoutMode: 'auto', density: 'compact', sidebar: 'hidden' } } });
    expect(res.statusCode).toBe(200);
    const again = (await u.call({ method: 'GET', url: '/preferences' })).json().preferences.dashboard;
    expect(again).toMatchObject({ style: 'timeline', layoutMode: 'auto', density: 'compact', sidebar: 'hidden' });
  });
});

describe('calendar edge cases', () => {
  it('saves a past event and reports that its reminder was skipped', async () => {
    const start = DateTime.now().minus({ hours: 3 });
    const res = await u.call({ method: 'POST', url: '/events', payload: { title: 'Earlier call', startAt: start.toISO(), endAt: start.plus({ hours: 1 }).toISO(), reminderMinutes: 15 } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ reminderSkipped: true, event: { reminderId: null } });
  });
});
