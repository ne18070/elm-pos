'use client';

import React, { useState, useEffect } from 'react';
import { X, Info, AlertTriangle, Banknote, CreditCard, Smartphone, Building2, FileCheck, Star, Gift } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useCashSessionStore } from '@/store/cashSession';
import { cn, formatCurrency } from '@/lib/utils';
import { toUserError } from '@/lib/user-error';
import { payServiceOrder, type ServiceOrder } from '@services/supabase/service-orders';
import { getLoyaltyConfig, getClientBalance, redeemPoints, type LoyaltyConfig } from '@services/supabase/loyalty';
import { computeChange, suggestRoundAmounts } from '@domain/payment.service';

// Sous-ensemble de méthodes propre aux ordres de service (≠ méthodes POS)
type ServicePayMethod = 'cash' | 'mobile' | 'card' | 'bank' | 'check';

const METHOD_CFG: Record<ServicePayMethod, { label: string; icon: React.ElementType; hasRef: boolean }> = {
  cash:   { label: 'Espèces',      icon: Banknote,   hasRef: false },
  mobile: { label: 'Mobile Money', icon: Smartphone,  hasRef: true  },
  card:   { label: 'Carte',        icon: CreditCard,  hasRef: true  },
  bank:   { label: 'Virement',     icon: Building2,   hasRef: true  },
  check:  { label: 'Chèque',       icon: FileCheck,   hasRef: true  },
};

