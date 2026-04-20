import dynamic from 'next/dynamic';

// On utilise un import dynamique avec ssr: false pour s'assurer que 
// la vue de suivi s'exécute uniquement côté client (navigateur).
const PublicTrackingView = dynamic(() => import('./PublicTrackingView'), { ssr: false });

// Indispensable pour le "next export" : génère une page statique "témoin".
// En production/Electron, toutes les routes /track/* seront servies par ce fichier.
export function generateStaticParams(): Array<{ token: string }> {
  return [{ token: 'view' }];
}

export default function Page() {
  return <PublicTrackingView />;
}
