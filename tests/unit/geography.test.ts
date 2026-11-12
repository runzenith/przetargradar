import { it, expect } from 'vitest';
import { resolvePlace, resolveLocationText } from '../../packages/core/src/geography';
it('recognizes an institution location with an inflected Polish locality', () => {
  expect(resolveLocationText('Centrum Usług Społecznych w Dobczycach', 'małopolskie')?.name).toBe(
    'Dobczyce',
  );
});
it('resolves Polish aliases and regions without inventing precise addresses', () => {
  expect(resolvePlace('Warszawa', 'mazowieckie')).toMatchObject({
    name: 'Warszawa',
    region: 'mazowieckie',
  });
  expect(resolvePlace('Toruń', 'kujawsko-pomorskie')?.lat).toBeCloseTo(53.01, 1);
  expect(resolvePlace('Warszawa', 'pomorskie')).toBeNull();
  expect(resolvePlace('Nieznana miejscowość 123', null)).toBeNull();
  expect(resolvePlace('Warszawa, Łódź i Poznań', null)).toBeNull();
  expect(resolvePlace(null, null)).toBeNull();
});
