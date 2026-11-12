import { useState } from 'react';
import { Search, X, SlidersHorizontal, MapPin, ArrowUpRight } from 'lucide-react';
import { industries, regions, sources } from '../../../../packages/contracts/src/discovery';
import { Select } from './select';
export const discoveryKeys = [
  'q',
  'industry',
  'category',
  'region',
  'city',
  'status',
  'source',
  'published',
  'deadlineDays',
  'analysis',
];
export function DiscoveryFilters({
  params,
  update,
  cities = [],
}: {
  params: URLSearchParams;
  update: (c: Record<string, string | null>) => void;
  cities?: string[];
}) {
  const [advanced, setAdvanced] = useState(false);
  const set = (key: string, value: string) =>
    update({ [key]: value, page: null, ...(key === 'region' ? { city: null } : {}) });
  const chips = discoveryKeys.filter((k) => params.has(k));
  const labels: Record<string, string> = {
    q: 'Szukaj',
    industry: 'Branża',
    category: 'Rodzaj',
    region: 'Region',
    city: 'Miasto',
    source: 'Źródło',
    published: 'Publikacja',
    deadlineDays: 'Termin',
    analysis: 'Analiza',
    status: 'Status',
  };
  const valueLabel = (k: string) => {
    const v = params.get(k)!;
    return (
      industries.find((i) => i.id === v)?.label ??
      sources.find(([id]) => id === v)?.[1] ??
      (
        {
          active: 'Otwarte',
          closed: 'Zakończone',
          unknown: 'Do sprawdzenia',
          today: 'Dzisiaj',
          week: 'Ostatnie 7 dni',
          completed: 'Przeanalizowane',
          works: 'Roboty budowlane',
          services: 'Usługi',
          supplies: 'Dostawy',
          other: 'Pozostałe',
        } as Record<string, string>
      )[v] ??
      (k === 'deadlineDays' ? `Do ${v} dni` : v)
    );
  };
  return (
    <section className="discovery-search" aria-label="Wyszukiwarka przetargów">
      <div className="discovery-search-main">
        <div className="search-input">
          <Search size={20} />
          <input
            aria-label="Szukaj zamówień"
            placeholder="Nazwa zamówienia, zamawiający lub kod CPV"
            value={params.get('q') ?? ''}
            onChange={(e) => set('q', e.target.value)}
          />
          {params.get('q') && (
            <button
              aria-label="Wyczyść wyszukiwanie"
              className="icon-button"
              onClick={() => set('q', '')}
            >
              <X size={16} />
            </button>
          )}
        </div>
        <Select
          label="Branża"
          value={params.get('industry') ?? 'all'}
          onChange={(v) => set('industry', v)}
          options={[
            ['all', 'Wszystkie branże'],
            ...industries.map((i) => [i.id, i.label] as [string, string]),
          ]}
        />
        <Select
          label="Województwo zamawiającego"
          value={params.get('region') ?? 'all'}
          onChange={(v) => set('region', v)}
          options={[['all', 'Cała Polska'], ...regions.map((r) => [r, r] as [string, string])]}
        />
      </div>
      <div className="discovery-quick">
        <span className="filter-caption">Szybki wybór</span>
        {[
          ['status', 'active', 'Tylko otwarte'],
          ['published', 'today', 'Nowe dzisiaj'],
          ['deadlineDays', '14', 'Termin do 14 dni'],
          ['analysis', 'completed', 'Z podsumowaniem'],
        ].map(([k, v, label]) => (
          <button
            key={k}
            aria-pressed={params.get(k!) === v}
            onClick={() => set(k!, params.get(k!) === v ? 'all' : v!)}
          >
            {label}
          </button>
        ))}
        <button
          className="advanced-toggle"
          aria-expanded={advanced}
          onClick={() => setAdvanced(!advanced)}
        >
          <SlidersHorizontal size={15} /> Wszystkie filtry
        </button>
      </div>
      {advanced && (
        <div className="discovery-advanced">
          <label>
            Miasto zamawiającego
            <CityPicker
              value={params.get('city') ?? ''}
              cities={cities}
              onChange={(v) => set('city', v)}
            />
          </label>
          <label>
            Źródło
            <Select
              label="Źródło ogłoszenia"
              value={params.get('source') ?? 'all'}
              onChange={(v) => set('source', v)}
              options={[['all', 'Wszystkie źródła'], ...sources]}
            />
          </label>
          <label>
            Rodzaj zamówienia
            <Select
              label="Rodzaj zamówienia"
              value={params.get('category') ?? 'all'}
              onChange={(v) => set('category', v)}
              options={[
                ['all', 'Każdy rodzaj'],
                ['works', 'Roboty budowlane'],
                ['services', 'Usługi'],
                ['supplies', 'Dostawy'],
                ['other', 'Pozostałe'],
              ]}
            />
          </label>
          <label>
            Status
            <Select
              label="Status postępowania"
              value={params.get('status') ?? 'all'}
              onChange={(v) => set('status', v)}
              options={[
                ['all', 'Każdy status'],
                ['active', 'Otwarte'],
                ['closed', 'Zakończone'],
                ['unknown', 'Do sprawdzenia'],
              ]}
            />
          </label>
          <label>
            Data publikacji
            <Select
              label="Data publikacji"
              value={params.get('published') ?? 'all'}
              onChange={(v) => set('published', v)}
              options={[
                ['all', 'Dowolna data'],
                ['today', 'Dzisiaj'],
                ['week', 'Ostatnie 7 dni'],
              ]}
            />
          </label>
          <label>
            Termin składania
            <Select
              label="Termin składania"
              value={params.get('deadlineDays') ?? 'all'}
              onChange={(v) => set('deadlineDays', v)}
              options={[
                ['all', 'Dowolny termin'],
                ['7', 'Do 7 dni'],
                ['14', 'Do 14 dni'],
                ['30', 'Do 30 dni'],
              ]}
            />
          </label>
        </div>
      )}
      {!!chips.length && (
        <div className="active-filters" aria-label="Aktywne filtry">
          {chips.map((k) => (
            <button key={k} onClick={() => set(k, 'all')} aria-label={`Usuń filtr: ${labels[k]}`}>
              <span>{labels[k]}:</span> {valueLabel(k)}
              <X size={12} />
            </button>
          ))}
          <button
            className="text-button"
            onClick={() =>
              update(Object.fromEntries([...discoveryKeys, 'page'].map((k) => [k, null])))
            }
          >
            Wyczyść wszystko
          </button>
        </div>
      )}
      {!chips.length && (
        <div className="discovery-suggestions">
          <span>Odkrywaj branże</span>
          {industries.slice(0, 6).map((i) => (
            <button key={i.id} onClick={() => set('industry', i.id)}>
              {i.label}
              <ArrowUpRight size={12} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
function CityPicker({
  value,
  cities,
  onChange,
}: {
  value: string;
  cities: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(-1);
  const choices = cities
    .filter((c) => c.toLocaleLowerCase('pl').includes(value.toLocaleLowerCase('pl')))
    .slice(0, 30);
  return (
    <div className="city-picker">
      <div className="city-field">
        <MapPin size={15} />
        <input
          role="combobox"
          aria-label="Miasto zamawiającego"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="city-options"
          aria-activedescendant={open && active >= 0 ? `city-option-${active}` : undefined}
          placeholder="Wpisz lub wybierz miasto"
          value={value}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive(Math.min(active + 1, choices.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive(Math.max(0, active - 1));
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setOpen(false);
            } else if (e.key === 'Enter' && open && choices[active]) {
              e.preventDefault();
              onChange(choices[active]!);
              setOpen(false);
            }
          }}
        />
      </div>
      {open && (
        <div id="city-options" role="listbox" aria-label="Miasta w bazie" className="city-options">
          {choices.map((c, i) => (
            <button
              type="button"
              id={`city-option-${i}`}
              role="option"
              aria-selected={active === i}
              key={c}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
            >
              {c}
            </button>
          ))}
          {!choices.length && <p>Brak podpowiedzi dla tego miasta.</p>}
        </div>
      )}
    </div>
  );
}
