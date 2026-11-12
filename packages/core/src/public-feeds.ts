import { z } from 'zod';
import { parse } from 'csv-parse/sync';
import { htmlText, sourceDate, type NoticeSource, type NormalizedNotice } from './bzp.js';
import { hash, stableJson, ExternalError, retry, retryAfter, sleep } from './utils.js';
const BK = 'https://bazakonkurencyjnosci.funduszeeuropejskie.gov.pl';
export const PZ_FEED = 'https://platformazakupowa.pl/transakcje-ON-eksport.csv';
const record = z.record(z.string(), z.unknown());
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const plain = (v: unknown) => htmlText(str(v));
const date = (v: unknown) => {
  const s = str(v);
  if (!s) return null;
  return sourceDate(s.replace(' ', 'T'));
};
function base(
  source: string,
  id: string,
  raw: unknown,
  title: string,
  buyer: string,
  text: string,
  published: Date,
  deadline: Date | null,
  url: string,
): NormalizedNotice {
  return {
    raw,
    sourceId: source + ':' + id,
    sourceKey: source + ':' + id,
    procedureId: null,
    noticeNumber: source.toUpperCase() + ' ' + id,
    noticeType: 'ContractNotice',
    title,
    buyer,
    text,
    publishedAt: published,
    deadline,
    sourceUrl: url,
    buyerCity: null,
    buyerRegion: null,
    cpv: null,
    category: 'other',
    contentHash: hash(stableJson({ raw, text, normalizationVersion: '1' })),
  };
}
function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([k]) =>
            ![
              'contact_persons',
              'created_by',
              'modified_by',
              'created_at',
              'modified_at',
              'favorite',
              'dictionaries',
              'badge',
              'offer_set_badge_count',
              'question_badge_count',
            ].includes(k),
        )
        .map(([k, v]) => [k, sanitize(v)]),
    );
  return value;
}
const businessLabels: Record<string, string> = {
  title: 'Tytuł',
  description: 'Opis',
  warranty_period: 'Gwarancja',
  terms_of_contract_change: 'Zmiany umowy',
  supplementary_orders: 'Zamówienia dodatkowe',
  estimated_value: 'Wartość szacunkowa',
  submission_deadline: 'Termin ofert',
  planned_sign_date: 'Planowana umowa',
  price_criterion: 'Kryterium ceny',
  name: 'Nazwa',
  code: 'Kod',
  locality: 'Miejscowość',
  voivodeship: 'Województwo',
  street: 'Ulica',
  number_description: 'Numer',
  postcode: 'Kod pocztowy',
  country: 'Kraj',
  condition: 'Warunek',
  content: 'Treść',
  fulfillment_deadline: 'Termin realizacji',
};
function businessText(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(businessText);
  if (!v || typeof v !== 'object') return [];
  return Object.entries(v).flatMap(([k, x]) =>
    x && typeof x === 'object'
      ? businessText(x)
      : !['id', 'group_uuid', 'is_mine', 'is_variant'].includes(k) &&
          x !== null &&
          x !== undefined &&
          x !== ''
        ? [(businessLabels[k] ?? k.replace(/_/g, ' ')) + ': ' + plain(String(x))]
        : [],
  );
}
const bkItem = z
  .object({
    id: z.number().int().positive(),
    title: z.string().min(1),
    advertiser_name: z.string().min(1),
    publication_date: z.string(),
    submission_deadline: z.string().nullish(),
  })
  .passthrough();
