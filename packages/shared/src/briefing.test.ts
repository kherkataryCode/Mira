import { describe, expect, it } from 'vitest';
import { CYBER_RELEVANCE_THRESHOLD, cyberRelevance, exploitationStatus, isBriefingRequest } from './news.js';
import { parseMarkdown, parseInline } from './markdown.js';
import { DEFAULT_PREFERENCES } from './defaults.js';
import { preferencesSchema } from './schemas.js';

describe('cyber relevance', () => {
  it('ranks security advisories above general tech news', () => {
    const advisory = cyberRelevance('Cisco Expressway vulnerability allows root command execution', 'CERT-In rated the remote code execution flaw critical.');
    const general = cyberRelevance('New smartphone launches with bigger battery', 'The phone ships next month in three colours.');
    expect(advisory).toBeGreaterThanOrEqual(CYBER_RELEVANCE_THRESHOLD);
    expect(general).toBeLessThan(CYBER_RELEVANCE_THRESHOLD);
  });
  it('boosts OT stories when the user follows OT security', () => {
    const t = 'Siemens PLC firmware flaw', s = 'Affects SCADA environments';
    expect(cyberRelevance(t, s, { otFocus: true })).toBeGreaterThan(cyberRelevance(t, s));
  });
  it('only reports exploitation the source states', () => {
    expect(exploitationStatus('CISA added the flaw to KEV after it was actively exploited')).toBe('exploited');
    expect(exploitationStatus('A proof-of-concept exploit is publicly available')).toBe('proof-of-concept');
    expect(exploitationStatus('Vendor released patches for the vulnerability')).toBe('not-reported');
  });
});

describe('briefing intent', () => {
  it('recognises on-demand briefing requests', () => {
    for (const t of ['give me my daily summary', 'Prepare today’s briefing', 'brief', 'show me a summary', "today's briefing"]) {
      expect(isBriefingRequest(t.replace('’', "'")), t).toBe(true);
    }
    expect(isBriefingRequest('summarise this article about firewalls for me please')).toBe(false);
  });
});

describe('markdown', () => {
  it('parses headings, lists, code and links safely', () => {
    const md = '## A. Top News\n\n1. **Cisco** flaw\n- Date: 24 Oct\n- Source: [CERT-In](https://cert-in.org.in/x)\n\n```\nPLC -> firewall\n```\n\n[bad](javascript:alert(1))';
    const blocks = parseMarkdown(md);
    expect(blocks.map((b) => b.t)).toEqual(['heading', 'list', 'list', 'code', 'paragraph']);
    const last = blocks.at(-1)!;
    expect(last.t === 'paragraph' && last.inlines[0]).toEqual({ t: 'text', v: 'bad' });
    expect(parseInline('see [x](https://a.example/p)')[1]).toEqual({ t: 'link', v: 'x', href: 'https://a.example/p' });
    expect(parseInline('[lesson](/learn/abc-1)')[0]).toEqual({ t: 'link', v: 'lesson', href: '/learn/abc-1' });
    expect(parseInline('[evil](//evil.example)')[0]).toEqual({ t: 'text', v: 'evil' });
  });
});

describe('defaults', () => {
  it('default preferences are cybersecurity-focused and valid', () => {
    expect(preferencesSchema.safeParse(DEFAULT_PREFERENCES).success).toBe(true);
    expect(DEFAULT_PREFERENCES.learningTopics).toEqual(['cybersecurity', 'ot-security']);
    expect(preferencesSchema.safeParse({ ...DEFAULT_PREFERENCES, learningTopics: ['finance'] }).success).toBe(false);
  });
});
