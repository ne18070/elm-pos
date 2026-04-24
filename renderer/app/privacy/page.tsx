import Link from 'next/link';
import { ShoppingCart, ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Politique de confidentialité — ELM APP',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen overflow-y-auto" style={{ height: '100vh' }}>
      {/* Grille de fond */}
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      <div className="relative max-w-3xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-40 h-14 bg-white rounded-2xl flex items-center justify-center mb-6 p-3 shadow-2xl overflow-hidden border-2 border-white/20">
            <img src="/logo.png" alt="ELM Logo" className="w-full h-full object-contain" />
          </div>
          <p className="text-content-secondary text-sm mt-1">Politique de confidentialité</p>
        </div>

        <div className="card p-8 space-y-8 text-slate-300 text-sm leading-relaxed">

          <div className="space-y-2">
            <p className="text-xs text-slate-500">Dernière mise à jour : avril 2026</p>
            <p>
              ELM APP s&apos;engage à protéger la vie privée de ses utilisateurs. La présente politique de
              confidentialité décrit les données que nous collectons, la manière dont nous les utilisons et
              les droits dont vous disposez à leur égard.
            </p>
          </div>

          {/* 1 */}
          <Section title="1. Qui sommes-nous ?">
            <p>
              ELM APP est une solution de gestion de point de vente (caisse, stocks, commandes, comptabilité)
              destinée aux commerçants, restaurants, hôtels et prestataires de service. L&apos;éditeur de
              l&apos;application est joignable à l&apos;adresse :{' '}
              <a href="mailto:contact@elm-app.click" className="text-content-brand hover:text-content-brand">
                contact@elm-app.click
              </a>{' '}ou sur WhatsApp au{' '}
              <a href="https://wa.me/33746436801" className="text-content-brand hover:text-content-brand">
                +33 7 46 43 68 01
              </a>.
            </p>
          </Section>

          {/* 2 */}
          <Section title="2. Données collectées">
            <p>Dans le cadre de l&apos;utilisation d&apos;ELM APP, nous collectons les catégories de données suivantes :</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>
                <span className="text-white font-medium">Données de compte :</span> nom complet, adresse
                e-mail, numéro de téléphone, mot de passe (haché, jamais stocké en clair).
              </li>
              <li>
                <span className="text-white font-medium">Données de l&apos;établissement :</span> nom commercial,
                adresse, type d&apos;activité, logo, paramètres fiscaux, coordonnées bancaires (pour les
                abonnements).
              </li>
              <li>
                <span className="text-white font-medium">Données transactionnelles :</span> commandes, articles,
                paiements, remises, acomptes, remboursements, sessions de caisse, dépenses, écritures
                comptables.
              </li>
              <li>
                <span className="text-white font-medium">Données clients de l&apos;établissement :</span> nom,
                téléphone et adresse des clients enregistrés par l&apos;abonné dans le module Clients.
              </li>
              <li>
                <span className="text-white font-medium">Messages WhatsApp Business</span> (si le module est
                activé) : numéros de téléphone, noms et contenus des messages échangés via l&apos;API
                WhatsApp Business de Meta.
              </li>
              <li>
                <span className="text-white font-medium">Données de connexion :</span> adresse IP, date et
                heure de connexion, type d&apos;appareil, journaux d&apos;activité (actions critiques).
              </li>
            </ul>
          </Section>

          {/* 3 */}
          <Section title="3. Finalités du traitement">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Fournir et maintenir le service de caisse et de gestion commerciale.</li>
              <li>Gérer les abonnements, la facturation et le support client.</li>
              <li>Assurer la sécurité des comptes (authentification, journaux d&apos;audit).</li>
              <li>Synchroniser les données entre plusieurs terminaux (temps réel).</li>
              <li>
                Permettre la réception et l&apos;envoi de messages WhatsApp Business (uniquement si le module
                est activé par l&apos;abonné).
              </li>
              <li>Améliorer l&apos;application grâce à des statistiques d&apos;usage anonymisées.</li>
              <li>Respecter les obligations légales et réglementaires applicables.</li>
            </ul>
          </Section>

          {/* 4 */}
          <Section title="4. Base légale du traitement">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <span className="text-white font-medium">Exécution du contrat</span> — pour la fourniture du
                service d&apos;abonnement.
              </li>
              <li>
                <span className="text-white font-medium">Intérêt légitime</span> — pour la sécurité, la
                détection de fraude et l&apos;amélioration du service.
              </li>
              <li>
                <span className="text-white font-medium">Consentement</span> — pour les modules optionnels
                (WhatsApp Business), activés volontairement par l&apos;abonné.
              </li>
            </ul>
          </Section>

          {/* 5 */}
          <Section title="5. Hébergement et sous-traitants">
            <p>
              ELM APP utilise <span className="text-white font-medium">Supabase</span> (infrastructure cloud
              basée sur PostgreSQL) pour l&apos;hébergement des données. Les serveurs sont localisés dans des
              centres de données certifiés ISO 27001.
            </p>
            <p className="mt-2">
              Le module WhatsApp Business utilise l&apos;<span className="text-white font-medium">API Cloud de
              Meta</span> pour l&apos;envoi et la réception des messages. Les données transitant par ce service
              sont soumises à la politique de confidentialité de Meta.
            </p>
            <p className="mt-2">
              Aucune donnée personnelle n&apos;est vendue à des tiers.
            </p>
          </Section>

          {/* 6 */}
          <Section title="6. Durée de conservation">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <span className="text-white font-medium">Données de compte :</span> conservées pendant toute
                la durée de l&apos;abonnement, puis supprimées dans les 90 jours suivant la résiliation.
              </li>
              <li>
                <span className="text-white font-medium">Données transactionnelles :</span> conservées 5 ans
                à compter de la date de la transaction, conformément aux obligations comptables légales.
              </li>
              <li>
                <span className="text-white font-medium">Journaux d&apos;activité :</span> conservés 12 mois.
              </li>
              <li>
                <span className="text-white font-medium">Messages WhatsApp :</span> conservés pendant toute
                la durée de l&apos;abonnement.
              </li>
            </ul>
          </Section>

          {/* 7 */}
          <Section title="7. Sécurité des données">
            <p>
              Nous mettons en œuvre des mesures techniques et organisationnelles appropriées pour protéger vos
              données contre tout accès non autorisé, modification, divulgation ou destruction :
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Chiffrement des données en transit (HTTPS/TLS).</li>
              <li>Chiffrement au repos sur l&apos;infrastructure Supabase.</li>
              <li>Contrôle d&apos;accès basé sur les rôles (staff, manager, admin, propriétaire).</li>
              <li>Journaux d&apos;audit immuables sur les actions sensibles.</li>
              <li>Limitation de débit sur les opérations critiques (authentification, etc.).</li>
              <li>Déconnexion automatique après inactivité prolongée.</li>
            </ul>
          </Section>

          {/* 8 */}
          <Section title="8. Vos droits">
            <p>
              Conformément à la réglementation applicable en matière de protection des données personnelles,
              vous disposez des droits suivants :
            </p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li><span className="text-white font-medium">Droit d&apos;accès</span> — obtenir une copie de vos données.</li>
              <li><span className="text-white font-medium">Droit de rectification</span> — corriger des données inexactes.</li>
              <li><span className="text-white font-medium">Droit à l&apos;effacement</span> — demander la suppression de vos données dans les limites légales.</li>
              <li><span className="text-white font-medium">Droit à la portabilité</span> — recevoir vos données dans un format structuré.</li>
              <li><span className="text-white font-medium">Droit d&apos;opposition</span> — vous opposer à certains traitements basés sur l&apos;intérêt légitime.</li>
              <li><span className="text-white font-medium">Droit de retrait du consentement</span> — à tout moment pour les modules activés volontairement.</li>
            </ul>
            <p className="mt-3">
              Pour exercer ces droits, contactez-nous à :{' '}
              <a href="mailto:privacy@elm-app.click" className="text-content-brand hover:text-content-brand">
                privacy@elm-app.click
              </a>
            </p>
          </Section>

          {/* 9 */}
          <Section title="9. Cookies et stockage local">
            <p>
              ELM APP est une application de bureau (Electron). Elle utilise le stockage local du navigateur
              intégré uniquement pour conserver les préférences de configuration (imprimante, tiroir-caisse,
              thème) sur votre appareil. Aucun cookie de traçage publicitaire n&apos;est utilisé.
            </p>
          </Section>

          {/* 10 */}
          <Section title="10. Modifications de la présente politique">
            <p>
              Nous nous réservons le droit de modifier cette politique à tout moment. En cas de changement
              substantiel, les utilisateurs seront notifiés par e-mail ou via l&apos;application au moins 15 jours
              avant l&apos;entrée en vigueur des modifications.
            </p>
          </Section>

          {/* 11 */}
          <Section title="11. Contact">
            <p>
              Pour toute question relative à la présente politique ou au traitement de vos données personnelles :
            </p>
            <div className="mt-3 p-4 rounded-xl bg-surface-input border border-surface-border space-y-1">
              <p className="text-white font-medium">ELM APP</p>
              <p>
                E-mail :{' '}
                <a href="mailto:privacy@elm-app.click" className="text-content-brand hover:text-content-brand">
                  privacy@elm-app.click
                </a>
              </p>
            </div>
          </Section>
        </div>

        {/* Retour */}
        <div className="flex items-center justify-center gap-6 mt-8 text-sm text-slate-500">
          <Link href="/login" className="flex items-center gap-1.5 hover:text-slate-300 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Retour à la connexion
          </Link>
          <span>·</span>
          <Link href="/subscribe" className="hover:text-slate-300 transition-colors">
            S&apos;abonner
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {children}
    </div>
  );
}
