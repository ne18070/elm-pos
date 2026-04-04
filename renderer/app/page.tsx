'use client';

import Link from 'next/link';
import {
  ShoppingCart, BarChart2, Truck, MessageCircle, BedDouble, Scale,
  Wifi, WifiOff, Check, ArrowRight, Store, Package,
  Users, Receipt, Zap, Globe, UserCircle, Loader2,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useEffect, useState } from 'react';
import { getPlans, type Plan } from '@services/supabase/subscriptions';

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav() {
  const { user } = useAuthStore();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200
      ${scrolled ? 'bg-[#0a0f1e]/95 backdrop-blur border-b border-white/5 shadow-lg' : 'bg-transparent'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <ShoppingCart className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">
            ELM <span className="text-brand-400">APP</span>
          </span>
        </div>

        {/* Nav links — desktop */}
        <nav className="hidden md:flex items-center gap-6 text-sm text-slate-400">
          <a href="#features"   className="hover:text-white transition-colors">Fonctionnalités</a>
          <a href="#secteurs"   className="hover:text-white transition-colors">Secteurs</a>
          <a href="#tarifs"     className="hover:text-white transition-colors">Tarifs</a>
        </nav>

        {/* CTA */}
        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <Link href="/pos"
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
              <UserCircle className="w-4 h-4" />
              <span className="hidden sm:inline">{user.full_name?.split(' ')[0] ?? 'Mon espace'}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <>
              <Link href="/login"
                className="text-slate-300 hover:text-white text-sm font-medium transition-colors hidden sm:inline">
                Connexion
              </Link>
              <Link href="/login"
                className="bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
                Démarrer gratuitement
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  const { user } = useAuthStore();

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-4 text-center overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 bg-[#0a0f1e]" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px]
                      bg-brand-600/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-4xl mx-auto space-y-8 pt-16">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-brand-900/50 border border-brand-700/50 text-brand-300 text-xs font-medium px-4 py-2 rounded-full">
          <Zap className="w-3.5 h-3.5" />
          GESTION SIMPLIFIÉE · FAIT POUR L'AFRIQUE
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-white leading-tight">
          Arrêtez la<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-cyan-400">
            gestion manuelle.
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
          ELM APP centralise ventes, stocks, dépenses et livraisons — en temps réel.{' '}
          <strong className="text-slate-200">Gagnez du temps. Réduisez les erreurs. Décidez vite.</strong>
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          {user ? (
            <Link href="/pos"
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-bold px-8 py-4 rounded-2xl text-lg transition-all hover:scale-105 shadow-lg shadow-brand-900/50">
              Accéder à mon espace <ArrowRight className="w-5 h-5" />
            </Link>
          ) : (
            <>
              <Link href="/login"
                className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-bold px-8 py-4 rounded-2xl text-lg transition-all hover:scale-105 shadow-lg shadow-brand-900/50">
                Commencer l&apos;essai gratuit <ArrowRight className="w-5 h-5" />
              </Link>
              <Link href="/login"
                className="flex items-center gap-2 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 px-8 py-4 rounded-2xl text-lg transition-all">
                Se connecter
              </Link>
            </>
          )}
        </div>

        <p className="text-xs text-slate-600">7 jours gratuits · Aucune carte bancaire requise</p>

        {/* App screenshot */}
        <div className="mt-8 relative mx-auto max-w-4xl">
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0f1e] via-transparent to-transparent z-10 pointer-events-none" />
          <div className="bg-surface-card border border-white/10 rounded-2xl overflow-hidden shadow-2xl shadow-black/60">
            {/* Fake window chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-black/20">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-amber-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
              <span className="ml-3 text-xs text-slate-600">Comptabilité OHADA · Tableau de bord</span>
            </div>
            {/* Fake content */}
            <div className="p-6 space-y-4">
              <div className="flex gap-2">
                {['Tableau de bord','Journal','Balance','États financiers'].map((t) => (
                  <div key={t} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${t === 'Tableau de bord' ? 'bg-brand-600 text-white' : 'text-slate-500'}`}>{t}</div>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Chiffre d'affaires", value: '5 250 FCFA', up: true },
                  { label: 'Charges totales',     value: '0 FCFA',    up: null },
                  { label: 'Résultat net',        value: '5 250 FCFA',up: true },
                  { label: 'Trésorerie',          value: '5 250 FCFA',up: true },
                ].map((k) => (
                  <div key={k.label} className="bg-surface-input/50 rounded-xl p-3">
                    <p className="text-xs text-slate-500 mb-1">{k.label}</p>
                    <p className="text-sm font-bold text-white">{k.value}</p>
                    {k.up && <p className="text-xs text-green-400 mt-0.5">↑ Vente jour ↑</p>}
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {['Vente #FB82S471','Vente #CAO7E8CA','Vente #7F6941CD7','Vente #8CB05842','Remboursement #65EFEG5B'].map((r, i) => (
                  <div key={r} className="flex items-center justify-between text-xs py-2 border-b border-white/5">
                    <span className="text-slate-400 font-mono">{r}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${i === 4 ? 'bg-orange-900/40 text-orange-400' : 'bg-green-900/40 text-green-400'}`}>
                      {i === 4 ? 'Rembours.' : 'Vente'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function Stats() {
  return (
    <section className="bg-black/20 border-y border-white/5 py-12">
      <div className="max-w-7xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
        {[
          { value: '500+',  label: 'Établissements actifs' },
          { value: '4',     label: 'Pays couverts' },
          { value: '99.9%', label: 'Disponibilité' },
          { value: '7j',    label: 'Essai gratuit' },
        ].map((s) => (
          <div key={s.label}>
            <p className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-cyan-400">{s.value}</p>
            <p className="text-sm text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: ShoppingCart,  title: 'Caisse rapide',       desc: 'Espèces, Wave, Orange Money, carte bancaire. Factures sur WhatsApp en un tap.' },
  { icon: Package,       title: 'Stock en temps réel', desc: 'Alertes rupture, approvisionnements, variantes — tout synchronisé.' },
  { icon: BarChart2,     title: 'Statistiques claires',desc: 'CA, top produits, heures de pointe. Décidez avec des données, pas des suppositions.' },
  { icon: Truck,         title: 'Livraisons suivies',  desc: 'Assignez un livreur, suivez chaque commande de la préparation à la remise.' },
  { icon: MessageCircle, title: 'WhatsApp intégré',    desc: 'Répondez aux clients, envoyez le menu du jour ou des promos sans quitter l\'app.' },
  { icon: Receipt,       title: 'Comptabilité OHADA',  desc: 'Journal, bilan, compte de résultat. Conforme aux normes comptables africaines.' },
  { icon: Users,         title: 'Gestion d\'équipe',   desc: 'Rôles par employé, accès séparés, suivi des actions de chacun.' },
  { icon: WifiOff,       title: 'Mode hors-ligne',     desc: 'Continuez à encaisser sans Internet. Synchronisation automatique au retour.' },
];

function Features() {
  return (
    <section id="features" className="py-24 px-4 bg-[#0a0f1e]">
      <div className="max-w-7xl mx-auto space-y-16">
        <div className="text-center space-y-4">
          <h2 className="text-3xl sm:text-4xl font-black text-white">Tout ce dont vous avez besoin</h2>
          <p className="text-slate-400 max-w-xl mx-auto">Une seule application pour gérer toute votre activité.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="group bg-surface-card border border-white/5 rounded-2xl p-6 space-y-4 hover:border-brand-700/50 hover:bg-brand-900/10 transition-all duration-200">
              <div className="w-10 h-10 rounded-xl bg-brand-900/50 border border-brand-800/50 flex items-center justify-center">
                <Icon className="w-5 h-5 text-brand-400" />
              </div>
              <div>
                <p className="text-white font-semibold mb-1">{title}</p>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Secteurs ─────────────────────────────────────────────────────────────────

const SECTEURS = [
  { icon: Store,    color: 'text-orange-400 bg-orange-900/30 border-orange-800/50', title: 'Commerce & Distribution', desc: 'Gestion des stocks, revendeurs, fournisseurs et prix de gros.' },
  { icon: ShoppingCart, color: 'text-brand-400 bg-brand-900/30 border-brand-800/50', title: 'Boutique & Retail',      desc: 'Caisse rapide, codes-barres, variantes, promotions.' },
  { icon: BedDouble,color: 'text-teal-400 bg-teal-900/30 border-teal-800/50',     title: 'Hôtellerie',              desc: 'Réservations, check-in/out, services additionnels, calendrier.' },
  { icon: Scale,    color: 'text-purple-400 bg-purple-900/30 border-purple-800/50',title: 'Cabinet juridique',       desc: 'Dossiers, honoraires, suivi OHADA, juridictions sénégalaises.' },
];

function Secteurs() {
  return (
    <section id="secteurs" className="py-24 px-4 bg-black/20">
      <div className="max-w-7xl mx-auto space-y-16">
        <div className="text-center space-y-4">
          <h2 className="text-3xl sm:text-4xl font-black text-white">Adapté à votre secteur</h2>
          <p className="text-slate-400 max-w-xl mx-auto">ELM se configure selon votre activité. Vous ne voyez que ce qui vous est utile.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SECTEURS.map(({ icon: Icon, color, title, desc }) => (
            <div key={title} className="flex items-start gap-5 bg-surface-card border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-all">
              <div className={`w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 ${color}`}>
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-white font-semibold mb-1">{title}</p>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Avantages clés ───────────────────────────────────────────────────────────

function Avantages() {
  return (
    <section className="py-24 px-4 bg-[#0a0f1e]">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h2 className="text-3xl sm:text-4xl font-black text-white leading-tight">
              Plusieurs boutiques,<br />
              <span className="text-brand-400">un seul compte.</span>
            </h2>
            <p className="text-slate-400 leading-relaxed">
              Gérez plusieurs établissements depuis le même compte. Chacun a ses propres données, son équipe, son stock. Vous passez de l'un à l'autre en un clic.
            </p>
            <ul className="space-y-3">
              {[
                'Données isolées par établissement',
                'Équipe et rôles séparés',
                'Stats consolidées ou par boutique',
                'Fonctionne même sans Internet',
              ].map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm text-slate-300">
                  <Check className="w-4 h-4 text-brand-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            {['Boutique Dakar Plateau', 'Restaurant Almadies', 'Cabinet Me. Diallo'].map((biz, i) => (
              <div key={biz} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all
                ${i === 0 ? 'border-brand-600 bg-brand-900/20' : 'border-white/5 bg-surface-card'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0
                  ${i === 0 ? 'bg-brand-600 text-white' : 'bg-surface-input text-slate-400'}`}>
                  {biz.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium truncate ${i === 0 ? 'text-brand-300' : 'text-slate-300'}`}>{biz}</p>
                  <p className="text-xs text-slate-600">{['Commerce', 'Restaurant', 'Juridique'][i]}</p>
                </div>
                {i === 0 && <div className="w-2 h-2 rounded-full bg-brand-400 shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Tarifs ───────────────────────────────────────────────────────────────────

function Tarifs() {
  const [plans, setPlans]     = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPlans()
      .then(setPlans)
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, []);

  // Determine which plan is "recommended" (highest price among active plans)
  const maxPrice = plans.length ? Math.max(...plans.map((p) => p.price)) : 0;

  return (
    <section id="tarifs" className="py-24 px-4 bg-black/20">
      <div className="max-w-3xl mx-auto space-y-12">
        <div className="text-center space-y-4">
          <h2 className="text-3xl sm:text-4xl font-black text-white">Simple et transparent</h2>
          <p className="text-slate-400">Pas de frais cachés. Pas de surprise.</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
          </div>
        ) : (
          <div className={`grid grid-cols-1 gap-6 ${plans.length === 2 ? 'sm:grid-cols-2' : plans.length >= 3 ? 'sm:grid-cols-3' : ''}`}>
            {plans.map((plan) => {
              const isFree    = plan.price === 0;
              const isPrimary = plan.price === maxPrice && !isFree;
              const priceStr  = isFree
                ? 'Gratuit'
                : plan.price.toLocaleString('fr-FR');
              const subStr    = isFree
                ? `${plan.duration_days} jours d'essai`
                : `${plan.currency} / mois`;

              return (
                <div key={plan.id}
                  className={`bg-surface-card border-2 rounded-2xl p-8 space-y-6 relative
                    ${isPrimary ? 'border-brand-600' : 'border-white/10'}`}>
                  {isPrimary && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-600 text-white text-xs font-bold px-4 py-1 rounded-full">
                      RECOMMANDÉ
                    </div>
                  )}
                  <div>
                    <p className="text-slate-400 text-sm font-medium">{plan.label || plan.name}</p>
                    <p className="text-3xl font-black text-white mt-1">{priceStr}</p>
                    <p className="text-sm text-slate-500">{subStr}</p>
                  </div>
                  <ul className="space-y-3">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2.5 text-sm text-slate-300">
                        <Check className={`w-4 h-4 shrink-0 ${isPrimary ? 'text-brand-400' : 'text-slate-500'}`} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/subscribe"
                    className={`block w-full text-center py-3 rounded-xl font-semibold text-sm transition-all
                      ${isPrimary
                        ? 'bg-brand-600 hover:bg-brand-500 text-white'
                        : 'border border-white/10 hover:border-white/20 text-slate-300 hover:text-white'}`}>
                    {isFree ? 'Commencer' : `Choisir ${plan.label || plan.name}`}
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── CTA final ────────────────────────────────────────────────────────────────

function CtaFinal() {
  const { user } = useAuthStore();
  return (
    <section className="py-24 px-4 bg-[#0a0f1e]">
      <div className="max-w-3xl mx-auto text-center space-y-8">
        <div className="w-16 h-16 rounded-2xl bg-brand-600 flex items-center justify-center mx-auto">
          <ShoppingCart className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-3xl sm:text-4xl font-black text-white">
          Prêt à simplifier<br />votre gestion ?
        </h2>
        <p className="text-slate-400">
          Rejoignez les commerçants, restaurateurs et professionnels qui font confiance à ELM APP.
        </p>
        {user ? (
          <Link href="/pos"
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-bold px-10 py-4 rounded-2xl text-lg transition-all hover:scale-105">
            Accéder à mon espace <ArrowRight className="w-5 h-5" />
          </Link>
        ) : (
          <Link href="/login"
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-bold px-10 py-4 rounded-2xl text-lg transition-all hover:scale-105">
            Commencer gratuitement <ArrowRight className="w-5 h-5" />
          </Link>
        )}
        <p className="text-xs text-slate-600">7 jours gratuits · Sans carte bancaire</p>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-white/5 bg-[#080c18] py-12 px-4">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
            <ShoppingCart className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-white font-bold">ELM <span className="text-brand-400">APP</span></span>
        </div>
        <div className="flex items-center gap-6 text-sm text-slate-600">
          <Link href="/privacy" className="hover:text-slate-400 transition-colors">Confidentialité</Link>
          <a href="mailto:support@elm-app.click" className="hover:text-slate-400 transition-colors">Contact</a>
          <span className="flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" /> Sénégal · Afrique
          </span>
        </div>
        <p className="text-xs text-slate-700">© {new Date().getFullYear()} Elm App. Tous droits réservés.</p>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-y-auto overflow-x-hidden" style={{ height: '100dvh' }}>
      <Nav />
      <Hero />
      <Stats />
      <Features />
      <Secteurs />
      <Avantages />
      <Tarifs />
      <CtaFinal />
      <Footer />
    </div>
  );
}
