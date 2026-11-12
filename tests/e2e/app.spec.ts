import { test, expect } from '@playwright/test';
test('filters persist in URL, opens source and closes with keyboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Zamówienia publiczne' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Szukaj zamówień' }).fill('obiegu');
  await expect(page).toHaveURL(/q=obiegu/);
  const title = page.getByRole('button', {
    name: 'Rozbudowa systemu elektronicznego obiegu dokumentów',
    exact: true,
  });
  await expect(title).toBeVisible();
  await title.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('tab', { name: 'Analiza AI i warunki', exact: true }).click();
  await page.locator('.evidence summary').first().click();
  await expect(page.locator('.evidence blockquote').first()).toBeVisible();
  await expect(page).toHaveURL(/tender=/);
  await expect(
    page.getByText(
      'Analiza na podstawie ogłoszenia — dokumentacja postępowania nie została przeanalizowana.',
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Treść i dokumenty', exact: true }).click();
  await expect(page.locator('.source-text')).toContainText(
    'Wartość szacunkowa: 280000.00 PLN netto.',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page).toHaveURL(/q=obiegu/);
  await expect(title).toBeFocused();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Szukaj zamówień' })).toHaveValue('obiegu');
});
test('pagination and empty state use backend data', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.opportunity-card')).toHaveCount(12);
  await page.getByRole('button', { name: 'Następna strona' }).click();
  await expect(page.locator('.opportunity-card')).toHaveCount(2);
  await expect(page).toHaveURL(/page=2/);
  await page.getByRole('textbox', { name: 'Szukaj zamówień' }).fill('nieistniejący-unikat');
  await expect(page.getByRole('heading', { name: 'Radar nie znalazł zamówień' })).toBeVisible();
  await page
    .locator('.empty-state')
    .getByRole('button', { name: 'Wyczyść wyszukiwanie', exact: true })
    .click();
  await expect(page.locator('.opportunity-card')).toHaveCount(12);
});
test('system view displays durable sync history', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Status systemu', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Status systemu' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Historia synchronizacji' })).toBeVisible();
  await expect(page.getByText('Tryb DEMO', { exact: true })).toBeVisible();
});
test('mobile navigation and full-width detail view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button', { name: 'Otwórz nawigację' }).click();
  await expect(page.getByRole('button', { name: 'Status systemu', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Wszystkie zamówienia' }).click();
  await page
    .getByRole('button', {
      name: 'Rozbudowa systemu elektronicznego obiegu dokumentów',
      exact: true,
    })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const bounds = await page.getByRole('dialog').boundingBox();
  expect(bounds?.width).toBeCloseTo(390, 1);
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth)).toBe(390);
  await page
    .getByRole('dialog')
    .screenshot({ path: 'test-results/tender-mobile.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Zamknij szczegóły' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('detail uses readable labels, separates missing data and shows scheduled retries', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('**/api/tenders/*', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.analysis.missingInformation = [
      'estimatedValue',
      'bidBond',
      'deadline',
      'executionLocation',
    ];
    body.analysis.estimatedValue = null;
    body.analysis.bidBond = null;
    body.analysis.executionLocation = null;
    body.analysisStatus = 'completed';
    body.analysisError = 'AI_SCHEMA: invalid response';
    body.analysisJob = {
      status: 'pending',
      attempts: 1,
      maxAttempts: 3,
      nextAttemptAt: new Date(Date.now() + 60000).toISOString(),
    };
    body.notices[0].noticeType = 'TenderResultNotice';
    await route.fulfill({ response, json: body });
  });
  await page.goto('/');
  await page
    .getByRole('button', {
      name: 'Rozbudowa systemu elektronicznego obiegu dokumentów',
      exact: true,
    })
    .click();
  const detail = page.getByRole('dialog');
  await expect(detail).toBeVisible();
  expect((await detail.boundingBox())?.width).toBeCloseTo(1440, 1);
  await page.getByRole('tab', { name: 'Analiza AI i warunki', exact: true }).click();
  await expect(detail.getByText('Zaplanowano ponowną próbę', { exact: true })).toBeVisible();
  await expect(detail.locator('.detail-facts')).toContainText('Ogłoszono wynik');
  await expect(detail.locator('.detail-facts')).not.toContainText('Termin składania ofert');
  await expect(detail.locator('.missing-section')).toContainText('Wadium — sprawdź');
  await expect(detail.locator('.missing-section')).not.toContainText('estimatedValue');
  await expect(detail.locator('.missing-section')).not.toContainText('Termin składania ofert');
  await expect(detail.locator('.notice-banner')).toHaveCount(0);
  await detail.screenshot({ path: 'test-results/tender-detail.png', animations: 'disabled' });
  await detail.locator('.missing-section').scrollIntoViewIfNeeded();
  await detail.screenshot({ path: 'test-results/tender-analysis.png', animations: 'disabled' });
});
