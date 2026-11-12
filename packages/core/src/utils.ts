import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + stableJson(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'null';
}
export const sleep = (ms: number, signal?: AbortSignal) => setTimeout(ms, undefined, { signal });
export class ExternalError extends Error {
  constructor(
    public status: number,
    public retryAfterMs: number | null = null,
  ) {
    super(`External HTTP ${status}`);
  }
}
export const retryable = (error: unknown) =>
  error instanceof ExternalError
    ? error.status === 429 ||
      error.status >= 500 ||
      (error.status === 403 && error.retryAfterMs !== null)
    : error instanceof TypeError ||
      (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name));
export function retryAfter(value: string | null) {
  if (!value) return null;
  const ms = /^\d+(\.\d+)?$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(ms) ? Math.max(0, ms) : null;
}
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    attempts?: number;
    signal?: AbortSignal;
    pause?: (ms: number, signal?: AbortSignal) => Promise<unknown>;
  } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    options.signal?.throwIfAborted();
    try {
      return await fn();
    } catch (error) {
      if (attempt + 1 >= (options.attempts ?? 3) || !retryable(error) || options.signal?.aborted)
        throw error;
      const wait = error instanceof ExternalError ? error.retryAfterMs : null;
      if (wait !== null && wait > 60000) throw error;
      await (options.pause ?? sleep)(
        Math.max(wait ?? 0, 1000 * 2 ** attempt + Math.random() * 400),
        options.signal,
      );
    }
  }
}
