// Visuels App Store de « ELM Boutique » aux tailles exactes demandées par App Store Connect.
//
//   1. Prendre les captures sur iPhone (app TestFlight) → les déposer dans buyer_app/store/raw/
//      en les numérotant dans l'ordre voulu : 01-accueil.png, 02-catalogue.png…
//   2. Ajuster les légendes dans buyer_app/store/captions.json
//   3. node buyer_app/store/generate.mjs            (iPhone + iPhone Duo + bannières)
//      node buyer_app/store/generate.mjs --ipad     (+ iPad 13" — seulement si l'app reste compatible iPad)
//
// Sortie : buyer_app/store/out/ (non commité). Rendu Chromium via Playwright (déjà installé pour les tests).
import { launchBrowser } from './browser.mjs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const STORE = dirname(fileURLToPath(import.meta.url));
const RAW = join(STORE, 'raw');
const OUT = join(STORE, 'out');
const LOGO = join(STORE, '..', 'assets', 'logo.png');

// Chaque format : taille finale en pixels = viewport (points) × scale
const SCREENSHOT_FORMATS = [
  { dir: 'iphone-1206x2622', width: 402, height: 874, scale: 3 },
  { dir: 'iphone-1179x2556', width: 393, height: 852, scale: 3 },
  { dir: 'iphone-duo-1398x2034', width: 699, height: 1017, scale: 2 },
];
const IPAD_FORMAT = { dir: 'ipad-2064x2752', width: 1032, height: 1376, scale: 2 };
const BANNER_FORMATS = [
  { file: 'en-tete-5244x2950.png', width: 2622, height: 1475, scale: 2 },
  { file: 'en-tete-3840x1646.png', width: 1920, height: 823, scale: 2 },
  { file: 'recherche-5244x2950.png', width: 2622, height: 1475, scale: 2 },
  { file: 'recherche-3840x2560.png', width: 1920, height: 1280, scale: 2 },
  { file: 'recherche-1920x1280.png', width: 1920, height: 1280, scale: 1 },
];

const BRAND = { dark: '#075985', main: '#0284c7', light: '#38bdf8' };

const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

async function dataUri(path) {
  const type = extname(path).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
  return `data:${type};base64,${(await readFile(path)).toString('base64')}`;
}

const baseCss = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100vw; height: 100vh; overflow: hidden; }
  body {
    font-family: 'Segoe UI', 'SF Pro Display', system-ui, sans-serif;
    color: #fff;
    background:
      radial-gradient(circle at 85% 10%, ${BRAND.light}66 0, transparent 45%),
      radial-gradient(circle at 10% 95%, ${BRAND.dark} 0, transparent 55%),
      linear-gradient(160deg, ${BRAND.main} 0%, ${BRAND.dark} 100%);
  }
`;

/** Capture d'écran : légende en haut, iPhone en dessous (débordant en bas). */
function screenshotHtml({ image, title, subtitle }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${baseCss}
    .caption { position: absolute; top: 7vh; left: 7vw; right: 7vw; text-align: center; }
    h1 { font-size: min(8.2vw, 4.4vh); font-weight: 800; line-height: 1.12; letter-spacing: -0.02em; }
    p { margin-top: 1.4vh; font-size: min(4.4vw, 2.3vh); font-weight: 500; opacity: .88; line-height: 1.3; }
    .phone {
      position: absolute; left: 50%; top: 25vh; transform: translateX(-50%);
      width: min(80vw, 37vh); padding: min(2.2vw, 1vh);
      background: #0b1220; border-radius: min(11vw, 5.2vh);
      box-shadow: 0 3vh 7vh rgba(2, 20, 40, .45);
    }
    .phone img { display: block; width: 100%; border-radius: min(9vw, 4.3vh); }
  </style></head><body>
    <div class="caption"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div>
    <div class="phone"><img src="${image}"></div>
  </body></html>`;
}

