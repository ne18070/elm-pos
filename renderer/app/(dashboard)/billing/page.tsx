'use client';
import { toUserError } from '@/lib/user-error';
import { displayCurrency } from '@/lib/utils';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle, Clock, Loader2, RefreshCw, Send, Calendar,
  AlertTriangle, ChevronDown, Package, RotateCcw, FileText,
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useSubscriptionStore } from '@/store/subscription';
import { useAuthStore } from '@/store/auth';
import {
  getPlans, getSubscription, getMySubscriptionRequests,
  submitSubscriptionRequest, getEffectiveStatus,
  type Plan, type SubscriptionRequest,
} from '@services/supabase/subscriptions';
import { getDefaultRoute } from '@/lib/getDefaultRoute';

// ── Status badge config ───────────────────────────────────────────────────────

const REQ_STATUS: Record<string, { label: string; bg: string; text: string; border: string }> = {
  pending:  { label: 'En attente',  bg: 'bg-amber-900/20', text: 'text-amber-400',  border: 'border-amber-800/50'  },
  approved: { label: 'Approuvée',   bg: 'bg-green-900/20', text: 'text-green-400',  border: 'border-green-800/50'  },
  rejected: { label: 'Rejetée',     bg: 'bg-red-900/20',   text: 'text-red-400',    border: 'border-red-800/50'    },
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { effectiveStatus, trialDaysRemaining, subscription, setSubscription } = useSubscriptionStore();
  const { business, user } = useAuthStore();
  const router = useRouter();

  const [loading, setLoading]           = useState(true);
  const [checking, setChecking]         = useState(false);
  const [allPlans, setAllPlans]         = useState<Plan[]>([]);
  const [period, setPeriod]             = useState<'monthly' | 'annual'>('monthly');
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [step, setStep]                 = useState<'form' | 'sent'>('form');
  const [submitting, setSubmitting]     = useState(false);
  const [submitError, setSubmitError]   = useState('');
  const [myRequests, setMyRequests]     = useState<SubscriptionRequest[]>([]);
  const [showRenew, setShowRenew]       = useState(false);

  const status     = effectiveStatus();
  const days       = trialDaysRemaining();
  const activePlan = allPlans.find((p) => p.id === subscription?.plan_id) ?? null;

  const expiresAt    = subscription?.expires_at ? new Date(subscription.expires_at) : null;
  const daysLeft     = expiresAt ? differenceInDays(expiresAt, new Date()) : null;
  const expiringSoon = daysLeft !== null && daysLeft < 30 && status === 'active';

  async function handleCheck() {
    if (!user) return;
    setChecking(true);
    try {
      const sub = await getSubscription(user.id, business?.id);
      setSubscription(sub);
      if (getEffectiveStatus(sub) === 'active') {
        router.replace(getDefaultRoute(business?.features ?? []));
      }
    } finally {
      setChecking(false);
    }
  }

  async function handleSubmit() {
    if (!business || !selectedPlan) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await submitSubscriptionRequest(business.id, selectedPlan.id, '');
      setStep('sent');
      const reqs = await getMySubscriptionRequests(business.id);
      setMyRequests(reqs);
    } catch (e) {
      setSubmitError(toUserError(e));
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!business) return;
    Promise.all([
      getPlans(),
      getMySubscriptionRequests(business.id),
    ])
      .then(([p, reqs]) => {
        setAllPlans(p);
        const firstPaid = p.find((pl) => pl.price > 0 && pl.duration_days < 300);
        if (firstPaid) setSelectedPlan(firstPaid);
        setMyRequests(reqs);
        if (reqs.some((r) => r.status === 'pending')) setStep('sent');
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  const paidMonthly    = allPlans.filter((p) => p.price > 0 && p.duration_days < 300);
  const paidAnnual     = allPlans.filter((p) => p.price > 0 && p.duration_days >= 300);
  const hasAnnual      = paidAnnual.length > 0;
  const hasMonthly     = paidMonthly.length > 0;
  const shownPlans     = period === 'annual' && hasAnnual ? paidAnnual : paidMonthly;
  const showPlanSelect = step === 'form' && (status !== 'active' || showRenew);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* ── En-tête ── */}
        <div>
          <h1 className="text-xl font-bold text-white">Abonnement & Facturation</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Gérez votre plan et consultez l'historique de vos demandes.
          </p>
        </div>

        {/* ── Statut actuel ── */}
        <div className={`rounded-2xl border p-5 space-y-3
          ${status === 'active' ? 'border-green-700/50 bg-green-900/10'
          : status === 'trial'  ? 'border-amber-700/50 bg-amber-900/10'
                                : 'border-red-700/50 bg-red-900/10'}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {status === 'active'
                ? <CheckCircle className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                : <Clock className={`w-5 h-5 shrink-0 mt-0.5 ${status === 'trial' ? 'text-amber-400' : 'text-red-400'}`} />
              }
              <div>
                <p className="font-semibold text-white">
                  {status === 'active' ? 'Abonnement actif'
                    : status === 'trial' ? "Période d'essai"
                    : 'Accès expiré'}
                </p>
                <p className="text-sm text-slate-400 mt-0.5">
                  {status === 'active' && expiresAt &&
                    `Valide jusqu'au ${format(expiresAt, 'dd MMMM yyyy', { locale: fr })}`}
                  {status === 'trial' &&
                    (days === 0 ? "Expire aujourd'hui"
                      : `${days} jour${days > 1 ? 's' : ''} restant${days > 1 ? 's' : ''}`)}
                  {(status === 'expired' || status === 'none') &&
                    'Souscrivez un abonnement pour continuer à utiliser elm-pos.'}
                </p>
                {subscription?.payment_note && (
                  <p className="text-xs text-slate-500 mt-1 italic">{subscription.payment_note}</p>
                )}
              </div>
            </div>

            <button
              onClick={handleCheck} disabled={checking}
              className="shrink-0 flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-surface-hover"
            >
              {checking
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5" />}
              Vérifier
            </button>
          </div>

          {expiringSoon && daysLeft !== null && (
            <div className="flex items-center gap-2 text-amber-400 text-sm bg-amber-900/20 border border-amber-800/50 rounded-xl px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Votre abonnement expire dans{' '}
                <strong>{daysLeft} jour{daysLeft > 1 ? 's' : ''}</strong>. Pensez à le renouveler.
              </span>
            </div>
          )}
        </div>

        {/* ── Plan actuel (si actif) ── */}
        {status === 'active' && activePlan && (
          <div className="card p-5 space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-brand-600/20 rounded-xl">
                  <Package className="w-5 h-5 text-brand-400" />
                </div>
                <div>
                  <p className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Plan actuel</p>
                  <p className="text-lg font-bold text-white leading-none mt-0.5">{activePlan.label}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-brand-400">
                  {activePlan.price.toLocaleString('fr-FR')}
                  <span className="text-sm font-normal text-slate-400">
                    {' '}{displayCurrency(activePlan.currency)}/{activePlan.duration_days >= 300 ? 'an' : 'mois'}
                  </span>
                </p>
                {subscription?.activated_at && (
                  <p className="text-xs text-slate-600 mt-0.5">
                    Activé le {format(new Date(subscription.activated_at), 'dd MMM yyyy', { locale: fr })}
                  </p>
                )}
              </div>
            </div>

            {expiresAt && (
              <div className={`flex items-center gap-2 text-sm px-3 py-2.5 rounded-xl border ${
                expiringSoon
                  ? 'bg-amber-900/20 border-amber-800/50 text-amber-400'
                  : 'bg-surface-input border-surface-border text-slate-400'
              }`}>
                <Calendar className="w-4 h-4 shrink-0" />
                <span>
                  Expire le{' '}
                  <strong className={expiringSoon ? 'text-amber-300' : 'text-slate-200'}>
                    {format(expiresAt, 'dd MMMM yyyy', { locale: fr })}
                  </strong>
                  {daysLeft !== null && daysLeft >= 0 && (
                    <span className="text-slate-500 ml-1">
                      — {daysLeft} jour{daysLeft > 1 ? 's' : ''} restant{daysLeft > 1 ? 's' : ''}
                    </span>
                  )}
                </span>
              </div>
            )}

            {activePlan.features.length > 0 && (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1 border-t border-surface-border">
                {activePlan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-slate-300">
                    <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            )}

            <button
              onClick={() => setShowRenew((v) => !v)}
              className="btn-secondary w-full flex items-center justify-center gap-2 text-sm h-10"
            >
              <RotateCcw className="w-4 h-4" />
              Renouveler / Changer de plan
              <ChevronDown className={`w-4 h-4 transition-transform ${showRenew ? 'rotate-180' : ''}`} />
            </button>
          </div>
        )}

        {/* ── Choix du plan ── */}
        {showPlanSelect && (
          <>
            <div>
              <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                <h2 className="text-base font-bold text-white">
                  {status === 'active' ? 'Renouveler / changer de plan' : 'Choisissez votre plan'}
                </h2>
                {hasAnnual && hasMonthly && (
                  <div className="flex items-center bg-surface-input border border-surface-border rounded-lg p-1 shrink-0">
                    {(['monthly', 'annual'] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => { setPeriod(p); setSelectedPlan(null); }}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors
                          ${period === p ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'}`}
                      >
                        {p === 'monthly' ? 'Mensuel' : (
                          <span className="flex items-center gap-1">Annuel <span className="text-green-400">−10%</span></span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className={`grid grid-cols-1 gap-4 ${
                shownPlans.length === 1 ? 'max-w-sm' :
                shownPlans.length >= 4  ? 'sm:grid-cols-2 xl:grid-cols-4' :
                'sm:grid-cols-2'
              }`}>
                {shownPlans.map((plan) => {
                  const isAnnual     = plan.duration_days >= 300;
                  const monthlyEquiv = isAnnual ? Math.round(plan.price / 12) : null;
                  return (
                    <button
                      key={plan.id}
                      onClick={() => setSelectedPlan(plan)}
                      className={`text-left p-5 rounded-2xl border transition-all relative
                        ${selectedPlan?.id === plan.id
                          ? 'border-brand-500 bg-brand-900/20'
                          : 'border-surface-border hover:border-slate-500'}`}
                    >
                      {isAnnual && (
                        <span className="absolute top-3 right-3 text-[10px] font-bold text-green-300 bg-green-900/40 border border-green-800/40 px-1.5 py-0.5 rounded-full">
                          1 mois offert
                        </span>
                      )}
                      <p className="font-bold text-white text-base">{plan.label}</p>
                      <p className="text-2xl font-bold text-brand-400 mt-1">
                        {plan.price.toLocaleString('fr-FR')}{' '}
                        <span className="text-sm font-normal text-slate-400">
                          {displayCurrency(plan.currency)}/{isAnnual ? 'an' : 'mois'}
                        </span>
                      </p>
                      {monthlyEquiv && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          soit {monthlyEquiv.toLocaleString('fr-FR')} {displayCurrency(plan.currency)}/mois
                        </p>
                      )}
                      <ul className="mt-3 space-y-1">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-center gap-2 text-xs text-slate-300">
                            <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="card p-5 space-y-5">
              <div className="flex items-start gap-4 p-4 rounded-xl bg-brand-900/10 border border-brand-800/50">
                <div className="w-10 h-10 rounded-full bg-brand-600 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Activation par notre équipe</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Une fois votre demande envoyée, notre équipe vous contactera sous 24h pour finaliser le règlement et activer votre accès.
                  </p>
                </div>
              </div>

              {selectedPlan && (
                <div className="flex items-center justify-between text-sm px-4 py-3 bg-surface-input rounded-xl border border-surface-border">
                  <span className="text-slate-400">Plan sélectionné</span>
                  <span className="font-bold text-white">
                    {selectedPlan.label}
                    {' — '}
                    {selectedPlan.price.toLocaleString('fr-FR')} {displayCurrency(selectedPlan.currency)}
                  </span>
                </div>
              )}

              {submitError && <p className="text-sm text-red-400">{submitError}</p>}

              <button
                onClick={handleSubmit}
                disabled={!selectedPlan || submitting}
                className="btn-primary w-full flex items-center justify-center gap-2 h-11"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {submitting ? 'Envoi en cours…' : "Envoyer ma demande d'activation"}
              </button>
            </div>
          </>
        )}

        {/* ── Confirmation envoi ── */}
        {step === 'sent' && (
          <div className="card p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-green-900/20 border border-green-700 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <div>
              <p className="text-lg font-bold text-white">Demande envoyée !</p>
              <p className="text-sm text-slate-400 mt-1">
                Notre équipe vous contactera très prochainement pour finaliser votre abonnement.
              </p>
            </div>
            <button onClick={() => setStep('form')} className="btn-secondary text-sm">
              Modifier ma demande
            </button>
          </div>
        )}

        {/* ── Historique des demandes ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
              Historique des demandes
            </h2>
            {myRequests.length > 0 && (
              <span className="text-xs text-slate-600">
                {myRequests.length} demande{myRequests.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {myRequests.length === 0 ? (
            <div className="card p-10 flex flex-col items-center gap-3 text-center">
              <FileText className="w-8 h-8 text-slate-600" />
              <p className="text-slate-500 text-sm">Aucune demande enregistrée</p>
            </div>
          ) : (
            myRequests.map((req) => {
              const s = REQ_STATUS[req.status] ?? REQ_STATUS.pending;
              return (
                <div key={req.id} className="card p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {/* Plan name + price */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-white">{req.plan_label ?? '—'}</p>
                        {req.plan_price != null && req.plan_currency && (
                          <span className="text-xs font-medium text-brand-400 bg-brand-600/10 border border-brand-600/20 px-2 py-0.5 rounded-full">
                            {req.plan_price.toLocaleString('fr-FR')} {displayCurrency(req.plan_currency)}
                          </span>
                        )}
                      </div>

                      {/* Dates */}
                      <div className="flex flex-wrap gap-x-4 gap-y-0 text-xs text-slate-500">
                        <span>
                          Demandé le{' '}
                          {format(new Date(req.created_at), 'dd MMM yyyy, HH:mm', { locale: fr })}
                        </span>
                        {req.processed_at && (
                          <span>
                            Traité le{' '}
                            {format(new Date(req.processed_at), 'dd MMM yyyy', { locale: fr })}
                          </span>
                        )}
                      </div>

                      {/* Rejection note */}
                      {req.note && req.status === 'rejected' && (
                        <p className="text-xs text-red-400 italic">Motif : {req.note}</p>
                      )}
                    </div>

                    <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${s.bg} ${s.text} ${s.border}`}>
                      {s.label}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
