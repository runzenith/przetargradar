import { ThemeToggle } from './theme-toggle';
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, mutate } from '../lib/api';
import { Button } from './ui/button';
export type Identity = {
  user: {
    id: string;
    email: string;
  } | null;
  csrf: string | null;
};
export function AuthView({ onDone }: { onDone: () => void }) {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const client = useQueryClient();
  return (
    <div className="auth-page">
      <a className="auth-back" href="/">
        ← Wróć do przetargów
      </a>
      <div className="auth-theme">
        <ThemeToggle />
      </div>
      <div className="auth-card">
        <div className="eyebrow">PrzetargRadar</div>
        <h1>{register ? 'Utwórz konto' : 'Zaloguj się'}</h1>
        <p>Profil firmy i zapisane zamówienia są przypisane do Twojego konta.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            const data = new FormData(e.currentTarget);
            try {
              await mutate('/auth/' + (register ? 'register' : 'login'), 'POST', {
                email: data.get('email'),
                password: data.get('password'),
              });
              client.clear();
              onDone();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            E-mail
            <input required type="email" name="email" autoComplete="email" maxLength={191} />
          </label>
          <label>
            Hasło (minimum 12 znaków)
            <input
              required
              type="password"
              name="password"
              minLength={12}
              maxLength={128}
              autoComplete={register ? 'new-password' : 'current-password'}
            />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <Button disabled={busy}>
            {busy ? 'Proszę czekać…' : register ? 'Zarejestruj się' : 'Zaloguj się'}
          </Button>
        </form>
        <button
          className="text-button"
          onClick={() => {
            setRegister(!register);
            setError('');
          }}
        >
          {register ? 'Mam już konto — zaloguj się' : 'Nie masz konta? Zarejestruj się'}
        </button>
      </div>
    </div>
  );
}
const blank = {
  description: '',
  services: [],
  exclusions: [],
  regions: [],
  cpvCodes: [],
  competencies: [],
} as {
  description: string;
  services: string[];
  exclusions: string[];
  regions: string[];
  cpvCodes: string[];
  competencies: string[];
};
export function ProfileView() {
  const query = useQuery({
    queryKey: ['profile'],
    queryFn: () =>
      api<{
        profile:
          | (typeof blank & {
              version: number;
            })
          | null;
      }>('/profile'),
  });
  const [form, setForm] = useState<Record<string, string>>({}),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const client = useQueryClient();
  useEffect(() => {
    const p = query.data?.profile ?? blank;
    setForm(
      Object.fromEntries(
        Object.entries(blank).map(([k]) => [
          k,
          Array.isArray(p[k as keyof typeof blank])
            ? (p[k as keyof typeof blank] as string[]).join('\n')
            : String(p[k as keyof typeof blank]),
        ]),
      ),
    );
  }, [query.data]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">USTAWIENIA DOPASOWANIA</div>
          <h1>Profil firmy</h1>
          <p>Określ usługi i regiony, aby otrzymywać dopasowane zamówienia.</p>
        </div>
      </div>
      <form
        className="profile-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await mutate(
              '/profile',
              'PUT',
              Object.fromEntries(
                Object.keys(blank).map((k) => [
                  k,
                  k === 'description'
                    ? (form[k] ?? '')
                    : (form[k] ?? '')
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean),
                ]),
              ),
            );
            await client.invalidateQueries({ queryKey: ['profile'] });
            await client.invalidateQueries({ queryKey: ['tenders'] });
            setMessage('Profil zapisany. Dopasowania zostały zaktualizowane.');
          } catch (err) {
            setMessage((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {Object.entries({
          description: 'Opis działalności',
          services: 'Oferowane usługi — każda w osobnym wierszu',
          exclusions: 'Wykluczone usługi — każda w osobnym wierszu',
          regions: 'Województwa zamawiającego — puste oznacza wszystkie',
          cpvCodes: 'Kody CPV — np. 72263000-6, każdy w osobnym wierszu',
          competencies: 'Deklarowane kompetencje i doświadczenie',
        }).map(([key, label]) => (
          <label key={key}>
            {label}
            <textarea
              value={form[key] ?? ''}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              rows={key === 'description' ? 4 : 3}
            />
          </label>
        ))}
        {query.isError && <p role="alert">Nie udało się pobrać profilu.</p>}
        <p role="status">{message}</p>
        <Button disabled={busy || query.isPending || query.isError}>
          {busy ? 'Zapisywanie…' : 'Zapisz profil firmy'}
        </Button>
      </form>
    </>
  );
}
