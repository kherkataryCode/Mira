/**
 * A small, safe markdown subset used for Mira's briefings, rendered natively on web and iOS.
 * No HTML is ever produced from user or model text: renderers map these nodes to components.
 */
export type Inline =
  | { t: 'text'; v: string }
  | { t: 'bold'; v: string }
  | { t: 'italic'; v: string }
  | { t: 'code'; v: string }
  | { t: 'link'; v: string; href: string };

export type MdBlock =
  | { t: 'heading'; level: 1 | 2 | 3; inlines: Inline[] }
  | { t: 'paragraph'; inlines: Inline[] }
  | { t: 'list'; ordered: boolean; start: number; items: Inline[][] }
  | { t: 'code'; text: string }
  | { t: 'rule' };

/** Only http(s) and mailto links survive; anything else becomes plain text. */
export function safeHref(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|(?<![\w*])\*([^*\n]+)\*(?![\w*])|(?<![\w_])_([^_\n]+)_(?![\w_])/g;
  let last = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m.index > last) out.push({ t: 'text', v: src.slice(last, m.index) });
    if (m[1] !== undefined && m[2] !== undefined) {
      const href = safeHref(m[2]);
      out.push(href ? { t: 'link', v: m[1], href } : { t: 'text', v: m[1] });
    } else if (m[3] !== undefined) out.push({ t: 'bold', v: m[3] });
    else if (m[4] !== undefined) out.push({ t: 'code', v: m[4] });
    else if (m[5] !== undefined) out.push({ t: 'italic', v: m[5] });
    else if (m[6] !== undefined) out.push({ t: 'italic', v: m[6] });
    last = re.lastIndex;
  }
  if (last < src.length) out.push({ t: 'text', v: src.slice(last) });
  return out;
}

export function parseMarkdown(src: string): MdBlock[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; start: number; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) blocks.push({ t: 'paragraph', inlines: parseInline(para.join(' ').trim()) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ t: 'list', ordered: list.ordered, start: list.start, items: list.items.map(parseInline) });
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^```/.test(line.trim())) {
      flushPara();
      flushList();
      const body: string[] = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]!.trim()); i++) body.push(lines[i]!);
      blocks.push({ t: 'code', text: body.join('\n') });
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      flushList();
      blocks.push({ t: 'heading', level: h[1]!.length as 1 | 2 | 3, inlines: parseInline(h[2]!.trim()) });
      continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      flushPara();
      flushList();
      blocks.push({ t: 'rule' });
      continue;
    }
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*(\d{1,3})[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const ordered = Boolean(ol);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, start: ol ? Number(ol[1]) : 1, items: [] };
      }
      list.items.push((ul ? ul[1] : ol![2])!.trim());
      continue;
    }
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return blocks;
}

/** Plain text for text-to-speech: no symbols, links read as their labels, diagrams skipped. */
export function speakableText(md: string, maxChars = 4000): string {
  const text = parseMarkdown(md)
    .map((b) => {
      const inl = (xs: Inline[]) => xs.map((x) => x.v).join('');
      if (b.t === 'code') return 'Diagram shown on screen.';
      if (b.t === 'rule') return '';
      if (b.t === 'list') return b.items.map((i) => `${inl(i)}.`).join(' ');
      return `${inl(b.inlines)}.`;
    })
    .join(' ')
    .replace(/\.{2,}/g, '.')
    .replace(/:\./g, ':')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxChars ? `${text.slice(0, maxChars - 1).replace(/\s+\S*$/, '')}…` : text;
}
