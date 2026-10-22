'use client';

import { useEffect, useState } from 'react';
import { Download, Loader2, ShieldCheck, Smartphone, RefreshCw } from 'lucide-react';
import { APP_STORE_URL, ANDROID_RELEASES_URL, type AndroidRelease } from '@/lib/mobile-app';
import { getPublicSiteUrl } from '@/lib/public-links';

type Device = 'android' | 'ios' | 'desktop';

function detectDevice(): Device {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return 'desktop';
}

const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export default function DownloadClient() {
  const [device, setDevice] = useState<Device>('desktop');
  const [release, setRelease] = useState<AndroidRelease | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    setDevice(detectDevice());
    fetch(`${ANDROID_RELEASES_URL}/latest.json`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: AndroidRelease) => {
        setRelease(data);
        setStatus('ready');
      })
      .catch(() => setStatus('unavailable'));
  }, []);

  const apkUrl = release
    ? `${ANDROID_RELEASES_URL}/${release.apk}?download=elm-boutique-${release.version}.apk`
    : '';
  const pageUrl = `${getPublicSiteUrl()}/telecharger`;

  return (
    <div data-theme="light" className="min-h-screen bg-surface text-content-primary">
      <main className="max-w-md mx-auto px-4 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] space-y-8">
        <header className="text-center space-y-3">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-white border border-surface-border p-2 shadow-sm">
            <img src="/logo.png" alt="ELM" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold">ELM Boutique</h1>
          <p className="text-content-secondary">
            Commandez auprès des boutiques et services ELM, suivez vos demandes et recevez une
            notification à chaque étape.
          </p>
        </header>

        {/* Android : APK */}
        {device !== 'ios' && (
          <section className="bg-surface-card border border-surface-border rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-content-brand" />
              <h2 className="font-semibold">Android</h2>
            </div>

            {status === 'loading' && (
              <div className="h-12 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-content-muted" />
              </div>
            )}

            {status === 'unavailable' && (
              <p className="text-sm text-content-secondary">
                L&apos;application Android sera disponible ici très bientôt. En attendant, vous pouvez
                commander depuis le lien de votre boutique.
              </p>
            )}

            {status === 'ready' && release && (
              <>
                <a
                  href={apkUrl}
                  className="flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold transition-colors"
                >
                  <Download className="w-5 h-5" />
                  Télécharger l&apos;app ({formatSize(release.size_bytes)})
                </a>
                <p className="text-xs text-content-muted text-center">
                  Version {release.version} · publiée le {formatDate(release.published_at)}
                </p>

                <ol className="space-y-2 text-sm text-content-secondary list-decimal list-inside">
                  <li>Touchez <strong>Télécharger l&apos;app</strong>, puis ouvrez le fichier téléchargé.</li>
                  <li>
                    Si Android le demande, autorisez votre navigateur à{' '}
                    <strong>installer des applications inconnues</strong>, puis revenez en arrière.
                  </li>
                  <li>Touchez <strong>Installer</strong>, puis <strong>Ouvrir</strong>.</li>
                </ol>

                <div className="flex gap-3 p-3 rounded-xl bg-badge-info text-sm">
                  <RefreshCw className="w-4 h-4 text-status-info shrink-0 mt-0.5" />
                  <p className="text-content-secondary">
                    L&apos;app vous prévient elle-même quand une nouvelle version est disponible.
                  </p>
                </div>
              </>
            )}
          </section>
        )}

        {/* iPhone / iPad */}
        {device !== 'android' && (
          <section className="bg-surface-card border border-surface-border rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-content-brand" />
              <h2 className="font-semibold">iPhone et iPad</h2>
            </div>
            {APP_STORE_URL ? (
              <a
                href={APP_STORE_URL}
                className="flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold transition-colors"
              >
                Télécharger sur l&apos;App Store
              </a>
            ) : (
              <p className="text-sm text-content-secondary">
                L&apos;app arrive très bientôt sur l&apos;App Store.
              </p>
            )}
          </section>
        )}

        {/* Ordinateur : QR code vers cette page */}
        {device === 'desktop' && (
          <section className="text-center space-y-3">
            <p className="text-sm text-content-secondary">
              Scannez ce code avec votre téléphone pour installer l&apos;app :
            </p>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(pageUrl)}`}
              alt="QR code de la page de téléchargement"
              width={240}
              height={240}
              className="mx-auto rounded-xl border border-surface-border bg-white"
            />
          </section>
        )}

        <p className="flex items-center justify-center gap-2 text-xs text-content-muted">
          <ShieldCheck className="w-4 h-4" />
          App officielle ELM, signée par ELM.
        </p>
      </main>
    </div>
  );
}
