import { Fragment, type ReactNode } from 'react';
import { parseMarkdown, type Inline } from '@friday/shared';

/** Renders Mira's briefing markdown with React elements only (no HTML injection possible). */
function inlines(xs: Inline[]): ReactNode {
  return xs.map((x, i) => {
    switch (x.t) {
      case 'bold':
        return <strong key={i} className="font-semibold">{x.v}</strong>;
      case 'italic':
        return <em key={i}>{x.v}</em>;
      case 'code':
        return <code key={i} className="rounded bg-raised px-1 py-0.5 text-[0.9em]">{x.v}</code>;
      case 'link':
        return (
          <a key={i} href={x.href} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-accent-text underline underline-offset-2">
            {x.v}
          </a>
        );
      default:
        return <Fragment key={i}>{x.v}</Fragment>;
    }
  });
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3 leading-relaxed">
      {parseMarkdown(text).map((b, i) => {
        if (b.t === 'heading') {
          return b.level === 1 ? (
            <h3 key={i} className="display display-md mt-1">{inlines(b.inlines)}</h3>
          ) : (
            <h3 key={i} className="display mt-2 border-t border-line pt-3 text-xl first:mt-0 first:border-0 first:pt-0">{inlines(b.inlines)}</h3>
          );
        }
        if (b.t === 'paragraph') return <p key={i}>{inlines(b.inlines)}</p>;
        if (b.t === 'rule') return <hr key={i} className="border-line" />;
        if (b.t === 'code') {
          return (
            <pre key={i} className="max-w-full overflow-x-auto rounded-2xl border border-line bg-bg p-3 font-mono text-[0.78rem] leading-snug scrollbar-thin">
              {b.text}
            </pre>
          );
        }
        const Tag = b.ordered ? 'ol' : 'ul';
        return (
          <Tag key={i} start={b.ordered ? b.start : undefined} className={`flex flex-col gap-1 pl-5 ${b.ordered ? 'list-decimal' : 'list-disc'} marker:text-muted`}>
            {b.items.map((it, j) => <li key={j}>{inlines(it)}</li>)}
          </Tag>
        );
      })}
    </div>
  );
}
