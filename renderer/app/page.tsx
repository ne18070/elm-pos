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
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500
      ${scrolled 
        ? 'bg-white border-b border-slate-200 py-2.5 shadow-xl' 
        : 'bg-transparent py-5'}`}>
      <div className="max-w-6xl mx-auto px-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-24 h-8 rounded-xl bg-white overflow-hidden flex items-center justify-center p-1.5 transition-all duration-300 ${scrolled ? 'shadow-md border border-slate-100' : 'shadow-2xl border border-white/20'}`}>
            <img src="/logo.png" alt="ELM" className="w-full h-full object-contain" />
          </div>
        </div>

        <nav className={`hidden md:flex items-center gap-8 text-sm font-medium transition-colors duration-300
          ${scrolled ? 'text-slate-600' : 'text-slate-400'}`}>
          <a href="#features" className="hover:text-brand-600 transition-colors">Fonctionnalités</a>
          <a href="#secteurs" className="hover:text-brand-600 transition-colors">Secteurs</a>
          <a href="#tarifs"   className="hover:text-brand-600 transition-colors">Tarifs</a>
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <Link href="/pos"
              className={`flex items-center gap-1.5 text-sm font-medium px-3.5 py-1.5 rounded-lg transition-all duration-300
                ${scrolled 
                  ? 'text-slate-900 bg-slate-100 hover:bg-slate-200' 
                  : 'text-white bg-white/10 hover:bg-white/15'}`}>
              <UserCircle className="w-3.5 h-3.5" />
              {user.full_name?.split(' ')[0] ?? 'Mon espace'}
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </Link>
          ) : (
            <>
              <Link href="/login"
                className={`text-sm transition-colors duration-300 hidden sm:block ${scrolled ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'}`}>
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

      <div className="relative z-10 max-w-6xl mx-auto w-full pt-32 pb-20">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold text-brand-400 tracking-widest uppercase mb-6">
            Logiciel de caisse · Sénégal &amp; Afrique
          </p>

          <h1 className="text-4xl sm:text-5xl md:text-[56px] font-bold text-white leading-[1.1] tracking-tight mb-6">
            Gérez votre activité<br />
            <span className="text-slate-400">sans vous compliquer la vie.</span>
          </h1>

          <p className="text-lg text-slate-400 leading-relaxed max-w-xl mb-10">
            Caisse, stock, comptabilité, livraisons — tout dans une seule application.
            Conçu pour les PME africaines.
          </p>

          {/* AJOUT : Tags de fonctionnalités */}
          <div className="flex flex-wrap gap-2 mb-12 max-w-2xl">
            {[
              { label: 'Caisse tactile', icon: ShoppingCart },
              { label: 'Gestion des stocks', icon: Package },
              { label: 'Comptabilité OHADA', icon: Receipt },
              { label: 'Livraisons', icon: Truck },
              { label: 'WhatsApp', icon: MessageCircle },
              { label: 'Mode hors-ligne', icon: WifiOff },
              { label: 'Multi-établissements', icon: Globe },
              { label: 'Hôtellerie', icon: BedDouble },
              { label: 'Dossiers juridiques', icon: Scale },
            ].map((tag) => (
              <span key={tag.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-bold text-slate-300 whitespace-nowrap hover:bg-brand-500/10 hover:border-brand-500/30 hover:text-brand-400 transition-all cursor-default">
                <tag.icon className="w-3 h-3" />
                {tag.label}
              </span>
            ))}
          </div>

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
        </div>

        {/* AJOUT : Visual Showcase du logiciel */}
        <div className="mt-16 relative">
          <div className="absolute -inset-4 bg-brand-500/10 blur-3xl rounded-[40px]" />
          <img 
            src="/screenshots/02-pos-main.png" 
            alt="Interface ELM POS" 
            className="relative rounded-2xl border border-white/10 shadow-2xl w-full max-w-5xl mx-auto" 
          />
        </div>
      </div>
    </section>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: ShoppingCart,  title: 'Caisse tactile',       desc: 'Interface ultra-rapide optimisée pour le scan et le tactile. Reçus WhatsApp instantanés.' },
  { icon: Package,       title: 'Gestion des stocks',   desc: 'Suivi en temps réel, alertes de rupture, gestion des variantes et prix de gros.' },
  { icon: Receipt,       title: 'Comptabilité OHADA',   desc: 'Génération automatique des journaux, bilans et résultats aux normes africaines.' },
  { icon: Truck,         title: 'Livraisons',            desc: 'Suivi des livreurs sur le terrain et vérification des colis par scan.' },
  { icon: MessageCircle, title: 'WhatsApp',             desc: 'Envoi automatique des factures PDF et communication directe avec vos clients.' },
  { icon: WifiOff,       title: 'Mode hors-ligne',      desc: 'Encaissez même sans connexion internet. Synchronisation automatique au retour.' },
  { icon: Globe,         title: 'Multi-établissements', desc: 'Gérez plusieurs boutiques ou points de vente depuis un seul compte centralisé.' },
  { icon: BedDouble,    title: 'Hôtellerie',           desc: 'Gestion des chambres, des réservations et facturation unifiée (PMS intégré).' },
  { icon: Scale,        title: 'Dossiers juridiques',  desc: 'Suivi des procédures, gestion documentaire et facturation d\'honoraires.' },
];

