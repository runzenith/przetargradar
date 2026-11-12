import { WorkspaceHeader } from './components/workspace-header';
import { DiscoveryFilters, discoveryKeys } from './components/discovery-filters';
import { TenderCard } from './components/tender-card';
import { useState, useEffect } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapExplorer } from './components/map-explorer';
import type { SystemStatus, TenderList } from '../../../packages/contracts/src/index';
import { api, mutate, setCsrf } from './lib/api';
import { useUrl } from './hooks/use-url';
import { ErrorState } from './components/indicators';
import { Select } from './components/select';
import { TenderSheet } from './components/tender-sheet';
import { AuthView, ProfileView, type Identity } from './components/account';
import { SystemView } from './components/system-view';
import { Button } from './components/ui/button';
import {
  ArrowDownUp,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  MapPinned,
  FileSearch,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
export default function App() {
  const { params, update } = useUrl();
  const view = params.get('view') ?? 'tenders';
  const client = useQueryClient();
  const identity = useQuery({
    queryKey: ['identity'],
    queryFn: () => api<Identity>('/auth/me'),
    staleTime: 60000,
  });
  useEffect(() => setCsrf(identity.data?.csrf ?? null), [identity.data]);
  const states = useQuery({
    queryKey: ['user-states', identity.data?.user?.id],
    queryFn: () =>
      api<{
        states: {
          tenderId: string;
          saved: boolean;
          readAt: string | null;
        }[];
      }>('/user/tenders'),
    enabled: !!identity.data?.user,
  });
  const selected = params.get('tender');
  const system = useQuery({
    queryKey: ['system'],
    queryFn: ({ signal }) => api<SystemStatus>('/system', signal),
    refetchInterval: 60000,
  });
  const rawSearch = params.get('q') ?? '';
  const [searchTerm, setSearchTerm] = useState(rawSearch);
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(rawSearch), 300);
    return () => clearTimeout(timer);
  }, [rawSearch]);
  const query = new URLSearchParams({ pageSize: '12' });
  for (const key of [...discoveryKeys, 'sort', 'page'])
    if (key !== 'q' && params.get(key)) query.set(key, params.get(key)!);
  if (searchTerm) query.set('q', searchTerm);
  if (view === 'saved' || view === 'recommended') query.set('view', view);
  const list = useQuery({
    queryKey: ['tenders', query.toString(), identity.data?.user?.id],
    queryFn: ({ signal }) => api<TenderList>('/tenders?' + query, signal),
    placeholderData: keepPreviousData,
    enabled: view !== 'map' && (!['saved', 'recommended'].includes(view) || !!identity.data?.user),
    refetchInterval: 60000,
  });
  const data = list.data;
  const setFilter = (key: string, value: string) => update({ [key]: value, page: null });
  const filterCount = discoveryKeys.filter((k) => params.has(k)).length;
  const save = async (id: string, saved: boolean) => {
    try {
      await mutate('/user/tenders/' + id, 'PUT', { saved });
      await client.invalidateQueries({ queryKey: ['user-states'] });
      await client.invalidateQueries({ queryKey: ['tenders'] });
    } catch (e) {
      window.alert((e as Error).message);
    }
  };
  const isDemo = system.data?.mode === 'DEMO';
  if (
    view === 'auth' ||
    (['profile', 'saved', 'recommended'].includes(view) &&
      !identity.data?.user &&
      !identity.isPending)
  )
    return (
      <AuthView
        onDone={() => {
          void identity.refetch();
          update({ view: 'tenders' });
        }}
      />
    );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Przejdź do treści
      </a>
      <div className="main-shell">
        <WorkspaceHeader
          view={view}
          source={params.get('source')}
          user={identity.data?.user ?? null}
          onNavigate={update}
          onLogout={async () => {
            await mutate('/auth/logout', 'POST', {});
            setCsrf(null);
            client.clear();
            window.location.href = '/';
          }}
        />
        <main id="main">
          {view === 'map' ? (
            <MapExplorer params={params} update={update} onOpen={(id) => update({ tender: id })} />
          ) : view === 'profile' ? (
            <ProfileView />
          ) : view === 'system' ? (
            <SystemView
              system={system.data}
              error={system.error?.message}
              retry={() => void system.refetch()}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">BZP · TED · Baza Konkurencyjności</div>
                  <h1>
                    {view === 'saved'
                      ? 'Zapisane zamówienia'
                      : view === 'recommended'
                        ? 'Dla Ciebie'
                        : 'Zamówienia publiczne'}
                  </h1>
                  {view === 'recommended' && (
                    <p>
                      Oferty dopasowane do branży, usług i regionów Twojej firmy.{' '}
                      <button className="text-button" onClick={() => update({ view: 'profile' })}>
                        Edytuj profil
                      </button>
                    </p>
                  )}
                  <p>
                    Wyszukuj po branży i lokalizacji. Porównaj warunki i terminy składania ofert.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    void list.refetch();
                    void system.refetch();
                  }}
                  disabled={list.isFetching}
                >
                  <RefreshCw size={15} className={list.isFetching ? 'spin' : ''} /> Odśwież wyniki
                </Button>
              </div>
              {isDemo && (
                <div className="demo-banner">
                  <span className="demo-tag">DEMO</span>
                  <p>
                    Odkryj, jak działa PrzetargRadar. Oglądasz przykładowe ogłoszenia i analizy.
                  </p>
                </div>
              )}
              <DiscoveryFilters params={params} update={update} cities={data?.cities} />
              <div className="market-pulse">
                <span>
                  <strong>{data?.stats.total ?? '—'}</strong> zamówień w bazie
                </span>
                <span>
                  <strong>{data?.stats.active ?? '—'}</strong> otwartych postępowań
                </span>
                <button onClick={() => update({ view: 'map' })}>
                  <MapPinned size={15} /> Przeglądaj na mapie <ArrowUpRight size={14} />
                </button>
              </div>
              <section className="list-section" aria-label="Lista zamówień">
                <div className="results-bar">
                  <span>
                    {params.get('q') || filterCount ? 'Znaleziono' : 'Wyświetlasz'}{' '}
                    <strong>{data?.total ?? '—'}</strong> zamówień
                    {filterCount > 0 && (
                      <button
                        className="text-button clear-filters"
                        onClick={() =>
                          update({
                            ...Object.fromEntries([...discoveryKeys, 'page'].map((k) => [k, null])),
                          })
                        }
                      >
                        Wyczyść filtry <X size={12} />
                      </button>
                    )}
                  </span>
                  <div className="sort">
                    <ArrowDownUp size={13} />
                    <Select
                      label="Sortowanie"
                      value={params.get('sort') ?? 'published_desc'}
                      onChange={(v) => setFilter('sort', v)}
                      options={[
                        ['published_desc', 'Najnowsze najpierw'],
                        ['deadline_asc', 'Najbliższy termin'],
                        ['title_asc', 'Tytuł A–Z'],
                      ]}
                    />
                  </div>
                </div>
                {list.isError ? (
                  <ErrorState message={list.error.message} retry={() => void list.refetch()} />
                ) : list.isPending ? (
                  <div
                    className="skeleton-table"
                    aria-label="Wczytywanie zamówień"
                    aria-busy="true"
                  >
                    {Array.from({ length: 7 }, (_, i) => (
                      <div className="skeleton-row" key={i} />
                    ))}
                  </div>
                ) : data?.items.length === 0 ? (
                  <div className="empty-state">
                    <FileSearch size={32} />
                    <h3>Radar nie znalazł zamówień</h3>
                    <p>Zmień wyszukiwanie lub wyczyść filtry, aby zobaczyć więcej wyników.</p>
                    <Button
                      variant="outline"
                      onClick={() =>
                        update({
                          ...Object.fromEntries([...discoveryKeys, 'page'].map((k) => [k, null])),
                        })
                      }
                    >
                      Wyczyść wyszukiwanie
                    </Button>
                  </div>
                ) : (
                  <div className="opportunity-list" aria-busy={list.isFetching}>
                    {data?.items.map((tender) => (
                      <TenderCard
                        key={tender.id}
                        tender={tender}
                        onOpen={() => {
                          update({ tender: tender.id });
                          if (identity.data?.user)
                            void mutate('/user/tenders/' + tender.id, 'PUT', {
                              read: true,
                            }).then(() => client.invalidateQueries({ queryKey: ['user-states'] }));
                        }}
                        saved={
                          states.data?.states.some((s) => s.tenderId === tender.id && s.saved) ??
                          false
                        }
                        onSave={
                          identity.data?.user
                            ? () =>
                                void save(
                                  tender.id,
                                  !states.data?.states.some(
                                    (s) => s.tenderId === tender.id && s.saved,
                                  ),
                                )
                            : undefined
                        }
                        match={(
                          data as TenderList & {
                            matches?: {
                              tenderId: string;
                              score: number;
                              explanation: string;
                            }[];
                          }
                        )?.matches?.find((m) => m.tenderId === tender.id)}
                      />
                    ))}
                  </div>
                )}
                {data && (
                  <div className="pagination">
                    <span>
                      {data.total
                        ? `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)}`
                        : '0'}{' '}
                      z {data.total} zamówień
                    </span>
                    <div>
                      {data.page > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Pierwsza strona"
                          disabled={list.isPlaceholderData}
                          onClick={() => update({ page: null })}
                        >
                          Pierwsza
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Poprzednia strona"
                        disabled={data.page <= 1 || list.isPlaceholderData}
                        onClick={() => update({ page: String(data.page - 1) })}
                      >
                        <ChevronLeft size={16} />
                      </Button>
                      <span className="pagination-label">Strona</span>
                      <span className="page-number" aria-current="page">
                        {data.page}
                      </span>
                      <span className="page-total">
                        z {Math.max(1, Math.ceil(data.total / data.pageSize))}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Następna strona"
                        disabled={data.page * data.pageSize >= data.total || list.isPlaceholderData}
                        onClick={() => update({ page: String(data.page + 1) })}
                      >
                        <ChevronRight size={16} />
                      </Button>
                    </div>
                  </div>
                )}
              </section>
              <footer className="content-footer">
                <span>
                  <ShieldCheck size={14} /> Oficjalne źródła · BZP, TED, BK i platformazakupowa.pl
                </span>
                <span>Warunki składania ofert znajdziesz w dokumentacji zamawiającego.</span>
              </footer>
            </>
          )}
        </main>
      </div>

      <TenderSheet id={selected} onClose={() => update({ tender: null })} />
    </div>
  );
}
