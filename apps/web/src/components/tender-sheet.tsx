import { TenderOverview } from './tender-overview';
import { SourceReader } from './source-reader';
import { TenderLocation } from './tender-location';
import { ThemeToggle } from './theme-toggle';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import type { Evidence, TenderDetail } from '../../../../packages/contracts/src/index';
import { api } from '../lib/api';
import { date, money, categories } from '../lib/format';
import { missingInformation, analysisErrorMessage } from '../lib/analysis-display';
import { Button } from './ui/button';
import { AnalysisBadge, ErrorState } from './indicators';
import {
  ArrowLeft,
  BookOpen,
  Building2,
  Check,
  CheckCheck,
  Clock3,
  ExternalLink,
  FileSearch,
  FileText,
  Info,
  LoaderCircle,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
function EvidenceView({ evidence }: { evidence: Evidence }) {
  return (
    <details className="evidence">
      <summary>Pokaż cytat ze źródła</summary>
      <blockquote>„{evidence.quote}”</blockquote>
      <span>
        <FileText size={11} />
        {evidence.sourceId.startsWith('pdf:') ? 'Dokument PDF' : evidence.sourceId}
        {evidence.location && <> · {evidence.location}</>}
      </span>
    </details>
  );
}
export function TenderSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [tab, setTab] = useState('overview');
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    setTab('overview');
    setCopied(false);
    if (id) previousFocus.current = document.activeElement as HTMLElement;
  }, [id]);
  const detail = useQuery({
    queryKey: ['tender', id],
    queryFn: ({ signal }) => api<TenderDetail>('/tenders/' + id, signal),
    enabled: !!id,
    refetchInterval: 15000,
  });
  const t = detail.data;
  const a = t?.analysis;
  const hasResult = t?.notices.some((n) => n.current && n.noticeType === 'TenderResultNotice');
  const sourceChanged = !!a && a.inputHash !== t?.contentHash;
  const retryAt = t?.analysisJob?.nextAttemptAt;
  return (
    <Dialog.Root
      open={!!id}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay" />
        <Dialog.Content
          className="tender-sheet"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            previousFocus.current?.focus();
          }}
        >
          <div className="sheet-top">
            <Dialog.Close asChild>
              <Button variant="ghost" aria-label="Zamknij szczegóły">
                <ArrowLeft size={17} /> Wróć do listy
              </Button>
            </Dialog.Close>
            <ThemeToggle />
          </div>
          <Dialog.Title className="sr-only">{t?.title ?? 'Szczegóły zamówienia'}</Dialog.Title>
          <Dialog.Description className="sr-only">
            Analiza, wymagania oraz źródła pobranego ogłoszenia.
          </Dialog.Description>
          {detail.isError ? (
            <ErrorState message={detail.error.message} retry={() => void detail.refetch()} />
          ) : !t ? (
            <div className="sheet-loading">
              <LoaderCircle className="spin" size={24} /> Wczytuję zamówienie…
            </div>
          ) : (
            <>
              <div className="sheet-heading">
                <div className="sheet-tags">
                  <span className="category-tag">{categories[t.category]}</span>
                  {hasResult && (
                    <span className="category-tag result-tag">
                      Postępowanie zakończone · ogłoszono wynik
                    </span>
                  )}
                  {t.isDemo && <span className="demo-tag">DEMO</span>}
                </div>
                <h2>{a?.title ?? t.title}</h2>
                {a?.title !== t.title && a?.title && (
                  <p className="original-title">Oryginalny tytuł: {t.title}</p>
                )}
                <div className="sheet-buyer">
                  <Building2 size={15} />
                  {t.buyer}
                </div>
                <div className="sheet-links">
                  <span>
                    Źródło:{' '}
                    {t.sourceKey.startsWith('pz:')
                      ? 'platformazakupowa.pl · składanie ofert na platformazakupowa.pl'
                      : t.sourceKey.startsWith('bk:')
                        ? 'Baza Konkurencyjności'
                        : t.sourceKey.startsWith('ted:')
                          ? 'TED'
                          : 'BZP'}
                  </span>
                  {t.sourceUrl ? (
                    <a href={t.sourceUrl} target="_blank" rel="noreferrer">
                      Oficjalne źródło <ExternalLink size={13} />
                    </a>
                  ) : (
                    <span>
                      {t.isDemo
                        ? 'Przykładowe ogłoszenie — brak oficjalnego źródła'
                        : 'Bezpośredni adres nie został udostępniony'}
                    </span>
                  )}
                  <span>Zaktualizowano {date(t.updatedAt, true)}</span>
                </div>
              </div>
              <div className="sheet-tabs" role="tablist" aria-label="Sekcje szczegółów">
                {[
                  ['overview', 'Przegląd zamówienia'],
                  ['analysis', 'Analiza AI i warunki'],
                  ['sources', 'Treść i dokumenty'],
                ].map(([v, label]) => (
                  <button
                    key={v}
                    role="tab"
                    id={'tab-' + v}
                    aria-controls={'panel-' + v}
                    aria-selected={tab === v}
                    tabIndex={tab === v ? 0 : -1}
                    className={tab === v ? 'active' : ''}
                    onClick={() => setTab(v!)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                        e.preventDefault();
                        const tabs = ['overview', 'analysis', 'sources'];
                        const index = tabs.indexOf(tab);
                        const next =
                          tabs[
                            (index + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length
                          ]!;
                        setTab(next);
                        document.getElementById('tab-' + next)?.focus();
                      }
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div
                className="sheet-body"
                role="tabpanel"
                id={'panel-' + tab}
                aria-labelledby={'tab-' + tab}
              >
                {tab === 'overview' ? (
                  <TenderOverview tender={t} onSection={setTab} />
                ) : tab === 'analysis' ? (
                  <>
                    <div className="scope-note">
                      <Info size={17} />
                      <span>
                        {a?.scope.materials === 'notice_and_documents'
                          ? 'Analiza ogłoszenia i pobranych dokumentów PDF. Zakres i braki znajdziesz w sekcji Treść i dokumenty.'
                          : 'Analiza na podstawie ogłoszenia — dokumentacja postępowania nie została przeanalizowana.'}
                      </span>
                    </div>
                    {sourceChanged && (
                      <div className="notice-banner">
                        <TriangleAlert size={17} />
                        Zestaw materiałów źródłowych różni się od przeanalizowanego. Poniższa
                        analiza dotyczy wcześniejszego zestawu ogłoszeń.
                      </div>
                    )}
                    {a?.scope.truncated && (
                      <div className="notice-banner">
                        <TriangleAlert size={17} />
                        Materiał skrócono do limitu wejścia. Analiza jest niepełna.
                      </div>
                    )}
                    {t.analysisJob && t.analysisJob.status !== 'completed' && (
                      <div className="analysis-job-note" role="status">
                        <Clock3 size={18} />
                        <div>
                          <strong>
                            {t.analysisJob.status === 'failed'
                              ? 'Automatyczne próby zakończone'
                              : t.analysisJob.status === 'processing'
                                ? 'Trwa przygotowywanie analizy'
                                : t.analysisError
                                  ? 'Zaplanowano ponowną próbę'
                                  : 'Analiza jest w kolejce'}
                          </strong>
                          <p>
                            {t.analysisError
                              ? analysisErrorMessage(t.analysisError)
                              : a
                                ? 'Dotychczasowa analiza pozostaje dostępna podczas przetwarzania nowej.'
                                : 'Wynik pojawi się tutaj automatycznie.'}
                          </p>
                          {retryAt && (
                            <p>
                              Najbliższa próba: {date(retryAt, true)}. Limity dostawcy mogą opóźnić
                              wykonanie.
                            </p>
                          )}
                          <small>
                            Wykonane próby: {t.analysisJob.attempts} z {t.analysisJob.maxAttempts}.
                            Odświeżanie strony nie uruchamia AI.
                          </small>
                          {t.analysisError && (
                            <details>
                              <summary>Szczegóły techniczne</summary>
                              <code>{t.analysisError}</code>
                            </details>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="detail-facts">
                      <div>
                        <span>{hasResult ? 'Status postępowania' : 'Termin składania ofert'}</span>
                        <strong className={hasResult ? '' : 'mono'}>
                          {hasResult
                            ? 'Ogłoszono wynik'
                            : t.deadline
                              ? date(t.deadline, true)
                              : 'Do sprawdzenia w źródle'}
                        </strong>
                        <small>
                          {hasResult
                            ? 'To ogłoszenie o wyniku, a nie zaproszenie do składania ofert.'
                            : t.statusBasis}
                        </small>
                      </div>
                      {a ? (
                        <>
                          <div>
                            <span>Wartość szacunkowa</span>
                            <strong className="mono">
                              {a?.estimatedValue
                                ? money(a.estimatedValue.amount, a.estimatedValue.currency)
                                : 'Nie ustalono'}
                            </strong>
                            <small>
                              {a?.estimatedValue
                                ? a.estimatedValue.basis === 'net'
                                  ? 'Wartość netto z ogłoszenia'
                                  : 'Sprawdź podstawę wartości w źródle'
                                : 'Sprawdź SWZ lub dokumentację zamówienia'}
                            </small>
                          </div>
                          <div>
                            <span>Miejsce realizacji</span>
                            <strong>
                              {a?.executionLocation?.value ?? 'Do sprawdzenia w dokumentacji'}
                            </strong>
                            <small>Siedziba zamawiającego: {t.buyerCity ?? 'nie podano'}</small>
                          </div>
                          <div>
                            <span>Wadium</span>
                            <strong className="mono">
                              {a?.bidBond
                                ? money(a.bidBond.amount, a.bidBond.currency)
                                : 'Do sprawdzenia w SWZ'}
                            </strong>
                            <small>
                              {!a?.bidBond
                                ? 'Brak informacji nie oznacza 0 zł'
                                : 'Kwota wskazana w ogłoszeniu'}
                            </small>
                          </div>
                        </>
                      ) : (
                        <div>
                          <span>Publikacja ogłoszenia</span>
                          <strong>{date(t.publishedAt, true)}</strong>
                          <small>Dane finansowe i warunki wymagają zakończenia analizy.</small>
                        </div>
                      )}
                    </div>
                    <TenderLocation tender={t} />
                    {a ? (
                      <AnalysisContent tender={t} />
                    ) : (
                      <div className="analysis-pending">
                        <Clock3 size={25} />
                        {!t.analysisJob && (
                          <h3>
                            {t.analysisStatus === 'failed'
                              ? 'Analiza zakończona błędem'
                              : 'Analiza oczekuje na przetworzenie'}
                          </h3>
                        )}
                        {!t.analysisJob && <p>{analysisErrorMessage(t.analysisError)}</p>}
                        <p>Możesz już przeczytać pobraną treść ogłoszenia.</p>
                        <Button variant="outline" onClick={() => setTab('sources')}>
                          <FileText size={16} /> Przejdź do źródeł
                        </Button>
                      </div>
                    )}
                    {a && (
                      <div className="analysis-provenance">
                        <ShieldCheck size={14} />
                        <span>Analiza została wygenerowana przez AI.</span>
                      </div>
                    )}
                  </>
                ) : (
                  <SourceReader key={t.id} tender={t} />
                )}
              </div>
              <div className="sheet-footer">
                <span>
                  <ShieldCheck size={13} />
                  <span role="status">
                    {copyFailed
                      ? 'Kopiowanie niedostępne. Skopiuj adres z paska przeglądarki.'
                      : 'Sprawdź warunki w oficjalnej dokumentacji.'}
                  </span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(window.location.href);
                      setCopied(true);
                      setCopyFailed(false);
                    } catch {
                      setCopied(false);
                      setCopyFailed(true);
                    }
                  }}
                >
                  {copied ? <Check size={13} /> : <ExternalLink size={13} />}
                  {copied ? 'Skopiowano' : 'Kopiuj link'}
                </Button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function AnalysisContent({ tender }: { tender: TenderDetail }) {
  const a = tender.analysis!;
  const missing = missingInformation(tender);
  return (
    <>
      <section className="analysis-section">
        <h3>
          <FileSearch size={17} />W skrócie
        </h3>
        <p>{a.summary}</p>
      </section>
      <section className="analysis-section">
        <h3>
          <CheckCheck size={17} />
          Warunki i wymagania <span className="count-pill">{a.requirements.length}</span>
        </h3>
        {a.requirements.length ? (
          a.requirements.map((r, i) => (
            <div className="finding" key={i}>
              <p>
                <Check size={15} />
                {r.text}
              </p>
              <EvidenceView evidence={r.evidence} />
            </div>
          ))
        ) : (
          <p className="muted">
            Nie wyodrębniono wymagań. Nie oznacza to, że postępowanie ich nie zawiera — sprawdź SWZ.
          </p>
        )}
      </section>
      <section className="analysis-section">
        <h3>
          <TriangleAlert size={17} />
          Ryzyka i kwestie do sprawdzenia
        </h3>
        {a.risks.map((r, i) => (
          <div className="finding risk" key={i}>
            <p>{r.text}</p>
            <EvidenceView evidence={r.evidence} />
          </div>
        ))}
        {!a.risks.length && (
          <p className="muted">
            Nie wskazano potwierdzonych ryzyk w analizowanym materiale. Sprawdź pełną dokumentację
            przed złożeniem oferty.
          </p>
        )}
      </section>
      {!!missing.length && (
        <section className="analysis-section missing-section">
          <h3>
            <Info size={17} /> Informacje do uzupełnienia
          </h3>
          <p className="muted">Tych danych nie udało się potwierdzić w analizowanym ogłoszeniu.</p>
          <ul className="missing-list">
            {missing.map((m) => (
              <li key={m}>
                <span />
                {m}
              </li>
            ))}
          </ul>
        </section>
      )}
      {(a.estimatedValue || a.bidBond || a.executionLocation) && (
        <section className="analysis-section">
          <h3>
            <BookOpen size={17} />
            Podstawa ustaleń
          </h3>
          {[a.estimatedValue, a.bidBond, a.executionLocation].map(
            (f, i) => f && <EvidenceView key={i} evidence={f.evidence} />,
          )}
        </section>
      )}
    </>
  );
}