function Features() {
  return (
    <section id="features" className="py-24 px-5 bg-[#080c18]">
      <div className="max-w-6xl mx-auto">
        <div className="mb-14">
          <p className="text-xs font-semibold text-slate-500 tracking-widest uppercase mb-3">Expertise</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Une solution complète</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/[0.04] rounded-2xl overflow-hidden border border-white/[0.04]">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="group bg-[#080c18] p-8 space-y-4 hover:bg-white/[0.02] transition-colors border-r border-b border-white/[0.02]">
              <div className="w-10 h-10 rounded-xl bg-brand-900/40 flex items-center justify-center mb-2">
                <Icon className="w-5 h-5 text-brand-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-base mb-2">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
        
        {/* AJOUT : Showcase Section Image pour les features */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-2 gap-10">
           <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">Suivi des stocks et inventaire</h3>
              <p className="text-sm text-slate-400">Gérez vos variantes et vos prix de gros en quelques clics.</p>
              <img src="/screenshots/10-products-list.png" className="rounded-xl border border-white/5 shadow-xl" loading="lazy" />
           </div>
           <div className="space-y-4">
              <h3 className="text-xl font-bold text-white">Analytique et rapports</h3>
              <p className="text-sm text-slate-400">Visualisez votre CA et vos marges en temps réel.</p>
              <img src="/screenshots/17-analytics.png" className="rounded-xl border border-white/5 shadow-xl" loading="lazy" />
           </div>
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
  { icon: Users,        iconColor: 'text-cyan-300',   iconBg: 'bg-cyan-950',   border: 'border-cyan-900',   title: 'Prestation de service',   desc: 'Devis, factures, suivi clients, honoraires et encaissements.' },
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

function PlanCard({ plan, isPrimary, period }: { plan: Plan; isPrimary: boolean; period: string }) {
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
                period={period}
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
          <div className="w-24 h-8 bg-white rounded-lg flex items-center justify-center p-1 overflow-hidden shadow-sm">
            <img src="/logo.png" alt="ELM" className="max-w-full max-h-full object-contain" />
          </div>
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

// ─── Modules Showcase ─────────────────────────────────────────────────────────

function ModuleFeature({ title, subtitle, desc, img, reverse = false }: { title: string, subtitle: string, desc: string, img: string, reverse?: boolean }) {
  return (
    <div className={`flex flex-col ${reverse ? 'lg:flex-row-reverse' : 'lg:flex-row'} items-center gap-12 lg:gap-20`}>
      <div className="flex-1 space-y-6">
        <div className="inline-block px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-[10px] font-bold tracking-widest uppercase">
          {subtitle}
        </div>
        <h3 className="text-3xl font-bold text-white tracking-tight">{title}</h3>
        <p className="text-slate-400 leading-relaxed text-lg">{desc}</p>
      </div>
      <div className="flex-1 w-full relative group">
        <div className="absolute -inset-4 bg-brand-500/5 blur-2xl rounded-[30px] transition-opacity group-hover:opacity-100 opacity-50" />
        <img 
          src={img} 
          alt={title} 
          className="relative rounded-2xl border border-white/5 shadow-2xl transition-transform duration-500 group-hover:scale-[1.02]" 
          loading="lazy" 
        />
      </div>
    </div>
  );
}

function ModulesShowcase() {
  return (
    <section id="solutions" className="py-32 px-5 bg-[#080c18]">
      <div className="max-w-6xl mx-auto space-y-40">
        
        <ModuleFeature 
          subtitle="Communication client"
          title="Factures PDF sur WhatsApp"
          desc="Modernisez votre relation client. Plus besoin d'imprimer systématiquement : envoyez les reçus professionnels directement sur le téléphone de vos clients en un clic."
          img="/screenshots/22-whatsapp-integration.png"
        />

        <ModuleFeature 
          subtitle="Pilotage stratégique"
          title="Tableaux de bord en temps réel"
          desc="Prenez des décisions basées sur des chiffres réels. Suivez votre chiffre d'affaires, vos marges nettes et vos produits les plus vendus grâce à des graphiques dynamiques et précis."
          img="/screenshots/17-analytics.png"
          reverse
        />

        <ModuleFeature 
          subtitle="Logistique & Terrain"
          title="Suivez vos livraisons en temps réel"
          desc="Préparez les colis avec vérification par scan pour éviter les erreurs. Assignez des livreurs et suivez l'état de chaque commande jusqu'à la remise au client."
          img="/screenshots/07-livraison.png"
        />

        <ModuleFeature 
          subtitle="Réseau de vente"
          title="Module Grossiste & Revendeurs"
          desc="Gérez vos ventes en volume en toute simplicité. Configurez des grilles de prix spécifiques pour vos revendeurs et suivez leurs performances et commissions."
          img="/screenshots/13-revendeurs.png"
          reverse
        />

        <ModuleFeature 
          subtitle="Transparence & Sécurité"
          title="Un journal d'audit pour tout contrôler"
          desc="Gardez l'esprit tranquille. Chaque annulation de vente, chaque modification de prix ou ouverture de tiroir est consignée. La fin des pertes inexpliquées en caisse."
          img="/screenshots/24-activity-logs.png"
        />

        <ModuleFeature 
          subtitle="Confiance Client"
          title="Écran Client Interactif"
          desc="Améliorez l'expérience en caisse. Affichez le panier et le total sur un second écran pour vos clients, réduisant les erreurs et renforçant la confiance lors du paiement."
          img="/screenshots/27-customer-display.png"
          reverse
        />

        <ModuleFeature 
          subtitle="Rigueur Financière"
          title="Comptabilité OHADA automatisée"
          desc="Générez vos journaux comptables, bilans et comptes de résultat sans effort. Toutes vos transactions sont déjà pré-classées selon les normes OHADA en vigueur."
          img="/screenshots/19-comptabilite.png"
        />

        <ModuleFeature 
          subtitle="Services Juridiques"
          title="Suivi de dossiers et honoraires"
          desc="Spécialement conçu pour les cabinets d'avocats et notaires au Sénégal. Gérez l'ouverture des dossiers, le suivi des procédures OHADA et la facturation précise des honoraires."
          img="/screenshots/15-dossiers-clients.png"
          reverse
        />

        <ModuleFeature 
          subtitle="Spécialisation métier"
          title="Gestion hôtelière intégrée"
          desc="Activez le module PMS pour gérer vos chambres, vos réservations et vos consommations bar/restaurant sur une seule facture client. Une solution vraiment tout-en-un."
          img="/screenshots/14-hotel-management.png"
        />

      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="theme-dark min-h-screen" style={{ backgroundColor: '#080c18' }}>
      <Nav />
      <Hero />
      <Features />
      <ModulesShowcase />
      <Secteurs />
      <MultiEtablissements />
      <Tarifs />
      <CtaFinal />
      <Footer />
    </div>
  );
}
