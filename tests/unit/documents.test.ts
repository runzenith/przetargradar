import { describe, it, expect, vi } from 'vitest';
import { publicIpv4, documentLinks, documentGet } from '../../packages/core/src/document-fetch';
import { materialSet } from '../../packages/core/src/documents';
import { aggregateHash } from '../../packages/core/src/ingest';
import { configSchema } from '../../packages/core/src/config';
import { validateAnalysis } from '../../packages/core/src/ai';
const config = configSchema.parse({
  APP_MODE: 'LIVE',
  DATABASE_URL: 'mysql://test',
  ADMIN_TOKEN: '123456789012345678901234',
});
describe('public procurement PDFs', () => {
  it('blocks local, link-local, private and cloud metadata addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '169.254.169.254',
      '10.0.0.1',
      '172.16.0.2',
      '192.168.1.1',
      '100.64.1.1',
      '0.0.0.0',
      '224.1.1.1',
      '::1',
    ])
      expect(publicIpv4(ip)).toBe(false);
    expect(publicIpv4('8.8.8.8')).toBe(true);
  });
  it('rejects HTTP, credentials and nonstandard ports before making a request', async () => {
    for (const url of [
      'http://example.com/a.pdf',
      'https://user:pw@example.com/a.pdf',
      'https://example.com:8000/a.pdf',
    ])
      await expect(documentGet(url, 100)).rejects.toThrow('DOCUMENT_URL_BLOCKED');
  });
  it('discovers BK file URIs and direct PDFs without treating a procurement page as PDF', () => {
    const links = documentLinks(
      {
        attachments: [{ file: { name: 'SWZ.pdf', uri: '/api/files/12' } }],
        html: '<a href="/files/warunki.pdf">SWZ</a> https://platformazakupowa.pl/transakcja/123',
      },
      'https://example.com/',
    );
    expect(links.files.map((f) => f.url)).toEqual([
      'https://example.com/api/files/12',
      'https://example.com/files/warunki.pdf',
    ]);
    expect(links.pages).toContain('https://platformazakupowa.pl/transakcja/123');
  });
  it('invalidates AI input when document text changes and deduplicates identical PDFs', async () => {
    const notices = [{ id: '1', sourceId: 'notice', text: 'Treść', contentHash: 'original' }];
    const db = {
      documentScan: {
        findMany: vi.fn().mockResolvedValue([
          {
            materials: [
              { sourceId: 'pdf:abc', text: '[Strona 1] Nowe wadium' },
              { sourceId: 'pdf:abc', text: '[Strona 1] Nowe wadium' },
            ],
          },
        ]),
      },
    };
    const set = await materialSet(db as never, notices, config);
    expect(set.materials).toHaveLength(2);
    expect(set.inputHash).not.toBe(aggregateHash(notices));
    const noticeOnly = await materialSet(db as never, notices, {
      ...config,
      DOCUMENTS_ENABLED: false,
    });
    expect(noticeOnly.inputHash).toBe(aggregateHash(notices));
  });
  it('validates a PDF quote against its actual page and marks document scope', () => {
    const materials = [
      {
        sourceId: 'pdf:abc',
        text: 'Dokument: SWZ.pdf\n[Strona 1]\nWymagane doświadczenie w realizacji dostaw.\n[Strona 2]\nTermin realizacji wynosi 30 dni.',
      },
    ];
    const analysis = {
      category: 'supplies',
      title: 'Dostawa',
      summary: 'Opis',
      requirements: [
        {
          text: 'Doświadczenie',
          evidence: {
            sourceId: 'pdf:abc',
            quote: 'Wymagane doświadczenie w realizacji dostaw.',
            location: 'SWZ.pdf — strona 1',
          },
        },
      ],
      risks: [],
      estimatedValue: null,
      bidBond: null,
      deadline: null,
      executionLocation: null,
      missingInformation: [],
      scope: { sourceIds: ['pdf:abc'], materials: 'notice_only', truncated: false },
    };
    expect(validateAnalysis(analysis, materials, false).scope.materials).toBe(
      'notice_and_documents',
    );
    analysis.requirements[0]!.evidence.location = 'SWZ.pdf — strona 2';
    expect(() => validateAnalysis(analysis, materials, false)).toThrow('page does not match');
  });
});
