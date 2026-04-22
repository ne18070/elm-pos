import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from './providers/auth-provider';
import { ThemeProvider } from './providers/theme-provider';
import { NotificationContainer } from '@/components/ui/NotificationContainer';

const BASE_URL = 'https://www.elm-app.click';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),

  title: {
    default: 'ELM APP — Logiciel de caisse et gestion pour les PME',
    template: '%s | ELM APP',
  },
  description:
    'Gérez votre business avec ELM APP : caisse tactile, stocks, comptabilité, livraisons et CRM. Conçu pour les commerces du Sénégal et d\'Afrique. Essai gratuit 7 jours.',
  applicationName: 'ELM APP',
  keywords: [
    'logiciel caisse', 'point de vente', 'POS', 'gestion stock',
    'comptabilité OHADA', 'restaurant', 'commerce retail', 'hôtel',
    'logiciel gestion PME', 'Sénégal', 'Afrique', 'ELM APP',
    'caisse enregistreuse', 'facturation', 'livraison',
  ],

  authors: [{ name: 'ELM APP', url: BASE_URL }],
  creator: 'ELM APP',
  publisher: 'ELM APP',

  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large' },
  },

  alternates: {
    canonical: BASE_URL,
  },

  openGraph: {
    type: 'website',
    locale: 'fr_SN',
    url: BASE_URL,
    siteName: 'ELM APP',
    title: 'ELM APP — Logiciel de caisse et gestion pour les PME',
    description:
      'Caisse tactile, stocks, comptabilité, livraisons. Tout-en-un pour votre business. Essai gratuit 7 jours.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ELM APP — Logiciel de gestion pour PME africaines',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'ELM APP — Logiciel de caisse et gestion pour les PME',
    description:
      'Caisse, stocks, comptabilité OHADA, livraisons. Conçu pour le Sénégal et l\'Afrique.',
    images: ['/og-image.png'],
    creator: '@elmapp',
  },

  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
    shortcut: ['/favicon.ico'],
  },

  manifest: '/site.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${BASE_URL}/#organization`,
      name: 'ELM APP',
      url: BASE_URL,
      logo: { '@type': 'ImageObject', url: `${BASE_URL}/logo.png` },
      sameAs: [],
    },
    {
      '@type': 'WebSite',
      '@id': `${BASE_URL}/#website`,
      url: BASE_URL,
      name: 'ELM APP',
      publisher: { '@id': `${BASE_URL}/#organization` },
      inLanguage: 'fr-SN',
    },
    {
      '@type': 'SoftwareApplication',
      name: 'ELM APP',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, Windows',
      url: BASE_URL,
      description:
        'Logiciel de caisse et gestion tout-en-un pour les PME : point de vente, stocks, comptabilité OHADA, livraisons, CRM.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'XOF',
        description: 'Essai gratuit 7 jours',
      },
      provider: { '@id': `${BASE_URL}/#organization` },
      featureList: ['Caisse tactile', 'Gestion des stocks', 'Comptabilité OHADA', 'Gestion des livraisons', 'CRM Clients', 'Multi-établissements'],
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <ThemeProvider>
          <AuthProvider>
            {children}
            <NotificationContainer />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
