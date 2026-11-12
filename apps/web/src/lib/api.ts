export async function api<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch('/api' + path, { signal });
  if (!res.ok)
    throw new Error(
      res.status === 503
        ? 'Baza danych nie jest jeszcze gotowa.'
        : 'Nie udało się pobrać danych. Sprawdź połączenie z API.',
    );
  return res.json() as Promise<T>;
}
let csrf: string | null = null;
export function setCsrf(value: string | null) {
  csrf = value;
}
export async function mutate<T = unknown>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? 'Nie udało się zapisać danych.');
  return data as T;
}
