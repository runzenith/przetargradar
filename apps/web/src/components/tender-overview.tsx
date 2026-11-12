import type { TenderDetail } from '../../../../packages/contracts/src/index';
import { industryFor, sourceName } from '../../../../packages/contracts/src/discovery';
import { date, money } from '../lib/format';
import { TenderLocation } from './tender-location';
import {
  ArrowUpRight,
  CalendarDays,
  FileText,
  Sparkles,
  Building2,
  Check,
  ArrowRight,
} from 'lucide-react';
export function TenderOverview({
  tender: t,
  onSection,
}: {
  tender: TenderDetail;
  onSection: (s: string) => void;
}) {
  const a = t.analysis?.inputHash === t.contentHash ? t.analysis : null;
  const ended = t.notices.some((n) => n.current && n.noticeType === 'TenderResultNotice');
  const days = t.deadline
    ? Math.ceil((new Date(t.deadline).getTime() - Date.now()) / 86400000)
    : null;
  return (
    <div className="brief-layout">
      <div className="brief-main">
        <section className="brief-section">
          <span className="section-kicker">PRZEDMIOT ZAMÓWIENIA</span>
          <h3>W skrócie</h3>
          <p className="brief-summary">
            {a?.summary ??
              'Ogłoszenie jest już dostępne. Automatyczne podsumowanie pojawi się po zakończeniu analizy. W tym czasie możesz sprawdzić pełną pobraną treść źródłową.'}
          </p>
          <div className="brief-attributes">
            <div>
              <span>Branża według CPV</span>
              <strong>{industryFor(t.cpv)?.label ?? 'Nie sklasyfikowano'}</strong>
            </div>
            <div>
              <span>Kod CPV</span>
              <strong>{t.cpv ?? 'Nie podano'}</strong>
            </div>
            <div>
              <span>Zamawiający</span>
              <strong>{t.buyer}</strong>
            </div>
            <div>
              <span>Siedziba zamawiającego</span>
              <strong>
                {[t.buyerCity, t.buyerRegion].filter(Boolean).join(', ') || 'Nie podano'}
              </strong>
            </div>
          </div>
        </section>
        <section className="brief-section">
          <span className="section-kicker">HARMONOGRAM</span>
          <h3>Terminy i aktualny etap</h3>
          <ol className="procedure-track">
            <li>
              <span className="track-point">
                <Check size={14} />
              </span>
              <div>
                <strong>Publikacja ogłoszenia</strong>
                <span>{date(t.publishedAt, true)}</span>
              </div>
            </li>
            <li>
              <span className="track-point">
                <CalendarDays size={14} />
              </span>
              <div>
                <strong>{ended ? 'Opublikowano wynik' : 'Składanie ofert'}</strong>
                <span>{ended ? 'Postępowanie zakończone' : date(t.deadline, true)}</span>
                <small>{ended ? 'Sprawdź rozstrzygnięcie w źródle' : t.statusBasis}</small>
              </div>
            </li>
          </ol>
        </section>
        <section className="brief-section">
          <span className="section-kicker">WARUNKI UDZIAŁU</span>
          <h3>Warunki, które trzeba sprawdzić</h3>
          {a?.requirements.length ? (
            <ul className="brief-requirements">
              {a.requirements.slice(0, 4).map((r, i) => (
                <li key={i}>
                  <Check size={15} />
                  <span>{r.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              Wymagania nie zostały jeszcze potwierdzone. Zweryfikuj warunki udziału w oryginalnej
              dokumentacji.
            </p>
          )}
          <button className="brief-link" onClick={() => onSection('analysis')}>
            Otwórz analizę i cytaty źródłowe <ArrowRight size={16} />
          </button>
        </section>
        <TenderLocation tender={t} />
      </div>
      <aside className="brief-side">
        <section className="deadline-panel">
          <span>
            <CalendarDays size={16} />
            {ended ? 'Status postępowania' : 'Termin składania ofert'}
          </span>
          <strong>{ended ? 'Ogłoszono wynik' : date(t.deadline, true)}</strong>
          <p>
            {ended
              ? 'To nie jest zaproszenie do składania ofert.'
              : days === null
                ? 'Termin wymaga sprawdzenia w źródle.'
                : days < 0
                  ? 'Termin wskazany w ogłoszeniu upłynął.'
                  : days === 0
                    ? 'Termin upływa dzisiaj.'
                    : `Na przygotowanie oferty pozostało ${days} dni.`}
          </p>
          {t.sourceUrl && (
            <a className="primary-source" href={t.sourceUrl} target="_blank" rel="noreferrer">
              Otwórz oficjalne ogłoszenie
              <ArrowUpRight size={16} />
            </a>
          )}
        </section>
        <section className="brief-finances">
          <h3>Budżet i zabezpieczenia</h3>
          <dl>
            <div>
              <dt>Wartość szacunkowa</dt>
              <dd>
                {t.estimatedValue ? money(t.estimatedValue, t.currency) : 'Nie podano'}
                {t.estimatedValue && (
                  <small>
                    {t.valueBasis === 'net'
                      ? 'netto'
                      : t.valueBasis === 'gross'
                        ? 'brutto'
                        : 'Podstawa nieokreślona'}
                  </small>
                )}
              </dd>
            </div>
            <div>
              <dt>Wadium</dt>
              <dd>
                {a?.bidBond ? money(a.bidBond.amount, a.bidBond.currency) : 'Sprawdź dokumentację'}
              </dd>
            </div>
          </dl>
          <p>Brak kwoty w ogłoszeniu nie oznacza, że wadium nie jest wymagane.</p>
        </section>
        <section className="brief-materials">
          <h3>
            <FileText size={17} /> Materiały źródłowe
          </h3>
          <p>
            {t.notices.filter((n) => n.current).length} aktualnych ogłoszeń ·{' '}
            {sourceName(t.sourceKey)}
          </p>
          <button className="brief-link" onClick={() => onSection('sources')}>
            Czytaj pobraną treść
            <ArrowRight size={16} />
          </button>
          <div className="material-scope">
            <Sparkles size={16} />
            <span>
              {a
                ? 'Analiza została wygenerowana przez AI.'
                : 'Analiza ogłoszenia jest przygotowywana w tle.'}{' '}
              {t.documentScanPending
                ? ' Trwa pobieranie dokumentów.'
                : ` PDF-y uwzględnione w bieżącym zestawie: ${t.documents?.filter((d) => d.status.startsWith('extracted')).length ?? 0}. Sprawdź zakres w sekcji Treść i dokumenty.`}
            </span>
          </div>
        </section>
      </aside>
    </div>
  );
}
