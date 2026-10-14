import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Chromium de Playwright (révision attendue, sinon toute révision installée), puis Edge / Chrome. */
export async function launchBrowser() {
  const cache = join(process.env.LOCALAPPDATA ?? join(process.env.HOME ?? '', '.cache'), 'ms-playwright');
  const installed = existsSync(cache)
    ? (await readdir(cache))
        .filter((d) => d.startsWith('chromium_headless_shell-'))
        .map((d) => ({ executablePath: join(cache, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') }))
        .filter((o) => existsSync(o.executablePath))
    : [];
  for (const options of [{}, ...installed, { channel: 'msedge' }, { channel: 'chrome' }]) {
    try {
      return await chromium.launch(options);
    } catch { /* essai suivant */ }
  }
  throw new Error('Aucun navigateur : lancer « npx playwright install chromium »');
}
