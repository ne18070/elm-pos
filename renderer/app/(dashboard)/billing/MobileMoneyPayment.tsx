'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle, Loader2, Smartphone, XCircle, FlaskConical, ExternalLink } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { LOOV_OPERATORS, loovOperatorLabel, normalizeSenegalPhone, type LoovOperatorCode } from '@/lib/loov-operators';
import {
  startMobilePayment, getMobilePayment, simulateMobilePayment, MobilePaymentError,
  type MobilePayment, type Plan,
} from '@services/supabase/subscriptions';

const POLL_MS     = 4_000;
// Loov expire une demande non validée au bout de 15 min
const MAX_WAIT_MS = 16 * 60_000;

function formatPhone(digits: string) {
  const local = digits.replace(/^221/, '');
  return local.replace(/^(\d{2})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4');
}

interface Props {
  businessId:   string;
  plan:         Plan;
  defaultPhone?: string | null;
  /** Abonnement activé : recharger le statut */
  onActivated:  () => void;
}

export function MobileMoneyPayment({ businessId, plan, defaultPhone, onActivated }: Props) {
  const [operator, setOperator] = useState<LoovOperatorCode>('orange-money-senegal');
  const [phone, setPhone]       = useState(defaultPhone ?? '');
  const [phoneError, setPhoneError] = useState('');
  const [otp, setOtp]           = useState('');
  const [needsOtp, setNeedsOtp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState('');
  const [payment, setPayment]   = useState<MobilePayment | null>(null);
  const [sentTo, setSentTo]     = useState('');
  // Wave : lien de paiement à ouvrir (pas de push sur le téléphone)
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const startedAt = useRef(0);
  const activatedNotified = useRef(false);

  const normalized = normalizeSenegalPhone(phone);
  const waiting    = payment !== null && (payment.status === 'pending' || payment.status === 'processing');
  // Payé mais pas encore activé (webhook en route) : on continue d'interroger
  const polling    = waiting || (payment?.status === 'succeeded' && !payment.activated);

  // Polling tant que le client n'a pas validé sur son téléphone
  useEffect(() => {
    if (!payment || !polling) return;
    if (waiting && Date.now() - startedAt.current > MAX_WAIT_MS) {
      setPayment({ ...payment, status: 'expired' });
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setPayment(await getMobilePayment(payment.id));
      } catch {
        // Réseau instable : on retentera au prochain tour
        setPayment((p) => (p ? { ...p } : p));
      }
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [payment, polling]);

  useEffect(() => {
    if (payment?.status === 'succeeded' && payment.activated && !activatedNotified.current) {
      activatedNotified.current = true;
      onActivated();
    }
  }, [payment, onActivated]);

  function validatePhone() {
    if (!phone.trim()) { setPhoneError(''); return; }
    setPhoneError(normalized ? '' : 'Numéro sénégalais à 9 chiffres, commençant par 7 (ex. 77 123 45 67).');
  }

  async function handlePay() {
    if (!normalized) { validatePhone(); return; }
    setSubmitting(true);
    setError('');
    try {
      const res = await startMobilePayment({
        businessId, planId: plan.id, operator, phone: normalized,
        otp: needsOtp ? otp : undefined,
      });
      startedAt.current = Date.now();
      activatedNotified.current = false;
      setSentTo(normalized);
      setCheckoutUrl(res.checkout_url ?? null);
      setPayment(res.payment);
      setNeedsOtp(false);
      setOtp('');
    } catch (e) {
      if (e instanceof MobilePaymentError && e.code === 'otp_required') setNeedsOtp(true);
      setError(e instanceof Error ? e.message : 'Paiement impossible. Réessayez.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSimulate(outcome: 'succeeded' | 'failed') {
    if (!payment) return;
    setSimulating(true);
    try {
      setPayment(await simulateMobilePayment(payment.id, outcome));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Simulation impossible');
    } finally {
      setSimulating(false);
    }
  }

  function reset() {
    setPayment(null);
    setCheckoutUrl(null);
    setError('');
  }

  const amountLabel = formatCurrency(plan.price, plan.currency);

  // -- Attente de validation sur le téléphone ----------------------------------
  if (payment && waiting) {
    const opLabel = loovOperatorLabel(payment.operator);
    return (
      <div className="flex flex-col items-center gap-4 text-center py-4" aria-live="polite">
        <div className="relative w-16 h-16 rounded-full bg-badge-brand border border-brand-600/50 flex items-center justify-center">
          <Smartphone className="w-8 h-8 text-content-brand" />
          <Loader2 className="absolute -right-1 -bottom-1 w-6 h-6 animate-spin text-content-brand" />
        </div>
        <div className="space-y-1">
          <p className="text-lg font-bold text-content-primary">
            {checkoutUrl ? `Finalisez le paiement dans ${opLabel}` : 'Validez le paiement sur votre téléphone'}
          </p>
          {checkoutUrl ? (
            <p className="text-sm text-content-secondary max-w-sm">
              Ouvrez {opLabel} pour régler <strong className="text-content-primary">{amountLabel}</strong>.
              Revenez ensuite ici : votre abonnement s&apos;active dès la validation.
            </p>
          ) : (
            <>
              <p className="text-sm text-content-secondary max-w-sm">
                Une demande de <strong className="text-content-primary">{amountLabel}</strong> a été envoyée au{' '}
                <strong className="text-content-primary">{formatPhone(sentTo)}</strong> ({opLabel}).
                Confirmez-la avec votre code secret.
              </p>
              <p className="text-xs text-content-muted max-w-sm pt-1">
                Pas de notification ? Ouvrez l&apos;application {opLabel} ou le menu USSD
                de votre opérateur, rubrique paiements en attente. Votre abonnement s&apos;active dès la validation.
              </p>
            </>
          )}
        </div>

        {checkoutUrl && (
          <a
            href={checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary w-full h-12 text-base flex items-center justify-center gap-2"
          >
            <ExternalLink className="w-4 h-4" /> Ouvrir {opLabel}
          </a>
        )}

        {!payment.livemode && (
          <div className="w-full rounded-xl border border-dashed border-status-warning/60 bg-badge-warning p-3 space-y-2">
            <p className="flex items-center justify-center gap-1.5 text-xs font-semibold text-status-warning">
              <FlaskConical className="w-3.5 h-3.5" /> Mode test : aucun débit réel
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => handleSimulate('succeeded')} disabled={simulating} className="btn-secondary h-11 text-sm">
                Simuler un succès
              </button>
              <button onClick={() => handleSimulate('failed')} disabled={simulating} className="btn-secondary h-11 text-sm">
                Simuler un refus
              </button>
            </div>
          </div>
        )}

        <button onClick={reset} className="text-xs text-content-muted hover:text-content-primary underline underline-offset-2 h-11">
          Changer de numéro ou d&apos;opérateur
        </button>
      </div>
    );
  }

  // -- Paiement confirmé -------------------------------------------------------
  if (payment?.status === 'succeeded') {
    return (
      <div className="flex flex-col items-center gap-4 text-center py-4" aria-live="polite">
        <div className="w-16 h-16 rounded-full bg-badge-success border border-status-success flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-status-success" />
        </div>
        <div className="space-y-1">
          <p className="text-lg font-bold text-content-primary">Paiement reçu</p>
          <p className="text-sm text-content-secondary">
            {payment.activated
              ? `Votre abonnement ${plan.label} est actif. La facture est disponible ci-dessous.`
              : 'Activation de votre abonnement en cours…'}
          </p>
        </div>
      </div>
    );
  }

  // -- Formulaire (et échec éventuel) ------------------------------------------
  const failed = payment && (payment.status === 'failed' || payment.status === 'expired');

  return (
    <div className="space-y-5">
      {failed && (
        <div className="flex items-start gap-3 rounded-xl border border-status-error/50 bg-badge-error px-4 py-3" role="alert">
          <XCircle className="w-5 h-5 text-status-error shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-content-primary">
              {payment.status === 'expired' ? 'Demande expirée' : 'Paiement non abouti'}
            </p>
            <p className="text-content-secondary mt-0.5">
              {payment.status === 'expired'
                ? 'Le paiement n\'a pas été validé à temps. Aucun montant n\'a été débité. Relancez-le ci-dessous.'
                : (payment.failure_reason || 'Le paiement a été refusé. Vérifiez votre solde ou essayez un autre opérateur.')}
            </p>
          </div>
        </div>
      )}

      <div>
        <p className="label">Opérateur</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Opérateur mobile money">
          {LOOV_OPERATORS.map((op) => (
            <button
              key={op.code}
              type="button"
              role="radio"
              aria-checked={operator === op.code}
              onClick={() => { setOperator(op.code); setNeedsOtp(false); setError(''); }}
              className={`h-12 rounded-xl border text-sm font-semibold transition-colors
                ${operator === op.code
                  ? 'border-brand-500 bg-badge-brand text-content-primary'
                  : 'border-surface-border text-content-secondary hover:text-content-primary'}`}
            >
              {op.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="mm-phone" className="label">Numéro {loovOperatorLabel(operator)} à débiter</label>
        <div className="flex">
          <span className="input w-auto rounded-r-none border-r-0 flex items-center text-content-muted select-none">+221</span>
          <input
            id="mm-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setPhoneError(''); }}
            onBlur={validatePhone}
            className={`input rounded-l-none flex-1 ${phoneError ? 'border-status-error focus:ring-status-error' : ''}`}
            placeholder="77 123 45 67"
          />
        </div>
        {phoneError && <p className="text-xs text-status-error mt-1">{phoneError}</p>}
      </div>

      {needsOtp && (
        <div>
          <label htmlFor="mm-otp" className="label">Code de validation</label>
          <input
            id="mm-otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            className="input"
            placeholder="Ex. 123456"
          />
          <p className="text-xs text-content-muted mt-1">
            Composez <strong className="text-content-primary">#144#391#</strong> sur votre téléphone Orange pour obtenir le code.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-status-error" role="alert">{error}</p>}

      <button
        onClick={handlePay}
        disabled={submitting || !normalized || (needsOtp && !otp.trim())}
        className="btn-primary w-full flex items-center justify-center gap-2 h-12 text-base"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
        {submitting ? 'Envoi de la demande…' : failed ? `Réessayer — ${amountLabel}` : `Payer ${amountLabel}`}
      </button>
    </div>
  );
}
