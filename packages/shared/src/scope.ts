/**
 * Mira's scope policy, enforced on the server before any AI call.
 * "out" = clearly unrelated (redirect without spending AI credit),
 * "mixed" = has both, answer only the supported part, "in" = fine.
 * Deliberately conservative: when unsure, it is "in".
 */
export type Scope = 'in' | 'out' | 'mixed';

const IN_SCOPE = /\b(task|to-?dos?|remind|reminder|event|calendar|meeting|schedule|agenda|plan|today|tomorrow|week|deadline|brief(?:ing)?|news|story|stories|article|headline|word|vocabulary|english|learn|lesson|concept|quiz|study|explain|security|cyber|hack|attack|vuln|cve|exploit|malware|ransomware|phishing|firewall|network|cloud|ot\b|ics|scada|plc|incident|soc|siem|zero trust|encryption|password|mfa|programming|code|python|ai\b|machine learning|tech|note|notes|mira|settings?)\b/i;

const OUT_OF_SCOPE: { re: RegExp; topic: string }[] = [
  { re: /\b(recipe|cook(?:ing)?|bake|baking|ingredients?)\b/i, topic: 'cooking' },
  { re: /\b(write|compose)\s+(?:me\s+)?(?:a\s+)?(poem|song|lyrics|rap|story|novel|haiku|limerick)\b/i, topic: 'creative writing' },
  { re: /\b(horoscope|astrology|zodiac|tarot)\b/i, topic: 'astrology' },
  { re: /\b(football|cricket|nba|nfl|ipl|premier league|match score|who won the)\b/i, topic: 'sports' },
  { re: /\b(celebrity|gossip|movie recommendations?|what (?:movie|film|show) should i watch|netflix)\b/i, topic: 'entertainment' },
  { re: /\b(dating|girlfriend|boyfriend|crush|pick-?up lines?)\b/i, topic: 'dating' },
  { re: /\b(stock tips?|which stock|crypto price|bitcoin price)\b/i, topic: 'investment tips' },
];

export function classifyScope(text: string): { scope: Scope; topic: string | null } {
  const out = OUT_OF_SCOPE.find((o) => o.re.test(text));
  if (!out) return { scope: 'in', topic: null };
  return { scope: IN_SCOPE.test(text) ? 'mixed' : 'out', topic: out.topic };
}

export function scopeRedirect(topic: string): string {
  return [
    `That one’s outside what I’m set up for (${topic}), so I’ll skip it rather than guess.`,
    '',
    'Here’s what I can do:',
    '- **Your day**: tasks, reminders and calendar events (“what’s on tomorrow?”)',
    '- **Your briefing**: “give me my daily summary”, or ask about a story in it',
    '- **Learning**: your selected topics and today’s English word',
  ].join('\n');
}

/** Does the message refer to a briefing, a story in it, or today's word? */
export const BRIEFING_REFERENCE = /\b(briefing|summary|that story|the story|main story|top story|this story|today'?s word|word of the day|the word|yesterday|headline|what changed)\b/i;
