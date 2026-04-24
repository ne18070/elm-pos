'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ShoppingCart,
  Truck,
  MessageCircle,
  BedDouble,
  Scale,
  WifiOff,
  Check,
  ArrowRight,
  ArrowUp,
  Store,
  Package,
  Users,
  Receipt,
  Globe,
  UserCircle,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { getPlans, type Plan } from '@services/supabase/subscriptions';
import { displayCurrency } from '@/lib/utils';

function Nav() {
  const { user } = useAuthStore();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'theme-dark bg-surface-card border-b border-surface-border py-2.5 shadow-xl'
          : 'theme-dark bg-surface-card/95 border-b border-surface-border py-5 backdrop-blur-md'
      }`}
    >
      <div className="max-w-6xl mx-auto px-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-24 h-8 rounded-xl bg-white overflow-hidden flex items-center justify-center p-1.5 transition-all duration-300 ${
              scrolled ? 'border border-surface-border shadow-md' : 'border border-surface-border shadow-2xl'
            }`}
          >
            <img src="/logo.png" alt="ELM" className="w-full h-full object-contain" />
          </div>
        </div>

        <nav
          className={`hidden md:flex items-center gap-8 text-sm font-medium transition-colors duration-300 ${
            scrolled ? 'text-content-muted' : 'text-content-secondary'
          }`}
        >
          <a href="#features" className="hover:text-brand-300 transition-colors">Fonctionnalites</a>
          <a href="#secteurs" className="hover:text-brand-300 transition-colors">Secteurs</a>
          <a href="#tarifs" className="hover:text-brand-300 transition-colors">Tarifs</a>
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <Link
              href="/pos"
              className={`flex items-center gap-1.5 text-sm font-medium px-3.5 py-1.5 rounded-lg transition-all duration-300 ${
                scrolled
                  ? 'text-content-primary bg-surface hover:bg-surface-hover'
                  : 'text-content-primary bg-surface-card/70 hover:bg-surface-card'
              }`}
            >
              <UserCircle className="w-3.5 h-3.5" />
              {user.full_name?.split(' ')[0] ?? 'Mon espace'}
              <ChevronRight className="w-3.5 h-3.5 text-content-secondary" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className={`text-sm transition-colors duration-300 hidden sm:block ${
                  scrolled ? 'text-content-muted hover:text-content-primary' : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                Connexion
              </Link>
              <Link
                href="/subscribe"
                className="text-sm font-semibold text-content-primary bg-brand-600 hover:bg-brand-500 px-4 py-1.5 rounded-lg transition-colors"
              >
                Essai gratuit
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const { user } = useAuthStore();

  return (
    <section className="relative min-h-screen flex flex-col justify-center px-5 overflow-hidden bg-surface">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.16),transparent_38%),radial-gradient(circle_at_80%_30%,rgba(16,185,129,0.08),transparent_28%)]" />

      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto w-full pt-32 pb-20">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold text-brand-300 tracking-widest uppercase mb-6">
            Logiciel de caisse - Senegal & Afrique
          </p>

          <h1 className="text-4xl sm:text-5xl md:text-[56px] font-bold text-content-primary leading-[1.1] tracking-tight mb-6">
            Gerez votre activite
            <br />
            <span className="text-content-secondary">sans vous compliquer la vie.</span>
          </h1>

          <p className="text-lg text-content-secondary leading-relaxed max-w-xl mb-10">
            Caisse, stock, comptabilite, livraisons: tout dans une seule application.
            Concu pour les PME africaines.
          </p>

          <div className="flex flex-wrap gap-2 mb-12 max-w-2xl">
            {[
              { label: 'Caisse tactile', icon: ShoppingCart },
              { label: 'Gestion des stocks', icon: Package },
              { label: 'Comptabilite OHADA', icon: Receipt },
              { label: 'Livraisons', icon: Truck },
              { label: 'WhatsApp', icon: MessageCircle },
              { label: 'Mode hors ligne', icon: WifiOff },
              { label: 'Multi-etablissements', icon: Globe },
              { label: 'Hotellerie', icon: BedDouble },
              { label: 'Dossiers juridiques', icon: Scale },
            ].map((tag) => (
              <span
                key={tag.label}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-card border border-surface-border text-[11px] font-bold text-content-primary whitespace-nowrap hover:bg-surface-hover hover:border-brand-500/30 hover:text-brand-300 transition-all cursor-default"
              >
                <tag.icon className="w-3 h-3" />
                {tag.label}
              </span>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-start gap-3">
            {user ? (
              <Link
                href="/pos"
                className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-content-primary font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
              >
                Acceder a mon espace <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <>
                <Link
                  href="/subscribe"
                  className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-content-primary font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
                >
                  Demarrer gratuitement <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/login"
                  className="flex items-center gap-2 text-content-secondary hover:text-content-primary border border-surface-border hover:border-brand-500/30 bg-surface-card/40 px-6 py-3 rounded-xl transition-colors text-sm"
                >
                  Se connecter
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="mt-16 relative">
          <div className="absolute -inset-4 bg-brand-500/10 blur-3xl rounded-[40px]" />
          <img
            src="/screenshots/02-pos-main.png"
            alt="Interface ELM POS"
            className="relative rounded-2xl border border-surface-border shadow-2xl w-full max-w-5xl mx-auto bg-surface-card"
          />
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: ShoppingCart,
    title: 'Caisse tactile',
    desc: 'Interface ultra-rapide optimisee pour le scan et le tactile. Recus WhatsApp instantanes.',
  },
  {
    icon: Package,
    title: 'Gestion des stocks',
    desc: 'Suivi en temps reel, alertes de rupture, gestion des variantes et prix de gros.',
  },
  {
    icon: Receipt,
    title: 'Comptabilite OHADA',
    desc: 'Generation automatique des journaux, bilans et resultats aux normes africaines.',
  },
  {
    icon: Truck,
    title: 'Livraisons',
    desc: 'Suivi des livreurs sur le terrain et verification des colis par scan.',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp',
    desc: 'Envoi automatique des factures PDF et communication directe avec vos clients.',
  },
  {
    icon: WifiOff,
    title: 'Mode hors ligne',
    desc: 'Encaissez meme sans connexion internet. Synchronisation automatique au retour.',
  },
  {
    icon: Globe,
    title: 'Multi-etablissements',
    desc: 'Gerez plusieurs boutiques ou points de vente depuis un seul compte centralise.',
  },
  {
    icon: BedDouble,
    title: 'Hotellerie',
    desc: 'Gestion des chambres, des reservations et facturation unifiee.',
  },
  {
    icon: Scale,
    title: 'Dossiers juridiques',
    desc: "Suivi des procedures, gestion documentaire et facturation d'honoraires.",
  },
];

function Features() {
  return (
    <section id="features" className="py-24 px-5 bg-surface">
      <div className="max-w-6xl mx-auto">
        <div className="mb-14">
          <p className="text-xs font-semibold text-content-muted tracking-widest uppercase mb-3">Expertise</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-content-primary">Une solution complete</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="group bg-surface-card p-8 space-y-4 rounded-2xl border border-surface-border hover:bg-surface-hover transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-badge-info flex items-center justify-center mb-2">
                <Icon className="w-5 h-5 text-brand-300" />
              </div>
              <div>
                <h3 className="text-content-primary font-bold text-base mb-2">{title}</h3>
                <p className="text-sm text-content-muted leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-20 grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-content-primary">Suivi des stocks et inventaire</h3>
            <p className="text-sm text-content-secondary">Gerez vos variantes et vos prix de gros en quelques clics.</p>
            <img
              src="/screenshots/10-products-list.png"
              className="rounded-xl border border-surface-border shadow-xl bg-surface-card"
              loading="lazy"
              alt="Suivi des stocks"
            />
          </div>
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-content-primary">Analytique et rapports</h3>
            <p className="text-sm text-content-secondary">Visualisez votre chiffre d'affaires et vos marges en temps reel.</p>
            <img
              src="/screenshots/17-analytics.png"
              className="rounded-xl border border-surface-border shadow-xl bg-surface-card"
              loading="lazy"
              alt="Analytique et rapports"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

const SECTEURS: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  border: string;
  title: string;
  desc: string;
}[] = [
  {
    icon: Store,
    iconColor: 'text-status-warning',
    iconBg: 'bg-badge-warning',
    border: 'border-surface-border',
    title: 'Commerce & Distribution',
    desc: 'Stocks, revendeurs, fournisseurs, prix de gros.',
  },
  {
    icon: ShoppingCart,
    iconColor: 'text-brand-300',
    iconBg: 'bg-badge-info',
    border: 'border-surface-border',
    title: 'Boutique & Retail',
    desc: 'Caisse rapide, codes-barres, variantes, promotions.',
  },
  {
    icon: BedDouble,
    iconColor: 'text-status-info',
    iconBg: 'bg-badge-info',
    border: 'border-surface-border',
    title: 'Hotellerie',
    desc: 'Reservations, check-in/out, services additionnels.',
  },
  {
    icon: Scale,
    iconColor: 'text-content-secondary',
    iconBg: 'bg-surface-input',
    border: 'border-surface-border',
    title: 'Cabinet juridique',
    desc: 'Dossiers, honoraires, OHADA, juridictions senegalaises.',
  },
  {
    icon: Users,
    iconColor: 'text-status-success',
    iconBg: 'bg-badge-success',
    border: 'border-surface-border',
    title: 'Prestation de service',
    desc: 'Devis, factures, suivi clients, honoraires et encaissements.',
  },
];

function Secteurs() {
  return (
    <section id="secteurs" className="py-24 px-5 bg-surface">
      <div className="max-w-6xl mx-auto">
        <div className="mb-14">
          <p className="text-xs font-semibold text-content-muted tracking-widest uppercase mb-3">Secteurs</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-content-primary">Adapte a votre activite</h2>
          <p className="text-content-muted mt-2 text-sm max-w-md">
            ELM se configure selon votre secteur. Vous ne voyez que ce qui vous est utile.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SECTEURS.map(({ icon: Icon, iconColor, iconBg, border, title, desc }) => (
            <div
              key={title}
              className={`flex items-start gap-4 p-5 rounded-xl border bg-surface-card ${border} transition-colors`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
                <Icon className={`w-4 h-4 ${iconColor}`} />
              </div>
              <div>
                <p className="text-content-primary font-medium text-sm mb-1">{title}</p>
                <p className="text-xs text-content-secondary leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MultiEtablissements() {
  return (
    <section className="py-24 px-5 bg-surface">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
        <div>
          <p className="text-xs font-semibold text-content-muted tracking-widest uppercase mb-3">Multi-etablissements</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-content-primary leading-tight mb-5">
            Plusieurs boutiques,
            <br />
            un seul compte.
          </h2>
          <p className="text-content-secondary text-sm leading-relaxed mb-8">
            Gerez plusieurs etablissements depuis le meme compte. Chacun a ses propres donnees,
            son equipe et ses stocks. Vous passez de l&apos;un a l&apos;autre en un clic.
          </p>
          <ul className="space-y-3">
            {[
              'Donnees isolees par etablissement',
              'Equipe et roles separes',
              'Changement de contexte instantane',
              'Synchronisation en temps reel',
            ].map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm text-content-secondary">
                <Check className="w-3.5 h-3.5 text-brand-300 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          {[
            { name: 'Boutique Dakar Plateau', type: 'Commerce', active: true },
            { name: 'Restaurant Almadies', type: 'Restauration', active: false },
            { name: 'Cabinet Me. Diallo', type: 'Juridique', active: false },
          ].map(({ name, type, active }) => (
            <div
              key={name}
              className={`flex items-center gap-3.5 p-4 rounded-xl border transition-colors ${
                active
                  ? 'bg-surface-card border-brand-500/40 shadow-lg shadow-brand-500/10'
                  : 'bg-surface-card border-surface-border'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                  active ? 'bg-brand-600 text-content-primary' : 'bg-surface-input text-content-muted'
                }`}
              >
                {name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${active ? 'text-brand-300' : 'text-content-secondary'}`}>{name}</p>
                <p className={`text-xs ${active ? 'text-content-secondary' : 'text-content-muted'}`}>{type}</p>
              </div>
              {active && <div className="w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlanCard({ plan, isPrimary }: { plan: Plan; isPrimary: boolean }) {
  const isFree = plan.price === 0;
  const isAnnual = plan.duration_days >= 300;
  const monthlyEquiv = isAnnual ? Math.round(plan.price / 12) : null;

  return (
    <div
      className={`relative rounded-xl p-6 border flex flex-col gap-5 ${
        isPrimary ? 'bg-surface-card border-brand-500/40' : 'bg-surface-card border-surface-border'
      }`}
    >
      {isPrimary && (
        <span className="absolute top-4 right-4 text-[10px] font-semibold text-brand-300 bg-badge-info border border-brand-500/30 px-2 py-0.5 rounded-full tracking-wider uppercase">
          Recommande
        </span>
      )}

      {isAnnual && !isFree && (
        <span className="absolute top-4 left-4 text-[10px] font-semibold text-status-success bg-badge-success border border-status-success/40 px-2 py-0.5 rounded-full tracking-wider uppercase">
          1 mois offert
        </span>
      )}

      <div className={isAnnual && !isFree ? 'pt-5' : ''}>
        <p className="text-xs font-medium text-content-muted uppercase tracking-wider mb-3">
          {plan.label || plan.name}
        </p>
        {isFree ? (
          <>
            <p className="text-3xl font-bold text-content-primary">Gratuit</p>
            <p className="text-xs text-content-muted mt-1">{plan.duration_days} jours d&apos;essai</p>
          </>
        ) : isAnnual ? (
          <>
            <p className="text-3xl font-bold text-content-primary">{plan.price.toLocaleString('fr-FR')}</p>
            <p className="text-xs text-content-muted mt-1">
              {displayCurrency(plan.currency)} / an
              <span className="ml-2 text-content-muted">
                ({monthlyEquiv?.toLocaleString('fr-FR')} / mois)
              </span>
            </p>
          </>
        ) : (
          <>
            <p className="text-3xl font-bold text-content-primary">{plan.price.toLocaleString('fr-FR')}</p>
            <p className="text-xs text-content-muted mt-1">{displayCurrency(plan.currency)} / mois</p>
          </>
        )}
      </div>

      <ul className="space-y-2.5 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-xs text-content-secondary">
            <Check className="w-3.5 h-3.5 text-brand-300 shrink-0 mt-0.5" />
            {f}
          </li>
        ))}
      </ul>

      <Link
        href="/subscribe"
        className={`block w-full text-center py-2.5 rounded-lg text-sm font-semibold transition-colors ${
          isPrimary
            ? 'bg-brand-600 hover:bg-brand-500 text-content-primary'
            : 'border border-surface-border hover:border-brand-500/30 text-content-primary hover:bg-surface-hover'
        }`}
      >
        {isFree ? 'Commencer' : `Choisir ${plan.label || plan.name}`}
      </Link>
    </div>
  );
}

