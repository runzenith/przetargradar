import { describe, expect, it } from 'vitest';
import {
  analyzeDemo,
  prepareMaterials,
  validateAnalysis,
  normalizeProviderFacts,
  fitGroq,
  groqTokenReservation,
} from '../../packages/core/src/ai.js';
import { demoNotices } from '../../packages/core/src/demo.js';
import { normalizeNotice } from '../../packages/core/src/bzp.js';
import { analysisSchema } from '../../packages/contracts/src/index.js';
import { cacheKeyFor } from '../../packages/core/src/ingest.js';
import { configSchema } from '../../packages/core/src/config.js';
const config = configSchema.parse({
  DATABASE_URL: 'mysql://test',
  ADMIN_TOKEN: 'test-admin-token-123456789012',
});
describe('analysis quality and cache contract', () => {
  it('canonicalizes explicit decimal notation without guessing or financial arithmetic', () => {
    expect(normalizeProviderFacts({ bidBond: { amount: '5 000,00' } })).toEqual({
      bidBond: { amount: '5000.00' },
    });
    expect(normalizeProviderFacts({ bidBond: { amount: 5000 } })).toEqual({
      bidBond: { amount: '5000' },
    });
    expect(normalizeProviderFacts({ bidBond: { amount: 'about 5000 PLN' } })).toEqual({
      bidBond: { amount: 'about 5000 PLN' },
    });
  });
  it('fits Groq byte reservation into the account quota and marks incomplete material', () => {
    expect(() =>
      fitGroq(config, [{ sourceId: 'x', text: 'Material '.repeat(50000) }], false),
    ).toThrow('Całe ogłoszenie');
  });
  const materials = demoNotices()
    .slice(0, 1)
    .map((n) => {
      const v = normalizeNotice(n);
      return { sourceId: v.sourceId, text: v.text };
    });
  it('extracts exact amounts and verifiable evidence from demo case', () => {
    const a = analyzeDemo(materials, false);
    expect(a.estimatedValue?.amount).toBe('280000.00');
    expect(a.estimatedValue?.basis).toBe('net');
    expect(a.bidBond?.amount).toBe('5000.00');
    expect(a.requirements).toHaveLength(1);
    expect(a.executionLocation?.value).toBe('Poznań');
    expect(a.deadline).toBeNull();
    expect(a.requirements[0]?.evidence.quote).toContain('dwie wdrożone integracje');
  });
  it('does not turn missing value/bond/deadline into zeros or fabricated dates', () => {
    const n = normalizeNotice(demoNotices()[1]);
    const a = analyzeDemo([{ sourceId: n.sourceId, text: n.text }], false);
    expect(a.estimatedValue).toBeNull();
    expect(a.bidBond).toBeNull();
    expect(a.deadline).toBeNull();
  });
  it('rejects invented certificates, sources and monetary evidence', () => {
    const a = analyzeDemo(materials, false);
    expect(() =>
      validateAnalysis(
        {
          ...a,
          requirements: [
            {
              text: 'ISO required',
              evidence: {
                sourceId: materials[0]!.sourceId,
                quote: 'Wymagany certyfikat ISO 9001',
                location: null,
              },
            },
          ],
        },
        materials,
        false,
      ),
    ).toThrow('Evidence');
    expect(() =>
      validateAnalysis(
        { ...a, estimatedValue: { ...a.estimatedValue, amount: '999999.00' } },
        materials,
        false,
      ),
    ).toThrow('Amount');
    expect(() =>
      validateAnalysis({ ...a, scope: { ...a.scope, sourceIds: ['invented'] } }, materials, false),
    ).toThrow('scope');
    expect(
      analysisSchema.safeParse({
        ...a,
        estimatedValue: { ...a.estimatedValue, amount: 280000 },
      }).success,
    ).toBe(false);
  });
  it('retains source identities and marks shortened material', () => {
    const p = prepareMaterials(materials, 50);
    expect(p.truncated).toBe(true);
    expect(p.materials[0]?.sourceId).toBe(materials[0]?.sourceId);
    expect(p.materials[0]?.text).toHaveLength(50);
  });
  it('keys cache by input, model, mode, prompt and schema', () => {
    expect(cacheKeyFor('a', config)).toBe(cacheKeyFor('a', config));
    expect(cacheKeyFor('b', config)).not.toBe(cacheKeyFor('a', config));
    expect(cacheKeyFor('a', { ...config, APP_MODE: 'LIVE' })).not.toBe(cacheKeyFor('a', config));
    expect(
      cacheKeyFor('a', {
        ...config,
        APP_MODE: 'LIVE',
        GEMINI_MODEL: 'different',
      }),
    ).not.toBe(cacheKeyFor('a', { ...config, APP_MODE: 'LIVE' }));
  });
  it('requires explicit LIVE cost authorization', () => {
    expect(
      configSchema.safeParse({
        ...config,
        APP_MODE: 'LIVE',
        AI_LIVE_ENABLED: 'true',
        AI_DAILY_LIMIT: 0,
      }).success,
    ).toBe(false);
  });
});