/** Bannière (en-tête / résultats de recherche) : texte à gauche, téléphone à droite. */
function bannerHtml({ logo, phoneImage, title, subtitle, pills }) {
  const u = 'min(1vw, 1.9vh)'; // unité commune aux formats 16:9, 3:2 et 2,33:1
  const phone = phoneImage
    ? `<div class="phone"><img src="${phoneImage}"></div>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${baseCss}
    body { display: flex; align-items: center; justify-content: center; gap: calc(${u} * 6); padding: 0 8vw; }
    .text { flex: 0 1 auto; max-width: calc(${u} * 52); }
    .logo { width: calc(${u} * 9); height: calc(${u} * 9); background: #fff; border-radius: calc(${u} * 2.2);
            padding: calc(${u} * 1); box-shadow: 0 1vh 3vh rgba(2,20,40,.3); }
    .logo img { width: 100%; height: 100%; object-fit: contain; }
    h1 { margin-top: calc(${u} * 2.4); font-size: calc(${u} * 7.4); font-weight: 800; letter-spacing: -0.03em; line-height: 1; }
    p { margin-top: calc(${u} * 1.6); font-size: calc(${u} * 2.9); font-weight: 500; opacity: .9; line-height: 1.25; }
    .pills { display: flex; flex-wrap: wrap; gap: calc(${u} * 1); margin-top: calc(${u} * 3); }
    .pill { padding: calc(${u} * .8) calc(${u} * 1.8); border-radius: 999px; font-size: calc(${u} * 1.7); font-weight: 600;
            background: rgba(255,255,255,.16); border: 1px solid rgba(255,255,255,.35); }
    .phone { flex: 0 0 auto; width: calc(${u} * 24); padding: calc(${u} * .7); background: #0b1220;
             border-radius: calc(${u} * 3.4); box-shadow: 0 2vh 6vh rgba(2,20,40,.45); transform: rotate(4deg); }
    .phone img { display: block; width: 100%; border-radius: calc(${u} * 2.8); }
  </style></head><body>
    <div class="text">
      <div class="logo"><img src="${logo}"></div>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(subtitle)}</p>
      <div class="pills">${pills.map((p) => `<span class="pill">${escapeHtml(p)}</span>`).join('')}</div>
    </div>
    ${phone}
  </body></html>`;
}

async function render(browser, html, { width, height, scale }, outPath) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  await page.setContent(html, { waitUntil: 'load' });
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, await page.screenshot({ type: 'png' }));
  await page.close();
  console.log(`  ${outPath.slice(STORE.length + 1)}  (${width * scale}×${height * scale})`);
}

const withIpad = process.argv.includes('--ipad');
const captions = JSON.parse(await readFile(join(STORE, 'captions.json'), 'utf8'));
const rawFiles = existsSync(RAW)
  ? (await readdir(RAW)).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort()
  : [];
const logo = await dataUri(LOGO);

const browser = await launchBrowser();
try {
  if (rawFiles.length === 0) {
    console.log('Aucune capture dans store/raw/ : seules les bannières sont générées.');
  } else {
    console.log(`Captures (${rawFiles.length}) :`);
    const formats = withIpad ? [...SCREENSHOT_FORMATS, IPAD_FORMAT] : SCREENSHOT_FORMATS;
    for (const [i, file] of rawFiles.entries()) {
      const caption = captions.screens[i] ?? { title: 'ELM Boutique', subtitle: '' };
      const html = screenshotHtml({ image: await dataUri(join(RAW, file)), ...caption });
      const name = `${String(i + 1).padStart(2, '0')}.png`;
      for (const format of formats) await render(browser, html, format, join(OUT, format.dir, name));
    }
  }

  console.log('Bannières :');
  const bannerScreen = rawFiles[(captions.banner.screen ?? 1) - 1] ?? rawFiles[0];
  const phoneImage = bannerScreen ? await dataUri(join(RAW, bannerScreen)) : null;
  const html = bannerHtml({ logo, phoneImage, ...captions.banner });
  for (const format of BANNER_FORMATS) await render(browser, html, format, join(OUT, 'bannieres', format.file));
} finally {
  await browser.close();
}
