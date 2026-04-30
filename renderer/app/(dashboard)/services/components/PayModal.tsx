import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { cn, formatCurrency } from '@/lib/utils';
import { toUserError } from '@/lib/user-error';
import { payServiceOrder, type ServiceOrder } from '@services/supabase/service-orders';
import { PAY_METHODS } from '../constants';

export function PayModal({ order, currency, onClose, onPaid }: {
  order: ServiceOrder; currency: string; onClose: () => void; onPaid: () => void;
}) {
  const { user } = useAuthStore();
  const { error: notifError } = useNotificationStore();
  const balance = order.total - order.paid_amount;
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState('cash');
  const [saving, setSaving] = useState(false);

  async function handlePay() {
    setSaving(true);
    try { 
      await payServiceOrder(order.id, parseFloat(amount) || 0, method, { userId: user?.id, userName: user?.full_name }); 
      onPaid(); 
    }
    catch (e: any) { notifError(toUserError(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface-card rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-surface-border">
          <h2 className="text-base font-bold text-content-primary">Encaisser le paiement</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover text-content-secondary"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-surface-hover p-4 flex justify-between items-center">
            <span className="text-content-secondary text-sm">Montant dû</span>
            <span className="text-content-primary font-bold text-lg">{formatCurrency(balance, currency)}</span>
          </div>
          <div>
            <label className="text-xs text-content-secondary font-medium mb-1 block">Montant reçu</label>
            <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min={0}
              className="w-full px-3 py-2.5 rounded-xl bg-surface-input border border-surface-border text-content-primary text-lg font-bold" />
          </div>
          <div>
            <label className="text-xs text-content-secondary font-medium mb-2 block">Mode de paiement</label>
            <div className="grid grid-cols-3 gap-2">
              {PAY_METHODS.map(m => (
                <button key={m.value} onClick={() => setMethod(m.value)}
                  className={cn('py-2 rounded-xl border text-xs font-semibold transition-colors', method === m.value
                    ? 'bg-brand-500/20 border-brand-500/50 text-content-brand'
                    : 'border-surface-border text-content-secondary hover:bg-surface-hover')}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t border-surface-border">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-surface-border text-content-secondary text-sm font-medium">Annuler</button>
          <button onClick={handlePay} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-status-success hover:opacity-90 text-white text-sm font-bold disabled:opacity-40">
            {saving ? 'Enregistrement…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}
