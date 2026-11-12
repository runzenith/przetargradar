import { lazy, Suspense } from 'react';
import { useMemo, useState, useEffect, useRef } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { MapPinned, ArrowUpRight, Search, X, Navigation, SlidersHorizontal } from 'lucide-react';
import type { TenderList } from '../../../../packages/contracts/src/index';
import { api } from '../lib/api';
import { date, categories } from '../lib/format';
import type { MapPoint } from './radar-map';
const RadarMap = lazy(() => import('./radar-map').then((m) => ({ default: m.RadarMap })));
import { Select } from './select';
import { ErrorState } from './indicators';
const regions = [
  'dolnośląskie',
  'kujawsko-pomorskie',
  'lubelskie',
  'lubuskie',
  'łódzkie',
  'małopolskie',
  'mazowieckie',
  'opolskie',
  'podkarpackie',
  'podlaskie',
  'pomorskie',
  'śląskie',
  'świętokrzyskie',
  'warmińsko-mazurskie',
  'wielkopolskie',
  'zachodniopomorskie',
];
export function MapExplorer({
  params,
  update,
  onOpen,
}: {
  params: URLSearchParams;
  update: (patch: Record<string, string | null>) => void;
  onOpen: (id: string) => void;
}) {
  const [locality, setLocality] = useState('');
  const savedSearch = params.get('q') ?? '';
  const [searchText, setSearchText] = useState(savedSearch);
  const updater = useRef(update);
  updater.current = update;
  useEffect(() => setSearchText(savedSearch), [savedSearch]);
  useEffect(() => {
    if (searchText === savedSearch) return;
    const timer = setTimeout(
      () => updater.current({ q: searchText || null, city: null, cityRegion: null, mapPage: null }),
      350,
    );
    return () => clearTimeout(timer);
  }, [searchText, savedSearch]);
  const query = new URLSearchParams();
  for (const k of [
    'q',
    'region',
    'category',
    'status',
    'analysis',
    'industry',
    'source',
    'published',
    'deadlineDays',
  ])
    if (params.get(k)) query.set(k, params.get(k)!);
  const result = useQuery({
    queryKey: ['map', query.toString()],
    queryFn: ({ signal }) =>
      api<{
        points: MapPoint[];
        unmapped: number;
        total: number;
      }>('/map?' + query, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 60000,
  });
  const points = useMemo(
    () =>
      (result.data?.points ?? []).filter((p) =>
        p.name.toLocaleLowerCase('pl').includes(locality.toLocaleLowerCase('pl')),
      ),
    [result.data, locality],
  );
  const selected = points.find(
    (p) => p.city === params.get('city') && p.buyerRegion === (params.get('cityRegion') || null),
  );
  const listQuery = new URLSearchParams(query);
  listQuery.set('pageSize', '10');
  listQuery.set('page', params.get('mapPage') ?? '1');
  if (selected) {
    listQuery.set('city', selected.city);
    if (selected.buyerRegion) listQuery.set('region', selected.buyerRegion);
  }
  const list = useQuery({
    queryKey: ['map-list', listQuery.toString()],
    queryFn: ({ signal }) => api<TenderList>('/tenders?' + listQuery, signal),
    placeholderData: keepPreviousData,
  });
  const filter = (k: string, v: string) =>
    update({ [k]: v || null, city: null, cityRegion: null, mapPage: null });
  return (
    <div className="map-explorer">
      <header className="atlas-heading">
        <div>
          <span className="eyebrow">Lokalizacja zamówień</span>
          <h1>
            Mapa zamówień<span>.</span>
          </h1>
          <p>Przeglądaj zamówienia według lokalizacji i filtruj wyniki.</p>
        </div>
        <div className="atlas-counter">
          <strong>{result.data?.total ?? '—'}</strong>
          <span>zamówień po filtrach</span>
        </div>
      </header>
      <div className="atlas-filters">
        <SlidersHorizontal size={18} />
        <label className="atlas-search">
          <Search size={16} />
          <input
            aria-label="Szukaj na mapie"
            placeholder="Tytuł, zamawiający lub CPV…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </label>
        <Select
          label="Kategoria na mapie"
          value={params.get('category') ?? 'all'}
          options={[
            ['all', 'Wszystkie branże'],
            ...(Object.entries(categories) as [string, string][]),
          ]}
          onChange={(v) => filter('category', v)}
        />
        <Select
          label="Status na mapie"
          value={params.get('status') ?? 'all'}
          options={[
            ['all', 'Wszystkie statusy'],
            ['active', 'Trwa nabór ofert'],
            ['closed', 'Zakończone'],
            ['unknown', 'Termin do sprawdzenia'],
          ]}
          onChange={(v) => filter('status', v)}
        />
        <Select
          label="Województwo na mapie"
          value={params.get('region') || 'all'}
          options={[['all', 'Cała Polska'], ...regions.map((r) => [r, r] as [string, string])]}
          onChange={(v) => filter('region', v === 'all' ? '' : v)}
        />
        <button
          className="text-button"
          onClick={() => {
            setLocality('');
            setSearchText('');
            update({
              q: null,
              region: null,
              category: null,
              status: null,
              analysis: null,
              city: null,
              cityRegion: null,
              mapPage: null,
            });
          }}
        >
          Wyczyść
        </button>
      </div>
      {result.isError ? (
        <ErrorState message={result.error.message} retry={() => void result.refetch()} />
      ) : (
        <div className="atlas-workspace">
          <div className="atlas-stage">
            <Suspense fallback={<div className="location-unavailable">Wczytuję mapę…</div>}>
              <RadarMap
                points={points}
                selected={selected}
                onSelect={(p) => update({ city: p.city, cityRegion: p.buyerRegion, mapPage: null })}
              />
            </Suspense>
            <div className="map-legend">
              <i /> Siedziby zamawiających <span>•</span> Liczba oznacza zamówienia{' '}
              <small>Poziom miejscowości, bez dokładnego adresu</small>
            </div>
          </div>
          <aside className="atlas-results">
            <div className="atlas-results-header">
              <span className="eyebrow">TWÓJ OBSZAR POSZUKIWAŃ</span>
              <h2>
                <MapPinned size={20} />
                {selected?.name ?? 'Cała Polska'}
              </h2>
              {selected && (
                <button
                  className="text-button"
                  onClick={() => {
                    setLocality('');
                    update({ city: null, cityRegion: null, mapPage: null });
                  }}
                >
                  <X size={13} /> Usuń wybór miasta
                </button>
              )}
              <label className="city-search">
                <Search size={15} />
                <input
                  aria-label="Znajdź miejscowość"
                  placeholder="Znajdź miejscowość na mapie…"
                  value={locality}
                  onChange={(e) => setLocality(e.target.value)}
                />
              </label>
              {locality && (
                <div className="city-suggestions">
                  {points.slice(0, 8).map((p) => (
                    <button
                      key={p.city + p.buyerRegion}
                      onClick={() => {
                        setLocality('');
                        update({ city: p.city, cityRegion: p.buyerRegion, mapPage: null });
                      }}
                    >
                      {p.name}
                      <span>{p.count}</span>
                    </button>
                  ))}
                  {!points.length && <p>Brak rozpoznanych miejscowości dla tego wyszukiwania.</p>}
                </div>
              )}
              <p>
                {list.data?.total ?? '…'} zamówień {list.isFetching && ' · aktualizowanie…'}
              </p>
            </div>
            <div className="atlas-cards">
              {list.isError ? (
                <ErrorState message={list.error.message} retry={() => void list.refetch()} />
              ) : (
                list.data?.items.map((t) => (
                  <button className="atlas-card" key={t.id} onClick={() => onOpen(t.id)}>
                    <span className="atlas-card-meta">
                      {categories[t.category]}
                      <ArrowUpRight size={17} />
                    </span>
                    <h3>{t.title}</h3>
                    <p>{t.buyer}</p>
                    <span className="atlas-card-location">
                      <Navigation size={12} />
                      {t.buyerCity ?? 'Brak miejscowości'}
                    </span>
                    <footer>
                      {t.status === 'closed'
                        ? 'Postępowanie zakończone'
                        : t.deadline
                          ? 'Oferty do ' + date(t.deadline)
                          : 'Termin do sprawdzenia'}
                    </footer>
                  </button>
                ))
              )}
              {list.data?.total === 0 && (
                <div className="atlas-empty">
                  <MapPinned size={30} />
                  <h3>Tu jeszcze nic nie ma</h3>
                  <p>Zmień filtry lub wybierz inne miasto.</p>
                </div>
              )}
            </div>
            {list.data && list.data.total > 10 && (
              <div className="atlas-pagination">
                <button
                  disabled={list.data.page === 1 || list.isFetching}
                  onClick={() => update({ mapPage: String(list.data!.page - 1) })}
                >
                  ← Wstecz
                </button>
                <span>
                  {list.data.page} / {Math.ceil(list.data.total / 10)}
                </span>
                <button
                  disabled={list.data.page * 10 >= list.data.total || list.isFetching}
                  onClick={() => update({ mapPage: String(list.data!.page + 1) })}
                >
                  Dalej →
                </button>
              </div>
            )}
          </aside>
        </div>
      )}
      <p className="atlas-disclaimer">
        {result.data?.unmapped ?? 0} zamówień bez jednoznacznie rozpoznanej miejscowości — są
        dostępne na liście. Punkty nie potwierdzają miejsca realizacji. W szczegółach znajdziesz
        lokalizację wynikającą z analizy, jeśli udało się ją ustalić.
      </p>
    </div>
  );
}
