import type { Metadata } from 'next';
import PublicServiceOrderClient from './PublicServiceOrderClient';
import { AppDownloadBanner } from '@/components/shared/AppDownloadBanner';
import { APP_STORE_ID } from '@/lib/mobile-app';

// Smart App Banner de Safari (iOS) une fois l'app publiée sur l'App Store
export const metadata: Metadata = APP_STORE_ID ? { itunes: { appId: APP_STORE_ID } } : {};

export function generateStaticParams(): Array<{ businessId: string }> {
  return [{ businessId: 'demo' }];
}

export default function PublicServiceOrderPage() {
  return (
    <>
      <AppDownloadBanner />
      <PublicServiceOrderClient />
    </>
  );
}
