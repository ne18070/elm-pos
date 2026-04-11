'use client';
import { toUserError } from '@/lib/user-error';
import { displayCurrency } from '@/lib/utils';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  QrCode, CheckCircle, Clock, Loader2, RefreshCw,
  Send, X, FileImage,
} from 'lucide-react';
import { useSubscriptionStore } from '@/store/subscription';
import { useAuthStore } from '@/store/auth';
import {
  getPlans, getPaymentSettings, getSubscription, getMySubscriptionRequests,
  uploadReceipt, submitSubscriptionRequest,
  type Plan, type PaymentSettings, type SubscriptionRequest,
} from '@services/supabase/subscriptions';
import { getDefaultRoute } from '@/lib/getDefaultRoute';

type Step = 'form' | 'sent';

const STATUS_REQUEST: Record<string, { label: string; color: string }> = {
  pending:  { label: 'En attente de validation', color: 'text-amber-400' },
  approved: { label: 'Approuvée',                color: 'text-green-400' },
  rejected: { label: 'Rejetée',                  color: 'text-red-400'   },
};

export default function BillingPage() {
  const { effectiveStatus, trialDaysRemaining, subscription, setSubscription } = useSubscriptionStore();
  const { business, user } = useAuthStore();
  const router = useRouter();

  const [loading, setLoading]       = useState(true);
  const [checking, setChecking]     = useState(false);
  const [allPlans, setAllPlans]     = useState<Plan[]>([]);
  const [period, setPeriod]         = useState<'monthly' | 'annual'>('monthly');
  const [settings, setSettings]     = useState<PaymentSettings | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [showQr, setShowQr]         = useState<'wave' | 'om' | null>(null);

  const [step, setStep]             = useState<Step>('form');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [myRequests, setMyRequests] = useState<SubscriptionRequest[]>([]);

  const status = effectiveStatus();
  const days   = trialDaysRemaining();

  async function handleCheck() {
    if (!user) return;
    setChecking(true);
    try {
      const sub = await getSubscription(user.id, business?.id);
      setSubscription(sub);
      if (sub?.status === 'active' && sub.expires_at && new Date(sub.expires_at) > new Date()) {
        router.replace(getDefaultRoute(business?.features ?? []));
      }
    } finally {
      setChecking(false);
    }
  }

  function handleReceiptChange(file: File) {
    setReceiptFile(file);
    const url = URL.createObjectURL(file);
    setReceiptPreview(url);
  }

  async function handleSubmit() {
    if (!business || !selectedPlan || !receiptFile) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const url = await uploadReceipt(business.id, receiptFile);
      await submitSubscriptionRequest(business.id, selectedPlan.id, url);
      setStep('sent');
      // Rafraîchir la liste des demandes
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
      getPaymentSettings(),
      getMySubscriptionRequests(business.id),
    ])
      .then(([p, s, reqs]) => {
        setAllPlans(p);
        setSettings(s);
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

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-8">

        {/* ── Statut actuel ── */}
        <div className={`rounded-2xl border p-5 flex items-start gap-4
          ${status === 'active'
            ? 'border-green-700 bg-green-900/10'
            : status === 'trial'
              ? 'border-amber-700 bg-amber-900/10'
              : 'border-red-700 bg-red-900/10'}`}
        >
          {status === 'active'
            ? <CheckCircle className="w-6 h-6 text-green-400 shrink-0 mt-0.5" />
            : <Clock className={`w-6 h-6 shrink-0 mt-0.5 ${status === 'trial' ? 'text-amber-400' : 'text-red-400'}`} />
          }
          <div className="flex-1">
            {status === 'active' && (
              <>
                <p className="font-semibold text-white">Abonnement actif</p>
                {subscription?.expires_at && (
                  <p className="text-sm text-slate-400 mt-0.5">
                    Valide jusqu'au {new Date(subscription.expires_at).toLocaleDateString('fr-FR')}
                  </p>
                )}
              </>
            )}
            {status === 'trial' && (
              <>
                <p className="font-semibold text-white">Période d'essai</p>
                <p className="text-sm text-slate-400 mt-0.5">
                  {days === 0 ? "Expire aujourd'hui" : `${days} jour${days > 1 ? 's' : ''} restant${days > 1 ? 's' : ''}`}
                </p>
              </>
            )}
            {(status === 'expired' || status === 'none') && (
              <>
                <p className="font-semibold text-red-400">Accès expiré</p>
                <p className="text-sm text-slate-400 mt-0.5">
                  Souscrivez un abonnement pour continuer à utiliser Elm POS.
                </p>
              </>
            )}
          </div>
          <button
            onClick={handleCheck}
            disabled={checking}
            className="shrink-0 flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
          >
            {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Vérifier
          </button>
        </div>

        {/* ── Mes demandes récentes ── */}
        {myRequests.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Mes demandes</h2>
            {myRequests.map((req) => {
              const s = STATUS_REQUEST[req.status] ?? STATUS_REQUEST.pending;
              return (
                <div key={req.id} className="card p-4 flex items-center gap-4">
                  <img
                    src={req.receipt_url}
                    alt="reçu"
                    className="w-12 h-12 object-cover rounded-lg border border-surface-border shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{req.plan_label}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(req.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <span className={`text-xs font-medium ${s.color}`}>{s.label}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Choix du plan ── */}
        {step === 'form' && (() => {
          const paidMonthly = allPlans.filter((p) => p.price > 0 && p.duration_days < 300);
          const paidAnnual  = allPlans.filter((p) => p.price > 0 && p.duration_days >= 300);
          const hasAnnual   = paidAnnual.length > 0;
          const hasMonthly  = paidMonthly.length > 0;
          const shownPlans  = period === 'annual' && hasAnnual ? paidAnnual : paidMonthly;

          return (
          <>
            <div>
              <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                <h2 className="text-lg font-bold text-white">Choisissez votre plan</h2>
                {hasAnnual && hasMonthly && (
                  <div className="flex items-center bg-surface-input border border-surface-border rounded-lg p-1 shrink-0">
                    {(['monthly', 'annual'] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => { setPeriod(p); setSelectedPlan(null); }}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors
                          ${period === p ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                        {p === 'monthly' ? 'Mensuel' : (
                          <span className="flex items-center gap-1">Annuel <span className="text-green-400">−10%</span></span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className={`grid grid-cols-1 gap-4
                ${shownPlans.length === 1 ? 'max-w-sm' :
                  shownPlans.length === 4 ? 'sm:grid-cols-2 xl:grid-cols-4' :
                  'sm:grid-cols-2'}`}>
                {shownPlans.map((plan) => {
                  const isAnnual = plan.duration_days >= 300;
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

            {/* ── Paiement + envoi reçu ── */}
            <div>
              <h2 className="text-lg font-bold text-white mb-4">Procéder au paiement</h2>
              <div className="card p-5 space-y-5">

                <ol className="space-y-3">
                  {[
                    { n: 1, text: 'Scannez le QR code Wave ou Orange Money ci-dessous' },
                    { n: 2, text: `Effectuez le paiement de ${selectedPlan?.price.toLocaleString('fr-FR') ?? '—'} ${displayCurrency(selectedPlan?.currency ?? '')}` },
                    { n: 3, text: 'Prenez une photo ou capture de votre reçu de paiement' },
                    { n: 4, text: 'Joignez le reçu et envoyez votre demande via le formulaire ci-dessous' },
                  ].map(({ n, text }) => (
                    <li key={n} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {n}
                      </span>
                      <span className="text-sm text-slate-300">{text}</span>
                    </li>
                  ))}
                </ol>

                {/* QR Codes */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'wave' as const, label: 'Wave',         url: settings?.wave_qr_url, color: 'border-blue-700 bg-blue-900/10' },
                    { key: 'om'   as const, label: 'Orange Money', url: settings?.om_qr_url,   color: 'border-orange-700 bg-orange-900/10' },
                  ].map(({ key, label, url, color }) => (
                    <button
                      key={key}
                      onClick={() => url && setShowQr(key)}
                      disabled={!url}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all
                        ${url ? `${color} hover:opacity-90 cursor-pointer` : 'border-surface-border opacity-30'}`}
                    >
                      <QrCode className="w-8 h-8 text-white" />
                      <span className="text-sm font-medium text-white">{label}</span>
                      {!url && <span className="text-xs text-slate-500">Bientôt disponible</span>}
                    </button>
                  ))}
                </div>

                {/* Upload reçu */}
                <div className="space-y-3 pt-2 border-t border-surface-border">
                  <p className="text-sm font-semibold text-white">Joindre votre reçu de paiement</p>

                  {receiptPreview ? (
                    <div className="relative w-fit">
                      <img
                        src={receiptPreview}
                        alt="reçu"
                        className="h-36 w-auto rounded-xl border border-surface-border object-cover"
                      />
                      <button
                        onClick={() => { setReceiptFile(null); setReceiptPreview(null); }}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 rounded-full flex items-center justify-center"
                      >
                        <X className="w-3.5 h-3.5 text-white" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-2 w-full h-32
                                      border-2 border-dashed border-surface-border rounded-xl
                                      cursor-pointer hover:border-brand-500 transition-colors">
                      <FileImage className="w-8 h-8 text-slate-500" />
                      <span className="text-sm text-slate-400">Cliquez pour choisir une image</span>
                      <span className="text-xs text-slate-600">PNG, JPG, PDF</span>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && handleReceiptChange(e.target.files[0])}
                      />
                    </label>
                  )}

                  {submitError && (
                    <p className="text-sm text-red-400">{submitError}</p>
                  )}

                  <button
                    onClick={handleSubmit}
                    disabled={!receiptFile || !selectedPlan || submitting}
                    className="btn-primary w-full flex items-center justify-center gap-2 h-11"
                  >
                    {submitting
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Send className="w-4 h-4" />}
                    {submitting ? 'Envoi en cours…' : 'Envoyer ma demande'}
                  </button>

                  <p className="text-xs text-slate-500 text-center">
                    Votre demande sera traitée sous 24h.
                  </p>
                </div>
              </div>
            </div>
          </>
          );
        })()}

        {/* ── Confirmation envoi ── */}
        {step === 'sent' && (
          <div className="card p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-green-900/20 border border-green-700 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <div>
              <p className="text-lg font-bold text-white">Demande envoyée !</p>
              <p className="text-sm text-slate-400 mt-1">
                Nous avons reçu votre reçu de paiement. Votre abonnement sera activé sous 24h.
              </p>
            </div>
            <button
              onClick={() => setStep('form')}
              className="btn-secondary text-sm"
            >
              Soumettre une nouvelle demande
            </button>
          </div>
        )}
      </div>

      {/* Modal QR code agrandi */}
      {showQr && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowQr(null)}
        >
          <div className="bg-white rounded-2xl p-4 max-w-xs w-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={showQr === 'wave' ? settings?.wave_qr_url! : settings?.om_qr_url!}
              alt={showQr === 'wave' ? 'QR Wave' : 'QR Orange Money'}
              className="w-full h-auto rounded-xl"
            />
            <p className="text-center text-sm text-slate-700 font-medium mt-3">
              {showQr === 'wave' ? 'Wave' : 'Orange Money'} — {selectedPlan?.price.toLocaleString('fr-FR')} {displayCurrency(selectedPlan?.currency ?? '')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
