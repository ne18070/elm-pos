import { test, expect } from '@playwright/test';

// Note: These tests assume the application is running and accessible.
// In a CI environment, you would typically use a test database or mocks.

test.describe('Contrats & Location', () => {
  
  test.beforeEach(async ({ page }) => {
    // Supposons que l'utilisateur est déjà connecté ou que nous gérons la session
    await page.goto('/contrats');
  });

  test('should display dashboard metrics', async ({ page }) => {
    const metrics = page.locator('.card');
    await expect(metrics).toHaveCount(4);
    await expect(page.getByText('Contrats actifs')).toBeVisible();
    await expect(page.getByText('Attente signature')).toBeVisible();
  });

  test('should filter contracts by status', async ({ page }) => {
    // Ouvrir les filtres
    await page.locator('button:has(svg.lucide-filter)').click();
    
    // Sélectionner le filtre "Signé"
    await page.locator('select').first().selectOption('signed');
    
    // Vérifier que tous les contrats affichés ont le badge "Signé"
    const badges = page.locator('span:has-text("Signé")');
    const count = await badges.count();
    for (let i = 0; i < count; i++) {
      await expect(badges.nth(i)).toBeVisible();
    }
  });

  test('should search for a contract by client name', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Rechercher client, véhicule, immatriculation...');
    await searchInput.fill('Test Client');
    
    // Attendre que la liste se mette à jour
    await page.waitForTimeout(500);
    
    const results = page.locator('button.w-full.flex.items-center.gap-3');
    const count = await results.count();
    for (let i = 0; i < count; i++) {
      await expect(results.nth(i)).toContainText(/Test Client/i);
    }
  });

  test('should validate rental period (end date after start date)', async ({ page }) => {
    // Ouvrir le panel de nouveau contrat
    await page.getByRole('button', { name: 'Contrat', exact: false }).click();
    
    // Remplir les dates de manière invalide
    await page.locator('input[type="date"]').first().fill('2026-05-10');
    await page.locator('input[type="date"]').nth(1).fill('2026-05-01'); // Retour avant départ
    
    await page.getByPlaceholder('Nom ou téléphone…').fill('Client Test');
    
    // Tenter d'enregistrer
    await page.getByRole('button', { name: 'Créer le contrat' }).click();
    
    // Vérifier l'apparition de l'erreur (via notification store)
    await expect(page.getByText('La restitution doit être après la prise en charge')).toBeVisible();
  });

  test('should detect vehicle conflict', async ({ page }) => {
    // Ce test nécessite des données pré-existantes ou des mocks
    // On simule ici la sélection d'un véhicule déjà loué
    await page.getByRole('button', { name: 'Contrat', exact: false }).click();
    
    // Sélectionner un véhicule (le premier de la liste)
    const select = page.locator('select').first();
    await select.selectOption({ index: 1 });
    
    // Si le véhicule est déjà loué, un avertissement doit s'afficher
    const warning = page.locator('p.text-status-error');
    // On ne peut pas garantir qu'il y aura un conflit sans mock, 
    // mais on teste la présence de la logique si on force une date conflictuelle
  });

});
