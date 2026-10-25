'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Download, Monitor, Smartphone } from 'lucide-react';
import { LEARNING_TOPICS, type LearningTopicId } from '@friday/shared';
import type { Preferences } from '@/lib/types';
import { englishVoices, pickMiraVoice, speak } from '@/components/useSpeech';
import { buddyEnabled, setBuddyEnabled } from '@/components/MiraBuddy';
import { api, errorMessage } from '@/lib/api';
import { useAction, useResource } from '@/lib/hooks';
import { relativeTime } from '@/lib/format';
import { Badge, Button, Card, Chip, ErrorNote, Field, IconButton, Loading, PageHeader, inputClass } from '@/components/ui';
import { useSession } from '@/components/AppShell';


const PROVIDER_NAMES = { anthropic: 'Anthropic (Claude)', openai: 'OpenAI', moonshot: 'OpenAI-compatible (Kimi, Groq…)' } as const;

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? <p className="mb-4 mt-1 text-sm text-muted">{description}</p> : <div className="mb-4" />}
      {children}
    </Card>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-[var(--accent)]" />
    </label>
  );
}

function csv(v: string[]) {
  return v.join(', ');
}
function parseCsv(v: string) {
  return v.split(',').map((x) => x.trim()).filter(Boolean);
}

interface SessionRow { id: string; client: 'web' | 'mobile'; userAgent: string | null; lastUsedAt: string; current: boolean }
interface AiStatus { demo: boolean; providers: { id: string; model: string; circuitOpen: boolean }[] }

function MiraVoice({ draft, onChange }: { draft: Preferences; onChange: (v: Preferences['voice']) => void }) {
  const voice = draft.voice;
  const [voices, setVoices] = useState<string[]>([]);
  const [natural, setNatural] = useState<boolean | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  useEffect(() => {
    const load = () => setVoices(englishVoices().map((v) => v.name));
    load();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.addEventListener('voiceschanged', load);
    api.get<{ natural: boolean }>('/voice/status').then((r) => setNatural(r.natural)).catch(() => setNatural(false));
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.removeEventListener('voiceschanged', load);
    };
  }, []);
  const best = pickMiraVoice(voice.webVoice)?.name;
  const [buddy, setBuddy] = useState(true);
  useEffect(() => setBuddy(buddyEnabled()), []);
  const test = async () => {
    const used = await speak('Hi, I’m Mira. Here’s your evening security briefing whenever you’re ready.', { natural: voice.naturalVoice, voiceName: voice.webVoice });
    setTestResult(used === 'natural' ? 'Played with Mira’s natural voice.' : used === 'device' ? `Played with this browser’s voice: ${best ?? 'default'}.` : 'This browser cannot speak.');
  };
  return (
    <Section title="Mira’s voice" description="A warm, natural female voice for spoken replies and briefings.">
      <Toggle label="Read chat replies aloud automatically" checked={voice.speakResponses} onChange={(v) => onChange({ ...voice, speakResponses: v })} />
      <Toggle label="Use Mira’s natural voice (server, uses AI budget)" checked={voice.naturalVoice} onChange={(v) => onChange({ ...voice, naturalVoice: v })} />
      <p className="mb-3 text-xs text-muted">
        {natural === null ? 'Checking…' : natural ? 'Natural voice is available on this server.' : 'Natural voice is not configured on this server (needs an OpenAI key), so Mira uses the best female voice your device has.'}
      </p>
      <Field label="Device voice (fallback)" hint="Leave on Automatic to let Mira pick the most natural female voice available.">
        <select value={voice.webVoice ?? ''} onChange={(e) => onChange({ ...voice, webVoice: e.target.value || null })} className={inputClass}>
          <option value="">Automatic{best ? ` (${best})` : ''}</option>
          {voices.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </Field>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button onClick={() => void test()}>Test Mira’s voice</Button>
        {testResult ? <span role="status" className="text-xs text-muted">{testResult}</span> : null}
      </div>
      <div className="mt-4 border-t border-line pt-3">
        <Toggle label="Mira pop-ups (cheeky reminders around the app, this browser)" checked={buddy} onChange={(v) => { setBuddyEnabled(v); setBuddy(v); }} />
      </div>
    </Section>
  );
}

