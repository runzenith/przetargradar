import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { ExternalError, hash, retry, retryAfter, sleep, stableJson } from './utils.js';
import type { NoticeSource, NormalizedNotice } from './bzp.js';
export const TED_NOTICE_TYPES = ['cn-standard'] as const;
const nutsRegions: Record<string, string> = {
  PL21: 'małopolskie',
  PL22: 'śląskie',
  PL41: 'wielkopolskie',
  PL42: 'zachodniopomorskie',
  PL43: 'lubuskie',
  PL51: 'dolnośląskie',
  PL52: 'opolskie',
  PL61: 'kujawsko-pomorskie',
  PL62: 'warmińsko-mazurskie',
  PL63: 'pomorskie',
  PL71: 'łódzkie',
  PL72: 'świętokrzyskie',
  PL81: 'lubelskie',
  PL82: 'podkarpackie',
  PL84: 'podlaskie',
  PL91: 'mazowieckie',
  PL92: 'mazowieckie',
};
const categoryMap: Record<string, string> = {
  Services: 'services',
  Supplies: 'supplies',
  Works: 'works',
};
const TED_FIELDS = [
  'notice-version',
  'publication-number',
  'publication-date',
  'notice-title',
  'organisation-name-buyer',
  'organisation-city-buyer',
  'notice-type',
  'classification-cpv',
  'contract-nature',
  'deadline-receipt-tender-date-lot',
  'deadline-receipt-tender-time-lot',
];
export class TedError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export function xmlNoticeText(xml: string): string {
  if (
    xml.length > 5000000 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    throw new TedError('TED_XML_INVALID');
  const parsed = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
  }).parse(xml);
  const lines: string[] = [];
  const fragments = new Map<string, number>();
  const emit = (label: string, text: string) => {
    if (text.length < 80) {
      lines.push(label + ': ' + text);
      return;
    }
    const previous = fragments.get(text);
    if (previous) lines.push(label + ': [fragment ' + previous + ' — identyczna treść jak wyżej]');
    else {
      const id = fragments.size + 1;
      fragments.set(text, id);
      lines.push(label + ': [fragment ' + id + '] ' + text);
    }
  };
  const walk = (value: unknown, path: string[], depth = 0): void => {
    if (depth > 60) throw new TedError('TED_XML_DEPTH');
    if (Array.isArray(value)) {
      for (const v of value) walk(v, path, depth + 1);
      return;
    }
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const attrs = Object.entries(obj)
        .filter(([k]) => k.startsWith('@_'))
        .map(([k, v]) => k.slice(2) + ': ' + String(v))
        .join(', ');
      if (obj['#text'] !== undefined)
        emit(path.slice(-2).join(' / ') + (attrs ? ' (' + attrs + ')' : ''), String(obj['#text']));
      for (const [k, v] of Object.entries(obj))
        if (!k.startsWith('@_') && k !== '#text' && k !== '?xml') walk(v, [...path, k], depth + 1);
    } else if (value !== null && value !== undefined && String(value).trim())
      emit(path.slice(-2).join(' / '), String(value));
  };
  walk(parsed, []);
  if (!lines.length) throw new TedError('TED_XML_EMPTY');
  return lines.join('\n');
}
function preferred(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (Array.isArray(v))
    return [...new Set(v.flatMap((x) => (preferred(x) ? [preferred(x)] : [])))].join('; ');
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return preferred(o.pol ?? o.POL ?? o.eng ?? Object.values(o)[0]);
  }
  return '';
}
export function adaptTedNotice(input: unknown, fullText: string) {
  const r = z.record(z.string(), z.unknown()).parse(input);
  const id = z
    .string()
    .regex(/^\d+-\d{4}$/)
    .parse(r['publication-number']);
  const dates = [
    ...new Set(z.array(z.string()).parse(r['deadline-receipt-tender-date-lot'] ?? [])),
  ];
  const times = [
    ...new Set(z.array(z.string()).parse(r['deadline-receipt-tender-time-lot'] ?? [])),
  ];
  let deadlineISO: string | null = null;
  if (dates.length === 1 && times.length === 1 && /[+-]\d{2}:\d{2}$|Z$/.test(times[0]!)) {
    const d = DateTime.fromISO(dates[0]!.slice(0, 10) + 'T' + times[0], { setZone: true });
    if (d.isValid) deadlineISO = d.toUTC().toISO();
  }
  return {
    ND: id,
    noticeVersion: preferred(r['notice-version']),
    TI: preferred(r['notice-title']),
    PD: preferred(r['publication-date']),
    TD: preferred(r['notice-type']),
    NC: preferred(r['contract-nature']),
    AU: preferred(r['organisation-name-buyer']),
    TW: preferred(r['organisation-city-buyer']),
    PC: preferred(r['classification-cpv']),
    fullText,
    deadlineISO,
  };
}
const tedNoticeSchema = z
  .object({
    ND: z.string().min(1),
    TI: z.string().default(''),
    PD: z.string().min(8).max(32),
    DT: z.string().min(8).max(8).nullish(),
    CY: z.string().default(''),
    TD: z.string().default(''),
    NC: z.string().default(''),
    AU: z.string().default(''),
    TW: z.string().default('').nullish(),
    RC: z.string().default('').nullish(),
    PC: z.string().default('').nullish(),
    PR: z.string().default('').nullish(),
    OL: z.string().default('').nullish(),
    AA: z.string().default('').nullish(),
    content: z.unknown().optional(),
    fullText: z.string().optional(),
    deadlineISO: z.string().nullable().optional(),
  })
  .passthrough();
