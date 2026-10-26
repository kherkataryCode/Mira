'use client';
import { useState } from 'react';
import { ChevronDown, MessageCircle, Share2 } from 'lucide-react';
import { Markdown } from './Markdown';

/**
 * Renders a "Brief me" briefing as separate boxed sections in a responsive grid.
 * The message stays plain markdown in the database; this is only a presentation.
 */
interface Section { title: string; body: string }

const SECTION_HEAD = /^\*\*([^*\n]+)\*\*\s*$/;

export function isCardBriefing(md: string): boolean {
  return /\n\n\*\*(?:⭐|✅) /.test(md);
}

function split(md: string): { intro: string; sections: Section[]; footer: string } {
  const blocks = md.split(/\n\n/);
  const intro = blocks.shift() ?? '';
  const sections: Section[] = [];
  let footer = '';
  for (const b of blocks) {
    const first = b.split('\n')[0]!;
    const m = SECTION_HEAD.exec(first);
    if (m) sections.push({ title: m[1]!, body: b.slice(first.length).trim() });
    else if (/^\[/.test(b) && /\]\(\//.test(b)) footer = b;
    else if (sections.length) sections[sections.length - 1]!.body += `\n\n${b}`;
  }
  return { intro, sections, footer };
}

interface Story { title: string; url: string; meta: string; summary: string; why: string }
function stories(body: string): Story[] | null {
  const items = body.split(/\n(?=- \[)/).filter((x) => x.startsWith('- ['));
  if (!items.length) return null;
  return items.map((it) => {
    const [head, ...rest] = it.split('\n').map((l) => l.trim());
    const m = /^- \[(.+?)\]\((\S+?)\)(.*)$/.exec(head!);
    const why = rest.find((l) => l.startsWith('**Why it matters:**'))?.replace('**Why it matters:**', '').trim() ?? '';
    return { title: m?.[1] ?? head!, url: m?.[2] ?? '', meta: (m?.[3] ?? '').replace(/^ — /, '').trim(), summary: rest.filter((l) => !l.startsWith('**Why')).join(' '), why };
  });
}

export function BriefingCards({ md, onAsk }: { md: string; onAsk: (text: string) => void }) {
  const { intro, sections, footer } = split(md);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const toggle = (t: string) => setClosed((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const share = async (s: Story) => {
    try {
      if (navigator.share) await navigator.share({ title: s.title, url: s.url });
      else await navigator.clipboard.writeText(`${s.title} ${s.url}`);
    } catch {
      /* user cancelled */
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Markdown text={intro} />
      <div className="grid gap-3 md:grid-cols-2">
        {sections.map((s) => {
          const wide = /^⭐|^🛡️|Cyber news/.test(s.title);
          const isClosed = closed.has(s.title);
          const list = /Cyber news/.test(s.title) ? stories(s.body) : null;
          return (
            <section key={s.title} aria-label={s.title} className={`min-w-0 rounded-2xl border border-line bg-raised ${wide ? 'md:col-span-2' : ''} ${/^⭐/.test(s.title) ? 'border-accent/50' : ''}`}>
              <button type="button" onClick={() => toggle(s.title)} aria-expanded={!isClosed} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm font-semibold">
                {s.title}
                <ChevronDown className={`size-4 shrink-0 text-muted transition ${isClosed ? '-rotate-90' : ''}`} aria-hidden />
              </button>
              {isClosed ? null : (
                <div className="border-t border-line px-4 py-3 text-sm">
                  {list ? (
                    <ul className="flex flex-col divide-y divide-line">
                      {list.map((n) => (
                        <li key={n.url || n.title} className="py-2 first:pt-0 last:pb-0">
                          <a href={n.url} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold hover:underline">{n.title}</a>
                          {n.meta ? <p className="text-xs text-muted">{n.meta.replace(/_/g, '')}</p> : null}
                          {n.summary ? <p className="mt-0.5 text-muted">{n.summary}</p> : null}
                          {n.why ? <p className="mt-0.5"><span className="font-semibold">Why it matters:</span> {n.why}</p> : null}
                          <div className="mt-1 flex gap-3 text-xs">
                            <a href={n.url} target="_blank" rel="noopener noreferrer nofollow" className="text-accent-text underline">Read more</a>
                            <button type="button" onClick={() => onAsk(`Tell me more about “${n.title}” from today's briefing`)} className="inline-flex items-center gap-1 text-muted hover:text-text"><MessageCircle className="size-3" aria-hidden />Ask Mira</button>
                            <button type="button" onClick={() => void share(n)} className="inline-flex items-center gap-1 text-muted hover:text-text"><Share2 className="size-3" aria-hidden />Share</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Markdown text={s.body} />
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {footer ? <Markdown text={footer} /> : null}
    </div>
  );
}
