import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from './providers/auth-provider';
import { ThemeProvider } from './providers/theme-provider';
import { NotificationContainer } from '@/components/ui/NotificationContainer';

const BASE_URL = 'https://www.elm-app.click';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),

  title: {
    default: 'ELM APP - Caisse · Stocks · Comptabilité OHADA · Location · Réservations · Juridique',
    template: '%s | ELM APP',
  },
  description:
    'ELM APP : caisse tactile, gestion des stocks, comptabilité OHADA, location de véhicules, réservations hôtels, dossiers juridiques, livraisons, WhatsApp natif, mode hors-ligne, multi-établissements. Pour restaurants, commerces, hôtels, cabinets juridiques et prestataires de services au Sénégal et en Afrique. Essai gratuit 7 jours.',
  applicationName: 'ELM APP',
  keywords: [
    // Fonctionnalités core
    'logiciel caisse', 'caisse tactile', 'point de vente', 'POS Sénégal',
    'caisse enregistreuse Sénégal', 'logiciel caisse restaurant',
    // Stock & ventes
    'gestion des stocks', 'gestion stock temps réel', 'alertes rupture stock',
    'approvisionnement', 'codes-barres', 'variantes produits',
    // Comptabilité
    'comptabilité OHADA', 'logiciel comptabilité Sénégal', 'journal comptable',
    'bilan OHADA', 'facturation', 'devis factures',
    // Paiements
    'Wave paiement', 'Orange Money', 'paiement mobile Sénégal',
    // Livraisons
    'gestion livraisons', 'suivi livreur', 'tracking commandes',
    // Communication
    'WhatsApp business', 'menu du jour WhatsApp', 'reçu WhatsApp',
    // Hors-ligne
    'mode hors-ligne', 'caisse sans internet',
    // Multi-établissements
    'multi-établissements', 'gestion plusieurs boutiques',
    // Équipe
    'gestion équipe', 'rôles employés', 'accès employés',
    // Location véhicules
    'location voiture Sénégal', 'contrat location véhicule', 'gestion flotte',
    // Réservations
    'réservation hôtel Sénégal', 'gestion réservations', 'logiciel hôtellerie',
    // Juridique
    'logiciel cabinet juridique', 'gestion dossiers juridiques', 'honoraires avocat',
    'dossiers juridiques OHADA', 'suivi affaires juridiques',
    // Secteurs
    'logiciel restaurant Sénégal', 'logiciel boutique retail',
    'logiciel hôtellerie Afrique', 'gestion hôtel Sénégal',
    'logiciel prestation service', 'honoraires',
    'commerce distribution', 'revendeurs grossistes',
    // Géo
    'logiciel gestion PME Sénégal', 'logiciel gestion PME Afrique',
    'ELM APP', 'application gestion business Dakar',
    // Statistiques
    'statistiques ventes', 'chiffre affaires', 'rapports business',
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
    title: 'ELM APP - Caisse · Stocks · Comptabilité OHADA · Location · Réservations · Juridique',
    description:
      'Tout-en-un : caisse tactile, stocks temps réel, comptabilité OHADA, location de véhicules, réservations hôtels, dossiers juridiques, livraisons, WhatsApp natif, hors-ligne, multi-établissements. Pour restaurants, commerces, hôtels et cabinets au Sénégal. Essai 7 jours gratuit.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ELM APP - Logiciel de gestion tout-en-un pour PME africaines',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'ELM APP - Caisse · Stocks · Compta OHADA · Location · Réservations · Juridique',
    description:
      'Caisse tactile, stocks, comptabilité OHADA, location de véhicules, réservations hôtels, dossiers juridiques, livraisons, WhatsApp natif, hors-ligne. Pour restaurants, boutiques, hôtels & cabinets au Sénégal.',
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
        'ELM APP est un logiciel de gestion tout-en-un pour les PME africaines : caisse tactile, stocks en temps réel, comptabilité OHADA, livraisons avec suivi, WhatsApp natif, mode hors-ligne, multi-établissements, gestion hôtelière, dossiers juridiques, et gestion d\'équipe. Conçu pour les restaurants, boutiques, hôtels, cabinets juridiques et prestataires de services au Sénégal et en Afrique.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'XOF',
        description: 'Essai gratuit 7 jours',
      },
      provider: { '@id': `${BASE_URL}/#organization` },
      featureList: [
        'Caisse tactile (espèces, Wave, Orange Money, carte)',
        'Reçus WhatsApp instantanés',
        'Gestion des stocks en temps réel',
        'Alertes de rupture de stock',
        'Approvisionnements et variantes',
        'Comptabilité OHADA (journal, bilan, résultat)',
        'Facturation et devis',
        'Gestion des livraisons et suivi livreurs',
        'WhatsApp natif (menu du jour, promos, réponses clients)',
        'Mode hors-ligne (encaissement sans internet)',
        'Multi-établissements (plusieurs boutiques, un seul compte)',
        'Gestion d\'équipe et rôles employés',
        'Statistiques et rapports de ventes',
        'Gestion hôtelière (réservations, check-in/out)',
        'Dossiers juridiques et honoraires',
        'CRM Clients',
        'Codes-barres et variantes produits',
        'Promotions et coupons',
        'Gestion des revendeurs et grossistes',
      ],
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
