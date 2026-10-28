import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Conditions d’utilisation — ELM Boutique',
};

// Texte résumé dans l'app (buyer_app/lib/screens/terms_screen.dart) :
// changer une règle ici → mettre à jour l'écran et AppConfig.termsVersion.
export default function ConditionsPage() {
  return (
    <div className="min-h-screen overflow-y-auto" style={{ height: '100vh' }}>
      <div className="relative max-w-3xl mx-auto px-4 py-12">
        <div className="flex flex-col items-center mb-10">
          <div className="w-24 h-24 bg-white rounded-2xl flex items-center justify-center mb-6 p-3 shadow-2xl overflow-hidden border-2 border-white/20">
            <img src="/logo.png" alt="ELM Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-xl font-bold text-content-primary">Conditions d&apos;utilisation</h1>
          <p className="text-content-secondary text-sm mt-1">Application ELM Boutique et annuaire ELM</p>
        </div>

        <div className="card p-8 space-y-8 text-content-primary text-sm leading-relaxed">
          <div className="space-y-2">
            <p className="text-xs text-content-muted">Dernière mise à jour : octobre 2026</p>
            <p>
              Les présentes conditions (le « contrat de licence utilisateur final ») s&apos;appliquent à
              l&apos;application ELM Boutique et aux pages publiques des boutiques ELM (vitrines, catalogues de
              services, suivi de commande). En utilisant l&apos;application, vous les acceptez. Si vous ne les
              acceptez pas, n&apos;utilisez pas l&apos;application.
            </p>
          </div>

          <Section title="1. Le service">
            <p>
              ELM Boutique est un annuaire de commerces et de prestataires qui utilisent ELM APP. Il permet de
              consulter leurs produits et services, de passer commande, de demander une prestation et d&apos;en
              suivre l&apos;avancement. Aucun compte n&apos;est nécessaire : vos coordonnées ne sont transmises
              qu&apos;au commerçant auquel vous passez commande.
            </p>
          </Section>

          <Section title="2. Contenus publiés par les commerçants">
            <p>
              Les fiches, noms, logos, photos, descriptions, prix et prestations sont publiés par chaque
              commerçant, qui en est seul responsable. La vente ou la prestation est conclue directement entre
              vous et le commerçant : ELM n&apos;est ni vendeur ni prestataire.
            </p>
          </Section>

          <Section title="3. Tolérance zéro pour les contenus inacceptables et les abus">
            <p>
              ELM n&apos;accepte <strong>aucun contenu inacceptable ni aucun utilisateur abusif</strong>, qu&apos;il
              s&apos;agisse d&apos;un commerçant ou d&apos;un acheteur. Sont notamment interdits :
            </p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>les contenus haineux, discriminatoires, violents, harcelants, pornographiques ou choquants ;</li>
              <li>la vente de produits ou services illégaux, contrefaits ou dangereux ;</li>
              <li>les arnaques, fausses boutiques, prix ou descriptions trompeurs, le spam ;</li>
              <li>l&apos;usurpation d&apos;identité et l&apos;atteinte aux droits d&apos;autrui ;</li>
              <li>les commandes fictives, les menaces ou insultes envers un commerçant ou un acheteur.</li>
            </ul>
            <p>
              Tout manquement entraîne le retrait du contenu et l&apos;exclusion du commerçant ou de
              l&apos;utilisateur concerné, sans préavis.
            </p>
          </Section>

          <Section title="4. Signaler et bloquer">
            <p>
              Sur chaque boutique, produit ou service, le menu <strong>Signaler</strong> permet de nous indiquer
              un contenu inacceptable. Le bouton <strong>Bloquer</strong> retire immédiatement la boutique de
              votre annuaire sur votre téléphone et prévient l&apos;équipe ELM. Vous pouvez débloquer une boutique à
              tout moment depuis le menu « Boutiques bloquées ».
            </p>
            <p>
              L&apos;équipe ELM examine chaque signalement <strong>sous 24 heures</strong> : le contenu en cause
              est retiré et le commerçant fautif est exclu de l&apos;annuaire.
            </p>
          </Section>

          <Section title="5. Votre utilisation">
            <p>
              Vous vous engagez à fournir des coordonnées exactes lors d&apos;une commande, à ne pas perturber le
              service (commandes en rafale, contournement des limites, tentative d&apos;accès non autorisé) et à
              respecter les commerçants. ELM peut limiter ou bloquer l&apos;accès en cas d&apos;abus.
            </p>
          </Section>

          <Section title="6. Responsabilité">
            <p>
              L&apos;application est fournie en l&apos;état. ELM s&apos;efforce d&apos;en assurer la disponibilité mais ne
              garantit pas l&apos;exactitude des contenus publiés par les commerçants, ni la bonne exécution des
              commandes et prestations, qui relèvent du commerçant.
            </p>
          </Section>

          <Section title="7. Données personnelles">
            <p>
              Le traitement de vos données est décrit dans notre{' '}
              <Link href="/privacy" className="text-content-brand hover:text-content-brand">
                politique de confidentialité
              </Link>
              .
            </p>
          </Section>

          <Section title="8. Modifications">
            <p>
              Nous pouvons modifier ces conditions. En cas de changement important, l&apos;application vous
              demandera de les accepter à nouveau.
            </p>
          </Section>

          <Section title="9. Contact">
            <div className="p-4 rounded-xl bg-surface-input border border-surface-border space-y-1">
              <p className="text-content-primary font-medium">ELM APP</p>
              <p>
                E-mail :{' '}
                <a href="mailto:contact@elm-app.click" className="text-content-brand hover:text-content-brand">
                  contact@elm-app.click
                </a>
              </p>
            </div>
          </Section>
        </div>

        <div className="flex items-center justify-center gap-6 mt-8 text-sm text-content-muted">
          <Link href="/" className="flex items-center gap-1.5 hover:text-content-primary transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Accueil
          </Link>
          <span>·</span>
          <Link href="/privacy" className="hover:text-content-primary transition-colors">
            Confidentialité
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold text-content-primary">{title}</h2>
      {children}
    </div>
  );
}
