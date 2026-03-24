'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, QrCode, CheckCircle, Clock, Loader2, RefreshCw } from 'lucide-react';
import { useSubscriptionStore } from '@/store/subscription';
import { useAuthStore } from '@/store/auth';
import {
  getPlans, getPaymentSettings, getSubscription,
  type Plan, type PaymentSettings,
} from '@services/supabase/subscriptions';

export default function BillingPage() {
  const { effectiveStatus, trialDaysRemaining, subscription, setSubscription } = useSubscriptionStore();
  const { business } = useAuthStore();
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [plans, setPlans]   = useState<Plan[]>([]);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [loading, setLoading]   = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [showQr, setShowQr] = useState<'wave' | 'om' | null>(null);

  const status = effectiveStatus();
  const days   = trialDaysRemaining();

  async function handleCheck() {
    if (!business) return;
    setChecking(true);
    try {
      const sub = await getSubscription(business.id);
      setSubscription(sub);
      if (sub?.status === 'active' && sub.expires_at && new Date(sub.expires_at) > new Date()) {
        router.replace('/pos');
      }
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    Promise.all([getPlans(), getPaymentSettings()])
      .then(([p, s]) => { setPlans(p); setSettings(s); if (p.length) setSelectedPlan(p[0]); })
      .finally(() => setLoading(false));
  }, []);

  const waMsg = encodeURIComponent(
    `Bonjour, je souhaite m'abonner à Elm POS.\n\nÉtablissement : ${business?.name ?? ''}\nPlan : ${selectedPlan?.label ?? ''}\n\nCi-joint mon reçu de paiement.`
  );
  const waLink = `https://wa.me/${(settings?.whatsapp_number ?? '').replace(/\s+/g, '')}?text=${waMsg}`;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Statut actuel */}
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
          <div>
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
                  {days === 0 ? 'Expire aujourd\'hui' : `${days} jour${days > 1 ? 's' : ''} restant${days > 1 ? 's' : ''}`}
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

          {/* Bouton vérifier — utile après activation manuelle par le back office */}
          <button
            onClick={handleCheck}
            disabled={checking}
            className="ml-auto shrink-0 flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
          >
            {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Vérifier mon abonnement
          </button>
        </div>

        {/* Choix du plan */}
        <div>
          <h2 className="text-lg font-bold text-white mb-4">Choisissez votre plan</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {plans.map((plan) => (
              <button
                key={plan.id}
                onClick={() => setSelectedPlan(plan)}
                className={`text-left p-5 rounded-2xl border transition-all
                  ${selectedPlan?.id === plan.id
                    ? 'border-brand-500 bg-brand-900/20'
                    : 'border-surface-border hover:border-slate-500'}`}
              >
                <p className="font-bold text-white text-lg">{plan.label}</p>
                <p className="text-2xl font-bold text-brand-400 mt-1">
                  {plan.price.toLocaleString('fr-FR')} <span className="text-sm font-normal text-slate-400">{plan.currency}/mois</span>
                </p>
                <ul className="mt-3 space-y-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-slate-300">
                      <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
        </div>

        {/* Comment payer */}
        <div>
          <h2 className="text-lg font-bold text-white mb-4">Comment payer</h2>
          <div className="card p-5 space-y-5">

            {/* Étapes */}
            <ol className="space-y-3">
              {[
                { n: 1, text: 'Scannez le QR code Wave ou Orange Money ci-dessous' },
                { n: 2, text: `Effectuez le paiement de ${selectedPlan?.price.toLocaleString('fr-FR') ?? '—'} ${selectedPlan?.currency ?? ''}` },
                { n: 3, text: 'Envoyez le reçu de paiement par WhatsApp' },
                { n: 4, text: 'Votre abonnement sera activé sous 24h' },
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
                { key: 'wave' as const, label: 'Wave', url: settings?.wave_qr_url, color: 'border-blue-700 bg-blue-900/10' },
                { key: 'om'   as const, label: 'Orange Money', url: settings?.om_qr_url, color: 'border-orange-700 bg-orange-900/10' },
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

            {/* Bouton WhatsApp */}
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 w-full h-12 rounded-xl
                border border-green-700 bg-green-900/20 text-green-400
                hover:bg-green-900/40 transition-colors font-semibold"
            >
              <MessageCircle className="w-5 h-5" />
              Envoyer le reçu par WhatsApp
            </a>

            <p className="text-xs text-slate-500 text-center">
              Après réception du reçu, l'activation est effectuée manuellement sous 24h.
            </p>
          </div>
        </div>
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
              {showQr === 'wave' ? 'Wave' : 'Orange Money'} — {selectedPlan?.price.toLocaleString('fr-FR')} {selectedPlan?.currency}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
