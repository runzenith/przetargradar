import { describe, it, expect } from 'vitest';
import { listQuerySchema } from '../../packages/contracts/src/index';
import { industries, industryFor } from '../../packages/contracts/src/discovery';
import { tenderFilters } from '../../apps/api/src/app';
import { sourcePassages } from '../../apps/web/src/lib/source-reader';
describe('discovery filters', () => {
  it('maps a validated industry to CPV prefixes in database filters', () => {
    const q = listQuerySchema.parse({
      industry: 'it',
      source: 'bk',
      city: 'Dobczyce',
      deadlineDays: '14',
    });
    const filter = tenderFilters(q);
    expect(filter.sourceKey).toEqual({ startsWith: 'bk:' });
    expect(filter.buyerCity).toBe('Dobczyce');
    expect(JSON.stringify(filter.AND)).toContain('"startsWith":"72"');
    expect(JSON.stringify(filter.AND)).toContain('deadline');
  });
  it('rejects unknown industries and unbounded deadlines', () => {
    expect(listQuerySchema.safeParse({ industry: 'invented' }).success).toBe(false);
    expect(listQuerySchema.safeParse({ deadlineDays: '-1' }).success).toBe(false);
  });
  it('keeps BZP separate from the other feeds', () => {
    expect(tenderFilters(listQuerySchema.parse({ source: 'bzp' })).NOT).toEqual({
      OR: ['ted:', 'bk:', 'pz:'].map((prefix) => ({ sourceKey: { startsWith: prefix } })),
    });
  });
  it('combines status with industry and deadline instead of replacing conditions', () => {
    const f = tenderFilters(
      listQuerySchema.parse({ industry: 'medical', status: 'active', deadlineDays: 7 }),
    );
    expect(Array.isArray(f.AND) && f.AND.length).toBe(3);
    expect(industries.length).toBe(22);
    expect(industryFor('72200000')?.id).toBe('it');
    expect(industryFor(null)).toBeUndefined();
    expect(industryFor('45231300')?.id).toBe('water');
  });
  it('preserves full source text without filters and narrows by topic and query', () => {
    const text = 'Zamawiający: Gmina\n\nTermin składania: jutro\n\nWadium: 5000 PLN';
    expect(sourcePassages(text, '', 'all').join('\n\n')).toBe(text);
    expect(sourcePassages(text, '5000', 'money')).toEqual(['Wadium: 5000 PLN']);
    expect(sourcePassages(text, '', 'dates')).toEqual(['Termin składania: jutro']);
  });
});
