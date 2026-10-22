'use client';

import { useEffect, useState } from 'react';
import { Smartphone, X } from 'lucide-react';
import { APP_STORE_URL, ANDROID_DOWNLOAD_URL, androidIntentUrl } from '@/lib/mobile-app';
import { isCapacitor, isElectron } from '@/lib/platform';

const DISMISS_KEY = 'elm-app-prompt-dismissed';

type MobileOs = 'android' | 'ios';

function detectMobileOs(): MobileOs | null {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  // iPadOS se présente comme un Mac : on le reconnaît à l'écran tactile
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return null;
}

/**
 * Lien de boutique / services ouvert dans le navigateur d'un téléphone : l'app n'est pas
 * installée (sinon Universal Links / App Links l'auraient ouverte directement).
 * On propose l'app une fois par session, sans bloquer la commande sur le site.
 */
export function AppDownloadPrompt() {
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

  // Android : ouvre l'app si elle est installée, sinon la page de téléchargement de l'APK.
  // iOS : l'app n'est pas installée (sinon le lien universel l'aurait ouverte) → App Store.
  const href = os === 'android' ? androidIntentUrl(window.location.href) : APP_STORE_URL;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-prompt-title"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="w-full max-w-sm bg-surface-card border border-surface-border rounded-2xl shadow-2xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-white border border-surface-border p-1.5 shrink-0">
            <img src="/logo.png" alt="" className="w-full h-full object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="app-prompt-title" className="font-bold text-content-primary">
              Commandez avec l&apos;app ELM Boutique
            </h2>
            <p className="text-sm text-content-secondary mt-0.5">
              Retrouvez vos boutiques en un geste et commandez plus vite.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Fermer"
            className="w-11 h-11 -mr-2 -mt-2 flex items-center justify-center rounded-xl text-content-muted hover:bg-surface-hover shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <a
          href={href}
          className="flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition-colors"
        >
          <Smartphone className="w-4 h-4" />
          {os === 'android' ? "Ouvrir dans l'app" : "Télécharger l'app"}
        </a>
        <button
          type="button"
          onClick={dismiss}
          className="w-full h-11 rounded-xl text-content-secondary font-semibold text-sm hover:bg-surface-hover transition-colors"
        >
          Continuer sur le site
        </button>
      </div>
    </div>
  );
}
