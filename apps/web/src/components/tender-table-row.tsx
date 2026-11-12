import type { TenderRow } from '../../../../packages/contracts/src/index';
import { date, money, categories } from '../lib/format';
import { AnalysisBadge } from './indicators';
import { Star, Building2, ChevronRight, Database, FileText, MapPin } from 'lucide-react';
export function TenderTableRow({
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
  return (
    <tr>
      <td className="title-cell">
        {onSave && (
          <button
            className="save-button"
            aria-label={saved ? 'Usuń z zapisanych' : 'Zapisz zamówienie'}
            aria-pressed={saved}
            onClick={onSave}
          >
            <Star size={15} fill={saved ? 'currentColor' : 'none'} />
          </button>
        )}
        {match && (
          <span className="match-score" title={match.explanation}>
            {match.score}/100 · {match.explanation}
          </span>
        )}
        <div className="tender-title-line">
          <span className={'category-icon ' + t.category}>
            {t.category === 'works' ? (
              <Building2 size={17} />
            ) : t.category === 'supplies' ? (
              <Database size={17} />
            ) : (
              <FileText size={17} />
            )}
          </span>
          <div>
            <button className="tender-title" onClick={onOpen}>
              {t.title}
            </button>
            <div className="tender-meta">
              <span>{categories[t.category]}</span>
              <span>
                {t.sourceKey.startsWith('pz:')
                  ? 'platformazakupowa.pl · ofertowanie w źródle'
                  : t.sourceKey.startsWith('bk:')
                    ? 'Baza Konkurencyjności'
                    : t.sourceKey.startsWith('ted:')
                      ? 'TED'
                      : 'BZP'}
              </span>
              <i />
              {t.cpv && <span className="mono">{t.cpv}</span>}
              {t.status === 'closed' && <span className="closed-badge">Zakończone</span>}
            </div>
          </div>
        </div>
      </td>
      <td className="buyer-cell">
        <span>{t.buyer}</span>
        <div>
          <MapPin size={11} />
          {t.buyerCity ?? 'Nie podano'}
          <span className="buyer-location-label"> · zamawiający</span>
        </div>
      </td>
      <td className="deadline-cell">
        <span className="mono">{date(t.deadline)}</span>
        <span className={days !== null && days >= 0 && days <= 5 ? 'deadline-soon' : 'muted'}>
          {t.status === 'closed'
            ? 'Termin upłynął / wynik'
            : days === null
              ? 'Do sprawdzenia'
              : days < 0
                ? 'Termin upłynął'
                : days === 0
                  ? 'Dzisiaj'
                  : `Za ${days} dni`}
        </span>
      </td>
      <td className={'value-cell ' + (!t.estimatedValue ? 'unknown-value' : '')}>
        <span className="mono">{money(t.estimatedValue, t.currency)}</span>
        {t.estimatedValue && (
          <span className="muted">
            {t.valueBasis === 'net'
              ? 'netto'
              : t.valueBasis === 'gross'
                ? 'brutto'
                : 'podstawa nieokreślona'}
          </span>
        )}
      </td>
      <td>
        <AnalysisBadge status={t.analysisStatus} />
      </td>
      <td className="arrow-col">
        <button
          className="row-arrow icon-button"
          aria-label={'Szczegóły: ' + t.title}
          onClick={onOpen}
        >
          <ChevronRight size={17} />
        </button>
      </td>
    </tr>
  );
}
