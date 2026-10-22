'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { ANDROID_DOWNLOAD_URL, APP_STORE_URL, androidIntentUrl } from '@/lib/mobile-app';
import { isCapacitor, isElectron } from '@/lib/platform';

const DISMISS_KEY = 'elm-app-banner-dismissed';

type MobileOs = 'android' | 'ios';

function detectMobileOs(): MobileOs | null {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  // iPadOS se présente comme un Mac : on le reconnaît à l'écran tactile
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return null;
}

/**
 * Bandeau « Installer l'app ELM Boutique » en haut des pages publiques (boutique, services,
 * suivi) ouvertes dans le navigateur d'un téléphone. À placer AVANT le contenu : il défile
 * avec la page et ne masque pas les barres fixées en bas (panier, demande).
 *
 * Android : lien direct vers /telecharger (APK). iOS : App Store, une fois l'URL renseignée.
 * Masquable pour la session.
 */
export function AppDownloadBanner() {
  const [os, setOs] = useState<MobileOs | null>(null);

  useEffect(() => {
    if (isCapacitor || isElectron) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) return;
    } catch { /* stockage indisponible : on affiche quand même */ }
    const detected = detectMobileOs();
    if (detected === 'android' && ANDROID_DOWNLOAD_URL) setOs('android');
    if (detected === 'ios' && APP_STORE_URL) setOs('ios');
  }, []);

  if (!os) return null;

  function dismiss() {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setOs(null);
  }

  const installUrl = os === 'android' ? ANDROID_DOWNLOAD_URL : APP_STORE_URL;

  return (
    <div
      role="region"
      aria-label="Application mobile ELM Boutique"
      className="bg-surface-card border-b border-surface-border pt-[env(safe-area-inset-top)]"
    >
      <div className="max-w-4xl mx-auto flex items-center gap-3 pl-3 pr-1 py-2">
        <div className="w-10 h-10 rounded-xl bg-white border border-surface-border p-1 shrink-0">
          <img src="/logo.png" alt="" className="w-full h-full object-contain" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-content-primary leading-tight">ELM Boutique</p>
          <p className="text-xs text-content-secondary leading-tight truncate">
            Commandez et suivez plus vite
          </p>
          {os === 'android' && (
            // Déjà installée : ouvre cette page dans l'app (sinon retombe sur /telecharger)
            <a
              href={androidIntentUrl(window.location.href)}
              className="text-xs text-content-brand underline"
            >
              Déjà installée ? Ouvrir dans l&apos;app
            </a>
          )}
        </div>
        <a
          href={installUrl}
          className="h-10 px-4 inline-flex items-center rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors shrink-0"
        >
          {os === 'android' ? 'Installer' : 'Télécharger'}
        </a>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Masquer"
          className="w-11 h-11 flex items-center justify-center rounded-xl text-content-muted hover:bg-surface-hover shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
