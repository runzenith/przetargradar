import { test, expect } from '@playwright/test';
test('discovery filters, detail, sources and responsive themes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.addInitScript(() => localStorage.removeItem('radar-theme'));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const tender = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Modernizacja i rozbudowa systemu elektronicznego obiegu dokumentów',
    sourceKey: 'bk:123',
    buyer: 'Urząd Miasta i Gminy w Dobczycach',
    buyerCity: 'Dobczyce',
    buyerRegion: 'małopolskie',
    category: 'services',
    cpv: '72200000',
    publishedAt: '2026-11-11T07:00:00Z',
    deadline: '2026-11-27T10:00:00Z',
    sourceUrl: 'https://example.com/notice',
    status: 'active',
    statusBasis: 'Termin składania ofert podany w ogłoszeniu.',
    analysisStatus: 'completed',
    estimatedValue: '280000.00',
    currency: 'PLN',
    valueBasis: 'net',
    updatedAt: '2026-11-11T08:00:00Z',
    contentHash: 'abc',
    isDemo: false,
  };
  const evidence = {
    sourceId: 'test',
    quote: 'Wymagane wdrożenie systemu obiegu dokumentów',
    location: null,
  };
  const detail = {
    ...tender,
    documents: [
      {
        name: 'SWZ.pdf',
        url: 'https://example.com/SWZ.pdf',
        status: 'extracted',
        sourceId: 'pdf:test',
      },
    ],
    documentTexts: [
      { sourceId: 'pdf:test', text: 'Dokument: SWZ.pdf\n[Strona 1]\nWadium wynosi 1000 PLN.' },
    ],
    analysis: {
      inputHash: 'abc',
      title: tender.title,
      summary:
        'Zamówienie obejmuje wdrożenie elektronicznego obiegu dokumentów, migrację danych oraz szkolenie pracowników urzędu. Wymagane jest zapewnienie wsparcia technicznego po uruchomieniu systemu.',
      requirements: [
        { text: 'Wdrożenie systemu i migracja danych ze środowiska zamawiającego.', evidence },
      ],
      risks: [],
      missingInformation: [],
      scope: { truncated: false, sourceIds: ['pdf:test'], materials: 'notice_and_documents' },
      bidBond: null,
      estimatedValue: { amount: '280000.00', currency: 'PLN', basis: 'net', evidence },
      executionLocation: null,
    },
    notices: [
      {
        id: 'notice',
        current: true,
        noticeNumber: 'BK/2026/123',
        noticeType: 'ContractNotice',
        publishedAt: tender.publishedAt,
        text: 'Zamawiający: Urząd Miasta w Dobczycach\n\nTermin składania ofert: 27 listopada 2026\n\nWartość szacunkowa: 280000.00 PLN netto.\n\nWymagane wdrożenie systemu obiegu dokumentów',
      },
    ],
    analysisJob: null,
    analysisError: null,
  };
  const requests: string[] = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);
    let data = {};
    if (url.pathname === '/api/auth/me') data = { user: null, csrf: null };
    else if (url.pathname === '/api/system')
      data = {
        mode: 'LIVE',
        ai: { enabled: true, configured: true },
        counts: {},
        sync: { inProgress: false },
      };
    else if (url.pathname === '/api/tenders')
      data = {
        items: [
          tender,
          {
            ...tender,
            id: '22222222-2222-4222-8222-222222222222',
            title: 'Dostawa sprzętu komputerowego do pracowni dydaktycznych',
            sourceKey: 'ted:123-2026',
            buyer: 'Zespół Szkół Technicznych w Krakowie',
            buyerCity: 'Kraków',
            category: 'supplies',
            estimatedValue: null,
          },
          {
            ...tender,
            id: '33333333-3333-4333-8333-333333333333',
            title: 'Przebudowa drogi gminnej i budowa chodnika w centrum miejscowości',
            sourceKey: 'bzp:321',
            buyer: 'Gmina Wieliczka',
            buyerCity: 'Wieliczka',
            cpv: '45233120',
            estimatedValue: '1320000.00',
            category: 'works',
          },
        ],
        total: 3,
        page: 1,
        pageSize: 12,
        stats: { total: 1482, active: 864, completed: 620, pending: 862 },
        regions: ['małopolskie'],
        cities: ['Dobczyce', 'Kraków'],
      };
    else if (url.pathname.startsWith('/api/tenders/')) data = detail;
    else if (url.pathname === '/api/map/location') data = { place: null };
    await route.fulfill({ json: data });
  });
  await page.goto('http://127.0.0.1:5173/');
  await expect(page.locator('.opportunity-card')).toHaveCount(3);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.sidebar')).toHaveCount(0);
  expect((await page.locator('.workspace-header').boundingBox())!.height).toBeLessThan(90);
  const navButtons = await page
    .locator('.workspace-navigation > button')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
  expect(Math.max(...navButtons) - Math.min(...navButtons)).toBeLessThan(2);
  await expect(page.getByRole('navigation', { name: 'Główna nawigacja' })).toBeVisible();
  await page.getByRole('button', { name: 'Baza Konkurencyjności', exact: true }).click();
  await expect(page).toHaveURL(/source=bk/);
  await expect(
    page.getByRole('button', { name: 'Baza Konkurencyjności', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Wszystkie zamówienia', exact: true }).click();
  await expect(page).not.toHaveURL(/source=bk/);
  await page.screenshot({
    path: 'test-results/atelier-light.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Wszystkie filtry', exact: true }).click();
  await page.getByRole('combobox', { name: 'Miasto zamawiającego', exact: true }).fill('Dobczyce');
  await expect(page).toHaveURL(/city=Dobczyce/);
  await page.getByRole('combobox', { name: 'Źródło ogłoszenia', exact: true }).click();
  await page.getByRole('option', { name: 'Baza Konkurencyjności', exact: true }).click();
  await expect(page).toHaveURL(/source=bk/);
  await page.getByRole('button', { name: tender.title, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('W skrócie', { exact: true })).toBeVisible();
  await page.screenshot({
    path: 'test-results/atelier-detail-light.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('tab', { name: 'Treść i dokumenty', exact: true }).click();
  await expect(page.locator('.document-inventory')).toContainText('Uwzględniono w analizie');
  await page.getByRole('textbox', { name: 'Szukaj w treści ogłoszenia' }).fill('1000');
  await expect(page.locator('.reader-result')).toContainText('1');
  await expect(page.locator('.reader-document').last()).toContainText('Wadium wynosi 1000 PLN');
  await page.getByRole('textbox', { name: 'Szukaj w treści ogłoszenia' }).fill('280000');
  await expect(page.locator('.reader-result')).toContainText('1');
  await expect(page.locator('.reader-document').first()).toContainText('280000.00');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Otwórz nawigację', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Baza Konkurencyjności', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Zamknij nawigację', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Główna nawigacja' })).not.toBeVisible();
  await page.screenshot({
    path: 'test-results/atelier-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: tender.title, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth)).toBeLessThanOrEqual(390);
  await page
    .getByRole('dialog')
    .screenshot({ path: 'test-results/atelier-detail-mobile.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Zamknij szczegóły', exact: true }).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (overflow) throw Error('Mobile horizontal overflow');
  await page.getByRole('button', { name: 'Włącz ciemny motyw', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({
    path: 'test-results/atelier-dark.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { user: { id: 'user', email: 'test@example.com' }, csrf: 'test' } }),
  );
  await page.route('**/api/user/tenders', (route) => route.fulfill({ json: { states: [] } }));
  await page.reload();
  await page.getByRole('button', { name: 'Moje konto', exact: true }).click();
  await expect(
    page.locator('#account-options').getByRole('button', { name: 'Profil firmy', exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('#account-options').getByRole('button', { name: 'Status systemu', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#account-options')).toHaveCount(0);
  for (const width of [360, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    expect((await page.locator('.workspace-header').boundingBox())!.height).toBeLessThan(90);
    const cards = await page
      .locator('.tile-card')
      .evaluateAll((els) =>
        els.map((el) => ({ x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y })),
      );
    const sameRow = Math.abs(cards[0]!.y - cards[1]!.y) < 2;
    expect(sameRow).toBe(width > 620);
    if (width > 1080) expect(Math.abs(cards[0]!.y - cards[2]!.y)).toBeLessThan(2);
    if (width > 700) {
      const nav = await page.locator('.workspace-navigation').boundingBox();
      const actions = await page.locator('.workspace-actions').boundingBox();
      expect(nav!.x + nav!.width).toBeLessThanOrEqual(actions!.x + 1);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.route('**/api/tenders?*', async (route) => {
    const q = new URL(route.request().url()).searchParams;
    const size = Number(q.get('pageSize'));
    expect(size).toBe(12);
    const number = Number(q.get('page') ?? 1);
    await route.fulfill({
      json: {
        items: Array.from({ length: size }, (_, i) => ({
          ...tender,
          id: `row-${number}-${i}`,
          title: `Zamówienie ${(number - 1) * size + i + 1}`,
        })),
        total: 2665,
        page: number,
        pageSize: size,
        stats: { total: 2665, active: 2000, completed: 1000, pending: 1665 },
        regions: [],
        cities: [],
      },
    });
  });
  await page.goto('/?page=3');
  await expect(page.locator('.opportunity-card')).toHaveCount(12);
  await expect(page.locator('.pagination')).toContainText('25–36');
  await expect(page.locator('.page-number')).toHaveText('3');
  await page.getByRole('button', { name: 'Pierwsza strona', exact: true }).click();
  await expect(page.locator('.pagination')).toContainText('1–12');
  await expect(page.locator('.page-number')).toHaveText('1');
  await expect(page).not.toHaveURL(/page=3/);
  await page.getByRole('button', { name: 'Następna strona', exact: true }).click();
  await expect(page.locator('.pagination')).toContainText('13–24');
  await page.getByRole('button', { name: 'Tylko otwarte', exact: true }).click();
  await expect(page.locator('.pagination')).toContainText('1–12');
  if (errors.length) throw Error(errors.join('\n'));
  console.log(
    JSON.stringify({
      passed: true,
      checks: [
        'cards',
        'city URL',
        'source URL',
        'detail overview',
        'source search',
        'escape',
        'mobile overflow',
        'dark/light',
      ],
      filterRequest: requests.some((r) => r.includes('source=bk')),
    }),
  );
});
