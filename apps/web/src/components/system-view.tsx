import type { SystemStatus } from '../../../../packages/contracts/src/index';
import { date } from '../lib/format';
import { Stat, ErrorState } from './indicators';
import { Button } from './ui/button';
import { Clock3, Database, LoaderCircle, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
export function SystemView({
  system: s,
  error,
  retry,
}: {
  system?: SystemStatus;
  error?: string;
  retry: () => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">POD KONTROLĄ</div>
          <h1>Status systemu</h1>
          <p>Synchronizacja, kolejka analiz i historia pracy Twojego radaru.</p>
        </div>
        <Button variant="outline" onClick={retry}>
          <RefreshCw size={15} />
          Odśwież status
        </Button>
      </div>
      {error ? (
        <ErrorState message={error} retry={retry} />
      ) : !s ? (
        <div className="empty-state">
          <LoaderCircle className="spin" />
          Wczytywanie statusu…
        </div>
      ) : (
        <>
          {s.ai.pauseReason && (
            <div className="notice-banner" role="status">
              {s.ai.pauseReason}
            </div>
          )}
          <section className="stats">
            <Stat
              label="Zamówienia w bazie"
              value={s.counts.tenders}
              icon={<Database size={18} />}
              hint={`${s.counts.notices} zapisanych wersji`}
            />
            <Stat label="Gotowe analizy" value={s.counts.analyses} icon={<Sparkles size={18} />} />
            <Stat
              label="Zadania w kolejce"
              value={s.counts.queued}
              icon={<Clock3 size={18} />}
              hint={`${s.counts.failed} zakończonych błędem`}
            />
            <Stat
              label="Wywołania AI dzisiaj"
              value={s.ai.usedToday}
              icon={<ShieldCheck size={18} />}
              hint={`Limit: ${s.ai.dailyLimit} / dzień UTC`}
            />
          </section>
          <section className="list-section">
            <div className="list-heading">
              <div className="section-title">
                <h2>Historia synchronizacji</h2>
                <span className="count-pill">{s.sync.logs.length}</span>
              </div>
            </div>
            <div className="table-wrap">
              <table className="sync-table">
                <thead>
                  <tr>
                    <th>ROZPOCZĘCIE</th>
                    <th>STATUS</th>
                    <th>STRONY</th>
                    <th>POBRANE</th>
                    <th>NOWE / ZMIANY</th>
                    <th>BEZ ZMIAN / POZA ZAKRESEM</th>
                    <th>BŁĘDY</th>
                  </tr>
                </thead>
                <tbody>
                  {s.sync.logs.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <span className="mono">{date(l.startedAt, true)}</span>
                        <small className="correlation">
                          {l.sourceId ?? 'bzp'} · ID {l.correlationId.slice(0, 8)}
                        </small>
                      </td>
                      <td>
                        <span
                          className={
                            'sync-badge ' +
                            (l.status === 'completed' && l.errors ? 'partial' : l.status)
                          }
                        >
                          {l.status === 'completed' && l.errors
                            ? 'Zakończona z uwagami'
                            : ((
                                {
                                  completed: 'Zakończona',
                                  running: 'W toku',
                                  partial: 'Do wznowienia',
                                  failed: 'Błąd',
                                  interrupted: 'Przerwana',
                                } as Record<string, string>
                              )[l.status] ?? l.status)}
                        </span>
                        {l.errorSummary && <p className="sync-error">{l.errorSummary}</p>}
                      </td>
                      <td className="mono">{l.pages}</td>
                      <td className="mono">{l.fetched}</td>
                      <td className="mono">
                        {l.created} / {l.changed}
                      </td>
                      <td className="mono">
                        {l.skipped} / {l.filtered ?? 0}
                      </td>
                      <td className="mono">{l.errors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!s.sync.logs.length && (
              <div className="empty-state">
                <Clock3 size={25} />
                <p>Nie wykonano jeszcze synchronizacji. Uruchom worker lub polecenie pnpm sync.</p>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
