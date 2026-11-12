import { test, expect } from '@playwright/test';
test('registration, profile, personalized feed, saved items and custom dropdown', async ({
  page,
}) => {
  await page.goto('/?view=auth');
  await page.getByRole('button', { name: 'Nie masz konta? Zarejestruj się' }).click();
  await page.getByLabel('E-mail', { exact: true }).fill(`browser-${Date.now()}@example.com`);
  await page
    .getByLabel('Hasło (minimum 12 znaków)', { exact: true })
    .fill('browser-password-12345');
  await page.getByRole('button', { name: 'Zarejestruj się', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Wyloguj się', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Profil firmy', exact: true }).click();
  const fields = page.locator('.profile-form textarea');
  await fields.nth(0).fill('Usługi IT');
  await fields.nth(1).fill('system');
  await fields.nth(4).fill('72263000-6');
  await page.getByRole('button', { name: 'Zapisz profil firmy', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Profil zapisany');
  await page.getByRole('button', { name: 'Dla Ciebie', exact: true }).click();
  await expect(page.locator('.match-score').first()).toBeVisible();
  await page.getByRole('button', { name: 'Zapisz zamówienie', exact: true }).first().click();
  await page.getByRole('button', { name: 'Zapisane', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Wszystkie zamówienia' }).click();
  await page.getByRole('combobox', { name: 'Rodzaj zamówienia' }).click();
  await page.getByRole('option', { name: 'Usługi', exact: true }).click();
  await expect(page).toHaveURL(/category=services/);
  await page.getByRole('button', { name: 'Wyloguj się', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Zaloguj / Zarejestruj' })).toBeVisible();
});