export type TedNotice = z.infer<typeof tedNoticeSchema>;
const tedResponseSchema = z.object({
  notices: z.array(z.unknown()).max(100),
  totalNoticeCount: z.number().int(),
  iterationNextToken: z.string().nullish(),
  timedOut: z.boolean().optional(),
});
function parseTedDate(value: string): Date {
  const dt = /^\d{8}$/.test(value)
    ? DateTime.fromFormat(value, 'yyyyMMdd', { zone: 'Europe/Warsaw', setZone: true })
    : DateTime.fromISO(value.slice(0, 10) + 'T00:00:00' + (value.slice(10) || '+01:00'), {
        setZone: true,
      });
  if (!dt.isValid) throw new Error(`Invalid TED date: ${value}`);
  return dt.toUTC().toJSDate();
}
function formatTedDate(date: Date): string {
  return DateTime.fromJSDate(date, { zone: 'UTC' }).toFormat('yyyyMMdd');
}
function resolveRegion(code: string | null | undefined): string | null {
  if (!code) return null;
  const prefix = code.slice(0, 4);
  return nutsRegions[prefix] ?? code;
}
function buildText(raw: TedNotice): string {
  if (raw.fullText) return raw.fullText;
  const parts: string[] = [];
  if (raw.TI) parts.push(raw.TI);
  if (raw.AU) parts.push(`Zamawiający: ${raw.AU}`);
  if (raw.TW) parts.push(`Miasto: ${raw.TW}`);
  if (raw.TD) parts.push(`Typ: ${raw.TD}`);
  if (raw.NC) parts.push(`Kategoria: ${raw.NC}`);
  if (raw.PR) parts.push(`Procedura: ${raw.PR}`);
  if (raw.PC) parts.push(`CPV: ${raw.PC}`);
  return parts.join(' | ');
}
export function normalizeTedNotice(input: unknown) {
  const raw = tedNoticeSchema.parse(input);
  const text = buildText(raw);
  const sourceId = raw.ND;
  const publishedAt = parseTedDate(raw.PD);
  const deadline = raw.deadlineISO
    ? new Date(raw.deadlineISO)
    : raw.DT
      ? parseTedDate(raw.DT)
      : null;
  const sourceUrl = `https://ted.europa.eu/pl/notice/-/detail/${encodeURIComponent(raw.ND)}`;
  const { noticeVersion: _cacheVersion, ...contentRaw } = raw;
  return {
    raw,
    sourceId,
    text,
    publishedAt,
    deadline,
    sourceUrl,
    sourceKey: `ted:${raw.ND}`,
    procedureId: null,
    noticeNumber: raw.ND,
    noticeType: raw.TD === 'cn-standard' ? 'ContractNotice' : raw.TD,
    title: raw.TI,
    buyer: raw.AU,
    buyerCity: raw.TW ?? null,
    buyerRegion: resolveRegion(raw.RC),
    cpv: raw.PC?.match(/\d{8}/)?.[0] ?? null,
    category:
      categoryMap[raw.NC] ??
      ({ works: 'works', supplies: 'supplies', services: 'services' } as Record<string, string>)[
        raw.NC.toLowerCase()
      ] ??
      'other',
    contentHash: hash(stableJson({ raw: contentRaw, text, normalizationVersion: '2-full-xml' })),
  };
}
export type TedCache = {
  get(id: string): Promise<{
    raw: unknown;
    fetchedAt: Date;
  } | null>;
  touch(id: string): Promise<void>;
};
function metadataKey(raw: Record<string, unknown>) {
  return stableJson(
    Object.fromEntries(
      ['ND', 'TI', 'PD', 'TD', 'NC', 'AU', 'TW', 'PC', 'deadlineISO', 'noticeVersion'].map((k) => [
        k,
        k === 'noticeVersion'
          ? String(
              raw[k] ??
                String(raw.fullText ?? '').match(/(?:^|\n)[^\n]* \/ VersionID: ([^\n]+)/)?.[1] ??
                '',
            ).replace(/^0+(?=\d)/, '') || null
          : (raw[k] ?? null),
      ]),
    ),
  );
}
export class TedClient implements NoticeSource {
  readonly id = 'ted';
  readonly windowHours = 24;
  readonly noticeTypes = TED_NOTICE_TYPES;
  readonly strictWindow = false;
  private nextRequest = 0;
  constructor(
    private config: Pick<
      {
        TED_REQUEST_INTERVAL_MS: number;
      },
      'TED_REQUEST_INTERVAL_MS'
    >,
    private http: typeof fetch = fetch,
    private cache?: TedCache,
  ) {}
  async page(
    type: string,
    from: Date,
    to: Date,
    cursor: string | null,
    size: number,
    signal?: AbortSignal,
  ): Promise<{
    items: unknown[];
    nextCursor: string | null;
  }> {
    if (!TED_NOTICE_TYPES.includes(type as (typeof TED_NOTICE_TYPES)[number]))
      throw new Error('Unsupported notice type');
    if (!Number.isInteger(size) || size < 1 || size > 100)
      throw new Error('Page size must be between 1 and 100');
    const query = `buyer-country=POL AND notice-type=cn-standard AND PD>=${formatTedDate(from)} AND PD<=${formatTedDate(to)} SORT BY publication-date DESC`;
    const body = JSON.stringify({
      query,
      fields: TED_FIELDS,
      limit: size,
      scope: 'ALL',
      paginationMode: 'ITERATION',
      ...(cursor ? { iterationNextToken: cursor } : {}),
    });
    return retry(
      async () => {
        await sleep(Math.max(0, this.nextRequest - Date.now()), signal);
        this.nextRequest = Date.now() + this.config.TED_REQUEST_INTERVAL_MS;
        const response = await this.http('https://api.ted.europa.eu/v3/notices/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body,
          signal: AbortSignal.any([AbortSignal.timeout(20000), ...(signal ? [signal] : [])]),
        });
        if (!response.ok)
          throw new ExternalError(response.status, retryAfter(response.headers.get('retry-after')));
        let parsed: z.infer<typeof tedResponseSchema>;
        try {
          parsed = tedResponseSchema.parse(await response.json());
        } catch {
          throw new TedError('TED_SEARCH_SCHEMA');
        }
        if (parsed.timedOut) throw new TedError('TED_SEARCH_TIMEOUT');
        if (
          !cursor &&
          parsed.totalNoticeCount > parsed.notices.length &&
          parsed.notices.length &&
          !parsed.iterationNextToken
        )
          throw new TedError('TED_SEARCH_CURSOR');
        return {
          items: parsed.notices,
          nextCursor: parsed.iterationNextToken ?? null,
        };
      },
      { signal },
    );
  }
  async hydrate(raw: unknown, signal?: AbortSignal): Promise<unknown> {
    const metadata = adaptTedNotice(raw, '');
    const id = metadata.ND;
    const cached = await this.cache?.get(id);
    if (
      cached &&
      typeof cached.raw === 'object' &&
      cached.raw &&
      'fullText' in cached.raw &&
      typeof cached.raw.fullText === 'string' &&
      cached.raw.fullText.length > 0 &&
      metadataKey(cached.raw as Record<string, unknown>) === metadataKey(metadata) &&
      Date.now() - cached.fetchedAt.getTime() < 86400000
    )
      return cached.raw;
    return retry(
      async () => {
        await sleep(Math.max(0, this.nextRequest - Date.now()), signal);
        this.nextRequest = Date.now() + this.config.TED_REQUEST_INTERVAL_MS;
        const xmlResponse = await this.http('https://ted.europa.eu/en/notice/' + id + '/xml', {
          headers: { Accept: 'application/xml,text/xml' },
          signal: AbortSignal.any([AbortSignal.timeout(25000), ...(signal ? [signal] : [])]),
        });
        if (!xmlResponse.ok)
          throw new ExternalError(
            xmlResponse.status,
            retryAfter(xmlResponse.headers.get('retry-after')),
          );
        if (Number(xmlResponse.headers.get('content-length')) > 5000000)
          throw new TedError('TED_XML_TOO_LARGE');
        const reader = xmlResponse.body?.getReader();
        if (!reader) throw new TedError('TED_XML_EMPTY');
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        while (true) {
          const c = await reader.read();
          if (c.done) break;
          bytes += c.value.length;
          if (bytes > 5000000) {
            await reader.cancel();
            throw new TedError('TED_XML_TOO_LARGE');
          }
          chunks.push(c.value);
        }
        const result = adaptTedNotice(
          raw,
          xmlNoticeText(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))),
        );
        if (
          cached &&
          typeof cached.raw === 'object' &&
          cached.raw &&
          'fullText' in cached.raw &&
          cached.raw.fullText === result.fullText
        )
          await this.cache?.touch(id);
        return result;
      },
      { signal },
    );
  }
  normalize(input: unknown): NormalizedNotice {
    return normalizeTedNotice(input);
  }
}