export default function SettingsPage() {
  const { user, prefs, setPrefs } = useSession();
  const [draft, setDraft] = useState<Preferences | null>(prefs);
  const [saved, setSaved] = useState(false);
  const sessions = useResource<{ sessions: SessionRow[] }>('/auth/sessions');
  const devices = useResource<{ devices: { id: string; platform: string; lastSeenAt: string; disabledAt: string | null }[] }>('/devices');
  const aiStatus = useResource<AiStatus>('/ai/status');
  const zones = useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
    } catch {
      return ['Asia/Kolkata', 'UTC'];
    }
  }, []);

  useEffect(() => setDraft(prefs), [prefs]);

  const save = useAction(async () => {
    if (!draft) return;
    const r = await api.patch<{ preferences: Preferences }>('/preferences', draft);
    setPrefs(r.preferences);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  });

  const [deletePw, setDeletePw] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const del = useAction(async () => {
    await api.post('/account/delete', { password: deletePw, confirm: deleteConfirm });
    window.location.assign('/login');
  });
  const revokeOthers = useAction(async () => {
    await api.post('/auth/sessions/revoke-others');
    sessions.reload();
  });

  if (!draft) return <Loading />;
  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setDraft({ ...draft, [key]: value });
  const order = draft.ai.providerOrder;
  const moveProvider = (i: number, dir: -1 | 1) => {
    const o = [...order];
    const j = i + dir;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j]!, o[i]!];
    set('ai', { ...draft.ai, providerOrder: o });
  };

  const schedules: { key: keyof Preferences['schedule'] & keyof Preferences['scheduleEnabled']; label: string }[] = [
    { key: 'morningBrief', label: 'Morning briefing in chat (plan + concept of the day)' },
    { key: 'eveningNews', label: 'Evening cybersecurity news in chat' },
    { key: 'microlearning', label: 'Microlearning nudge' },
    { key: 'afternoonCheckIn', label: 'Afternoon check-in' },
    { key: 'eveningReview', label: 'Evening review' },
  ];

  return (
    <div className="pb-24">
      <PageHeader title="Settings" subtitle="Everything here is yours to change. Suggested defaults are just a starting point." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Profile">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Name</dt><dd>{user.displayName}</dd>
            <dt className="text-muted">Email</dt><dd className="break-all">{user.email}</dd>
            <dt className="text-muted">Role</dt><dd className="capitalize">{user.role}</dd>
          </dl>
        </Section>

        <Section title="Time & appearance">
          <div className="flex flex-col gap-3">
            <Field label="Timezone" hint="Used for reminders, briefs and “today”.">
              <select value={draft.timezone} onChange={(e) => set('timezone', e.target.value)} className={inputClass}>
                {zones.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </Field>
            <Field label="Theme">
              <select value={draft.theme} onChange={(e) => set('theme', e.target.value as Preferences['theme'])} className={inputClass}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">Match system</option>
              </select>
            </Field>
            <Field label="Reply length">
              <select value={draft.verbosity} onChange={(e) => set('verbosity', e.target.value as Preferences['verbosity'])} className={inputClass}>
                <option value="concise">Concise</option>
                <option value="balanced">Balanced</option>
                <option value="detailed">Detailed</option>
              </select>
            </Field>
          </div>
        </Section>

        <Section title="Daily briefings & schedule" description="Mira posts each day’s briefings into that day’s chat thread. You can also ask any time: “give me my daily summary”.">
          <div className="flex flex-col gap-2">
            {schedules.map(({ key, label }) => (
              <div key={key} className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
                <span className="text-sm">{label}</span>
                <input type="time" aria-label={`${label} time`} value={draft.schedule[key]} onChange={(e) => set('schedule', { ...draft.schedule, [key]: e.target.value })} className={`${inputClass} !w-32`} />
                <input type="checkbox" aria-label={`Enable ${label}`} checked={draft.scheduleEnabled[key]} onChange={(e) => set('scheduleEnabled', { ...draft.scheduleEnabled, [key]: e.target.checked })} className="size-5 accent-[var(--accent)]" />
              </div>
            ))}
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
              <span className="text-sm">News scans</span>
              <input aria-label="News scan times" value={csv(draft.schedule.newsScans)} onChange={(e) => set('schedule', { ...draft.schedule, newsScans: parseCsv(e.target.value) })} className={`${inputClass} !w-32`} placeholder="08:00, 17:00" />
              <input type="checkbox" aria-label="Enable news scans" checked={draft.scheduleEnabled.newsScans} onChange={(e) => set('scheduleEnabled', { ...draft.scheduleEnabled, newsScans: e.target.checked })} className="size-5 accent-[var(--accent)]" />
            </div>
          </div>
          <p className="eyebrow mb-2 mt-4">Brief sections</p>
          <div className="flex flex-wrap gap-2">
            {(['tasks', 'reminders', 'news', 'learning'] as const).map((s) => (
              <Chip key={s} active={draft.briefSections.includes(s)} onClick={() => set('briefSections', draft.briefSections.includes(s) ? draft.briefSections.filter((x) => x !== s) : [...draft.briefSections, s])}>
                <span className="capitalize">{s}</span>
              </Chip>
            ))}
          </div>
        </Section>

        <Section title="Notifications" description="Phone alerts need the iOS app, notification permission, and server push configured by the owner.">
          <Toggle label="Send push notifications to my devices" checked={draft.notifications.push} onChange={(v) => set('notifications', { ...draft.notifications, push: v })} />
          <Field label="Default early warning for reminders">
            <select value={draft.notifications.reminderAdvanceMinutes} onChange={(e) => set('notifications', { ...draft.notifications, reminderAdvanceMinutes: Number(e.target.value) })} className={inputClass}>
              <option value={0}>None</option>
              <option value={5}>5 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={60}>1 hour</option>
            </select>
          </Field>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Quiet hours from"><input type="time" value={draft.notifications.quietHoursStart ?? ''} onChange={(e) => set('notifications', { ...draft.notifications, quietHoursStart: e.target.value || null })} className={inputClass} /></Field>
            <Field label="until"><input type="time" value={draft.notifications.quietHoursEnd ?? ''} onChange={(e) => set('notifications', { ...draft.notifications, quietHoursEnd: e.target.value || null })} className={inputClass} /></Field>
          </div>
          <p className="mt-2 text-xs text-muted">During quiet hours push is skipped; reminders still appear in your inbox.</p>
        </Section>

        <Section title="Learning & news">
          <p className="eyebrow mb-1">Learning topics</p>
          <p className="mb-2 text-xs text-muted">Mira teaches only these topics — in lessons, daily concepts and chat. Pick at least one.</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {LEARNING_TOPICS.map((t) => {
              const on = draft.learningTopics.includes(t.id);
              const next: LearningTopicId[] = on ? draft.learningTopics.filter((x) => x !== t.id) : [...draft.learningTopics, t.id];
              return (
                <Chip key={t.id} active={on} onClick={() => next.length && set('learningTopics', next)}>
                  {t.label}
                </Chip>
              );
            })}
          </div>
          <div className="flex flex-col gap-3">
            <Field label="Keywords to prioritise" hint="Comma separated, e.g. AI, RBI, ransomware"><input value={csv(draft.news.keywords)} onChange={(e) => set('news', { ...draft.news, keywords: parseCsv(e.target.value) })} className={inputClass} /></Field>
            <Field label="Muted keywords" hint="Stories mentioning these are skipped"><input value={csv(draft.news.mutedKeywords)} onChange={(e) => set('news', { ...draft.news, mutedKeywords: parseCsv(e.target.value) })} className={inputClass} /></Field>
          </div>
        </Section>

        <Section title="AI providers & budget" description="Keys live only on the server. Mira tries providers in this order and falls back only for outages or rate limits.">
          {aiStatus.data ? (
            <p className="mb-3 text-sm">
              {aiStatus.data.demo ? <Badge tone="demo">Demo mode — no provider connected</Badge> : `Connected: ${aiStatus.data.providers.map((p) => `${p.id} (${p.model})${p.circuitOpen ? ' — paused after errors' : ''}`).join(', ')}`}
            </p>
          ) : null}
          <ol className="mb-3 flex flex-col gap-1">
            {order.map((p, i) => (
              <li key={p} className="flex items-center gap-2 rounded-xl bg-raised px-3 text-sm">
                <span className="w-5 text-muted">{i + 1}.</span>
                <span className="flex-1">{PROVIDER_NAMES[p]}</span>
                <IconButton label={`Move ${PROVIDER_NAMES[p]} up`} disabled={i === 0} onClick={() => moveProvider(i, -1)}><ArrowUp className="size-4" /></IconButton>
                <IconButton label={`Move ${PROVIDER_NAMES[p]} down`} disabled={i === order.length - 1} onClick={() => moveProvider(i, 1)}><ArrowDown className="size-4" /></IconButton>
              </li>
            ))}
          </ol>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monthly AI budget (USD)">
              <input type="number" min={0} max={1000} step={0.5} value={draft.ai.monthlyBudgetUsd} onChange={(e) => set('ai', { ...draft.ai, monthlyBudgetUsd: Number(e.target.value) })} className={inputClass} />
            </Field>
            {order.map((p) => (
              <Field key={p} label={`${PROVIDER_NAMES[p]} cap`} hint="Blank = no separate cap">
                <input
                  type="number"
                  min={0}
                  max={1000}
                  step={0.5}
                  value={draft.ai.perProviderBudgetUsd[p] ?? ''}
                  onChange={(e) => {
                    const next = { ...draft.ai.perProviderBudgetUsd };
                    if (e.target.value === '') delete next[p];
                    else next[p] = Number(e.target.value);
                    set('ai', { ...draft.ai, perProviderBudgetUsd: next });
                  }}
                  className={inputClass}
                />
              </Field>
            ))}
          </div>
          <Toggle label="Let AI write the brief headline (uses budget)" checked={draft.ai.briefUsesAi} onChange={(v) => set('ai', { ...draft.ai, briefUsesAi: v })} />
        </Section>

        <MiraVoice draft={draft} onChange={(voice) => set('voice', voice)} />
      </div>

      <div className="sticky bottom-20 z-20 mt-4 flex items-center gap-3 rounded-2xl border border-line bg-raised/95 p-3 backdrop-blur lg:bottom-4">
        <Button variant="primary" onClick={() => void save.run()} pending={save.pending}>Save settings</Button>
        {saved ? <span role="status" className="text-sm text-positive">Saved</span> : null}
        {save.error ? <span role="alert" className="text-sm text-accent-text">{save.error}</span> : null}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Section title="Signed-in sessions">
          {sessions.loading && !sessions.data ? <Loading /> : null}
          <ul className="flex flex-col gap-2">
            {sessions.data?.sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-xl bg-raised p-3 text-sm">
                {s.client === 'mobile' ? <Smartphone className="size-4 text-muted" aria-hidden /> : <Monitor className="size-4 text-muted" aria-hidden />}
                <div className="min-w-0 flex-1">
                  <p className="truncate">{s.userAgent ?? s.client}</p>
                  <p className="text-xs text-muted">Active {relativeTime(s.lastUsedAt)}{s.current ? ' · this device' : ''}</p>
                </div>
                {!s.current ? (
                  <Button className="!min-h-9" onClick={async () => { await api.del(`/auth/sessions/${s.id}`).catch((e: unknown) => alert(errorMessage(e))); sessions.reload(); }}>Sign out</Button>
                ) : null}
              </li>
            ))}
          </ul>
          <Button className="mt-3" onClick={() => void revokeOthers.run()} pending={revokeOthers.pending}>Sign out everywhere else</Button>
        </Section>

        <Section title="Devices for push">
          {devices.data?.devices.length ? (
            <ul className="flex flex-col gap-2 text-sm">
              {devices.data.devices.map((d) => (
                <li key={d.id} className="flex items-center gap-3 rounded-xl bg-raised p-3">
                  <span className="flex-1 capitalize">{d.platform} · seen {relativeTime(d.lastSeenAt)}{d.disabledAt ? ' · token expired' : ''}</span>
                  <Button className="!min-h-9" onClick={async () => { await api.del(`/devices/${d.id}`).catch(() => undefined); devices.reload(); }}>Remove</Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No devices registered. Sign in on the iOS app and allow notifications to add one.</p>
          )}
        </Section>

        <Section title="Your data" description="Download everything Mira stores about you as JSON.">
          <a href="/api/account/export" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-raised px-4 text-sm font-semibold" download>
            <Download className="size-4" aria-hidden /> Export my data
          </a>
        </Section>

        <Section title="Delete account" description="Permanently deletes your account and all tasks, reminders, notes, chats and history. This cannot be undone.">
          <div className="flex flex-col gap-3">
            <Field label="Password"><input type="password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} autoComplete="current-password" className={inputClass} /></Field>
            <Field label='Type "DELETE" to confirm'><input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} className={inputClass} /></Field>
            {del.error ? <ErrorNote message={del.error} /> : null}
            <Button variant="danger" disabled={deleteConfirm !== 'DELETE' || !deletePw} pending={del.pending} onClick={() => void del.run()}>Delete my account</Button>
          </div>
        </Section>
      </div>
    </div>
  );
}
