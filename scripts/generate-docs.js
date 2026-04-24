const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'http://localhost:3000'; // Votre URL de dev Next.js
const SCREENSHOT_DIR = path.join(__dirname, '../docs/screenshots');
const CREDENTIALS = {
  email: 'votre-email@exemple.com',
  password: 'votre-mot-de-passe'
};

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function takeScreenshot(driver, name) {
  const image = await driver.takeScreenshot();
  fs.writeFileSync(path.join(SCREENSHOT_DIR, `${name}.png`), image, 'base64');
  console.log(`📸 Capture effectuée : ${name}.png`);
}

async function run() {
  let driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(new chrome.Options().windowSize({ width: 1440, height: 900 }))
    .build();

  try {
    // 1. LOGIN
    console.log('🚀 Connexion...');
    await driver.get(`${BASE_URL}/login`);
    await driver.wait(until.elementLocated(By.css('input[type="email"]')), 10000);
    
    await driver.findElement(By.css('input[type="email"]')).sendKeys(CREDENTIALS.email);
    await driver.findElement(By.css('input[type="password"]')).sendKeys(CREDENTIALS.password);
    await driver.findElement(By.css('button[type="submit"]')).click();

    // Attendre l'arrivée sur le dashboard
    await driver.wait(until.urlContains('/dashboard'), 15000);
    await takeScreenshot(driver, '01_dashboard_principal');

    // 2. PERSONNEL - ONGLETS
    console.log('👥 Navigation vers le Personnel...');
    await driver.get(`${BASE_URL}/staff`);
    await driver.wait(until.elementLocated(By.css('button')), 10000);
    await takeScreenshot(driver, '02_staff_equipe');

    // Onglet Présences
    console.log('📅 Capture des Présences...');
    const tabs = await driver.findElements(By.css('button'));
    for (let tab of tabs) {
      const text = await tab.getText();
      if (text.includes('Présences')) {
        await tab.click();
        await driver.sleep(1000); // Attendre l'animation
        await takeScreenshot(driver, '03_staff_presences');
        break;
      }
    }

    // Onglet Paie
    console.log('💰 Capture de la Paie...');
    const tabsPaie = await driver.findElements(By.css('button'));
    for (let tab of tabsPaie) {
      const text = await tab.getText();
      if (text.includes('Paie')) {
        await tab.click();
        await driver.sleep(1000);
        await takeScreenshot(driver, '04_staff_paie');
        break;
      }
    }

    // Onglet Congés
    console.log('🌴 Capture des Congés...');
    const tabsConges = await driver.findElements(By.css('button'));
    for (let tab of tabsConges) {
      const text = await tab.getText();
      if (text.includes('Congés')) {
        await tab.click();
        await driver.sleep(1000);
        await takeScreenshot(driver, '05_staff_conges_demandes');
        
        // Sous-onglet Planning
        const subTabs = await driver.findElements(By.css('button'));
        for (let sub of subTabs) {
          const subText = await sub.getText();
          if (subText.includes('Planning')) {
            await sub.click();
            await driver.sleep(1000);
            await takeScreenshot(driver, '06_staff_conges_planning');
            break;
          }
        }
        break;
      }
    }

    // 3. PARAMÈTRES
    console.log('⚙️ Capture des Paramètres...');
    await driver.get(`${BASE_URL}/settings`);
    await driver.sleep(2000);
    await takeScreenshot(driver, '07_settings_etablissement');

    console.log('✅ Documentation générée avec succès !');

  } catch (error) {
    console.error('❌ Erreur durant la capture:', error);
  } finally {
    await driver.quit();
  }
}

run();
