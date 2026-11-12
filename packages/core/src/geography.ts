import data from '../data/places-pl.json';
export type Place = {
  name: string;
  lat: number;
  lng: number;
  region: string;
  approximate?: boolean;
};
const population = new Map<string, number>();
const key = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').toLowerCase().trim();
const places = new Map<string, Place[]>();
for (const row of data) {
  const [name, lat, lng, region, , aliases] = row as [
    string,
    number,
    number,
    string,
    number,
    string[],
  ];
  const forms = /ce$/i.test(name) ? [name.replace(/ce$/i, 'cach')] : [];
  population.set(lat + ':' + lng, Number(row[4]));
  for (const k of new Set([name, ...aliases, ...forms].map(key))) {
    const list = places.get(k) ?? [];
    list.push({ name, lat, lng, region });
    places.set(k, list);
  }
}
export function resolveLocationText(text: string | null, region: string | null): Place | null {
  if (!text) return null;
  const cleaned = text.replace(/\b\d{2}-\d{3}\s*/g, '').trim();
  const direct = resolvePlace(cleaned, region);
  if (direct) return direct;
  const suffix = cleaned.match(/\b(?:w|we|z)\s+(.+)$/i)?.[1] ?? cleaned;
  const words = suffix.split(/[\s,;]+/);
  for (let size = Math.min(4, words.length); size >= 1; size--) {
    const found: Place[] = [];
    for (let i = 0; i + size <= words.length; i++) {
      const term = words.slice(i, i + size).join(' ');
      let p = resolvePlace(term, region);
      if (!p) {
        const candidates = (places.get(key(term)) ?? []).filter(
          (p) => !region || key(p.region) === key(region),
        );
        const populated = candidates.filter(
          (p) => (population.get(p.lat + ':' + p.lng) ?? 0) >= 1000,
        );
        const unique = populated.filter(
          (p, i) => populated.findIndex((q) => q.lat === p.lat && q.lng === p.lng) === i,
        );
        if (unique.length === 1) p = { ...unique[0]!, approximate: true };
      }
      if (p && !found.some((q) => q.lat === p.lat && q.lng === p.lng)) found.push(p);
    }
    if (found.length === 1) return found[0]!;
    if (found.length > 1) return null;
  }
  return null;
}
export function resolvePlace(city: string | null, region: string | null): Place | null {
  if (!city) return null;
  const candidates = (places.get(key(city)) ?? []).filter(
    (p) => !region || key(p.region) === key(region),
  );
  const distinct = candidates.filter(
    (p, i) =>
      !candidates
        .slice(0, i)
        .some((q) => Math.abs(q.lat - p.lat) + Math.abs(q.lng - p.lng) < 0.015),
  );
  return distinct.length === 1
    ? { ...distinct[0]!, name: distinct[0]!.name === 'Warsaw' ? 'Warszawa' : distinct[0]!.name }
    : null;
}
