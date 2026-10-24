import { createHash, randomBytes } from 'node:crypto';

/** 256-bit random opaque session token (base64url). */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
