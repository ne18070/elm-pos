import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Essai gratuit 7 jours — Démarrez votre espace',
  description:
    'Créez votre compte ELM APP gratuitement. Caisse, stocks, comptabilité et livraisons pour votre commerce. Sans engagement, sans carte bancaire.',
  alternates: {
    canonical: 'https://www.elm-app.click/subscribe',
  },
  openGraph: {
    title: 'Essai gratuit 7 jours — ELM APP',
    description:
      'Démarrez gratuitement. Caisse, stocks, comptabilité OHADA pour votre business au Sénégal.',
    url: 'https://www.elm-app.click/subscribe',
  },
};

export default function SubscribeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
