import dynamic from 'next/dynamic';
import { AppDownloadBanner } from '@/components/shared/AppDownloadBanner';

// Accueil web « Mes boutiques » (/boutique)
const BoutiqueHome = dynamic(() => import('./BoutiqueHome'), { ssr: false });

export default function Page() {
  return (
    <>
      <AppDownloadBanner />
      <BoutiqueHome />
    </>
  );
}
