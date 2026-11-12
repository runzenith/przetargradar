import { lazy, Suspense, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPinned, ArrowUpRight } from 'lucide-react';
import type { TenderDetail } from '../../../../packages/contracts/src/index';
import { api } from '../lib/api';
import type { MapPoint } from './radar-map';
const RadarMap = lazy(() => import('./radar-map').then((m) => ({ default: m.RadarMap })));
type Place = Omit<MapPoint, 'count' | 'city' | 'buyerRegion'> & {
  approximate?: boolean;
};
export function TenderLocation({ tender: t }: { tender: TenderDetail }) {
  const execution =
    t.analysis?.inputHash === t.contentHash ? t.analysis.executionLocation?.value : null;
  const query = useQuery({
    queryKey: ['location-v2', t.id, execution, t.buyerCity, t.buyerRegion],
    queryFn: async () => {
      const lookup = async (city: string | null | undefined, region?: string | null) =>
        city
          ? (
              await api<{
                place: Place | null;
              }>('/map/location?' + new URLSearchParams({ city, ...(region ? { region } : {}) }))
            ).place
          : null;
      const [work, buyer] = await Promise.all([
        lookup(execution),
        (async () => {
          const structured = await lookup(t.buyerCity, t.buyerRegion);
          if (structured) return structured;
          const source = t.notices
            .filter((n) => n.current)
            .map((n) => n.text)
            .join(' ');
          const official = source.match(
            /Miejscowość\s*:\s*(.{2,100}?)(?=\s+\d[.)]|\s+Kod|\s+Wojew|$)/i,
          )?.[1];
          return (await lookup(official, t.buyerRegion)) ?? (await lookup(t.buyer, t.buyerRegion));
        })(),
      ]);
      return { place: work ?? buyer, isExecution: !!work };
    },
    staleTime: Infinity,
  });
  const place = query.data?.place;
  const points = useMemo<MapPoint[]>(
    () => (place ? [{ ...place, count: 1, city: place.name, buyerRegion: place.region }] : []),
    [place],
  );
  return (
    <section className="tender-location analysis-section">
      <div className="location-heading">
        <div>
          <h3>
            <MapPinned size={19} />
            Lokalizacja zamówienia
          </h3>
          <p>
            {query.data?.isExecution
              ? 'Miejscowość realizacji wskazana w analizowanym ogłoszeniu'
              : 'Siedziba zamawiającego · miejsce realizacji nie zostało zlokalizowane'}
          </p>
        </div>
        <a
          className="text-button"
          href={
            '/?' +
            new URLSearchParams({
              view: 'map',
              ...(t.buyerCity ? { city: t.buyerCity, cityRegion: t.buyerRegion ?? '' } : {}),
            })
          }
        >
          Otwórz mapę zamówień <ArrowUpRight size={15} />
        </a>
      </div>
      {query.isPending ? (
        <div className="location-unavailable">Ustalam lokalizację…</div>
      ) : place ? (
        <>
          <Suspense fallback={<div className="location-unavailable">Wczytuję mapę…</div>}>
            <RadarMap points={points} compact />
          </Suspense>
          <div className="location-caption">
            <strong>
              {place.name}
              {place.approximate ? ' · lokalizacja przybliżona' : ''}
            </strong>
            <span>{place.region} · środek miejscowości, nie adres inwestycji</span>
          </div>
        </>
      ) : (
        <div className="location-unavailable">
          <MapPinned size={25} />
          <strong>
            {query.isError
              ? 'Nie udało się pobrać lokalizacji'
              : 'Brak jednoznacznej lokalizacji na mapie'}
          </strong>
          <p>
            {execution
              ? 'Miejsce podane w analizie: ' + execution
              : 'Siedziba zamawiającego: ' + (t.buyerCity ?? 'nie podano')}
            . Sprawdź dokładny obszar w dokumentacji.
          </p>
        </div>
      )}
    </section>
  );
}
