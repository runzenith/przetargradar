import { describe, expect, it, vi } from 'vitest';
import {
  normalizeTedNotice,
  TedClient,
  xmlNoticeText,
  adaptTedNotice,
} from '../../packages/core/src/ted.js';
const notice = {
  ND: '2026/S 001-000001',
  TI: 'Modernizacja infrastruktury kolejowej',
  PD: '20261109',
  DT: '20261215',
  CY: 'PL',
  TD: 'cn-standard',
  NC: 'Works',
  AU: 'PKP Polskie Linie Kolejowe S.A.',
  TW: 'Warszawa',
  RC: 'PL91',
  PC: '45234100-7',
  PR: 'Open',
};
describe('TED provider', () => {
  it('normalizes Polish notice metadata and keeps the TED source identity', () => {
    const normalized = normalizeTedNotice(notice);
    expect(normalized.sourceId).toBe(notice.ND);
    expect(normalized.sourceKey).toBe(`ted:${notice.ND}`);
    expect(normalized.buyerRegion).toBe('mazowieckie');
    expect(normalized.category).toBe('works');
    expect(normalized.cpv).toBe('45234100');
    expect(normalized.sourceUrl).toContain(encodeURIComponent(notice.ND));
    expect(normalized.deadline?.toISOString()).toBe('2026-12-14T23:00:00.000Z');
  });
  it('uses TED page tokens and a Poland-only query', async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          notices: [
            {
              'publication-number': '780445-2026',
              'publication-date': '2026-11-10+01:00',
              'notice-type': 'cn-standard',
              'notice-title': { pol: 'Polskie ogłoszenie', eng: 'English title' },
              'organisation-name-buyer': { pol: ['Urząd Testowy'] },
              'organisation-city-buyer': ['Radom'],
              'classification-cpv': ['90511000'],
              'contract-nature': 'services',
              'deadline-receipt-tender-date-lot': ['2026-11-17+01:00'],
              'deadline-receipt-tender-time-lot': ['10:00:00+01:00'],
            },
          ],
          totalNoticeCount: 2,
          iterationNextToken: 'next',
          timedOut: false,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          '<ContractNotice><Description>Pełny opis ogłoszenia, którego nie ma w metadanych.</Description></ContractNotice>',
        ),
      );
    const client = new TedClient({ TED_REQUEST_INTERVAL_MS: 0 }, http);
    const result = await client.page(
      'cn-standard',
      new Date('2026-11-09T00:00:00Z'),
      new Date('2026-11-09T23:59:59Z'),
      'previous',
      25,
    );
    expect(result.nextCursor).toBe('next');
    const normalized = normalizeTedNotice(await client.hydrate(result.items[0]));
    expect(normalized.title).toBe('Polskie ogłoszenie');
    expect(normalized.noticeType).toBe('ContractNotice');
    expect(normalized.text).toContain('Pełny opis ogłoszenia');
    expect(normalized.deadline?.toISOString()).toBe('2026-11-17T09:00:00.000Z');
    expect(http.mock.calls[1]?.[0]).toBe('https://ted.europa.eu/en/notice/780445-2026/xml');
    const request = http.mock.calls[0];
    expect(request?.[1]).toMatchObject({ method: 'POST' });
    expect(String(request?.[1]?.body)).toContain('buyer-country=POL');
    expect(String(request?.[1]?.body)).toContain('"iterationNextToken":"previous"');
  });
});
it('rejects XML entities and preserves XML labels and currency', () => {
  expect(() => xmlNoticeText('<!DOCTYPE x [<!ENTITY bomb "x">]><x>&bomb;</x>')).toThrow(
    'TED_XML_INVALID',
  );
  expect(
    xmlNoticeText('<ContractNotice><Amount currencyID="PLN">123.00</Amount></ContractNotice>'),
  ).toContain('currencyID: PLN');
});
it('keeps a multi-lot deadline unknown instead of pairing unrelated dates and times', () => {
  const n = adaptTedNotice(
    {
      'publication-number': '780445-2026',
      'publication-date': '2026-11-10+01:00',
      'deadline-receipt-tender-date-lot': ['2026-11-17+01:00', '2026-11-20+01:00'],
      'deadline-receipt-tender-time-lot': ['10:00:00+01:00'],
    },
    'Pełne źródło',
  );
  expect(n.deadlineISO).toBeNull();
});
it('reuses complete stored XML for unchanged metadata and fetches a changed revision', async () => {
  const raw = {
    'publication-number': '780445-2026',
    'publication-date': '2026-11-10+01:00',
    'notice-version': '01',
    'notice-title': { pol: 'Tytuł' },
  };
  const xml =
    '<ContractNotice><Description>Pełny opis bez skracania.</Description></ContractNotice>';
  const cached = adaptTedNotice(raw, xmlNoticeText(xml));
  const http = vi.fn<typeof fetch>().mockResolvedValue(new Response(xml));
  const cache = {
    get: vi.fn().mockResolvedValue({ raw: cached, fetchedAt: new Date() }),
    touch: vi.fn(),
  };
  const client = new TedClient({ TED_REQUEST_INTERVAL_MS: 0 }, http, cache);
  expect(await client.hydrate(raw)).toEqual(cached);
  expect(http).not.toHaveBeenCalled();
  await client.hydrate({ ...raw, 'notice-version': '02' });
  expect(http).toHaveBeenCalledTimes(1);
});
it('accepts the final iteration page even when the total count exceeds its length', async () => {
  const http = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      notices: [{ 'publication-number': '780445-2026' }],
      totalNoticeCount: 100,
      iterationNextToken: null,
    }),
  );
  const client = new TedClient({ TED_REQUEST_INTERVAL_MS: 0 }, http);
  const page = await client.page('cn-standard', new Date(), new Date(), 'last-page-token', 25);
  expect(page.nextCursor).toBeNull();
  expect(page.items).toHaveLength(1);
});
it('does not invalidate analyses when adding cache-only version metadata', () => {
  const raw = adaptTedNotice(
    { 'publication-number': '780445-2026', 'publication-date': '2026-11-10+01:00' },
    'Treść',
  );
  const { noticeVersion: _, ...legacy } = raw;
  expect(normalizeTedNotice(legacy).contentHash).toBe(
    normalizeTedNotice({ ...raw, noticeVersion: '01' }).contentHash,
  );
});
