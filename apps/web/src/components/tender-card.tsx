import type { TenderRow } from '../../../../packages/contracts/src/index';
import { industryFor, sourceName } from '../../../../packages/contracts/src/discovery';
import { date, money, categories } from '../lib/format';
import { AnalysisBadge } from './indicators';
import { ArrowUpRight, Bookmark, MapPin, Building2, CalendarDays } from 'lucide-react';
export function TenderCard({
  tender: t,
  onOpen,
  saved,
  onSave,
  match,
}: {
  tender: TenderRow;
  onOpen: () => void;
  saved?: boolean;
  onSave?: () => void;
  match?: {
    score: number;
    explanation: string;
  };
}) {
  const days = t.deadline
    ? Math.ceil((new Date(t.deadline).getTime() - Date.now()) / 86400000)
    : null;
  const open = t.status !== 'closed' && days !== null && days >= 0;
  const source = sourceName(t.sourceKey);
  return (
    <article className="opportunity-card tile-card">
      <div className="tile-content">
        <div className="tile-topline">
          <div className="tile-budget">
            <span>Szacunek</span>
            <strong>
              {t.estimatedValue ? money(t.estimatedValue, t.currency) : 'Nie podano'}
              {t.estimatedValue && (
                <small>
                  {t.valueBasis === 'net' ? 'netto' : t.valueBasis === 'gross' ? 'brutto' : ''}
                </small>
              )}
            </strong>
          </div>
          <span
            className="tile-industry"
            title={industryFor(t.cpv)?.label ?? categories[t.category]}
          >
            {industryFor(t.cpv)?.label ?? categories[t.category]}
          </span>
        </div>
        <h3>
          <button onClick={onOpen} title={t.title}>
            {t.title}
          </button>
        </h3>
        <dl className="tile-facts">
          <div>
            <dt>
              <CalendarDays size={16} />
              <span>Publikacja</span>
            </dt>
            <dd>{date(t.publishedAt)}</dd>
          </div>
          <div className="tile-deadline">
            <dt>
              <CalendarDays size={16} />
              <span>Termin</span>
            </dt>
            <dd>
              <strong>{date(t.deadline)}</strong>
              <small className={open && days! <= 5 ? 'deadline-soon' : ''}>
                {open
                  ? days === 0
                    ? 'Dzisiaj'
                    : `Za ${days} dni`
                  : t.status === 'closed'
                    ? 'Zakończone'
                    : 'Do sprawdzenia'}
              </small>
            </dd>
          </div>
          <div className="tile-place">
            <dt>
              <MapPin size={16} />
              <span className="sr-only">Siedziba zamawiającego</span>
            </dt>
            <dd title={[t.buyerCity, t.buyerRegion].filter(Boolean).join(', ')}>
              {t.buyerCity ?? 'Lokalizacja niepodana'}
              {t.buyerRegion && <small>{t.buyerRegion}</small>}
            </dd>
            <span className="tile-source" title={source}>
              {t.sourceKey.startsWith('ted:')
                ? 'TED'
                : t.sourceKey.startsWith('bk:')
                  ? 'BK'
                  : t.sourceKey.startsWith('pz:')
                    ? 'PZ'
                    : 'BZP'}
            </span>
          </div>
          <div className="tile-buyer">
            <dt>
              <Building2 size={16} />
              <span className="sr-only">Zamawiający</span>
            </dt>
            <dd title={t.buyer}>{t.buyer}</dd>
          </div>
        </dl>
        {match && (
          <p className="tile-match" title={match.explanation}>
            Dopasowanie {match.score}/100
          </p>
        )}
      </div>
      <footer className="tile-footer">
        <div className="tile-tools">
          <AnalysisBadge status={t.analysisStatus} />
          {onSave && (
            <button className="bookmark-action" aria-pressed={saved} onClick={onSave}>
              <Bookmark size={16} fill={saved ? 'currentColor' : 'none'} />
              {saved ? 'Zapisane' : 'Zapisz'}
            </button>
          )}
        </div>
        <button className="tile-open" onClick={onOpen}>
          Zobacz szczegóły
          <ArrowUpRight size={17} />
        </button>
      </footer>
    </article>
  );
}
