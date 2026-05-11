/**
 * Génère toutes les icônes ET splash screens Android pour ELM Mobile
 * Source : renderer/public/logo.png
 * Usage  : node scripts/generate-icons.js
 */

const { Jimp } = require('./icon-gen/node_modules/jimp');
const path = require('path');
const fs   = require('fs');

const SOURCE       = path.resolve(__dirname, '../renderer/public/logo.png');
const SPLASH_SRC   = path.resolve(__dirname, '../assets/splash.png');
const ANDROID_RES  = path.resolve(__dirname, '../android/app/src/main/res');

// Couleur de fond brand ELM — modifie si besoin
const BG = { r: 0x1C, g: 0x1C, b: 0x2E, a: 0xFF }; // #1C1C2E

const DENSITIES = [
  { dir: 'mipmap-mdpi',    launcher: 48,  foreground: 108 },
  { dir: 'mipmap-hdpi',    launcher: 72,  foreground: 162 },
  { dir: 'mipmap-xhdpi',   launcher: 96,  foreground: 216 },
  { dir: 'mipmap-xxhdpi',  launcher: 144, foreground: 324 },
  { dir: 'mipmap-xxxhdpi', launcher: 192, foreground: 432 },
];

// Splash screens portrait (w×h) et landscape (h×w)
const SPLASHES = [
  { dir: 'drawable',               w: 2732, h: 2732 },
  { dir: 'drawable-port-mdpi',     w: 320,  h: 480  },
  { dir: 'drawable-port-hdpi',     w: 480,  h: 800  },
  { dir: 'drawable-port-xhdpi',    w: 720,  h: 1280 },
  { dir: 'drawable-port-xxhdpi',   w: 960,  h: 1600 },
  { dir: 'drawable-port-xxxhdpi',  w: 1280, h: 1920 },
  { dir: 'drawable-land-mdpi',     w: 480,  h: 320  },
  { dir: 'drawable-land-hdpi',     w: 800,  h: 480  },
  { dir: 'drawable-land-xhdpi',    w: 1280, h: 720  },
  { dir: 'drawable-land-xxhdpi',   w: 1600, h: 960  },
  { dir: 'drawable-land-xxxhdpi',  w: 1920, h: 1280 },
];

function fill(img, w, h, color) {
  img.scan(0, 0, w, h, function(x, y, idx) {
    this.bitmap.data[idx + 0] = color.r;
    this.bitmap.data[idx + 1] = color.g;
    this.bitmap.data[idx + 2] = color.b;
    this.bitmap.data[idx + 3] = color.a;
  });
}

function center(logo, canvasSize, logoSize) {
  return Math.round((canvasSize - logoSize) / 2);
}

async function run() {
  console.log('📂 Source :', SOURCE);
  if (!fs.existsSync(SOURCE)) {
    console.error('❌ logo.png introuvable à', SOURCE);
    process.exit(1);
  }

  const src = await Jimp.read(SOURCE);
  console.log(`✅ Logo chargé : ${src.width}×${src.height}px\n`);

  for (const { dir, launcher, foreground } of DENSITIES) {
    const outDir = path.join(ANDROID_RES, dir);
    fs.mkdirSync(outDir, { recursive: true });

    // ── ic_launcher.png : fond coloré + logo centré (60%) ────────────────────
    const bg = new Jimp({ width: launcher, height: launcher });
    fill(bg, launcher, launcher, BG);
    const logoL = src.clone().resize({ w: Math.round(launcher * 0.60) });
    bg.composite(logoL, center(logoL, launcher, logoL.width), center(logoL, launcher, logoL.height));
    await bg.write(path.join(outDir, 'ic_launcher.png'));
    await bg.write(path.join(outDir, 'ic_launcher_round.png'));

    // ── ic_launcher_foreground.png : fond transparent + logo centré (60%) ────
    const fgCanvas = new Jimp({ width: foreground, height: foreground });
    const logoFg = src.clone().resize({ w: Math.round(foreground * 0.60) });
    fgCanvas.composite(logoFg, center(logoFg, foreground, logoFg.width), center(logoFg, foreground, logoFg.height));
    await fgCanvas.write(path.join(outDir, 'ic_launcher_foreground.png'));

    console.log(`  ✔ ${dir} (${launcher}px)`);
  }

  // ─── XMLs adaptatifs (Android 8+) ────────────────────────────────────────────
  const anydpiDir = path.join(ANDROID_RES, 'mipmap-anydpi-v26');
  fs.mkdirSync(anydpiDir, { recursive: true });

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>`;

  fs.writeFileSync(path.join(anydpiDir, 'ic_launcher.xml'),       xml, 'utf8');
  fs.writeFileSync(path.join(anydpiDir, 'ic_launcher_round.xml'), xml, 'utf8');
  console.log('  ✔ mipmap-anydpi-v26 XMLs');

  // ─── Couleur de fond dans un fichier dédié ────────────────────────────────
  const valuesDir = path.join(ANDROID_RES, 'values');
  fs.mkdirSync(valuesDir, { recursive: true });
  fs.writeFileSync(path.join(valuesDir, 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1C1C2E</color>\n</resources>`,
    'utf8'
  );
  console.log('  ✔ values/ic_launcher_background.xml');

  // ─── Icône Play Store 512×512 ─────────────────────────────────────────────
  const playDir = path.resolve(__dirname, '../assets');
  fs.mkdirSync(playDir, { recursive: true });
  const playCanvas = new Jimp({ width: 512, height: 512 });
  fill(playCanvas, 512, 512, BG);
  const logoPlay = src.clone().resize({ w: Math.round(512 * 0.60) });
  playCanvas.composite(logoPlay, center(logoPlay, 512, logoPlay.width), center(logoPlay, 512, logoPlay.height));
  await playCanvas.write(path.join(playDir, 'play-store-icon.png'));
  console.log('  ✔ assets/play-store-icon.png (512×512 Play Console)');

  // ─── Splash screens (depuis assets/splash.png) ───────────────────────────
  console.log('\n  Splash screens...');

  if (!fs.existsSync(SPLASH_SRC)) {
    console.warn('⚠️  assets/splash.png introuvable — splash screens ignorés');
  } else {
    const splashSrc = await Jimp.read(SPLASH_SRC);
    console.log(`   Source splash : ${splashSrc.width}×${splashSrc.height}px`);

    for (const { dir, w, h } of SPLASHES) {
      const outDir = path.join(ANDROID_RES, dir);
      fs.mkdirSync(outDir, { recursive: true });

      // Redimensionner en couvrant toute la surface (cover), puis recadrer au centre
      const scaleW = w / splashSrc.width;
      const scaleH = h / splashSrc.height;
      const scale  = Math.max(scaleW, scaleH);
      const scaledW = Math.round(splashSrc.width  * scale);
      const scaledH = Math.round(splashSrc.height * scale);

      const resized = splashSrc.clone().resize({ w: scaledW, h: scaledH });

      // Crop centré
      const cropX = Math.round((scaledW - w) / 2);
      const cropY = Math.round((scaledH - h) / 2);
      const canvas = new Jimp({ width: w, height: h });
      canvas.composite(resized, -cropX, -cropY);

      await canvas.write(path.join(outDir, 'splash.png'));
      console.log(`  ✔ ${dir} (${w}×${h})`);
    }
  }

  console.log('\n🎉 Icônes et splash screens générés avec succès !');
}

run().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
