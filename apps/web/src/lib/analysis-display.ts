import type { TenderDetail } from '../../../../packages/contracts/src/index';
const missingLabels: Record<string, string> = {
  estimatedValue: 'Wartość szacunkowa — sprawdź dokumentację postępowania.',
  bidBond: 'Wadium — sprawdź, czy jest wymagane i w jakiej wysokości.',
  deadline: 'Termin składania ofert — sprawdź aktualny termin w oficjalnym źródle.',
  executionLocation: 'Miejsce realizacji — sprawdź lokalizację wskazaną w dokumentacji.',
  requirements: 'Warunki udziału — sprawdź pełne wymagania w dokumentacji.',
  cpv: 'Kod CPV — sprawdź klasyfikację zamówienia w źródle.',
};
export function missingInformation(t: TenderDetail): string[] {
  const a = t.analysis;
  if (!a) return [];
  const resultOnly = t.notices.some((n) => n.current && n.noticeType === 'TenderResultNotice');
  return [
    ...new Set(
      a.missingInformation.flatMap((value) => {
        if (value.trim().startsWith('Materiał skrócono')) return [];
        const key = value
          .trim()
          .replace(/^(analysis\.)/, '')
          .replace(/\.(amount|value)$/, '');
        if (
          (key === 'deadline' && (t.deadline || resultOnly)) ||
          (key === 'estimatedValue' && a.estimatedValue) ||
          (key === 'bidBond' && a.bidBond) ||
          (key === 'executionLocation' && a.executionLocation)
        )
          return [];
        if (missingLabels[key]) return [missingLabels[key]!];
        if (/^[a-zA-Z][\w.]*$/.test(key))
          return ['Sprawdź kompletność informacji w dokumentacji postępowania.'];
        return [value];
      }),
    ),
  ];
}
export function analysisErrorMessage(code: string | null): string {
  if (code?.includes('AI_INPUT_TOO_LARGE'))
    return 'Całe ogłoszenie nie mieści się w limitach dostępnych dostawców. Treść nie została skrócona; administrator musi dostosować konfigurację.';
  if (!code) return 'Serwer przygotuje analizę automatycznie w tle.';
  if (/^AI_(SCHEMA|JSON|EVIDENCE)/.test(code))
    return 'Odpowiedź AI nie przeszła kontroli poprawności. Nie publikujemy niepotwierdzonych ustaleń.';
  if (/^AI_RATE_LIMIT|limit/i.test(code)) return 'Analiza czeka na dostępny limit wywołań AI.';
  if (/^AI_HTTP_40/.test(code))
    return 'Dostawca AI odrzucił żądanie. Konfiguracja wymaga sprawdzenia przez administratora.';
  if (/MAX_TOKENS/.test(code))
    return 'Odpowiedź AI została ucięta. Administrator musi dostosować limit długości odpowiedzi.';
  return 'Nie udało się przygotować poprawnej analizy.';
}