function Tarifs() {
  const [allPlans, setAllPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly');

  useEffect(() => {
    getPlans()
      .then(setAllPlans)
      .catch(() => setAllPlans([]))
      .finally(() => setLoading(false));
  }, []);

  const trialPlans = allPlans.filter((p) => p.price === 0);
  const paidMonthly = allPlans.filter((p) => p.price > 0 && p.duration_days < 300);
  const paidAnnual = allPlans.filter((p) => p.price > 0 && p.duration_days >= 300);

  const hasAnnual = paidAnnual.length > 0;
  const hasMonthly = paidMonthly.length > 0;

  const shownPaid = period === 'annual' && hasAnnual ? paidAnnual : paidMonthly;
  const plans = [...trialPlans, ...shownPaid];
  const maxPrice = plans.length ? Math.max(...plans.map((p) => p.price)) : 0;

  return (
    <section id="tarifs" className="py-24 px-5 bg-surface">
      <div className="max-w-6xl mx-auto">
        <div className="mb-12 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold text-content-muted tracking-widest uppercase mb-3">Tarifs</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-content-primary">Simple et transparent</h2>
            <p className="text-content-muted mt-2 text-sm">Pas de frais caches. Pas de surprise.</p>
          </div>

          {hasAnnual && hasMonthly && (
            <div className="flex items-center bg-surface-card border border-surface-border rounded-lg p-1 self-start sm:self-auto shrink-0">
              {(['monthly', 'annual'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    period === p ? 'bg-brand-600 text-content-primary' : 'text-content-secondary hover:text-content-primary'
                  }`}
                >
                  {p === 'monthly' ? (
                    'Mensuel'
                  ) : (
                    <span className="flex items-center gap-1.5">
                      Annuel
                      <span className="text-[10px] font-bold text-status-success">-10%</span>
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 text-brand-300 animate-spin" />
          </div>
        ) : (
          <div
            className={`grid grid-cols-1 gap-4 ${
              plans.length === 1
                ? 'max-w-sm'
                : plans.length === 2
                  ? 'sm:grid-cols-2 max-w-2xl'
                  : plans.length === 4
                    ? 'sm:grid-cols-2 lg:grid-cols-4'
                    : 'sm:grid-cols-3'
            }`}
          >
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

function CtaFinal() {
  const { user } = useAuthStore();
  return (
    <section className="py-24 px-5 bg-surface border-t border-surface-border">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-content-primary mb-2">Pret a demarrer ?</h2>
          <p className="text-content-muted text-sm">7 jours gratuits. Aucune carte bancaire requise.</p>
        </div>
        {user ? (
          <Link
            href="/pos"
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-content-primary font-semibold px-6 py-3 rounded-xl text-sm transition-colors shrink-0"
          >
            Acceder a mon espace <ArrowRight className="w-4 h-4" />
          </Link>
        ) : (
          <Link
            href="/subscribe"
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-content-primary font-semibold px-6 py-3 rounded-xl text-sm transition-colors shrink-0"
          >
            Commencer gratuitement <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-surface-border bg-surface py-10 px-5">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <div className="w-24 h-8 bg-white rounded-lg flex items-center justify-center p-1.5 overflow-hidden shadow-sm border border-surface-border">
            <img src="/logo.png" alt="ELM" className="max-w-full max-h-full object-contain" />
          </div>
        </div>
        <div className="flex items-center gap-6 text-xs text-content-muted">
          <Link href="/privacy" className="hover:text-content-secondary transition-colors">Confidentialite</Link>
          <a href="https://wa.me/33746436801" className="hover:text-content-secondary transition-colors">WhatsApp</a>
          <a href="mailto:contact@elm-app.click" className="hover:text-content-secondary transition-colors">Contact</a>
          <span className="flex items-center gap-1.5">
            <Globe className="w-3 h-3" /> Senegal - Afrique
          </span>
        </div>
        <p className="text-xs text-content-muted">(c) {new Date().getFullYear()} ELM APP</p>
      </div>
    </footer>
  );
}

function FloatingActions() {
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 320);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col gap-3">
      <a
        href="https://wa.me/33746436801"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Contacter sur WhatsApp"
        className="w-12 h-12 rounded-full bg-brand-600 hover:bg-brand-500 text-content-primary shadow-xl border border-brand-500/30 flex items-center justify-center transition-colors"
      >
        <MessageCircle className="w-5 h-5" />
      </a>

      {showBackToTop && (
        <button
          type="button"
          aria-label="Retour en haut"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="w-12 h-12 rounded-full bg-surface-card hover:bg-surface-hover text-content-primary shadow-xl border border-surface-border flex items-center justify-center transition-colors"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

function ModuleFeature({
  title,
  subtitle,
  desc,
  img,
  reverse = false,
}: {
  title: string;
  subtitle: string;
  desc: string;
  img: string;
  reverse?: boolean;
}) {
  return (
    <div className={`flex flex-col ${reverse ? 'lg:flex-row-reverse' : 'lg:flex-row'} items-center gap-12 lg:gap-20`}>
      <div className="flex-1 space-y-6">
        <div className="inline-block px-3 py-1 rounded-full bg-surface-card border border-brand-500/30 text-status-info text-[10px] font-bold tracking-widest uppercase">
          {subtitle}
        </div>
        <h3 className="text-3xl font-bold text-content-primary tracking-tight">{title}</h3>
        <p className="text-content-secondary leading-relaxed text-lg">{desc}</p>
      </div>
      <div className="flex-1 w-full relative group">
        <div className="absolute -inset-4 bg-brand-500/5 blur-2xl rounded-[30px] transition-opacity group-hover:opacity-100 opacity-50" />
        <img
          src={img}
          alt={title}
          className="relative rounded-2xl border border-surface-border shadow-2xl transition-transform duration-500 group-hover:scale-[1.02] bg-surface-card"
          loading="lazy"
        />
      </div>
    </div>
  );
}

function ModulesShowcase() {
  return (
    <section id="solutions" className="py-32 px-5 bg-surface">
      <div className="max-w-6xl mx-auto space-y-40">
        <ModuleFeature
          subtitle="Communication client"
          title="Factures PDF sur WhatsApp"
          desc="Modernisez votre relation client. Plus besoin d'imprimer systematiquement: envoyez les recus professionnels directement sur le telephone de vos clients en un clic."
          img="/screenshots/22-whatsapp-integration.png"
        />

        <ModuleFeature
          subtitle="Pilotage strategique"
          title="Tableaux de bord en temps reel"
          desc="Prenez des decisions basees sur des chiffres reels. Suivez votre chiffre d'affaires, vos marges nettes et vos produits les plus vendus grace a des graphiques dynamiques et precis."
          img="/screenshots/17-analytics.png"
          reverse
        />

        <ModuleFeature
          subtitle="Logistique & Terrain"
          title="Suivez vos livraisons en temps reel"
          desc="Preparez les colis avec verification par scan pour eviter les erreurs. Assignez des livreurs et suivez l'etat de chaque commande jusqu'a la remise au client."
          img="/screenshots/07-livraison.png"
        />

        <ModuleFeature
          subtitle="Reseau de vente"
          title="Module Grossiste & Revendeurs"
          desc="Gerez vos ventes en volume en toute simplicite. Configurez des grilles de prix specifiques pour vos revendeurs et suivez leurs performances et commissions."
          img="/screenshots/13-revendeurs.png"
          reverse
        />

        <ModuleFeature
          subtitle="Transparence & Securite"
          title="Un journal d'audit pour tout controler"
          desc="Gardez l'esprit tranquille. Chaque annulation de vente, chaque modification de prix ou ouverture de tiroir est consignee. La fin des pertes inexpliquees en caisse."
          img="/screenshots/24-activity-logs.png"
        />

        <ModuleFeature
          subtitle="Confiance client"
          title="Ecran client interactif"
          desc="Ameliorez l'experience en caisse. Affichez le panier et le total sur un second ecran pour vos clients, reduisant les erreurs et renforcant la confiance lors du paiement."
          img="/screenshots/27-customer-display.png"
          reverse
        />

        <ModuleFeature
          subtitle="Rigueur financiere"
          title="Comptabilite OHADA automatisee"
          desc="Generez vos journaux comptables, bilans et comptes de resultat sans effort. Toutes vos transactions sont deja pre-classees selon les normes OHADA en vigueur."
          img="/screenshots/19-comptabilite.png"
        />

        <ModuleFeature
          subtitle="Services juridiques"
          title="Suivi de dossiers et honoraires"
          desc="Specialement concu pour les cabinets d'avocats et notaires au Senegal. Gerez l'ouverture des dossiers, le suivi des procedures OHADA et la facturation precise des honoraires."
          img="/screenshots/15-dossiers-clients.png"
          reverse
        />

        <ModuleFeature
          subtitle="Specialisation metier"
          title="Gestion hoteliere integree"
          desc="Activez le module PMS pour gerer vos chambres, vos reservations et vos consommations bar/restaurant sur une seule facture client. Une solution vraiment tout-en-un."
          img="/screenshots/14-hotel-management.png"
        />
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <div className="theme-dark min-h-screen bg-surface">
      <Nav />
      <Hero />
      <Features />
      <ModulesShowcase />
      <Secteurs />
      <MultiEtablissements />
      <Tarifs />
      <CtaFinal />
      <Footer />
      <FloatingActions />
    </div>
  );
}
