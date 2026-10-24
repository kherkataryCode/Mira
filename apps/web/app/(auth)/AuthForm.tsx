'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, errorMessage, ApiError } from '@/lib/api';
import { Button, ErrorNote, Field, inputClass } from '@/components/ui';

/** Only allow same-site relative redirects after sign-in (prevents open redirects). */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/';
  return raw;
}

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      if (mode === 'login') {
        await api.post('/auth/login', { email: form.get('email'), password: form.get('password'), client: 'web' });
      } else {
        await api.post('/auth/register', {
          email: form.get('email'),
          password: form.get('password'),
          displayName: form.get('displayName'),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      }
      router.replace(safeNext(params.get('next')));
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        setError((err.details as { message: string }[]).map((d) => d.message).join(' '));
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <h1 className="display display-lg">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
      {mode === 'register' ? (
        <Field label="Your name">
          <input name="displayName" required maxLength={60} autoComplete="given-name" className={inputClass} />
        </Field>
      ) : null}
      <Field label="Email">
        <input name="email" type="email" required autoComplete="email" className={inputClass} />
      </Field>
      <Field label="Password" hint={mode === 'register' ? 'At least 12 characters. A passphrase works well.' : undefined}>
        <input
          name="password"
          type="password"
          required
          minLength={mode === 'register' ? 12 : 1}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          className={inputClass}
        />
      </Field>
      {error ? <ErrorNote message={error} /> : null}
      <Button type="submit" variant="primary" pending={pending}>
        {mode === 'login' ? 'Sign in' : 'Create account'}
      </Button>
      <p className="text-sm text-muted">
        {mode === 'login' ? (
          <>
            New here? <Link className="font-semibold text-text underline underline-offset-4" href="/register">Create an account</Link>
          </>
        ) : (
          <>
            Already have an account? <Link className="font-semibold text-text underline underline-offset-4" href="/login">Sign in</Link>
          </>
        )}
      </p>
    </form>
  );
}
