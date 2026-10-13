import dynamic from 'next/dynamic';

// Accueil de la vitrine acheteur — écran de démarrage de l'app mobile (com.elmapp.mobile)
const BoutiqueHome = dynamic(() => import('./BoutiqueHome'), { ssr: false });

export default function Page() {
  return <BoutiqueHome />;
}
