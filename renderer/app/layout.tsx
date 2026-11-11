import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from './providers/auth-provider';
import { ThemeProvider } from './providers/theme-provider';
import { NotificationContainer } from '@/components/ui/NotificationContainer';
import { GlobalConfirmDialog } from '@/components/shared/ConfirmDialog';
import { MonitoringProvider } from '@/components/providers/MonitoringProvider';
import { Analytics } from '@vercel/analytics/next';

const BASE_URL = 'https://www.elm-app.click';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),

  title: {
    // ≤ 60 caractères : au-delà, Google coupe le titre dans ses résultats
    default: 'ELM — Logiciel de gestion et de caisse pour PME au Sénégal',
    template: '%s | ELM (Sénégal)',
  },
  // ≤ ~160 caractères (longueur affichée par Google)
  description:
    'Caisse, stocks, comptabilité OHADA, RH & paie, hôtel, location, cabinet juridique et école : le logiciel de gestion des PME au Sénégal. Essai gratuit 7 jours.',
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
    // Multi-établissements
    'multi-établissements Sénégal', 'gestion plusieurs boutiques',
    // Équipe
    'gestion équipe Sénégal', 'rôles employés', 'accès employés Sénégal',
    // Location véhicules
    'location voiture Sénégal', 'contrat location véhicule Sénégal', 'gestion flotte Sénégal',
    // Réservations
    'réservation hôtel Sénégal', 'gestion réservations Sénégal', 'logiciel hôtellerie Sénégal',
    // École & Éducation
    'logiciel gestion scolaire Sénégal', 'gestion école Dakar', 'système suivi élèves Sénégal',
    'paiement scolarité en ligne Sénégal', 'bulletins scolaires numériques Sénégal',
    'gestion centre de formation Sénégal',
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

  openGraph: {
    type: 'website',
    locale: 'fr_SN',
    url: BASE_URL,
    siteName: 'ELM Sénégal',
    title: 'ELM — Logiciel de gestion tout-en-un pour PME au Sénégal',
    description:
      'Caisse, stocks, comptabilité OHADA, RH & paie, location, hôtellerie, cabinet juridique et gestion scolaire. Reçus WhatsApp et boutique en ligne. Essayez ELM gratuitement pendant 7 jours.',
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
    title: 'ELM — Logiciel de gestion tout-en-un pour PME au Sénégal',
    description:
      'Caisse, stocks, comptabilité OHADA, location, hôtellerie, juridique et école au Sénégal. Reçus WhatsApp et boutique en ligne.',
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
      // 'Windows' (app de bureau) à rajouter quand elle sera distribuée
      operatingSystem: 'Web',
      url: BASE_URL,
      description:
        'ELM (Entreprise Lifecycle Management) est un logiciel de gestion tout-en-un pour les PME au Sénégal : caisse tactile, stocks en temps réel, comptabilité OHADA, livraisons, WhatsApp natif, boutique en ligne, multi-établissements, gestion hôtelière, dossiers juridiques et gestion scolaire.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'XOF',
        description: 'Essai gratuit 7 jours',
      },
      provider: { '@id': `${BASE_URL}/#organization` },
      featureList: [
        'Caisse tactile (espèces, Wave, Orange Money, carte)',
        'Gestion scolaire (élèves, classes, bulletins, scolarité)',
        'Gestion restaurant (plan de salle, menu du jour)',
        'Reçus WhatsApp instantanés',
        'Gestion des stocks en temps réel',
        'Alertes de rupture de stock',
        'Approvisionnements et variantes',
        'Comptabilité OHADA (journal, bilan, résultat)',
        'Facturation et devis',
        'Gestion des livraisons et suivi livreurs',
        'WhatsApp natif (menu du jour, promos, réponses clients)',
        'Boutique en ligne (retrait ou livraison)',
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
        {/*
          Script bloquant (sans async/defer) : s'exécute avant le premier pixel peint.
          Lit le thème depuis localStorage et pose data-theme AVANT que le CSS s'applique,
          ce qui évite le flash de mode sombre lors des navigations en mode clair.
          Format Zustand persist : { state: { theme: 'light'|'dark'|'auto' } }
        */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var s=JSON.parse(localStorage.getItem('elm-pos-theme')||'{}');var t=s&&s.state&&s.state.theme;if(t==='light'){document.documentElement.setAttribute('data-theme','light');}else if(t==='dark'){document.documentElement.removeAttribute('data-theme');}else{var h=new Date().getHours();if(h>=7&&h<19){document.documentElement.setAttribute('data-theme','light');}}}catch(e){}})();` }} />
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
              <GlobalConfirmDialog />
            </MonitoringProvider>
          </AuthProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
