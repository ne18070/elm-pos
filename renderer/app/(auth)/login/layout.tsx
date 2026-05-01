import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Connexion — ELM Sénégal',
  description:
    'Connectez-vous à votre espace ELM (Entreprise Lifecycle Management) pour gérer votre business au Sénégal : caisse, stocks et comptabilité.',
  robots: { index: false, follow: false },
  alternates: {
    canonical: 'https://www.elm-app.click/login',
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
