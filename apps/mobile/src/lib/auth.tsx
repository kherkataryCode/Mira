import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Preferences, User } from '@friday/shared';
import { api, clearToken, loadToken, saveToken, setUnauthorizedHandler } from './api';
import { unregisterLocalSchedules } from './notifications';

interface AuthState {
  status: 'loading' | 'signedOut' | 'signedIn';
  user: User | null;
  prefs: Preferences | null;
  setPrefs: (p: Preferences) => void;
  signIn: (email: string, password: string) => Promise<void>;
  register: (displayName: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [prefs, setPrefs] = useState<Preferences | null>(null);

  const hydrate = useCallback(async () => {
    const me = await api.get<{ user: User }>('/auth/me');
    setUser(me.user);
    const p = await api.get<{ preferences: Preferences }>('/preferences');
    setPrefs(p.preferences);
    setStatus('signedIn');
  }, []);

  const signOutLocal = useCallback(async () => {
    await clearToken();
    await unregisterLocalSchedules().catch(() => undefined);
    setUser(null);
    setPrefs(null);
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void signOutLocal());
    loadToken()
      .then((t) => (t ? hydrate() : setStatus('signedOut')))
      .catch(() => setStatus('signedOut'));
  }, [hydrate, signOutLocal]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      prefs,
      setPrefs,
      signIn: async (email, password) => {
        const r = await api.post<{ token: string }>('/auth/login', { email, password, client: 'mobile' });
        await saveToken(r.token);
        await hydrate();
      },
      register: async (displayName, email, password) => {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const r = await api.post<{ token: string }>('/auth/register', { displayName, email, password, timezone });
        await saveToken(r.token);
        await hydrate();
      },
      signOut: async () => {
        await api.post('/auth/logout').catch(() => undefined);
        await signOutLocal();
      },
    }),
    [status, user, prefs, hydrate, signOutLocal],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
