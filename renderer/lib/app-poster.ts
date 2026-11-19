import { ANDROID_DOWNLOAD_URL, APP_STORE_URL } from '@/lib/mobile-app';
import { qrImageUrl } from '@/lib/qr';

/**
 * Affiche de comptoir « Installez l'app ELM Boutique » : deux QR (Android → page
 * /telecharger, iPhone → App Store), identité de l'établissement, mode d'emploi.
 *
 * Document HTML autonome : le même rendu sert à l'aperçu (iframe srcDoc) et à
 * l'impression — ce qu'on voit est ce qui sort de l'imprimante. Toujours en clair
 * (papier), indépendant du thème du dashboard. Toutes les tailles sont en `em` :
 * changer le format ne change que la taille de police de base.
 */
export type PosterFormat = 'A4' | 'A5';

/** Service / atelier : le message porte sur le suivi des ordres de travail sans lien */
export type PosterAudience = 'service' | 'boutique';

export interface AppPosterOptions {
  businessName: string;
  logoUrl?: string | null;
  phone?: string | null;
  address?: string | null;
  format: PosterFormat;
  audience: PosterAudience;
  accent: string;
  headline: string;
  subline: string;
}

export const POSTER_ACCENTS = ['#0f766e', '#1d4ed8', '#7c3aed', '#be123c', '#c2410c', '#111827'];

const FORMAT = {
  A4: { width: '210mm', height: '297mm', base: '3.55mm' },
  A5: { width: '148mm', height: '210mm', base: '2.5mm' },
} as const;

export function defaultPosterText(audience: PosterAudience, businessName: string) {
  return audience === 'service'
    ? {
        headline: 'Suivez vos réparations sur votre téléphone',
        subline: `${businessName} vous prévient à chaque étape, directement dans l'app. Sans lien, sans appel.`,
      }
    : {
        headline: 'Commandez et suivez vos achats sur votre téléphone',
        subline: `Retrouvez ${businessName} dans l'app ELM Boutique : catalogue, commande et suivi en quelques secondes.`,
      };
}

export const posterInstallUrls = { android: ANDROID_DOWNLOAD_URL, ios: APP_STORE_URL };

/** Android distribué par Google Play (NEXT_PUBLIC_ANDROID_DOWNLOAD_URL) plutôt que par APK */
const ANDROID_ON_PLAY = /(^|\.)play\.google\.com$/i.test(safeHost(ANDROID_DOWNLOAD_URL));

function safeHost(url: string) {
  try { return new URL(url).hostname; } catch { return ''; }
}

/** QR en PNG haute définition (impression) : la carte fournit déjà la marge blanche */
function qrUrl(data: string) {
  return qrImageUrl(data, { size: 800, margin: 0, ecc: 'M' });
}

