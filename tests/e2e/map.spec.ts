import { test, expect } from '@playwright/test';
test('system cards and every sync status stay dark and readable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.route('**/api/system', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const log = body.sync.logs[0];
    body.sync.logs = ['completed', 'running', 'partial', 'interrupted', 'failed'].map(
      (status, i) => ({ ...log, id: 'test-' + i, status }),
    );
    await route.fulfill({ response, json: body });
  });
  await page.goto('/?view=system');
  await page.getByRole('button', { name: 'Włącz ciemny motyw' }).click();
  await expect(page.locator('.system-info > div')).toHaveCount(2);
  await expect(page.locator('.sync-badge')).toHaveCount(5);
  for (const card of await page.locator('.system-info > div').all()) {
    expect(await card.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
      'rgb(255, 255, 255)',
    );
  }
  await expect(page.locator('.sync-badge.completed')).toHaveCSS(
    'background-color',
    'rgb(32, 42, 35)',
  );
  for (const badge of await page.locator('.sync-badge').all()) {
    expect(await badge.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
      'rgb(255, 255, 255)',
    );
  }
  await page.screenshot({ path: 'test-results/system-dark.png', fullPage: true });
});
test('charcoal theme covers populated and empty tender panels', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Włącz ciemny motyw' }).click();
  await expect(page.locator('.tile-card')).toHaveCount(12);
  await page.screenshot({ path: 'test-results/charcoal-list.png', fullPage: true });
  await page.getByRole('textbox', { name: 'Szukaj zamówień' }).fill('nieistniejacy-unikat');
  await expect(page.locator('.empty-state')).toBeVisible();
  for (const selector of ['.empty-state']) {
    await expect(page.locator(selector)).toHaveCSS('background-color', 'rgb(25, 25, 31)');
  }
  await page.screenshot({ path: 'test-results/charcoal-empty.png', fullPage: true });
});
test('explores cities, opens a tender map and persists the dark theme', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/?view=map');
  await expect(page.getByRole('heading', { name: 'Mapa zamówień.' })).toBeVisible();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.locator('.atlas-counter strong')).toHaveText('14');
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('O projekcie i pomoc', { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: 'test-results/map-light.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Włącz ciemny motyw' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.locator('.radar-pin').first()).toBeVisible();
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible({ timeout: 20000 });
  await page.screenshot({
    path: 'test-results/map-dark.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('textbox', { name: 'Znajdź miejscowość' }).fill('Poznań');
  await page.locator('.city-suggestions button').click();
  await expect(page.locator('.atlas-results-header h2')).toHaveText('Poznań');
  await expect(page.locator('.atlas-card')).toHaveCount(1);
  await page.locator('.atlas-card').click();
  await expect(page.locator('.tender-location .leaflet-container')).toBeVisible();
  await expect(page.locator('.location-caption')).toContainText('środek miejscowości');
  await page.locator('.tender-location').scrollIntoViewIfNeeded();
  await page
    .getByRole('dialog')
    .screenshot({ path: 'test-results/location-dark.png', animations: 'disabled' });
  await page.getByRole('dialog').getByRole('button', { name: 'Włącz jasny motyw' }).click();
  await page.getByRole('button', { name: 'Zamknij szczegóły' }).click();
  await expect(page.getByRole('button', { name: 'Włącz ciemny motyw' })).toBeVisible();
  await page.getByRole('button', { name: 'Włącz ciemny motyw' }).click();
  await expect(page.locator('.atlas-results-header h2')).toHaveText('Poznań');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.radar-map-canvas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({
    path: 'test-results/map-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
});
