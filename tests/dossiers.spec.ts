import { test, expect } from '@playwright/test';

test.describe('Dossiers Module', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/dossiers');
  });

  test('should display operational KPIs', async ({ page }) => {
    await expect(page.getByText('Dossiers ouverts')).toBeVisible();
    await expect(page.getByText('Audiences à venir')).toBeVisible();
    await expect(page.getByText('Sans prochaine action')).toBeVisible();
    await expect(page.getByText('Stockage utilisé')).toBeVisible();
  });

  test('should open new dossier modal', async ({ page }) => {
    const newBtn = page.getByRole('button', { name: 'Nouveau Dossier' });
    if (await newBtn.isVisible()) {
      await newBtn.click();
      await expect(page.getByText('Nouveau dossier')).toBeVisible();
      await expect(page.getByLabel('Référence Dossier')).toBeVisible();
    }
  });

  test('should toggle archived dossiers', async ({ page }) => {
    const archiveBtn = page.getByRole('button', { name: 'Voir l\'Archive' });
    await archiveBtn.click();
    await expect(page.getByRole('button', { name: 'Voir Dossiers Actifs' })).toBeVisible();
  });

  test('should filter dossiers by search', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Référence, client, adversaire...');
    await searchInput.fill('NON_EXISTENT_REFERENCE_12345');
    await expect(page.getByText('Aucun dossier trouvé.')).toBeVisible();
  });

  test('should open finances panel', async ({ page }) => {
    // This requires at least one dossier to be present
    const financeBtn = page.locator('button[title="Honoraires & Finances"]').first();
    if (await financeBtn.isVisible()) {
      await financeBtn.click();
      await expect(page.getByText('Total Facturé')).toBeVisible();
      await expect(page.getByText('Reste à payer')).toBeVisible();
    }
  });

});
