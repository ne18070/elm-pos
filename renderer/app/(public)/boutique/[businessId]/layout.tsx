import type { Metadata } from 'next';
import { AppDownloadPrompt } from '@/components/shared/AppDownloadPrompt';
import { APP_STORE_ID } from '@/lib/mobile-app';

export const metadata: Metadata = {
  title: 'Boutique en ligne',
  // Smart App Banner de Safari (iOS) une fois l'app publiée sur l'App Store
  ...(APP_STORE_ID ? { itunes: { appId: APP_STORE_ID } } : {}),
};

// Boutique pages are client-only, no server-side auth or dashboard chrome
export default function BoutiqueLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {children}
      <AppDownloadPrompt />
    </div>
  );
}

