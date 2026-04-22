import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const CONFIG = {
  baseUrl: 'https://www.elm-app.click', // Utilisation de votre URL de prod car elle semble plus stable
  email: 'demo@elm-pos.app',
  password: 'passer123',
  outputDir: 'docs/screenshots',
  routes: [
    { name: '01-login', path: '/login' },
    { name: '02-pos-main', path: '/pos' },
    { name: '03-caisse-sessions', path: '/caisse' },
    { name: '04-orders-history', path: '/orders' },
    { name: '05-contrats', path: '/contrats' },
    { name: '06-menu-du-jour', path: '/menu-du-jour' },
    { name: '07-livraison', path: '/livraison' },
    { name: '08-livreurs', path: '/livreurs' },
    { name: '09-team-tracking', path: '/team-tracking' },
    { name: '10-products-list', path: '/products' },
    { name: '11-categories', path: '/categories' },
    { name: '12-approvisionnement', path: '/approvisionnement' },
    { name: '13-revendeurs', path: '/revendeurs' },
    { name: '14-hotel-management', path: '/hotel' },
    { name: '15-dossiers-clients', path: '/dossiers' },
    { name: '16-honoraires', path: '/honoraires' },
    { name: '17-analytics', path: '/analytics' },
    { name: '18-depenses', path: '/depenses' },
    { name: '19-comptabilite', path: '/comptabilite' },
    { name: '20-clients', path: '/clients' },
    { name: '21-coupons', path: '/coupons' },
    { name: '22-whatsapp-integration', path: '/whatsapp' },
    { name: '23-staff-management', path: '/staff' },
    { name: '24-activity-logs', path: '/activity' },
    { name: '25-settings', path: '/settings' },
    { name: '26-help-center', path: '/help' },
    { name: '27-customer-display', path: '/display' },
    { name: '28-admin-profile', path: '/admin' },
    { name: '29-billing-subscription', path: '/billing' },
    { name: '30-configuration-business', path: '/configure' },
    { name: '31-inscription-onboarding', path: '/subscribe' },
    { name: '32-order-tracking-public', path: '/track' },
  ]
};

async function generateScreenshots() {
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }

  console.log(`🚀 Lancement de la capture FINALE (${CONFIG.routes.length} pages)...`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, 
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);

  try {
    console.log(`🔑 Connexion à ${CONFIG.baseUrl}/login...`);
    await page.goto(`${CONFIG.baseUrl}/login`, { waitUntil: 'domcontentloaded' });

    await page.fill('#email', CONFIG.email);
    await page.fill('#password', CONFIG.password);
    await page.click('button[type="submit"]');

    console.log('⏳ Authentification...');
    await page.waitForFunction(() => {
      return window.location.pathname !== '/login';
    }, { timeout: 60000 });

    console.log('✅ Connecté. Début de la capture...');
    await page.waitForTimeout(5000);

    for (const route of CONFIG.routes) {
      const screenshotPath = path.join(CONFIG.outputDir, `${route.name}.png`);
      console.log(`📸 [${route.name}] Navigation vers ${route.path}...`);
      
      try {
        await page.goto(`${CONFIG.baseUrl}${route.path}`, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(3000); // Un peu plus de temps pour les données
        
        // On capture
        await page.screenshot({ path: screenshotPath, fullPage: false });
        console.log(`✅ Sauvegardé : ${route.name}`);
      } catch (err) {
        console.error(`❌ Échec sur ${route.path}:`, err.message);
      }
    }

  } catch (error) {
    console.error('❌ Erreur critique :', error);
  } finally {
    await browser.close();
    console.log(`🏁 TERMINÉ ! Les ${CONFIG.routes.length} écrans sont prêts.`);
  }
}

generateScreenshots();
