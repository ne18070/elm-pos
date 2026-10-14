// Captures App Store de l'app réelle, compilée en web avec le point d'entrée store/screenshot_main.dart :
//
//   cd buyer_app
//   flutter build web -t store/screenshot_main.dart --dart-define=SUPABASE_URL=… --dart-define=SUPABASE_ANON_KEY=…
//   node store/capture.mjs [build/web] [--id <boutique>]
//
// Sortie :
//   store/raw/0N-*.png               iPhone 1206×2622 plein écran → mises en page par generate.mjs
//   store/out/ipad-2048x2732/0N.png  iPad 13" plein écran, prêtes pour App Store Connect
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './browser.mjs';

const STORE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const idIndex = args.indexOf('--id');
const boutiqueId = idIndex >= 0 ? args[idIndex + 1] : null;
const webDir = resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--id') ?? join(STORE, '..', 'build', 'web'));
if (!existsSync(join(webDir, 'index.html'))) {
  console.error(`Build web introuvable : ${webDir} (lancer flutter build web -t store/screenshot_main.dart)`);
  process.exit(1);
}

const DEVICES = [
  { name: 'iphone', width: 402, height: 874, scale: 3, out: (shot) => join(STORE, 'raw', `${shot}.png`) },
  { name: 'ipad', width: 1024, height: 1366, scale: 2, out: (shot) => join(STORE, 'out', 'ipad-2048x2732', `${shot}.png`) },
];
// Ordre = ordre des légendes de captions.json
const SHOTS = [
  { name: '01-accueil', screen: 'home' },
  { name: '02-catalogue', screen: 'catalogue' },
  { name: '03-commande', screen: 'commande' },
  { name: '04-paiement', screen: 'commande', scroll: 1100 },
  { name: '05-confirmation', screen: 'confirmation' },
];

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.wasm': 'application/wasm', '.png': 'image/png', '.ico': 'image/x-icon', '.otf': 'font/otf',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.css': 'text/css', '.bin': 'application/octet-stream',
};

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([\\/])+/, '');
  const file = join(webDir, path || 'index.html');
  try {
    const body = await readFile(file.startsWith(webDir) && existsSync(file) && extname(file) ? file : join(webDir, 'index.html'));
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'text/html' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await launchBrowser();
try {
  for (const device of DEVICES) {
    for (const shot of SHOTS) {
      const context = await browser.newContext({
        viewport: { width: device.width, height: device.height },
        deviceScaleFactor: device.scale,
        locale: 'fr-FR',
        colorScheme: 'light',
      });
      const page = await context.newPage();
      const query = new URLSearchParams({ screen: shot.screen, ...(boutiqueId ? { id: boutiqueId } : {}) });
      await page.goto(`${base}?${query}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('flutter-view, flt-glass-pane', { timeout: 60_000 });
      // Données Supabase, images produits et transition de page
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(4000);
      if (shot.scroll) {
        await page.mouse.move(device.width / 2, device.height / 2);
        await page.mouse.wheel(0, shot.scroll);
        await page.waitForTimeout(1500);
      }
      const out = device.out(shot.name);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, await page.screenshot({ type: 'png' }));
      console.log(`  ${device.name} ${shot.name} → ${out.slice(STORE.length + 1)}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
