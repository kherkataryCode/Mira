'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  Activity,
  Bell,
  BookOpen,
  CheckSquare,
  Home,
  LogOut,
  Menu,
  MessageCircle,
  Newspaper,
  Settings,
  StickyNote,
  AlarmClock,
  X,
} from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { Preferences, User } from '@/lib/types';
import { relativeTime } from '@/lib/format';
import { LogoMark } from './Art';
import { ErrorNote, IconButton, Loading } from './ui';

interface Session {
  user: User;
  prefs: Preferences | null;
  setPrefs: (p: Preferences) => void;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession outside AppShell');
  return s;
}

const NAV = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/reminders', label: 'Reminders', icon: AlarmClock },
  { href: '/learn', label: 'Learn', icon: BookOpen },
  { href: '/news', label: 'News', icon: Newspaper },
  { href: '/chat', label: 'Chat', icon: MessageCircle },
  { href: '/notes', label: 'Notes', icon: StickyNote },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const TABS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/chat', label: 'Chat', icon: MessageCircle },
  { href: '/learn', label: 'Learn', icon: BookOpen },
];

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function applyTheme(theme: Preferences['theme'] | undefined) {
  const root = document.documentElement;
  const resolved = theme === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : (theme ?? 'dark');
  root.dataset.theme = resolved;
}

interface Notification {
  id: string;
  title: string;
  body: string | null;
  channel: 'in_app' | 'push';
  status: string;
  createdAt: string;
  readAt: string | null;
}

function Inbox() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    api
      .get<{ notifications: Notification[]; unread: number }>('/notifications')
      .then((r) => {
        setItems(r.notifications.filter((n) => n.channel === 'in_app'));
        setUnread(r.unread);
      })
      .catch(() => setItems([]));
  }, [pathname]);

  const toggle = async () => {
    setOpen((o) => !o);
    if (!open && unread > 0) {
      setUnread(0);
      await api.post('/notifications/read-all').catch(() => undefined);
    }
  };

  return (
    <div className="relative">
      <IconButton label={unread ? `Notifications, ${unread} unread` : 'Notifications'} onClick={toggle} aria-expanded={open}>
        <Bell className="size-5" aria-hidden />
        {unread > 0 ? <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-accent" aria-hidden /> : null}
      </IconButton>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-line bg-raised p-2 shadow-2xl">
          <p className="eyebrow px-2 py-1">Notifications</p>
          {!items ? <Loading /> : null}
          {items && items.length === 0 ? <p className="px-2 py-3 text-sm text-muted">No notifications yet. Delivered reminders and briefs appear here.</p> : null}
          <ul className="max-h-80 overflow-y-auto scrollbar-thin">
            {items?.slice(0, 20).map((n) => (
              <li key={n.id} className="rounded-xl px-2 py-2 text-sm">
                <p className="font-medium">{n.title}</p>
                {n.body ? <p className="text-muted">{n.body}</p> : null}
                <p className="text-xs text-muted">{relativeTime(n.createdAt)}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setBootError(null);
    api
      .get<{ user: User }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch((e: unknown) => setBootError(errorMessage(e)));
    api
      .get<{ preferences: Preferences }>('/preferences')
      .then((r) => setPrefs(r.preferences))
      .catch(() => undefined);
  }, [attempt]);

  useEffect(() => applyTheme(prefs?.theme), [prefs?.theme]);
  useEffect(() => setMoreOpen(false), [pathname]);

  const logout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    router.replace('/login');
  };

  if (!user) {
    return (
      <div className="safe-x grid min-h-dvh place-items-center">
        {bootError ? (
          <div className="w-full max-w-sm">
            <ErrorNote message={`Mira couldn't load: ${bootError}`} onRetry={() => setAttempt((a) => a + 1)} />
          </div>
        ) : (
          <Loading label="Opening Mira" />
        )}
      </div>
    );
  }

  const nav = user.role === 'owner' ? [...NAV, { href: '/health', label: 'System Health', icon: Activity }] : NAV;
  const isChat = pathname === '/chat';

  return (
    <SessionContext.Provider value={{ user, prefs, setPrefs }}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-raised focus:p-3">
        Skip to content
      </a>
      <div className="flex min-h-dvh">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
          <Link href="/" className="mb-6 flex items-center gap-2 px-3">
            <LogoMark />
            <span className="display text-2xl">Mira</span>
          </Link>
          <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 overflow-y-auto scrollbar-thin">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(pathname, href) ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition ${
                  isActive(pathname, href) ? 'bg-raised font-semibold text-text' : 'text-muted hover:bg-raised hover:text-text'
                }`}
              >
                <Icon className="size-[18px]" aria-hidden />
                {label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-line p-2">
            <span className="grid size-9 place-items-center rounded-full bg-green font-semibold text-cream" aria-hidden>
              {user.displayName.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user.displayName}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
            <IconButton label="Sign out" onClick={logout}>
              <LogOut className="size-4" aria-hidden />
            </IconButton>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <header className="safe-top sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
            <div className="safe-x mx-auto flex h-[var(--topbar-h)] w-full max-w-6xl items-center gap-2">
              <Link href="/" className="flex items-center gap-2 lg:hidden">
                <LogoMark size={24} />
                <span className="display text-xl">Mira</span>
              </Link>
              <div className="flex-1" />
              <Inbox />
              <IconButton label="More" className="lg:hidden" onClick={() => setMoreOpen(true)} aria-expanded={moreOpen}>
                <Menu className="size-5" aria-hidden />
              </IconButton>
            </div>
          </header>

          <main id="main" className={`safe-x mx-auto w-full max-w-6xl flex-1 ${isChat ? 'flex flex-col' : 'pb-28 lg:pb-10'}`}>
            {children}
          </main>

          {/* Mobile tab bar (hidden in Chat so the composer owns the bottom edge) */}
          {!isChat ? (
            <nav aria-label="Primary" className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
              <ul className="mx-auto grid max-w-lg grid-cols-4">
                {TABS.map(({ href, label, icon: Icon }) => {
                  const active = isActive(pathname, href);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        aria-current={active ? 'page' : undefined}
                        className={`tab-link flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.7rem] ${active ? 'font-semibold text-accent-text' : 'text-muted'}`}
                      >
                        <Icon className="size-5" aria-hidden />
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : null}
        </div>
      </div>

      {/* Mobile "More" sheet */}
      {moreOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="More">
          <button className="absolute inset-0 bg-black/60" aria-label="Close menu" onClick={() => setMoreOpen(false)} />
          <div className="safe-bottom absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-raised p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="eyebrow">Signed in as {user.displayName}</p>
              <IconButton label="Close" onClick={() => setMoreOpen(false)}>
                <X className="size-5" aria-hidden />
              </IconButton>
            </div>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {nav.map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link href={href} className="flex min-h-14 items-center gap-3 rounded-2xl border border-line px-3 text-sm">
                    <Icon className="size-5 text-muted" aria-hidden />
                    {label}
                  </Link>
                </li>
              ))}
              <li>
                <button onClick={logout} className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line px-3 text-sm">
                  <LogOut className="size-5 text-muted" aria-hidden />
                  Sign out
                </button>
              </li>
            </ul>
          </div>
        </div>
      ) : null}
    </SessionContext.Provider>
  );
}
