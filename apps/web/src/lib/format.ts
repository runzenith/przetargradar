export const date = (value: string | null, time = false) =>
  value
    ? new Intl.DateTimeFormat('pl-PL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        ...(time ? { hour: '2-digit', minute: '2-digit' } : {}),
        timeZone: 'Europe/Warsaw',
      }).format(new Date(value))
    : 'Nie podano';
export const money = (value: string | null, currency: string | null) =>
  value
    ? value.replace(/\B(?=(\d{3})+(?!\d))/g, ' ').replace('.', ',') +
      ' ' +
      (currency === 'PLN' ? 'zł' : (currency ?? ''))
    : 'Nie podano';
export const categories: Record<string, string> = {
  services: 'Usługi',
  supplies: 'Dostawy',
  works: 'Roboty budowlane',
  other: 'Pozostałe',
};
export const analysisNames: Record<string, string> = {
  completed: 'Gotowa',
  pending: 'Oczekuje',
  processing: 'W analizie',
  failed: 'Błąd analizy',
  stale: 'Nieaktualna',
};
