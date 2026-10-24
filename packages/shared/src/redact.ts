/** Patterns for credential-looking strings that must never reach logs. */
const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{10,}/g,
  /sk-(?:proj-)?[A-Za-z0-9_-]{16,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{10,}/gi,
  /postgres(?:ql)?:\/\/[^\s"']+/gi,
  /ExponentPushToken\[[^\]]+\]/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

export function redactString(input: string): string {
  let out = input;
  for (const p of SECRET_PATTERNS) out = out.replace(p, '[REDACTED]');
  return out;
}

const SENSITIVE_KEYS = /^(password|pass|secret|token|apikey|api_key|authorization|cookie|set-cookie|content|prompt|body|sessiontoken|pushtoken)$/i;

/** Deep-redacts sensitive keys and secret-looking values. Bounded depth to avoid cycles. */
export function redactObject(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[DEPTH]';
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redactObject(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.test(k) ? '[REDACTED]' : redactObject(v, depth + 1);
    }
    return out;
  }
  return value;
}
