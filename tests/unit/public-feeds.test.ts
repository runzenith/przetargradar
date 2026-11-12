import { expect, it, vi } from 'vitest';
import {
  BkClient,
  PzClient,
  normalizeBk,
  normalizePz,
  parsePz,
} from '../../packages/core/src/public-feeds';
const listing = (id: number) => ({
  id,
  title: 'Usługa IT',
  advertiser_name: 'Urząd Testowy',
  publication_date: '2026-11-10',
  submission_deadline: '2026-12-01 12:00:00',
});
const detail = (id: number) => ({
  title: 'Usługa IT',
  publication_date: '2026-11-10',
  submission_deadline: '2026-12-01 12:00:00',
  advertisement: { id },
  advertiser_address_details: {
    name: 'Urząd Testowy',
    address: { locality: 'Toruń', voivodeship: 'kujawsko-pomorskie' },
  },
  orders: [
    {
      order_items: [
        {
          description: 'Pełny opis zamówienia i wymagań, którego nie ma w skrócie.',
          cpv_items: [{ code: '72000000-5', name: 'Usługi informatyczne' }],
        },
      ],
    },
  ],
  contact_persons: [{ email: 'private@example.test' }],
});
const csv =
  'data_rozpoczecia,data_zakonczenia,firma_wystawiajaca,nazwa,id_zapytania,opis_i_specyfikacja,email\n"2026-11-10 09:00:00","2026-12-01 12:00:00","Urząd Testowy","Dostawa, sprzęt",20,"Opis pierwszy\nOpis drugi",private@example.test\n"2026-11-10 10:00:00","2026-12-01 12:00:00","Urząd Testowy","Druga oferta",10,Inny opis,private@example.test';
it('parses official CSV quoting, complete descriptions and source-scoped stable identifiers without contact columns', () => {
  const rows = parsePz(csv);
  expect(rows).toHaveLength(2);
  expect(rows[0]).not.toHaveProperty('email');
  const n = normalizePz(rows[0]);
  expect(n.title).toBe('Dostawa, sprzęt');
  expect(n.text).toContain('Opis pierwszy');
  expect(n.text).toContain('Opis drugi');
  expect(n.sourceKey).toBe('pz:20');
  expect(n.deadline?.toISOString()).toBe('2026-12-01T11:00:00.000Z');
  expect(normalizePz({ ...rows[0], opis_i_specyfikacja: 'Zmieniony opis' }).contentHash).not.toBe(
    n.contentHash,
  );
  expect(parsePz('')).toEqual([]);
  expect(() => parsePz('<html>Login required</html>')).toThrow();
});
it('paginates a PZ snapshot by identifiers and downloads it once during a run', async () => {
  const http = vi.fn().mockResolvedValue(new Response(csv));
  const client = new PzClient({ PZ_REQUEST_INTERVAL_MS: 0 }, http);
  const first = await client.page('', new Date(), new Date(), null, 1);
  expect(normalizePz(first.items[0]).sourceKey).toBe('pz:10');
  const next = await client.page('', new Date(), new Date(), first.nextCursor, 1);
  expect(normalizePz(next.items[0]).sourceKey).toBe('pz:20');
  expect(next.nextCursor).toBeNull();
  expect(http).toHaveBeenCalledTimes(1);
});
it('uses public BK search, hydrates full details and resumes with a stable page size', async () => {
  const http = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/search?')) {
      expect(u).toContain('status%5B0%5D=PUBLISHED');
      expect(u).toContain('limit=100');
      expect(u).toContain('publicationDateRange%5Bfrom%5D=2026-11-10');
      return Response.json({
        status: 'OK',
        data: { advertisements: [listing(1), listing(2)], meta: { total: 2 } },
      });
    }
    const id = Number(u.match(/announcements\/(\d+)\//)?.[1]);
    return Response.json({ status: 'OK', data: { advertisement: detail(id) } });
  });
  const client = new BkClient({ BK_REQUEST_INTERVAL_MS: 0 }, http);
  const from = new Date('2026-11-10T00:00:00Z');
  const first = await client.page('', from, from, null, 1);
  const n = normalizeBk(await client.hydrate(first.items[0]));
  expect(n.sourceKey).toBe('bk:1');
  expect(n.text).toContain('Pełny opis');
  expect(n.buyerCity).toBe('Toruń');
  expect(n.cpv).toBe('72000000');
  expect(JSON.stringify(n.raw)).not.toContain('private@example.test');
  const next = await client.page('', from, from, first.nextCursor, 1);
  expect(normalizeBk(await client.hydrate(next.items[0])).sourceKey).toBe('bk:2');
  expect(next.nextCursor).toBeNull();
});
it('rejects mismatched BK detail and refuses unauthorized access without retries or bypass', async () => {
  const denied = vi.fn().mockResolvedValue(new Response('', { status: 403 }));
  await expect(
    new BkClient({ BK_REQUEST_INTERVAL_MS: 0 }, denied).page('', new Date(), new Date(), null, 1),
  ).rejects.toThrow('403');
  expect(denied).toHaveBeenCalledTimes(1);
  const http = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ status: 'OK', data: { advertisements: [listing(1)], meta: { total: 1 } } }),
    )
    .mockResolvedValueOnce(Response.json({ status: 'OK', data: { advertisement: detail(999) } }));
  const client = new BkClient({ BK_REQUEST_INTERVAL_MS: 0 }, http);
  const page = await client.page('', new Date(), new Date(), null, 1);
  await expect(client.hydrate(page.items[0])).rejects.toThrow('identifier mismatch');
});
