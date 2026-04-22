import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Connexion à votre espace',
  description: 'Connectez-vous à votre espace ELM APP pour gérer votre caisse, vos stocks et votre comptabilité.',
  robots: { index: false, follow: false },
  alternates: {
    canonical: 'https://www.elm-app.click/login',
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
