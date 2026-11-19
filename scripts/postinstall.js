// Recompile les modules natifs (better-sqlite3, pilotes matériels) pour Electron.
// Inutile — et fragile sur les runners Linux — pour les tests Playwright, qui visent la
// version web : SKIP_ELECTRON_REBUILD=1 (posé par .github/workflows/playwright.yml) le saute.
// Les installeurs Electron (release.yml) relancent electron-rebuild explicitement.
const { execSync } = require('child_process');

if (process.env.SKIP_ELECTRON_REBUILD === '1') {
  console.log('[postinstall] electron-rebuild ignoré (SKIP_ELECTRON_REBUILD=1)');
  process.exit(0);
}

execSync('electron-rebuild', { stdio: 'inherit' });
