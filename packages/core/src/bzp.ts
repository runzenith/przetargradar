import { z } from 'zod';
import { convert } from 'html-to-text';
import { DateTime } from 'luxon';
import type { Config } from './config.js';
import { ExternalError, hash, retry, retryAfter, sleep, stableJson } from './utils.js';
const optionalText = z.string().nullish();
export const noticeSchema = z
  .object({
    objectId: z.string().min(1).max(191),
    noticeType: z.string().min(1).max(80),
    publicationDate: z.string(),
    noticeNumber: optionalText,
    bzpNumber: optionalText,
    tenderId: optionalText,
    orderObject: z.string().min(1),
    organizationName: z.string().min(1).max(500),
    organizationCity: optionalText,
    organizationProvince: optionalText,
    cpvCode: optionalText,
    submittingOffersDate: optionalText,
    htmlBody: optionalText,
    orderType: optionalText,
    procedureResult: optionalText,
  })
  .passthrough();
export type BzpNotice = z.infer<typeof noticeSchema>;
export const NOTICE_TYPES = ['ContractNotice', 'NoticeUpdateNotice', 'TenderResultNotice'] as const;
export const regions: Record<string, string> = {
  PL02: 'dolnośląskie',
  PL04: 'kujawsko-pomorskie',
  PL06: 'lubelskie',
  PL08: 'lubuskie',
  PL10: 'łódzkie',
  PL12: 'małopolskie',
  PL14: 'mazowieckie',
  PL16: 'opolskie',
  PL18: 'podkarpackie',
  PL20: 'podlaskie',
  PL22: 'pomorskie',
  PL24: 'śląskie',
  PL26: 'świętokrzyskie',
  PL28: 'warmińsko-mazurskie',
  PL30: 'wielkopolskie',
  PL32: 'zachodniopomorskie',
};
export function sourceDate(value: string): Date {
  const dt = DateTime.fromISO(value, { zone: 'Europe/Warsaw', setZone: true });
  if (!dt.isValid) throw new Error('Invalid BZP date');
  return dt.toUTC().toJSDate();
}
export const normalizeText = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim();
export const htmlText = (html: string) =>
  normalizeText(
    convert(html, {
      wordwrap: false,
      selectors: [
        ...['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((selector) => ({
          selector,
          options: { uppercase: false },
        })),
        { selector: 'a', options: { ignoreHref: true } },
        { selector: 'img', format: 'skip' },
        { selector: 'style', format: 'skip' },
        { selector: 'script', format: 'skip' },
      ],
    }),
  );
export function normalizeNotice(input: unknown) {
  const raw = noticeSchema.parse(input);
  const text = htmlText(raw.htmlBody ?? '');
  const sourceId = raw.objectId;
  const publishedAt = sourceDate(raw.publicationDate);
  const deadline = raw.submittingOffersDate ? sourceDate(raw.submittingOffersDate) : null;
  const sourceUrl =
    text.match(
      /https:\/\/ezamowienia\.gov\.pl\/mp-client\/search\/list\/ocds-[a-zA-Z0-9-]+/,
    )?.[0] ?? null;
  return {
    raw,
    sourceId,
    text,
    publishedAt,
    deadline,
    sourceUrl,
    sourceKey: raw.tenderId ? `bzp:${raw.tenderId}` : `notice:${sourceId}`,
    procedureId: raw.tenderId ?? null,
    noticeNumber: raw.noticeNumber ?? null,
    noticeType: raw.noticeType,
    title: raw.orderObject,
    buyer: raw.organizationName,
    buyerCity: raw.organizationCity ?? null,
    buyerRegion: raw.organizationProvince
      ? (regions[raw.organizationProvince] ?? raw.organizationProvince)
      : null,
    cpv: raw.cpvCode?.match(/\d{8}(-\d)?/)?.[0] ?? null,
    category:
      (
        {
          Services: 'services',
          Delivery: 'supplies',
          Works: 'works',
        } as Record<string, string>
      )[raw.orderType ?? ''] ?? 'other',
    contentHash: hash(stableJson({ raw, text, normalizationVersion: '1' })),
  };
}
export type NormalizedNotice = {
  raw: unknown;
  sourceId: string;
  text: string;
  publishedAt: Date;
  deadline: Date | null;
  sourceUrl: string | null;
  sourceKey: string;
  procedureId: string | null;
  noticeNumber: string | null;
  noticeType: string;
  title: string;
  buyer: string;
  buyerCity: string | null;
  buyerRegion: string | null;
  cpv: string | null;
  category: string;
  contentHash: string;
};
export type NoticeSource = {
  readonly id?: string;
  readonly noticeTypes?: readonly string[];
  readonly strictWindow?: boolean;
  readonly filterWindow?: boolean;
  readonly isSnapshot?: boolean;
  readonly windowHours?: number;
  hydrate?(input: unknown, signal?: AbortSignal): Promise<unknown>;
  page(
    type: string,
    from: Date,
    to: Date,
    cursor: string | null,
    size: number,
    signal?: AbortSignal,
  ): Promise<
    | {
        items: unknown[];
        nextCursor: string | null;
      }
    | unknown[]
  >;
  normalize?(input: unknown): NormalizedNotice;
};
export const bzpSourceId = 'bzp';
export class BzpClient implements NoticeSource {
  readonly id = bzpSourceId;
  readonly filterWindow = true;
  readonly noticeTypes = NOTICE_TYPES;
  private nextRequest = 0;
  constructor(
    private config: Pick<Config, 'BZP_REQUEST_INTERVAL_MS'>,
    private http: typeof fetch = fetch,
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
    if (!NOTICE_TYPES.includes(type as (typeof NOTICE_TYPES)[number]))
      throw new Error('Unsupported notice type');
    if (!Number.isInteger(size) || size < 1 || size > 100)
      throw new Error('Page size must be between 1 and 100');
    const url = new URL('https://ezamowienia.gov.pl/mo-board/api/v1/notice');
    for (const [k, v] of Object.entries({
      NoticeType: type,
      PublicationDateFrom: new Date(from.getTime() - 2 * 3600000).toISOString(),
      PublicationDateTo: new Date(to.getTime() + 2 * 3600000).toISOString(),
      PageSize: String(size),
      ...(cursor ? { SearchAfter: cursor } : {}),
    }))
      url.searchParams.set(k, v);
    return retry(
      async () => {
        await sleep(Math.max(0, this.nextRequest - Date.now()), signal);
        this.nextRequest = Date.now() + this.config.BZP_REQUEST_INTERVAL_MS;
        const response = await this.http(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.any([AbortSignal.timeout(20000), ...(signal ? [signal] : [])]),
        });
        if (!response.ok)
          throw new ExternalError(response.status, retryAfter(response.headers.get('retry-after')));
        const items = z
          .array(z.unknown())
          .max(100)
          .parse(await response.json());
        return {
          items,
          nextCursor: items.length
            ? z.object({ objectId: z.string().min(1) }).parse(items.at(-1)).objectId
            : null,
        };
      },
      { signal },
    );
  }
  normalize(input: unknown) {
    return normalizeNotice(input);
  }
}
