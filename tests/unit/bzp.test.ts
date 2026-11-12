import { describe, it, expect, vi } from 'vitest';
import fixture from '../fixtures/bzp-contract-notice.json';
import { BzpClient, htmlText, normalizeNotice, sourceDate } from '../../packages/core/src/bzp.js';
import { ExternalError, retry, retryAfter } from '../../packages/core/src/utils.js';
describe('verified BZP contract (captured 2026-11-09)', () => {
  it('pads provider date queries to cover its observed timezone shift', async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(Response.json([]));
    const from = new Date('2026-11-11T11:00:00Z');
    const to = new Date('2026-11-11T12:00:00Z');
    await new BzpClient({ BZP_REQUEST_INTERVAL_MS: 3100 }, http).page(
      'ContractNotice',
      from,
      to,
      null,
      100,
    );
    const url = new URL(String(http.mock.calls[0]![0]));
    expect(url.searchParams.get('PublicationDateFrom')).toBe('2026-11-11T09:00:00.000Z');
    expect(url.searchParams.get('PublicationDateTo')).toBe('2026-11-11T14:00:00.000Z');
  });
  it('normalizes the real API response without confusing buyer and execution location', () => {
    const n = normalizeNotice(fixture[0]);
    expect(n.sourceId).toBe('08df3e38-1ecc-f9d2-c1c5-d5000193e597');
    expect(n.procedureId).toBe('ocds-148610-6bebbdb4-fa89-4887-a266-848b883d6f4c');
    expect(n.cpv).toBe('33100000-1');
    expect(n.category).toBe('supplies');
    expect(n.deadline?.toISOString()).toBe('2026-11-18T08:00:00.000Z');
    expect(n.buyerRegion).toBe('zachodniopomorskie');
    expect(n.sourceUrl).toBe(
      'https://ezamowienia.gov.pl/mp-client/search/list/ocds-148610-6bebbdb4-fa89-4887-a266-848b883d6f4c',
    );
    expect(n.text).toContain('Termin składania ofert: 2026-11-18 09:00');
    expect(n.text).not.toContain('font-family');
  });
  it('preserves unknown deadlines and uses Warsaw explicitly for offset-less dates', () => {
    expect(normalizeNotice({ ...fixture[0], submittingOffersDate: null }).deadline).toBeNull();
    expect(sourceDate('2026-11-18T09:00:00').toISOString()).toBe('2026-11-18T08:00:00.000Z');
    expect(sourceDate('2026-07-18T09:00:00').toISOString()).toBe('2026-07-18T07:00:00.000Z');
    expect(() => sourceDate('not-a-date')).toThrow();
  });
  it('does not execute or include scripts and styles', () => {
    expect(htmlText('<style>x</style><script>alert(1)</script><p>Treść &amp; dane</p>')).toBe(
      'Treść & dane',
    );
  });
  it('uses documented cursor and never PageNumber', async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(new Response('[]', { status: 200 }));
    await new BzpClient({ BZP_REQUEST_INTERVAL_MS: 3100 }, http).page(
      'ContractNotice',
      new Date('2026-11-09T00:00:00Z'),
      new Date('2026-11-09T01:00:00Z'),
      'cursor-value',
      25,
    );
    const url = new URL(String(http.mock.calls[0]?.[0]));
    expect(url.searchParams.get('SearchAfter')).toBe('cursor-value');
    expect(url.searchParams.get('PageSize')).toBe('25');
    expect(url.searchParams.has('PageNumber')).toBe(false);
  });
});
describe('bounded retry policy', () => {
  it('does not equate every 403 with rate limiting', async () => {
    const call = vi.fn().mockRejectedValue(new ExternalError(403));
    await expect(retry(call, { pause: vi.fn() })).rejects.toThrow('403');
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('honors Retry-After with bounded attempts', async () => {
    const call = vi
      .fn()
      .mockRejectedValueOnce(new ExternalError(429, 6000))
      .mockResolvedValue('ok');
    const pause = vi.fn().mockResolvedValue(undefined);
    expect(await retry(call, { pause })).toBe('ok');
    expect(pause.mock.calls[0]?.[0]).toBe(6000);
    expect(retryAfter('2')).toBe(2000);
    expect(retryAfter('garbage')).toBeNull();
  });
  it('caps retry attempts and never waits less than a long Retry-After', async () => {
    const call = vi.fn().mockRejectedValue(new ExternalError(503));
    await expect(retry(call, { pause: vi.fn(), attempts: 3 })).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(3);
    const pause = vi.fn();
    await expect(
      retry(
        async () => {
          throw new ExternalError(429, 120000);
        },
        { pause },
      ),
    ).rejects.toThrow();
    expect(pause).not.toHaveBeenCalled();
  });
});
