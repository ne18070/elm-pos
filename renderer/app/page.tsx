'use client';

import React from 'react';
import Link from 'next/link';
import {
  ShoppingCart, BarChart2, Truck, MessageCircle, BedDouble, Scale,
  WifiOff, Check, ArrowRight, Store, Package,
  Users, Receipt, Globe, UserCircle, Loader2, ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useEffect, useState } from 'react';
import { getPlans, type Plan } from '@services/supabase/subscriptions';
import { displayCurrency } from '@/lib/utils';

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
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300
      ${scrolled ? 'bg-[#080c18]/90 backdrop-blur-md border-b border-white/[0.06]' : ''}`}>
      <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
            <ShoppingCart className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-white font-semibold text-sm tracking-tight">ELM APP</span>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-sm text-slate-500">
          <a href="#features" className="hover:text-slate-200 transition-colors">Fonctionnalités</a>
          <a href="#secteurs" className="hover:text-slate-200 transition-colors">Secteurs</a>
          <a href="#tarifs"   className="hover:text-slate-200 transition-colors">Tarifs</a>
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <Link href="/pos"
              className="flex items-center gap-1.5 text-sm font-medium text-white bg-white/10 hover:bg-white/15 px-3.5 py-1.5 rounded-lg transition-colors">
              <UserCircle className="w-3.5 h-3.5" />
              {user.full_name?.split(' ')[0] ?? 'Mon espace'}
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </Link>
          ) : (
            <>
              <Link href="/login"
                className="text-sm text-slate-400 hover:text-white transition-colors hidden sm:block">
                Connexion
              </Link>
              <Link href="/subscribe"
                className="text-sm font-semibold text-white bg-brand-600 hover:bg-brand-500 px-4 py-1.5 rounded-lg transition-colors">
                Essai gratuit
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
    <section className="relative min-h-screen flex flex-col justify-center px-5 overflow-hidden">
      <div className="absolute inset-0 bg-[#080c18]" />

      {/* Subtle grid */}
      <div className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }} />

      {/* Accent light — top right */}
      <div className="absolute top-0 right-0 w-[500px] h-[400px] bg-brand-700/15 rounded-full blur-[140px] pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto w-full pt-28 pb-20">
        <div className="max-w-3xl">

          {/* Label */}
          <p className="text-xs font-semibold text-brand-400 tracking-widest uppercase mb-6">
            Logiciel de caisse · Sénégal &amp; Afrique
          </p>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-[56px] font-bold text-white leading-[1.1] tracking-tight mb-6">
            Gérez votre activité<br />
            <span className="text-slate-400">sans vous compliquer la vie.</span>
          </h1>

          <p className="text-lg text-slate-400 leading-relaxed max-w-xl mb-10">
            Caisse, stock, comptabilité, livraisons — tout dans une seule application.
            Conçu pour les PME africaines.
          </p>

          <div className="flex flex-col sm:flex-row items-start gap-3">
            {user ? (
              <Link href="/pos"
                className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm">
                Accéder à mon espace <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <>
                <Link href="/subscribe"
                  className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm">
                  Démarrer gratuitement <ArrowRight className="w-4 h-4" />
                </Link>
                <Link href="/login"
                  className="flex items-center gap-2 text-slate-400 hover:text-white border border-white/10 hover:border-white/20 px-6 py-3 rounded-xl transition-colors text-sm">
                  Se connecter
                </Link>
              </>
            )}
          </div>

          <p className="text-xs text-slate-600 mt-4">7 jours d&apos;essai · Aucune carte requise</p>
        </div>

        {/* Module pills */}
        <div className="mt-16 flex flex-wrap gap-2">
          {[
            'Caisse tactile',
            'Gestion des stocks',
            'Comptabilité OHADA',
            'Livraisons',
            'WhatsApp',
            'Mode hors-ligne',
            'Multi-établissements',
            'Hôtellerie',
            'Dossiers juridiques',
          ].map((tag) => (
            <span key={tag}
              className="text-xs text-slate-500 border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: ShoppingCart,  title: 'Caisse rapide',        desc: 'Espèces, Wave, Orange Money, carte. Reçus WhatsApp en un tap.' },
  { icon: Package,       title: 'Stock en temps réel',  desc: 'Alertes de rupture, approvisionnements, variantes synchronisées.' },
  { icon: BarChart2,     title: 'Statistiques',          desc: 'Chiffre d\'affaires, top produits, heures de pointe — lisibles.' },
  { icon: Truck,         title: 'Livraisons',            desc: 'Assignez un livreur, suivez chaque commande jusqu\'à la remise.' },
  { icon: MessageCircle, title: 'WhatsApp natif',        desc: 'Menu du jour, promos, réponses clients sans quitter l\'app.' },
  { icon: Receipt,       title: 'Comptabilité OHADA',   desc: 'Journal, bilan, résultat. Conforme aux normes comptables africaines.' },
  { icon: Users,         title: 'Gestion d\'équipe',    desc: 'Rôles par employé, accès séparés, traçabilité des actions.' },
  { icon: WifiOff,       title: 'Hors-ligne',           desc: 'Continuez à encaisser sans connexion. Sync automatique au retour.' },
];

function Features() {
  return (
    <section id="features" className="py-24 px-5 bg-[#080c18]">
      <div className="max-w-6xl mx-auto">
        <div className="mb-14">
          <p className="text-xs font-semibold text-slate-500 tracking-widest uppercase mb-3">Fonctionnalités</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Tout ce dont vous avez besoin</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-white/[0.04] rounded-2xl overflow-hidden border border-white/[0.04]">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-[#080c18] p-6 space-y-4 hover:bg-white/[0.02] transition-colors">
              <div className="w-8 h-8 rounded-lg bg-brand-900/60 flex items-center justify-center">
                <Icon className="w-4 h-4 text-brand-400" />
              </div>
              <div>
                <p className="text-white font-medium text-sm mb-1.5">{title}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Secteurs ─────────────────────────────────────────────────────────────────

const SECTEURS: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  border: string;
  title: string;
  desc: string;
}[] = [
  { icon: Store,        iconColor: 'text-orange-300', iconBg: 'bg-orange-950', border: 'border-orange-900', title: 'Commerce & Distribution', desc: 'Stocks, revendeurs, fournisseurs, prix de gros.' },
  { icon: ShoppingCart, iconColor: 'text-brand-300',  iconBg: 'bg-brand-950',  border: 'border-brand-900',  title: 'Boutique & Retail',       desc: 'Caisse rapide, codes-barres, variantes, promotions.' },
  { icon: BedDouble,    iconColor: 'text-teal-300',   iconBg: 'bg-teal-950',   border: 'border-teal-900',   title: 'Hôtellerie',              desc: 'Réservations, check-in/out, services additionnels.' },
  { icon: Scale,        iconColor: 'text-purple-300', iconBg: 'bg-purple-950', border: 'border-purple-900', title: 'Cabinet juridique',        desc: 'Dossiers, honoraires, OHADA, juridictions sénégalaises.' },
];

function Secteurs() {
  return (
    <section id="secteurs" className="py-24 px-5 bg-[#060a15]">
      <div className="max-w-6xl mx-auto">
        <div className="mb-14">
          <p className="text-xs font-semibold text-slate-500 tracking-widest uppercase mb-3">Secteurs</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Adapté à votre activité</h2>
          <p className="text-slate-500 mt-2 text-sm max-w-md">
            ELM se configure selon votre secteur. Vous ne voyez que ce qui vous est utile.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SECTEURS.map(({ icon: Icon, iconColor, iconBg, border, title, desc }) => (
            <div key={title}
              className={`flex items-start gap-4 p-5 rounded-xl border bg-[#0c1020] ${border} transition-colors`}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
                <Icon className={`w-4 h-4 ${iconColor}`} />
              </div>
              <div>
                <p className="text-slate-100 font-medium text-sm mb-1">{title}</p>
                <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Multi-établissements ─────────────────────────────────────────────────────

function MultiEtablissements() {
  return (
    <section className="py-24 px-5 bg-[#080c18]">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
        <div>
          <p className="text-xs font-semibold text-slate-500 tracking-widest uppercase mb-3">Multi-établissements</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-white leading-tight mb-5">
            Plusieurs boutiques,<br />un seul compte.
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-8">
            Gérez plusieurs établissements depuis le même compte. Chacun a ses propres données, son équipe et ses stocks. Vous passez de l&apos;un à l&apos;autre en un clic.
          </p>
          <ul className="space-y-3">
            {[
              'Données isolées par établissement',
              'Équipe et rôles séparés',
              'Changement de contexte instantané',
              'Synchronisation en temps réel',
            ].map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm text-slate-400">
                <Check className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Visual */}
        <div className="space-y-2">
          {[
            { name: 'Boutique Dakar Plateau', type: 'Commerce', active: true },
            { name: 'Restaurant Almadies',    type: 'Restauration', active: false },
            { name: 'Cabinet Me. Diallo',     type: 'Juridique', active: false },
          ].map(({ name, type, active }) => (
            <div key={name}
              className={`flex items-center gap-3.5 p-4 rounded-xl border transition-colors
                ${active
                  ? 'bg-brand-900/20 border-brand-700/40'
                  : 'bg-white/[0.02] border-white/[0.05]'}`}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0
                ${active ? 'bg-brand-600 text-white' : 'bg-white/5 text-slate-500'}`}>
                {name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${active ? 'text-white' : 'text-slate-400'}`}>{name}</p>
                <p className="text-xs text-slate-600">{type}</p>
              </div>
              {active && <div className="w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Tarifs ───────────────────────────────────────────────────────────────────

function PlanCard({ plan, isPrimary }: { plan: Plan; isPrimary: boolean }) {
  const isFree   = plan.price === 0;
  const isAnnual = plan.duration_days >= 300;
  const monthlyEquiv = isAnnual ? Math.round(plan.price / 12) : null;

  return (
    <div className={`relative rounded-xl p-6 border flex flex-col gap-5
      ${isPrimary ? 'bg-[#0d1a2d] border-brand-700/60' : 'bg-[#0c1020] border-white/[0.08]'}`}>

      {isPrimary && (
        <span className="absolute top-4 right-4 text-[10px] font-semibold text-brand-300 bg-brand-900/60 border border-brand-700/40 px-2 py-0.5 rounded-full tracking-wider uppercase">
          Recommandé
        </span>
      )}

      {isAnnual && !isFree && (
        <span className="absolute top-4 left-4 text-[10px] font-semibold text-green-300 bg-green-900/40 border border-green-800/40 px-2 py-0.5 rounded-full tracking-wider uppercase">
          1 mois offert
        </span>
      )}

      <div className={isAnnual && !isFree ? 'pt-5' : ''}>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">
          {plan.label || plan.name}
        </p>
        {isFree ? (
          <>
            <p className="text-3xl font-bold text-white">Gratuit</p>
            <p className="text-xs text-slate-600 mt-1">{plan.duration_days} jours d&apos;essai</p>
          </>
        ) : isAnnual ? (
          <>
            <p className="text-3xl font-bold text-white">{plan.price.toLocaleString('fr-FR')}</p>
            <p className="text-xs text-slate-500 mt-1">
              {displayCurrency(plan.currency)} / an
              <span className="ml-2 text-slate-600">
                ({monthlyEquiv?.toLocaleString('fr-FR')} / mois)
              </span>
            </p>
          </>
        ) : (
          <>
            <p className="text-3xl font-bold text-white">{plan.price.toLocaleString('fr-FR')}</p>
            <p className="text-xs text-slate-600 mt-1">{displayCurrency(plan.currency)} / mois</p>
          </>
        )}
      </div>

      <ul className="space-y-2.5 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-xs text-slate-400">
            <Check className="w-3.5 h-3.5 text-brand-400 shrink-0 mt-0.5" />
            {f}
          </li>
        ))}
      </ul>

      <Link href="/subscribe"
        className={`block w-full text-center py-2.5 rounded-lg text-sm font-semibold transition-colors
          ${isPrimary
            ? 'bg-brand-600 hover:bg-brand-500 text-white'
            : 'border border-white/10 hover:border-white/20 text-slate-300 hover:text-white'}`}>
        {isFree ? 'Commencer' : `Choisir ${plan.label || plan.name}`}
      </Link>
    </div>
  );
}

function Tarifs() {
  const [allPlans, setAllPlans] = useState<Plan[]>([]);
  const [loading, setLoading]   = useState(true);
  const [period, setPeriod]     = useState<'monthly' | 'annual'>('monthly');

  useEffect(() => {
    getPlans()
      .then(setAllPlans)
      .catch(() => setAllPlans([]))
      .finally(() => setLoading(false));
  }, []);

  const trialPlans   = allPlans.filter((p) => p.price === 0);
  const paidMonthly  = allPlans.filter((p) => p.price > 0 && p.duration_days < 300);
  const paidAnnual   = allPlans.filter((p) => p.price > 0 && p.duration_days >= 300);

  const hasAnnual  = paidAnnual.length > 0;
  const hasMonthly = paidMonthly.length > 0;

  const shownPaid  = period === 'annual' && hasAnnual ? paidAnnual : paidMonthly;
  const plans      = [...trialPlans, ...shownPaid];
  const maxPrice   = plans.length ? Math.max(...plans.map((p) => p.price)) : 0;

  return (
    <section id="tarifs" className="py-24 px-5 bg-[#060a15]">
      <div className="max-w-6xl mx-auto">
        <div className="mb-12 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold text-slate-500 tracking-widest uppercase mb-3">Tarifs</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Simple et transparent</h2>
            <p className="text-slate-500 mt-2 text-sm">Pas de frais cachés. Pas de surprise.</p>
          </div>

          {hasAnnual && hasMonthly && (
            <div className="flex items-center bg-[#0c1020] border border-white/[0.07] rounded-lg p-1 self-start sm:self-auto shrink-0">
              {(['monthly', 'annual'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors
                    ${period === p ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                  {p === 'monthly' ? 'Mensuel' : (
                    <span className="flex items-center gap-1.5">
                      Annuel
                      <span className="text-[10px] font-bold text-green-400">−10%</span>
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
          </div>
        ) : (
          <div className={`grid grid-cols-1 gap-4
            ${plans.length === 1 ? 'max-w-sm' :
              plans.length === 2 ? 'sm:grid-cols-2 max-w-2xl' :
              plans.length === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' :
              'sm:grid-cols-3'}`}>
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isPrimary={plan.price === maxPrice && plan.price > 0}
              />
            ))}
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
    <section className="py-24 px-5 bg-[#080c18] border-t border-white/[0.04]">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            Prêt à démarrer ?
          </h2>
          <p className="text-slate-500 text-sm">
            7 jours gratuits. Aucune carte bancaire requise.
          </p>
        </div>
        {user ? (
          <Link href="/pos"
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors shrink-0">
            Accéder à mon espace <ArrowRight className="w-4 h-4" />
          </Link>
        ) : (
          <Link href="/subscribe"
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors shrink-0">
            Commencer gratuitement <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-white/[0.04] bg-[#060a15] py-10 px-5">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-brand-600 flex items-center justify-center">
            <ShoppingCart className="w-3 h-3 text-white" />
          </div>
          <span className="text-white font-semibold text-sm">ELM APP</span>
        </div>
        <div className="flex items-center gap-6 text-xs text-slate-600">
          <Link href="/privacy" className="hover:text-slate-400 transition-colors">Confidentialité</Link>
          <a href="https://wa.me/33746436801" className="hover:text-slate-400 transition-colors">WhatsApp</a>
          <a href="mailto:contact@elm-app.click" className="hover:text-slate-400 transition-colors">Contact</a>
          <span className="flex items-center gap-1.5 text-slate-700">
            <Globe className="w-3 h-3" /> Sénégal · Afrique
          </span>
        </div>
        <p className="text-xs text-slate-700">© {new Date().getFullYear()} ELM APP</p>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="dark-section min-h-screen overflow-y-auto overflow-x-hidden" style={{ height: '100dvh', backgroundColor: '#080c18' }}>
      <Nav />
      <Hero />
      <Features />
      <Secteurs />
      <MultiEtablissements />
      <Tarifs />
      <CtaFinal />
      <Footer />
    </div>
  );
}