function esc(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Couleur de texte lisible sur l'accent (blanc sauf accent très clair) */
export function onAccent(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.65 ? '#111827' : '#ffffff';
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || 'E';
}

const PHONE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg>`;
const SHIELD_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>`;

const INFO_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/></svg>`;

export function buildAppPosterHtml(o: AppPosterOptions): string {
  const f = FORMAT[o.format];
  const accent = /^#[0-9a-f]{6}$/i.test(o.accent) ? o.accent : POSTER_ACCENTS[0];
  const ink = onAccent(accent);
  const name = esc(o.businessName || 'Votre établissement');
  const contact = [o.address, o.phone].filter((v): v is string => !!v && !!v.trim()).map(esc).join('  ·  ');

  const steps = o.audience === 'service'
    ? [
        ['Scannez et installez', 'l’app ELM Boutique, gratuite'],
        ['Ouvrez « Mon code client »', 'et indiquez votre numéro'],
        ['Montrez-le au comptoir', 'une seule fois : c’est tout'],
      ]
    : [
        ['Scannez et installez', 'l’app ELM Boutique, gratuite'],
        ['Cherchez', esc(o.businessName || 'notre boutique')],
        ['Commandez et suivez', 'vos achats en temps réel'],
      ];

  const trust = o.audience === 'service'
    ? 'Application officielle ELM. Nous ne vous enverrons jamais de lien pour payer ou vous connecter : l’avancement de vos ordres arrive uniquement dans l’app.'
    : 'Application officielle ELM. Nous ne vous enverrons jamais de lien pour payer ou vous connecter.';

  const logo = o.logoUrl
    ? `<img class="logo" src="${esc(o.logoUrl)}" alt="" />`
    : `<div class="logo logo-fallback">${esc(initials(o.businessName))}</div>`;

  const qrCard = (platform: string, hint: string, url: string) => `
    <div class="qr-card">
      <div class="qr-head">${PHONE_ICON}<span>${platform}</span></div>
      <img class="qr" src="${qrUrl(url)}" alt="QR code ${platform}" />
      <div class="qr-hint">${hint}</div>
    </div>`;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Affiche app — ${name}</title>
<style>
  @page { size: ${o.format} portrait; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #e5e7eb; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, Roboto, 'Helvetica Neue', Arial, sans-serif;
    color: #111827;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .page {
    width: ${f.width}; height: ${f.height}; margin: 0 auto; overflow: hidden;
    font-size: ${f.base}; background: #fff; display: flex; flex-direction: column;
  }
  @media screen { body { padding: 24px 0; } .page { box-shadow: 0 10px 40px rgba(0,0,0,.18); } }
  @media print { html, body { background: #fff; } }

  .band { background: ${accent}; color: ${ink}; padding: 2.6em 3em 4.2em; position: relative; }
  .brand { display: flex; align-items: center; gap: 1.2em; }
  .logo { width: 5.4em; height: 5.4em; border-radius: 1.2em; background: #fff; object-fit: contain; padding: .45em; flex-shrink: 0; }
  .logo-fallback { display: flex; align-items: center; justify-content: center; color: ${accent}; font-weight: 800; font-size: 2em; width: 2.7em; height: 2.7em; border-radius: .6em; padding: 0; }
  .biz { min-width: 0; }
  .biz-name { font-size: 2em; font-weight: 800; line-height: 1.1; }
  .biz-contact { font-size: 1em; opacity: .9; margin-top: .35em; }
  .headline { font-size: 3.5em; font-weight: 900; line-height: 1.05; letter-spacing: -.02em; margin-top: .75em; }
  .subline { font-size: 1.35em; line-height: 1.4; margin-top: .7em; opacity: .95; max-width: 34em; }

  .qrs { display: flex; gap: 2.2em; justify-content: center; margin: -2.6em 3em 0; position: relative; }
  .qr-card { flex: 1; max-width: 25em; background: #fff; border-radius: 1.6em; padding: 1.5em 1.5em 1.3em; text-align: center;
             box-shadow: 0 .4em 1.6em rgba(17,24,39,.14); border: 1px solid #e5e7eb; }
  .qr-head { display: inline-flex; align-items: center; gap: .45em; font-size: 1.55em; font-weight: 800; color: ${accent}; }
  .qr-head svg { width: 1.05em; height: 1.05em; }
  .qr { display: block; width: 100%; aspect-ratio: 1; margin: .9em 0 .8em; image-rendering: pixelated; }
  .qr-hint { font-size: 1.1em; color: #4b5563; }

  .android-note { display: flex; gap: .8em; align-items: flex-start; margin: 1.4em 3em 0; padding: .9em 1.2em; border-radius: 1em;
                  border: 1.5px dashed ${accent}; font-size: 1em; line-height: 1.4; color: #374151; }
  .android-note svg { width: 1.6em; height: 1.6em; color: ${accent}; flex-shrink: 0; margin-top: .1em; }
  .android-note strong { color: #111827; }
  .main { flex: 1; display: flex; flex-direction: column; justify-content: space-evenly; padding: 1.6em 3em 0; }
  .steps { display: flex; gap: 1.6em; }
  .step { flex: 1; display: flex; gap: .8em; align-items: flex-start; }
  .num { width: 2.2em; height: 2.2em; border-radius: 50%; background: ${accent}; color: ${ink}; font-weight: 800; font-size: 1.4em;
         display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .step-title { font-size: 1.4em; font-weight: 800; line-height: 1.2; }
  .step-text { font-size: 1.15em; color: #4b5563; margin-top: .25em; line-height: 1.3; }

  .trust { display: flex; gap: .9em; align-items: center; padding: 1.1em 1.3em; border-radius: 1.1em;
           background: #f3f4f6; color: #374151; font-size: 1.02em; line-height: 1.4; }
  .trust svg { width: 2.2em; height: 2.2em; color: ${accent}; flex-shrink: 0; }
  .foot { display: flex; justify-content: space-between; align-items: center; margin: 1.4em 3em 2.2em; font-size: .95em; color: #6b7280; }
  .foot strong { color: #111827; }
</style>
</head>
<body>
  <div class="page">
    <div class="band">
      <div class="brand">
        ${logo}
        <div class="biz">
          <div class="biz-name">${name}</div>
          ${contact ? `<div class="biz-contact">${contact}</div>` : ''}
        </div>
      </div>
      <h1 class="headline">${esc(o.headline)}</h1>
      <p class="subline">${esc(o.subline)}</p>
    </div>

    <div class="qrs">
      ${qrCard('Android', 'Ouvrez l’appareil photo et visez le code', posterInstallUrls.android)}
      ${qrCard('iPhone', 'Ouvrez l’appareil photo et visez le code', posterInstallUrls.ios)}
    </div>

    <!-- Installation hors Play Store : mode d'emploi des avertissements Android -->
    ${ANDROID_ON_PLAY ? '' : `<div class="android-note">${INFO_ICON}<span>
      <strong>Android :</strong> l’app n’est pas encore sur Google Play, elle s’installe depuis le site officiel elm-app.click.
      Votre téléphone affichera des avertissements (« application inconnue », Play Protect) : c’est normal.
      Touchez <strong>Paramètres → Autoriser cette source</strong>, puis <strong>Installer</strong> (ou « Installer quand même »).
    </span></div>`}

    <div class="main">
    <div class="steps">
      ${steps.map(([t, d], i) => `
        <div class="step">
          <div class="num">${i + 1}</div>
          <div><div class="step-title">${t}</div><div class="step-text">${d}</div></div>
        </div>`).join('')}
    </div>

    <div class="trust">${SHIELD_ICON}<span>${trust}</span></div>
    </div>
    <div class="foot"><span><strong>ELM Boutique</strong> · application gratuite</span><span>elm-app.click</span></div>
  </div>
</body>
</html>`;
}
