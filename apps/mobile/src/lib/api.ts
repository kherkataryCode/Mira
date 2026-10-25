import * as SecureStore from 'expo-secure-store';
import { fetch as streamingFetch } from 'expo/fetch';
import type { Proposal } from '@friday/shared';

const TOKEN_KEY = 'friday.session';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export async function loadToken(): Promise<string | null> {
  token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token;
}
export async function saveToken(t: string): Promise<void> {
  token = t;
  // Stored in the iOS Keychain, only readable while the device is unlocked.
  await SecureStore.setItemAsync(TOKEN_KEY, t, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}
export async function clearToken(): Promise<void> {
  token = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
/** The current session token (for media players that need an auth header). */
export function getToken(): string | null {
  return token;
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json', 'x-friday-client': 'mobile' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, 'network', "Can't reach Mira. Check your connection and try again.");
  }
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined;
  }
  if (res.status === 401 && token && !path.startsWith('/auth/login')) onUnauthorized?.();
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; message?: string; details?: unknown };
    throw new ApiError(res.status, d.error ?? 'error', d.message ?? `Request failed (${res.status})`, d.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.name === 'AbortError') return 'Cancelled';
  return 'Something went wrong. Please try again.';
}

export type ChatEvent =
  | { type: 'meta'; conversationId: string; userMessageId: string; assistantMessageId: string; proposals: Proposal[] }
  | { type: 'delta'; text: string }
  | { type: 'done'; provider: string; model: string; demo: boolean }
  | { type: 'error'; code: string; message: string; partial: boolean };

/** Streams NDJSON chat events. Uses expo/fetch, which supports streaming response bodies. */
export async function streamChat(path: string, body: unknown, onEvent: (e: ChatEvent) => void, signal: AbortSignal): Promise<void> {
  const res = await streamingFetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token ?? ''}`, 'x-friday-client': 'mobile' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let message = `Request failed (${res.status})`;
    try {
      message = ((await res.json()) as { message?: string }).message ?? message;
    } catch {
      /* keep default */
    }
    throw new ApiError(res.status, 'chat_failed', message);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) onEvent(JSON.parse(line) as ChatEvent);
    }
  }
}

export function newClientId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 8)}`;
}
