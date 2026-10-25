'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { MiraFace } from './Art';

/**
 * Mira pops up at random spots with cheeky one-liners. Purely client-side: one cheap /home call
 * every 10 minutes for to-do counts, no AI. Muting is remembered per browser.
 */
export const BUDDY_KEY = 'mira.buddy';

export function buddyEnabled(): boolean {
  try {
    return localStorage.getItem(BUDDY_KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setBuddyEnabled(on: boolean) {
  try {
    localStorage.setItem(BUDDY_KEY, on ? 'on' : 'off');
  } catch {
    /* storage blocked: stays on for this visit */
  }
  window.dispatchEvent(new Event('mira-buddy'));
}

type Mood = 'happy' | 'curious' | 'sly';
interface Pop { id: number; text: string; mood: Mood; spot: number; cta?: { href: string; label: string } }

// Spots avoid the top bar and the phone tab bar / chat composer.
const SPOTS = [
  'right-4 bottom-24 lg:bottom-6',
  'left-4 bottom-24 lg:left-64 lg:bottom-6',
  'right-4 top-20',
  'right-4 top-1/2 -translate-y-1/2',
  'left-4 top-1/3 lg:left-64',
];
const CHAT_SPOTS = [2, 3];

const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;

const IDLE = ['Are you still there? 👀', 'Hellooo? Did you fall asleep on the keyboard?', 'I can wait. I’m very patient. Mostly.'];
const READING = ['Oh, you’re reading? 🤓', 'Oh damn, you do read? 📚', 'Look at you, learning things. Proud of you.'];
const RANDOM = [
  'Hydrate. Then patch something. 💧',
  'Fun fact: most breaches start with a password reused somewhere. Just saying.',
  'I’m not saying you should take a break… but stretch, maybe? 🙆',
  'Psst. MFA on everything. Everything.',
  'Need a summary? Hit “Brief me” and I’ll keep it short.',
  'You look like someone who closes their tabs. Respect.',
];
const PAGE: Record<string, string[]> = {
  '/news': ['Anything actively exploited today? I’ve flagged those 🔥', 'Doomscrolling security news is still doomscrolling 😅'],
  '/learn': ['One lesson a day keeps the attackers away. Probably.', 'Ooh, studying! Want me to quiz you in chat?'],
  '/tasks': ['Pick one. Just one. Finish it. Go. 🏁'],
  '/notes': ['Writing it down = remembering it. Science-ish.'],
  '/settings': ['Fiddling with settings is my favourite kind of procrastination too.'],
};

function lateNight() {
  const h = new Date().getHours();
  return h >= 0 && h < 5;
}

export function MiraBuddy({ name }: { name: string }) {
  const pathname = usePathname();
  const [on, setOn] = useState(true);
  const [pop, setPop] = useState<Pop | null>(null);
  const [leaving, setLeaving] = useState(false);
  const counts = useRef<{ openTasks: number; tasksToday: number } | null>(null);
  const lastActive = useRef(Date.now());
  const scrolled = useRef(0);
  const nextId = useRef(1);
  const path = useRef(pathname);
  path.current = pathname;

  useEffect(() => {
    const sync = () => setOn(buddyEnabled());
    sync();
    window.addEventListener('mira-buddy', sync);
    return () => window.removeEventListener('mira-buddy', sync);
  }, []);

  const show = useCallback((p: Omit<Pop, 'id' | 'spot'>) => {
    const spots = path.current === '/chat' ? CHAT_SPOTS : SPOTS.map((_, i) => i);
    setLeaving(false);
    setPop({ ...p, id: nextId.current++, spot: pick(spots) });
  }, []);

  const dismiss = useCallback(() => {
    setLeaving(true);
    setTimeout(() => setPop(null), 250);
  }, []);

  // Auto-hide after a few seconds.
  useEffect(() => {
    if (!pop) return;
    const t = setTimeout(dismiss, 7000);
    return () => clearTimeout(t);
  }, [pop, dismiss]);

  // To-do counts (cheap, cached for 10 minutes).
  useEffect(() => {
    if (!on) return;
    let alive = true;
    const load = () =>
      api.get<{ counts: { openTasks?: number; tasksToday: number } }>('/home').then((h) => {
        if (alive) counts.current = { openTasks: h.counts.openTasks ?? h.counts.tasksToday, tasksToday: h.counts.tasksToday };
      }).catch(() => undefined);
    void load();
    const t = setInterval(load, 600_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [on]);

  // Activity tracking for "still there?" and "you're reading?".
  useEffect(() => {
    const active = () => (lastActive.current = Date.now());
    const scroll = () => {
      active();
      scrolled.current += 1;
    };
    window.addEventListener('pointerdown', active);
    window.addEventListener('keydown', active);
    window.addEventListener('scroll', scroll, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', active);
      window.removeEventListener('keydown', active);
      window.removeEventListener('scroll', scroll);
    };
  }, []);

  // Hello on open.
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => {
      if (lateNight()) show({ text: `It’s late, ${name}. Are we hacking or procrastinating? 🌙`, mood: 'sly' });
      else show({ text: pick([`Hey ${name}! 👋 Missed me?`, `Oh hi ${name}! Ready to be productive-ish?`, `${name}! You’re back ✨`]), mood: 'happy', cta: { href: '/chat?brief=1', label: 'Brief me' } });
    }, 2500);
    return () => clearTimeout(t);
  }, [on, name, show]);

  // The random heartbeat: every ~20s decide whether Mira has something to say.
  useEffect(() => {
    if (!on) return;
    let lastPop = Date.now();
    const t = setInterval(() => {
      if (document.hidden) return;
      const now = Date.now();
      const sincePop = now - lastPop;
      const idle = now - lastActive.current;
      const p = path.current;
      const c = counts.current;
      let next: Omit<Pop, 'id' | 'spot'> | null = null;
      if (idle > 75_000 && sincePop > 60_000) next = { text: pick(IDLE), mood: 'curious' };
      else if (scrolled.current > 25 && (p.startsWith('/learn') || p.startsWith('/news')) && sincePop > 45_000) next = { text: pick(READING), mood: 'sly' };
      else if (sincePop > 60_000 + Math.random() * 90_000) {
        if (c && c.openTasks >= 5 && Math.random() < 0.5) next = { text: `Hey… are you even working on your to-dos? ${c.openTasks} still open 😤`, mood: 'sly', cta: { href: '/tasks', label: 'Show me' } };
        else if (c && c.openTasks === 0 && Math.random() < 0.3) next = { text: 'Zero to-dos? Either you’re a legend or you forgot to add them.', mood: 'curious' };
        else {
          const page = Object.entries(PAGE).find(([k]) => p.startsWith(k))?.[1];
          next = { text: pick(page && Math.random() < 0.6 ? page : RANDOM), mood: pick(['happy', 'curious', 'sly'] as const) };
        }
      }
      if (next) {
        scrolled.current = 0;
        lastPop = now;
        show(next);
      }
    }, 20_000);
    return () => clearInterval(t);
  }, [on, show]);

  if (!on || !pop) return null;
  return (
    <div
      key={pop.id}
      role="status"
      aria-live="polite"
      className={`fixed z-40 flex max-w-[min(20rem,calc(100vw-2rem))] items-end gap-2 ${SPOTS[pop.spot]} ${leaving ? 'mira-out' : 'mira-pop'}`}
    >
      <Link href="/chat" aria-label="Talk to Mira" className="shrink-0 drop-shadow-lg">
        <MiraFace size={52} mood={pop.mood} />
      </Link>
      <div className="relative rounded-2xl rounded-bl-sm border border-line bg-raised px-3 py-2 text-sm shadow-xl">
        <p className="pr-5">{pop.text}</p>
        <div className="mt-1 flex items-center gap-3 text-xs">
          {pop.cta ? <Link href={pop.cta.href} onClick={dismiss} className="font-semibold text-accent-text underline">{pop.cta.label}</Link> : null}
          <button type="button" onClick={() => setBuddyEnabled(false)} className="text-muted underline">Mute Mira</button>
        </div>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="absolute right-1 top-1 grid size-6 place-items-center rounded-full text-muted hover:text-text">
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
