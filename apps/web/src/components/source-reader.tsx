import { useState } from 'react';
import type { TenderDetail } from '../../../../packages/contracts/src/index';
import { sourceTopics, sourcePassages } from '../lib/source-reader';
import { Search, ExternalLink, FileText } from 'lucide-react';
import { date } from '../lib/format';
export function SourceReader({ tender: t }: { tender: TenderDetail }) {
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('all');
  const notices = [
    ...t.notices.filter((n) => n.current),
    ...(t.documentTexts ?? []).map((d) => ({
      id: d.sourceId,
      sourceId: d.sourceId,
      noticeNumber: d.text.split('\n')[0] ?? 'Dokument PDF',
      publishedAt: t.publishedAt,
      text: d.text,
    })),
  ];
  const groups = notices.map((n) => ({ n, passages: sourcePassages(n.text, query, topic) }));
  return (
    <div className="document-reader">
      <DocumentInventory tender={t} />
      <div className="reader-heading">
        <div>
          <span className="section-kicker">TEKST ŹRÓDŁOWY</span>
          <h3>Ogłoszenie, bez szukania w ścianie tekstu</h3>
          <p>
            Pełna pobrana treść. Filtry tematyczne wskazują fragmenty według słów kluczowych; nie
            zastępują lektury całości.
          </p>
        </div>
        {t.sourceUrl && (
          <a className="brief-link" href={t.sourceUrl} target="_blank" rel="noreferrer">
            Oryginał
            <ExternalLink size={15} />
          </a>
        )}
      </div>
      <div className="reader-tools">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Szukaj w treści ogłoszenia"
            placeholder="Znajdź słowo lub kwotę w ogłoszeniu…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="reader-topics">
          {sourceTopics.map(([id, label]) => (
            <button key={id} aria-pressed={topic === id} onClick={() => setTopic(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="reader-result" role="status">
        {query || topic !== 'all'
          ? `Znaleziono fragmentów: ${groups.reduce((s, g) => s + g.passages.length, 0)}`
          : 'Wyświetlasz całą pobraną treść ogłoszeń.'}
        {(query || topic !== 'all') && (
          <button
            className="text-button"
            onClick={() => {
              setQuery('');
              setTopic('all');
            }}
          >
            Pokaż całość
          </button>
        )}
      </div>
      {groups.map(({ n, passages }) => (
        <section className="source-text reader-document" key={n.id}>
          <header>
            <FileText size={18} />
            <strong>{n.noticeNumber ?? n.sourceId}</strong>
            <span>Publikacja {date(n.publishedAt)}</span>
          </header>
          {passages.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {!passages.length && (
            <p className="muted">Brak fragmentów pasujących do wybranych filtrów.</p>
          )}
        </section>
      ))}
      <div className="scope-note">
        Treść ogłoszenia została znormalizowana. Zakres analizy obejmuje tylko materiały wymienione
        w analizie; nie wszystkie pliki platformy mogą być dostępne.
      </div>
    </div>
  );
}
function DocumentInventory({ tender: t }: { tender: TenderDetail }) {
  const names: Record<string, string> = {
    extracted: 'Tekst gotowy do analizy',
    extracted_ocr: 'Tekst odczytany przez OCR — zweryfikuj z oryginałem',
    ocr_limit: 'Przekroczono limit stron wymagających OCR',
    cached_stale: 'Zapisana kopia — ponowne pobranie nie powiodło się',
    needs_ocr: 'Skan PDF — wymaga OCR',
    storage_limit: 'Magazyn PDF jest pełny — wymaga sprawdzenia przez administratora',
    file_limit: 'Poza limitem liczby plików',
    analysis_size_limit: 'Tekst zapisany — przekracza limit wejścia AI',
    unsupported_format: 'Format inny niż PDF',
    discovery_failed: 'Nie udało się odczytać strony dokumentacji',
    scan_interrupted: 'Przerwano pobieranie — ponowienie w tle',
    size_limit: 'Plik przekracza limit rozmiaru',
    text_limit: 'Dokument przekracza limit ekstrakcji',
    not_pdf: 'Odpowiedź nie jest plikiem PDF',
    url_blocked: 'Adres niedostępny dla pobierania',
    host_paused: 'Przerwa po błędzie serwera',
    fetch_or_extract_failed: 'Błąd pobierania lub odczytu PDF',
  };
  return (
    <section className="document-inventory">
      <h3>Dokumenty postępowania</h3>
      {t.documentScanPending ? (
        <p role="status">
          Trwa wyszukiwanie i pobieranie załączników. Analiza poczeka na zakończenie tego etapu.
        </p>
      ) : !t.documents?.length ? (
        <p>
          Nie znaleziono dostępnych PDF-ów w obsługiwanych odnośnikach. Nie oznacza to, że
          dokumentacja nie istnieje — sprawdź oficjalną stronę postępowania.
        </p>
      ) : (
        <ul>
          {t.documents.map((d, i) => {
            const included =
              !!d.sourceId &&
              t.analysis?.scope.sourceIds.includes(d.sourceId) &&
              t.analysis.inputHash === t.contentHash;
            return (
              <li key={i}>
                <div>
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noreferrer">
                      {d.name}
                      <ExternalLink size={13} />
                    </a>
                  ) : (
                    <strong>{d.name}</strong>
                  )}
                  <span>
                    {included
                      ? 'Uwzględniono w analizie'
                      : (names[d.status] ?? 'Niedostępny — ponowienie w tle')}
                  </span>
                </div>
                {d.sourceId && <small>{d.sourceId.slice(0, 16)}…</small>}
              </li>
            );
          })}
        </ul>
      )}
      <p>
        PDF-y są odczytywane w całości, bez ucinania tekstu. Pliki poza limitem oraz skany bez
        warstwy tekstowej są oznaczone jako braki.
      </p>
    </section>
  );
}
