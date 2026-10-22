import type { Metadata } from 'next';
import dynamic from 'next/dynamic';

export const metadata: Metadata = {
  title: "Télécharger l'app ELM Boutique",
  description: 'Commandez auprès des boutiques et services ELM depuis votre téléphone.',
};

// Lien à partager pour installer l'app Android (APK hors Play Store)
const DownloadClient = dynamic(() => import('./DownloadClient'), { ssr: false });

export default function Page() {
  return <DownloadClient />;
}
