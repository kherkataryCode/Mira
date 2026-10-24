import type { z } from 'zod';
import { badRequest } from './errors.js';

/** Parses untrusted input; throws a 400 with field-level issues on failure. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw badRequest('Invalid input', issues);
  }
  return result.data;
}

/** Escapes LIKE wildcards so user search text matches literally. */
export function likeEscape(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}