export function normalizeBk(input: unknown): NormalizedNotice {
  const envelope = z.object({ listing: bkItem, detail: record }).parse(input);
  const { listing: l, detail: d } = envelope;
  const advertiser = record.parse(d.advertiser_address_details ?? {});
  const address = record.parse(advertiser.address ?? {});
  const published = date(d.publication_date ?? l.publication_date);
  if (!published) throw new Error('BK missing publication date');
  const text = [
    'Źródło: Baza Konkurencyjności',
    'Zamawiający: ' + l.advertiser_name,
    ...businessText(d),
  ].join('\n');
  const n = base(
    'bk',
    String(l.id),
    envelope,
    plain(d.title ?? l.title),
    plain(advertiser.name ?? l.advertiser_name),
    text,
    published,
    date(d.submission_deadline ?? l.submission_deadline),
    BK + '/ogloszenia/' + l.id,
  );
  n.buyerCity = str(address.locality) || null;
  n.buyerRegion = str(address.voivodeship) || null;
  n.cpv = text.match(/Kod: (\d{8})/)?.[1] ?? null;
  n.category = n.cpv?.startsWith('45')
    ? 'works'
    : /Nazwa: Dostawy/.test(text)
      ? 'supplies'
      : /Nazwa: Usługi/.test(text)
        ? 'services'
        : 'other';
  return n;
}
const pzFields = [
  'id_zapytania',
  'nazwa',
  'firma_wystawiajaca',
  'data_rozpoczecia',
  'data_zakonczenia',
  'adres_dostawy',
  'wymagania_dodatkowe',
  'opis_dodatkowy_ON',
  'przedmiot_zapytania',
  'opis_i_specyfikacja',
  'termin_platnosci',
  'najwczesniejszy_termin_dostawy',
  'napozniejszy_termin_dostawy',
] as const;
export function parsePz(csv: string): Record<string, string>[] {
  if (!csv.trim()) return [];
  const rows: Record<string, string>[] = parse(csv, {
    columns: (headers: string[]) => {
      for (const field of ['id_zapytania', 'nazwa', 'firma_wystawiajaca', 'data_rozpoczecia'])
        if (!headers.includes(field)) throw new Error('Invalid PZ CSV headers');
      return headers;
    },
    bom: true,
    skip_empty_lines: true,
    max_record_size: 4000000,
  });
  return rows.map((row) => Object.fromEntries(pzFields.map((k) => [k, row[k] ?? ''])));
}
export function normalizePz(input: unknown): NormalizedNotice {
  const r = z.record(z.string(), z.string()).parse(input);
  const id = z.string().regex(/^\d+$/).parse(r.id_zapytania);
  const title = z.string().min(1).parse(r.nazwa);
  const buyer = z.string().min(1).parse(r.firma_wystawiajaca);
  const published = date(r.data_rozpoczecia);
  if (!published) throw new Error('PZ missing date');
  const labels: Record<string, string> = {
    nazwa: 'Tytuł',
    firma_wystawiajaca: 'Zamawiający',
    data_rozpoczecia: 'Publikacja',
    data_zakonczenia: 'Termin ofert',
    adres_dostawy: 'Adres dostawy',
    wymagania_dodatkowe: 'Wymagania',
    opis_dodatkowy_ON: 'Informacje',
    przedmiot_zapytania: 'Przedmiot zamówienia',
    opis_i_specyfikacja: 'Opis i specyfikacja',
    termin_platnosci: 'Termin płatności',
    najwczesniejszy_termin_dostawy: 'Początek realizacji',
    napozniejszy_termin_dostawy: 'Koniec realizacji',
  };
  const text = Object.entries(labels)
    .flatMap(([k, label]) => (r[k] ? [label + ': ' + plain(r[k])] : []))
    .join('\n');
  const notice = base(
    'pz',
    id,
    r,
    plain(title),
    plain(buyer),
    text,
    published,
    date(r.data_zakonczenia),
    'https://platformazakupowa.pl/transakcja/' + id,
  );
  notice.cpv = text.match(/\bCPV\s*[:\-]?\s*(\d{8})(?:-\d)?\b/i)?.[1] ?? null;
  if (notice.cpv)
    notice.category = notice.cpv.startsWith('45')
      ? 'works'
      : Number(notice.cpv.slice(0, 2)) < 50
        ? 'supplies'
        : 'services';
  return notice;
}
class FeedHttp {
  private next = 0;
  constructor(
    private interval: number,
    private http: typeof fetch,
  ) {}
  async get(url: string, signal?: AbortSignal): Promise<string> {
    return retry(
      async () => {
        await sleep(Math.max(0, this.next - Date.now()), signal);
        this.next = Date.now() + this.interval;
        const r = await this.http(url, {
          headers: {
            Accept: 'application/json,text/csv',
            'User-Agent': 'PrzetargRadar/1.0 public-feed-client',
          },
          signal: AbortSignal.any([AbortSignal.timeout(25000), ...(signal ? [signal] : [])]),
        });
        if (!r.ok) throw new ExternalError(r.status, retryAfter(r.headers.get('retry-after')));
        const reader = r.body?.getReader();
        if (!reader) return '';
        const parts: Uint8Array[] = [];
        let bytes = 0;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.length;
          if (bytes > 20000000) {
            await reader.cancel();
            throw new Error('Feed exceeds 20 MB');
          }
          parts.push(chunk.value);
        }
        return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts));
      },
      { signal },
    );
  }
}
export class BkClient implements NoticeSource {
  readonly id = 'bk';
  readonly windowHours = 24;
  readonly noticeTypes = ['ContractNotice'];
  readonly strictWindow = false;
  private transport: FeedHttp;
  constructor(
    config: {
      BK_REQUEST_INTERVAL_MS: number;
    },
    http: typeof fetch = fetch,
  ) {
    this.transport = new FeedHttp(config.BK_REQUEST_INTERVAL_MS, http);
  }
  normalize = normalizeBk;
  async page(
    _type: string,
    from: Date,
    to: Date,
    cursor: string | null,
    size: number,
    signal?: AbortSignal,
  ) {
    const offset = cursor ? z.coerce.number().int().nonnegative().parse(cursor) : 0;
    const page = Math.floor(offset / 100) + 1;
    const q = new URLSearchParams({
      page: String(page),
      limit: '100',
      sort: 'publicationDate',
      'status[0]': 'PUBLISHED',
      'publicationDateRange[from]': from.toISOString().slice(0, 10),
      'publicationDateRange[to]': to.toISOString().slice(0, 10),
    });
    const response = z
      .object({
        status: z.literal('OK'),
        data: z.object({
          advertisements: z.array(bkItem),
          meta: z.object({ total: z.number().int().nonnegative() }),
        }),
      })
      .parse(JSON.parse(await this.transport.get(BK + '/api/announcements/search?' + q, signal)));
    const items = response.data.advertisements.slice(offset % 100, (offset % 100) + size);
    return {
      items,
      nextCursor:
        offset + items.length < response.data.meta.total ? String(offset + items.length) : null,
    };
  }
  async hydrate(input: unknown, signal?: AbortSignal): Promise<unknown> {
    const listing = bkItem.parse(input);
    const d = z
      .object({ status: z.literal('OK'), data: z.object({ advertisement: record }) })
      .parse(
        JSON.parse(
          await this.transport.get(BK + '/api/announcements/' + listing.id + '/compact', signal),
        ),
      );
    const publicId = (
      d.data.advertisement.advertisement as
        | {
            id?: number;
          }
        | undefined
    )?.id;
    if (publicId !== listing.id) throw new Error('BK detail identifier mismatch');
    return { listing: sanitize(listing), detail: sanitize(d.data.advertisement) };
  }
}
export class PzClient implements NoticeSource {
  readonly isSnapshot = true;
  readonly id = 'pz';
  readonly noticeTypes = ['ContractNotice'];
  readonly strictWindow = false;
  private transport: FeedHttp;
  private snapshot: Record<string, string>[] | null = null;
  constructor(
    config: {
      PZ_REQUEST_INTERVAL_MS: number;
    },
    http: typeof fetch = fetch,
  ) {
    this.transport = new FeedHttp(config.PZ_REQUEST_INTERVAL_MS, http);
  }
  normalize = normalizePz;
  async page(
    _type: string,
    _from: Date,
    _to: Date,
    cursor: string | null,
    size: number,
    signal?: AbortSignal,
  ) {
    if (!cursor || !this.snapshot)
      this.snapshot = parsePz(await this.transport.get(PZ_FEED, signal));
    const after = cursor ? BigInt(z.string().regex(/^\d+$/).parse(cursor)) : 0n;
    const sorted = this.snapshot
      .map((row) => {
        normalizePz(row);
        return row;
      })
      .sort((a, b) => (BigInt(a.id_zapytania!) < BigInt(b.id_zapytania!) ? -1 : 1));
    const remaining = sorted.filter((r) => BigInt(r.id_zapytania!) > after);
    const items = remaining.slice(0, size);
    return {
      items,
      nextCursor: remaining.length > items.length ? items.at(-1)!.id_zapytania! : null,
    };
  }
}
