'use client';
import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { MiraFace } from './Art';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'panel';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:brightness-110',
  secondary: 'bg-raised text-text border border-line hover:border-muted',
  ghost: 'text-text hover:bg-raised',
  danger: 'bg-transparent border border-accent text-accent-text hover:bg-accent hover:text-on-accent',
  panel: 'bg-panel text-on-panel hover:brightness-95',
};

export function Button({
  variant = 'secondary',
  pending,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; pending?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || pending}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    >
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function IconButton({ label, className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-raised hover:text-text disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <section className={`rounded-3xl border border-line bg-surface p-4 sm:p-5 ${className}`}>{children}</section>;
}

export function SectionHeader({ title, href, action }: { title: string; href?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {href ? (
        <Link href={href} className="inline-flex min-h-11 items-center px-1 text-sm text-muted hover:text-text">
          View all →
        </Link>
      ) : (
        action
      )}
    </div>
  );
}

export function Chip({ active, children, onClick }: { active?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm transition ${
        active ? 'border-sand bg-sand text-on-panel font-semibold' : 'border-line text-muted hover:text-text'
      }`}
    >
      {children}
    </button>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'positive' | 'demo'; children: ReactNode }) {
  const tones = {
    neutral: 'border-line text-muted',
    accent: 'border-accent/60 text-accent-text',
    positive: 'border-positive/60 text-positive',
    demo: 'border-sand/60 text-sand',
  };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide ${tones[tone]}`}>{children}</span>;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-line p-5 text-sm">
      <p className="font-semibold">{title}</p>
      {body ? <p className="text-muted">{body}</p> : null}
      {action}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent/50 bg-accent/10 p-3 text-sm">
      <AlertTriangle className="size-4 text-accent-text" aria-hidden />
      <span className="flex-1">{message}</span>
      {onRetry ? (
        <Button variant="ghost" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-6 text-sm text-muted">
      <MiraFace size={34} />
      <span>{label}</span>
      <span className="flex gap-1" aria-hidden>
        <span className="typing-dot size-1.5 rounded-full bg-accent-text" />
        <span className="typing-dot size-1.5 rounded-full bg-accent-text" />
        <span className="typing-dot size-1.5 rounded-full bg-accent-text" />
      </span>
    </div>
  );
}

/** Shimmering placeholder blocks while a page loads. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="compact-landscape mb-5 flex flex-wrap items-end justify-between gap-3 pt-2">
      <div className="min-w-0">
        <h1 className="display display-lg">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  'min-h-11 w-full rounded-xl border border-line bg-raised px-3 text-[16px] text-text placeholder:text-muted/70 focus:border-sand focus:outline-none';