export function PayModal({ order, currency, onClose, onPaid }: {
  order: ServiceOrder; currency: string; onClose: () => void; onPaid: () => void;
}) {
  const { user }               = useAuthStore();
  const { session: cashSession } = useCashSessionStore();
  const { error: notifError }  = useNotificationStore();

  const balance = order.total - order.paid_amount;

  const [amount,    setAmount]    = useState(String(balance));
  const [method,    setMethod]    = useState<ServicePayMethod>('cash');
  const [reference, setReference] = useState('');
  const [erreur,    setErreur]    = useState('');
  const [saving,    setSaving]    = useState(false);

  // ── Fidélité ──────────────────────────────────────────────────────────────────
  const [loyaltyConfig,  setLoyaltyConfig]  = useState<LoyaltyConfig | null>(null);
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [useLoyalty,     setUseLoyalty]     = useState(false);

  useEffect(() => {
    if (!order.client_name || !order.business_id) return;
    Promise.all([
      getLoyaltyConfig(order.business_id),
      getClientBalance(order.business_id, order.client_name),
    ]).then(([cfg, bal]) => {
      if (cfg.is_active) {
        setLoyaltyConfig(cfg);
        setLoyaltyBalance(bal);
      }
    }).catch(() => {});
  }, [order.business_id, order.client_name]);

  // Points utilisables = plafonné à ce qui couvre au max le solde dû
  const maxRedeemablePoints  = loyaltyConfig
    ? Math.min(loyaltyBalance, Math.floor(balance / loyaltyConfig.point_value))
    : 0;
  const loyaltyDiscount      = useLoyalty && loyaltyConfig
    ? maxRedeemablePoints * loyaltyConfig.point_value
    : 0;
  const canUseLoyalty        = !!loyaltyConfig && maxRedeemablePoints >= (loyaltyConfig.min_redeem ?? 1);

  // Montant dû après remise fidélité
  const balanceAfterLoyalty  = Math.max(0, balance - loyaltyDiscount);

  useEffect(() => {
    setAmount(String(balanceAfterLoyalty || balance));
  }, [useLoyalty, balanceAfterLoyalty, balance]);

  const parsedAmount = parseFloat(amount) || 0;
  const isPartial    = parsedAmount > 0 && parsedAmount < balanceAfterLoyalty - 0.01;
  const isOverpay    = parsedAmount > balanceAfterLoyalty + 0.01;
  const rendu        = method === 'cash' && isOverpay ? computeChange(parsedAmount, balanceAfterLoyalty) : 0;
  const remainder    = Math.max(0, balanceAfterLoyalty - parsedAmount);
  const suggestions  = method === 'cash' ? suggestRoundAmounts(balanceAfterLoyalty, currency === 'XOF' ? 'XOF' : 'EUR') : [];

  function validate(): string | null {
    if (parsedAmount <= 0 && balanceAfterLoyalty > 0) return 'Veuillez saisir un montant';
    if (METHOD_CFG[method].hasRef && reference !== '' && !reference.trim())
      return 'La référence ne peut pas être vide si elle est saisie';
    return null;
  }

  async function handlePay() {
    if (!cashSession) { notifError('Aucune session de caisse ouverte'); return; }
    const err = validate();
    if (err) { setErreur(err); return; }

    setSaving(true);
    setErreur('');
    try {
      // 1. Déduire les points fidélité
      if (useLoyalty && loyaltyConfig && maxRedeemablePoints >= loyaltyConfig.min_redeem) {
        await redeemPoints(
          order.business_id,
          order.client_name!,
          order.client_phone ?? null,
          maxRedeemablePoints,
          loyaltyConfig,
          order.id,
        );
      }

      // 2. Enregistrer le paiement
      if (balanceAfterLoyalty === 0) {
        // Les points couvrent tout — on enregistre la remise comme paiement pour clôturer l'OT
        await payServiceOrder(order.id, loyaltyDiscount, 'loyalty', { userId: user?.id, userName: user?.full_name });
      } else {
        await payServiceOrder(order.id, parsedAmount, method, { userId: user?.id, userName: user?.full_name });
      }

      onPaid();
    } catch (e: any) {
      setErreur(toUserError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface-card rounded-2xl w-full max-w-sm shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-border">
          <h2 className="text-base font-bold text-content-primary">Encaisser le paiement</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover text-content-secondary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* Alerte session caisse */}
          {!cashSession && (
            <div className="p-3 rounded-xl bg-status-error/10 border border-status-error/20 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-status-error shrink-0 mt-0.5" />
              <p className="text-xs text-status-error leading-relaxed">
                <strong>Action bloquée.</strong> Ouvrez une session de caisse pour enregistrer un versement.
              </p>
            </div>
          )}

          {/* Récapitulatif solde */}
          <div className="rounded-xl bg-surface-hover p-3 space-y-1.5">
            {order.paid_amount > 0 && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-content-secondary">Total OT</span>
                  <span className="font-medium text-content-primary">{formatCurrency(order.total, currency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-content-secondary">Déjà encaissé</span>
                  <span className="font-medium text-status-success">-{formatCurrency(order.paid_amount, currency)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-surface-border pt-1.5">
                  <span className="font-semibold text-content-primary">Reste dû</span>
                  <span className="font-bold text-content-primary">{formatCurrency(balance, currency)}</span>
                </div>
              </>
            )}
            {order.paid_amount === 0 && (
              <div className="flex justify-between items-center">
                <span className="text-content-secondary text-sm">Montant dû</span>
                <span className="text-content-primary font-bold text-lg">{formatCurrency(balance, currency)}</span>
              </div>
            )}

            {/* Remise fidélité appliquée */}
            {useLoyalty && loyaltyDiscount > 0 && (
              <>
                <div className="flex justify-between text-sm border-t border-surface-border pt-1.5">
                  <span className="text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                    <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                    Remise fidélité ({maxRedeemablePoints} pts)
                  </span>
                  <span className="font-bold text-yellow-600 dark:text-yellow-400">-{formatCurrency(loyaltyDiscount, currency)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold border-t border-surface-border pt-1.5">
                  <span className="text-content-primary">À encaisser</span>
                  <span className={cn('text-lg', balanceAfterLoyalty === 0 ? 'text-status-success' : 'text-content-primary')}>
                    {balanceAfterLoyalty === 0 ? '✓ Réglé' : formatCurrency(balanceAfterLoyalty, currency)}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Bloc fidélité — visible seulement si le client a des points utilisables */}
          {canUseLoyalty && (
            <button
              onClick={() => setUseLoyalty(v => !v)}
              className={cn(
                'w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors text-sm',
                useLoyalty
                  ? 'bg-yellow-400/10 border-yellow-400/40 text-yellow-700 dark:text-yellow-300'
                  : 'bg-surface-input border-surface-border text-content-secondary hover:bg-surface-hover',
              )}
            >
              <span className="flex items-center gap-2 font-semibold">
                <Gift className="w-4 h-4" />
                Utiliser les points de fidélité
              </span>
              <span className="flex items-center gap-1.5 text-xs font-bold">
                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                {loyaltyBalance} pts → -{formatCurrency(loyaltyDiscount || maxRedeemablePoints * loyaltyConfig!.point_value, currency)}
              </span>
            </button>
          )}

          {/* Mode de paiement — masqué si remise couvre tout */}
          {balanceAfterLoyalty > 0 && (
            <>
              <div>
                <label className="text-xs text-content-secondary font-medium mb-2 block">Mode de paiement</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(Object.entries(METHOD_CFG) as [ServicePayMethod, typeof METHOD_CFG[ServicePayMethod]][]).map(([val, cfg]) => {
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={val}
                        onClick={() => { setMethod(val); setReference(''); setErreur(''); }}
                        disabled={!cashSession}
                        className={cn(
                          'flex flex-col items-center gap-1 py-2.5 rounded-xl border text-[10px] font-semibold transition-colors disabled:opacity-50',
                          method === val
                            ? 'bg-brand-500/20 border-brand-500/50 text-content-brand'
                            : 'border-surface-border text-content-secondary hover:bg-surface-hover',
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Montant reçu */}
              <div>
                <label className="text-xs text-content-secondary font-medium mb-1 block">Montant reçu</label>
                <input
                  value={amount}
                  onChange={e => { setAmount(e.target.value); setErreur(''); }}
                  type="number"
                  min={0}
                  disabled={!cashSession}
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-input border border-surface-border text-content-primary text-lg font-bold disabled:opacity-50"
                />

                {/* Suggestions d'arrondi (espèces uniquement) */}
                {suggestions.length > 0 && (
                  <div className="grid grid-cols-4 gap-1.5 mt-2">
                    {suggestions.map(v => (
                      <button
                        key={v}
                        onClick={() => { setAmount(String(v)); setErreur(''); }}
                        className={cn(
                          'py-1.5 rounded-lg border text-[11px] font-semibold transition-colors',
                          parsedAmount === v
                            ? 'border-brand-500 text-content-brand bg-brand-500/10'
                            : 'border-surface-border text-content-secondary hover:bg-surface-hover',
                        )}
                      >
                        {formatCurrency(v, currency)}
                      </button>
                    ))}
                  </div>
                )}

                {/* Retour visuel sur le montant saisi */}
                {parsedAmount > 0 && (
                  <div className={cn(
                    'mt-2 rounded-xl px-3 py-2.5 text-sm flex items-center justify-between',
                    isOverpay  ? 'bg-badge-success  border border-status-success  text-status-success'  :
                    isPartial  ? 'bg-status-info/10 border border-blue-800/30     text-blue-400'         :
                                 'bg-badge-success  border border-status-success  text-status-success',
                  )}>
                    <span className="font-medium">
                      {isOverpay ? 'Monnaie à rendre' : isPartial ? 'Acompte — reste dû' : '✓ Solde complet'}
                    </span>
                    <span className="font-black font-mono">
                      {isOverpay  ? formatCurrency(rendu, currency)
                       : isPartial ? formatCurrency(remainder, currency)
                       :             formatCurrency(parsedAmount, currency)}
                    </span>
                  </div>
                )}

                {(!parsedAmount || parsedAmount === 0) && (
                  <p className="flex items-center gap-1.5 mt-1.5 text-xs text-content-muted">
                    <Info className="w-3 h-3 shrink-0" />
                    Vous pouvez encaisser un acompte — saisissez un montant inférieur au reste dû.
                  </p>
                )}
              </div>

              {/* Référence */}
              {METHOD_CFG[method].hasRef && (
                <div>
                  <label className="text-xs text-content-secondary font-medium mb-1 block">
                    Référence{' '}
                    <span className="text-content-muted text-[10px]">(optionnel)</span>
                  </label>
                  <input
                    type="text"
                    value={reference}
                    onChange={e => { setReference(e.target.value); setErreur(''); }}
                    placeholder={
                      method === 'mobile' ? 'Ex : ID transaction Wave / Orange' :
                      method === 'card'   ? 'Ex : code TPE ou 4 derniers chiffres' :
                      method === 'bank'   ? 'Ex : référence virement' :
                                           'Ex : numéro de chèque'
                    }
                    disabled={!cashSession}
                    className="w-full px-3 py-2 rounded-xl bg-surface-input border border-surface-border text-content-primary text-sm disabled:opacity-50"
                  />
                </div>
              )}
            </>
          )}

          {/* Erreur inline */}
          {erreur && (
            <p className="text-sm text-status-error bg-badge-error border border-status-error rounded-xl px-3 py-2">
              {erreur}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t border-surface-border">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-surface-border text-content-secondary text-sm font-medium">
            Annuler
          </button>
          <button
            onClick={handlePay}
            disabled={saving || !cashSession || (balanceAfterLoyalty > 0 && parsedAmount <= 0)}
            className="flex-1 py-2.5 rounded-xl bg-status-success hover:opacity-90 text-white text-sm font-bold disabled:bg-surface-input disabled:text-content-muted disabled:cursor-not-allowed"
          >
            {saving ? 'Enregistrement…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}
