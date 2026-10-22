/**
 * App mobile acheteur « ELM Boutique » (Flutter, buyer_app/) — liens profonds et stores.
 *
 * Les liens partagés https://www.elm-app.click/boutique/<ref>, /services/<ref> et /track/<jeton>
 * (QR codes, WhatsApp…) ouvrent l'app si elle est installée (Universal Links iOS / App Links
 * Android, fichiers servis sous /.well-known/), sinon la page web, qui propose l'app
 * (AppDownloadBanner).
 *
 * Android est distribué hors Play Store : APK publié par la CI dans le bucket Supabase
 * public « app-releases » (migration 159), téléchargeable depuis la page /telecharger.
 */
export const MOBILE_APP_BUNDLE_ID = 'com.elmapp.mobile';

/** Team ID Apple (Membership) — préfixe de l'App ID dans apple-app-site-association */
export const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || 'H3USZB5KY7';

/** Chemins ouverts dans l'app — garder aligné avec buyer_app/tool/configure_platforms.py */
export const MOBILE_APP_PATHS = ['/boutique/*', '/services/*', '/track/*'];

/**
 * Où obtenir l'app :
 *   Android : page /telecharger du site (APK), ou NEXT_PUBLIC_ANDROID_DOWNLOAD_URL pour la remplacer
 *             (ex. page Play Store un jour)
 *   iOS     : NEXT_PUBLIC_IOS_APP_STORE_URL (https://apps.apple.com/app/id…) ; bandeau masqué
 *             tant qu'elle est vide
 */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.elm-app.click').replace(/\/$/, '');
export const ANDROID_DOWNLOAD_URL = process.env.NEXT_PUBLIC_ANDROID_DOWNLOAD_URL || `${SITE_URL}/telecharger`;
export const APP_STORE_URL = process.env.NEXT_PUBLIC_IOS_APP_STORE_URL || '';

/** APK Android et son manifeste latest.json, déposés par .github/workflows/mobile-android.yml */
export const ANDROID_RELEASES_URL = `${(process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')}/storage/v1/object/public/app-releases/android`;

export interface AndroidRelease {
  version: string;
  build: number;
  apk: string;
  size_bytes: number;
  published_at: string;
}

/** Identifiant numérique App Store (Smart App Banner de Safari), extrait de APP_STORE_URL */
export const APP_STORE_ID = APP_STORE_URL.match(/id(\d+)/)?.[1] ?? '';

/**
 * Android : ouvre l'app si elle est installée, sinon la page de téléchargement (browser_fallback_url).
 * https://developer.chrome.com/docs/android/intents
 */
export function androidIntentUrl(pageUrl: string): string {
  const url = new URL(pageUrl);
  const fallback = encodeURIComponent(ANDROID_DOWNLOAD_URL);
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=${MOBILE_APP_BUNDLE_ID};S.browser_fallback_url=${fallback};end`;
}
