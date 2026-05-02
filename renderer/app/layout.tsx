import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from './providers/auth-provider';
import { ThemeProvider } from './providers/theme-provider';
import { NotificationContainer } from '@/components/ui/NotificationContainer';
import { MonitoringProvider } from '@/components/providers/MonitoringProvider';
import { Analytics } from '@vercel/analytics/next';

const BASE_URL = 'https://www.elm-app.click';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),

  title: {
    default: 'ELM - Entreprise Lifecycle Management (Sénégal) | Caisse · Stocks · Compta · Location · Juridique',
    template: '%s | ELM (Sénégal)',
  },
  description:
    'ELM (Entreprise Lifecycle Management) Sénégal : Le logiciel de gestion tout-en-un conçu pour les PME sénégalaises. Caisse tactile, stocks, comptabilité OHADA, location de véhicules, réservations hôtels, dossiers juridiques, livraisons et WhatsApp natif. La solution de référence à Dakar et dans tout le Sénégal.',
  applicationName: 'ELM Sénégal',
  keywords: [
    // Fonctionnalités core
    'logiciel caisse Sénégal', 'caisse tactile Dakar', 'point de vente Sénégal', 'POS Sénégal',
    'caisse enregistreuse Sénégal', 'logiciel caisse restaurant Sénégal',
    // Stock & ventes
    'gestion des stocks Sénégal', 'gestion stock temps réel', 'alertes rupture stock',
    'approvisionnement', 'codes-barres Sénégal', 'variantes produits',
    // Comptabilité
    'comptabilité OHADA Sénégal', 'logiciel comptabilité Sénégal', 'journal comptable Sénégal',
    'bilan OHADA', 'facturation Sénégal', 'devis factures Sénégal',
    // Paiements
    'Wave paiement Sénégal', 'Orange Money Sénégal', 'paiement mobile Sénégal',
    // Livraisons
    'gestion livraisons Sénégal', 'suivi livreur Sénégal', 'tracking commandes Sénégal',
    // Communication
    'WhatsApp business Sénégal', 'menu du jour WhatsApp', 'reçu WhatsApp Sénégal',
    // Hors-ligne
    'mode hors-ligne', 'caisse sans internet Sénégal',
    // Multi-établissements
    'multi-établissements Sénégal', 'gestion plusieurs boutiques',
    // Équipe
    'gestion équipe Sénégal', 'rôles employés', 'accès employés Sénégal',
    // Location véhicules
    'location voiture Sénégal', 'contrat location véhicule Sénégal', 'gestion flotte Sénégal',
    // Réservations
    'réservation hôtel Sénégal', 'gestion réservations Sénégal', 'logiciel hôtellerie Sénégal',
    // Juridique
    'logiciel cabinet juridique Sénégal', 'gestion dossiers juridiques Sénégal', 'honoraires avocat Sénégal',
    'dossiers juridiques OHADA Sénégal', 'suivi affaires juridiques Sénégal',
    // Secteurs
    'logiciel restaurant Sénégal', 'logiciel boutique retail Sénégal',
    'logiciel hôtellerie Sénégal', 'gestion hôtel Sénégal',
    'logiciel prestation service Sénégal', 'honoraires Sénégal',
    'commerce distribution Sénégal', 'revendeurs grossistes Sénégal',
    // Géo
    'logiciel gestion PME Sénégal', 'logiciel gestion PME Afrique',
    'ELM Entreprise Lifecycle Management', 'application gestion business Dakar',
    // Statistiques
    'statistiques ventes Sénégal', 'chiffre affaires Sénégal', 'rapports business Sénégal',
  ],

  authors: [{ name: 'ELM - Entreprise Lifecycle Management', url: BASE_URL }],
  creator: 'ELM Sénégal',
  publisher: 'ELM Sénégal',

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
    siteName: 'ELM Sénégal',
    title: 'ELM - Entreprise Lifecycle Management (Sénégal) | Gestion PME Tout-en-un',
    description:
      'Solution complète pour PME au Sénégal : caisse, stocks, comptabilité OHADA, location, hôtellerie et dossiers juridiques. WhatsApp natif & mode hors-ligne. Essayez ELM gratuitement pendant 7 jours.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ELM Sénégal - Logiciel de gestion Entreprise Lifecycle Management pour PME sénégalaises',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'ELM (Entreprise Lifecycle Management) Sénégal - Gestion PME Tout-en-un',
    description:
      'Caisse tactile, stocks, comptabilité OHADA, location, hôtellerie & dossiers juridiques au Sénégal. WhatsApp natif & hors-ligne.',
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
      name: 'ELM - Entreprise Lifecycle Management',
      url: BASE_URL,
      logo: { '@type': 'ImageObject', url: `${BASE_URL}/logo.png` },
      sameAs: [],
    },
    {
      '@type': 'WebSite',
      '@id': `${BASE_URL}/#website`,
      url: BASE_URL,
      name: 'ELM Sénégal',
      publisher: { '@id': `${BASE_URL}/#organization` },
      inLanguage: 'fr-SN',
    },
    {
      '@type': 'SoftwareApplication',
      name: 'ELM (Entreprise Lifecycle Management) Sénégal',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, Windows',
      url: BASE_URL,
      description:
        'ELM (Entreprise Lifecycle Management) est le logiciel de gestion tout-en-un leader au Sénégal pour les PME : caisse tactile, stocks en temps réel, comptabilité OHADA, livraisons, WhatsApp natif, mode hors-ligne, multi-établissements, gestion hôtelière et dossiers juridiques.',
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
            <MonitoringProvider>
              {children}
              <NotificationContainer />
            </MonitoringProvider>
          </AuthProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
