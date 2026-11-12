import { normalizeNotice, type NoticeSource, type BzpNotice } from './bzp.js';
const records = [
  [
    'Rozbudowa systemu elektronicznego obiegu dokumentów',
    'Urząd Miasta Poznania',
    'Poznań',
    'PL30',
    'Services',
    '72263000-6',
    '2026-11-20T09:00:00Z',
    'Przedmiotem zamówienia jest rozbudowa systemu EZD, integracja z e-Doręczeniami oraz migracja danych. Wykonawca musi wykazać co najmniej dwie wdrożone integracje systemów. Wartość szacunkowa: 280000.00 PLN netto. Wadium: 5000.00 PLN. Miejsce realizacji: Poznań.',
  ],
  [
    'Dostawa i wdrożenie infrastruktury serwerowej',
    'Politechnika Warszawska',
    'Warszawa',
    'PL14',
    'Delivery',
    '48820000-2',
    '2026-11-16T10:00:00Z',
    'Dostawa czterech serwerów, macierzy dyskowej i konfiguracja środowiska wirtualizacji. Wymagana gwarancja producenta na 36 miesięcy. Miejsce realizacji: Warszawa.',
  ],
  [
    'Utrzymanie i rozwój portalu usług publicznych',
    'Urząd Marszałkowski Województwa Małopolskiego',
    'Kraków',
    'PL12',
    'Services',
    '72250000-2',
    '2026-11-24T11:00:00Z',
    'Utrzymanie portalu usług publicznych przez 24 miesiące. Wymagany czas reakcji na awarie krytyczne do 2 godzin. Wartość szacunkowa: 420000.00 PLN netto. Miejsce realizacji: zdalnie.',
  ],
  [
    'Audyt bezpieczeństwa systemów informatycznych',
    'Gdański Uniwersytet Medyczny',
    'Gdańsk',
    'PL22',
    'Services',
    '72810000-1',
    '2026-11-13T08:00:00Z',
    'Audyt infrastruktury IT oraz testy penetracyjne aplikacji internetowych. Raport z audytu w terminie 30 dni od podpisania umowy. Miejsce realizacji: Gdańsk.',
  ],
  [
    'Modernizacja oświetlenia ulicznego na terenie gminy',
    'Gmina Zielona Góra',
    'Zielona Góra',
    'PL08',
    'Works',
    '45316110-9',
    '2026-11-27T09:00:00Z',
    'Wymiana 180 opraw oświetleniowych na LED oraz modernizacja szaf sterowniczych. Wartość szacunkowa: 650000.00 PLN netto. Miejsce realizacji: Zielona Góra.',
  ],
  [
    'Zaprojektowanie i wykonanie strony internetowej',
    'Muzeum Narodowe we Wrocławiu',
    'Wrocław',
    'PL02',
    'Services',
    '72413000-8',
    '2026-11-19T09:00:00Z',
    'Projekt i wykonanie responsywnej strony internetowej muzeum z systemem CMS. Wymagana zgodność z WCAG 2.1 na poziomie AA. Miejsce realizacji: zdalnie.',
  ],
  [
    'Dostawa sprzętu komputerowego dla szkół',
    'Miasto Katowice',
    'Katowice',
    'PL24',
    'Delivery',
    '30213000-5',
    '2026-11-23T08:00:00Z',
    'Dostawa 120 laptopów wraz z systemem operacyjnym dla szkół podstawowych. Wartość szacunkowa: 360000.00 PLN netto. Miejsce realizacji: Katowice.',
  ],
  [
    'Usługa wsparcia technicznego systemu ERP',
    'Miejskie Przedsiębiorstwo Komunikacyjne',
    'Łódź',
    'PL10',
    'Services',
    '72261000-2',
    '2026-11-25T10:00:00Z',
    'Wsparcie techniczne systemu ERP przez 12 miesięcy. Wymagana znajomość obecnego systemu; jego nazwa nie została wskazana w ogłoszeniu. Miejsce realizacji: Łódź.',
  ],
  [
    'Budowa ogólnodostępnej strefy rekreacji',
    'Gmina Lublin',
    'Lublin',
    'PL06',
    'Works',
    '45000000-7',
    '2026-12-02T09:00:00Z',
    'Budowa placu zabaw, siłowni plenerowej i ścieżek pieszych. Wartość szacunkowa: 820000.00 PLN netto. Miejsce realizacji: Lublin.',
  ],
  [
    'Szkolenia z analizy danych i narzędzi BI',
    'Urząd Statystyczny w Rzeszowie',
    'Rzeszów',
    'PL18',
    'Services',
    '80500000-9',
    '2026-11-30T08:00:00Z',
    'Przeprowadzenie 80 godzin szkoleń z analizy danych dla 24 pracowników. Wymagane doświadczenie w prowadzeniu szkoleń z Power BI. Miejsce realizacji: Rzeszów.',
  ],
  [
    'Dostawa materiałów biurowych',
    'Starostwo Powiatowe w Toruniu',
    'Toruń',
    'PL04',
    'Delivery',
    '30192000-1',
    '2026-11-06T09:00:00Z',
    'Sukcesywna dostawa papieru i materiałów biurowych przez 12 miesięcy. Miejsce realizacji: Toruń.',
  ],
  [
    'Przygotowanie dokumentacji projektowej budynku biblioteki',
    'Gmina Olsztyn',
    'Olsztyn',
    'PL28',
    'Services',
    '71220000-6',
    null,
    'Opracowanie dokumentacji projektowej nowej siedziby biblioteki. Termin składania ofert nie został podany. Miejsce realizacji: Olsztyn.',
  ],
  [
    'Obsługa prawna jednostek samorządowych',
    'Urząd Miasta Białystok',
    'Białystok',
    'PL20',
    'Services',
    '79100000-5',
    '2026-11-26T10:00:00Z',
    'Bieżąca obsługa prawna oraz reprezentacja procesowa przez 12 miesięcy. Wymagane uprawnienia radcy prawnego lub adwokata. Miejsce realizacji: Białystok.',
  ],
  [
    'Rozwój aplikacji do zarządzania transportem',
    'Zarząd Transportu Miejskiego',
    'Szczecin',
    'PL32',
    'Services',
    '72212000-4',
    '2026-12-01T09:00:00Z',
    'Rozwój aplikacji do zarządzania transportem miejskim i udostępnienie API. Wymagana dokumentacja OpenAPI i testy integracyjne. Wartość szacunkowa: 190000.00 PLN netto. Miejsce realizacji: Szczecin.',
  ],
] as const;
export function demoNotices(): BzpNotice[] {
  return records.map((r, index) => ({
    objectId: `demo-notice-${String(index + 1).padStart(3, '0')}`,
    tenderId: `demo-procedure-${index + 1}`,
    noticeType: 'ContractNotice',
    noticeNumber: `DEMO/2026/${String(index + 1).padStart(5, '0')}`,
    publicationDate: new Date(Date.UTC(2026, 10, 9, 14, 45 - index * 8)).toISOString(),
    orderObject: r[0],
    organizationName: r[1],
    organizationCity: r[2],
    organizationProvince: r[3],
    orderType: r[4],
    cpvCode: r[5],
    submittingOffersDate: r[6],
    htmlBody: `<h1>${r[0]}</h1><h2>Przedmiot zamówienia</h2><p>${r[7]}</p><p>Dane demonstracyjne PrzetargRadar. Nie jest to rzeczywiste ogłoszenie.</p>`,
  }));
}
export class DemoSource implements NoticeSource {
  readonly id = 'bzp';
  readonly noticeTypes = ['ContractNotice'] as const;
  constructor(private records: unknown[] = demoNotices()) {}
  async page(
    type: string,
    _from: Date,
    _to: Date,
    cursor: string | null,
    size: number,
  ): Promise<{
    items: unknown[];
    nextCursor: string | null;
  }> {
    const items = this.records.filter((r) => (r as BzpNotice).noticeType === type);
    const start = cursor ? items.findIndex((r) => (r as BzpNotice).objectId === cursor) + 1 : 0;
    const page = items.slice(start, start + size);
    return {
      items: page,
      nextCursor: page.length ? (page.at(-1) as BzpNotice).objectId : null,
    };
  }
  normalize(input: unknown) {
    return normalizeNotice(input);
  }
}
