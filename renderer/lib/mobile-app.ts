/**
 * App mobile acheteur « ELM Boutique » (Flutter, buyer_app/) — liens profonds et stores.
 *
 * Les liens partagés https://www.elm-app.click/boutique/<ref> et /services/<ref> (QR codes,
 * WhatsApp…) ouvrent l'app si elle est installée (Universal Links iOS / App Links Android,
 * fichiers servis sous /.well-known/), sinon la page web, qui propose l'app (AppDownloadPrompt).
 */
export const MOBILE_APP_BUNDLE_ID = 'com.elmapp.mobile';

/** Team ID Apple (Membership) — préfixe de l'App ID dans apple-app-site-association */
export const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || 'H3USZB5KY7';

/** Chemins ouverts dans l'app — garder aligné avec buyer_app/tool/configure_platforms.py */
export const MOBILE_APP_PATHS = ['/boutique/*', '/services/*'];

/**
 * Pages de store : la proposition d'installer l'app n'apparaît que pour un store renseigné,
 * donc pas avant que l'app y soit publiée.
 */
export const PLAY_STORE_URL = process.env.NEXT_PUBLIC_ANDROID_PLAY_STORE_URL || '';
export const APP_STORE_URL = process.env.NEXT_PUBLIC_IOS_APP_STORE_URL || '';

/** Identifiant numérique App Store (Smart App Banner de Safari), extrait de APP_STORE_URL */
export const APP_STORE_ID = APP_STORE_URL.match(/id(\d+)/)?.[1] ?? '';

/**
 * Android : ouvre l'app si elle est installée, sinon le Play Store (browser_fallback_url).
 * https://developer.chrome.com/docs/android/intents
 */
export function androidIntentUrl(pageUrl: string): string {
  const url = new URL(pageUrl);
  const fallback = encodeURIComponent(PLAY_STORE_URL);
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=${MOBILE_APP_BUNDLE_ID};S.browser_fallback_url=${fallback};end`;
}
