'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Banknote, Trash2, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useConfirm } from '@/components/shared/ConfirmDialog';
import {
  getFinancialRequests, updateFinancialRequestStatus, deleteFinancialRequest,
  FINANCIAL_REQUEST_KIND_LABELS, FINANCIAL_REQUEST_STATUS_LABELS,
  type StaffFinancialRequest, type FinancialRequestKind, type FinancialRequestStatus,
} from '@services/supabase/staff-finance';

const STATUS_COLOR: Record<FinancialRequestStatus, string> = {
  en_attente: 'text-status-warning',
  approuvee:  'text-status-success',
  rejetee:    'text-status-error',
  decaissee:  'text-blue-400',
  remboursee: 'text-content-muted',
};

export function StaffFinanceRequestsTab({
  businessId, currency, notifError, notifSuccess,
}: {
  businessId: string; currency: string;
  notifError: (m: string) => void; notifSuccess: (m: string) => void;
}) {
  const { user } = useAuthStore();
  const [requests, setRequests] = useState<StaffFinancialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<FinancialRequestKind | 'all'>('all');
  const { askConfirm, ConfirmDialog } = useConfirm();

  const load = useCallback(async () => {
    try { setRequests(await getFinancialRequests(businessId)); }
    catch (e) { notifError(String(e)); }
    finally { setLoading(false); }
  }, [businessId, notifError]);

  useEffect(() => { load(); }, [load]);

  async function handleStatusChange(req: StaffFinancialRequest, status: FinancialRequestStatus) {
    try { await updateFinancialRequestStatus(req.id, status, user?.id); load(); }
    catch (e) { notifError(String(e)); }
  }

  function handleDelete(req: StaffFinancialRequest) {
    askConfirm(`Supprimer cette demande de ${FINANCIAL_REQUEST_KIND_LABELS[req.kind].toLowerCase()} ?`, async () => {
      try { await deleteFinancialRequest(req.id); notifSuccess('Demande supprimée'); load(); }
      catch (e) { notifError(String(e)); }
    });
  }

  const filtered = requests.filter((r) => kindFilter === 'all' || r.kind === kindFilter);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-content-brand" /></div>;

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4">
      <div className="flex bg-surface-input p-1 rounded-xl border border-surface-border w-fit">
        {(['all', 'pret', 'avance_salaire'] as const).map((k) => (
          <button key={k} onClick={() => setKindFilter(k)}
            className={cn('px-4 py-2 rounded-lg text-xs font-bold transition-all',
              kindFilter === k ? 'bg-brand-600 text-content-primary shadow-lg' : 'text-content-muted hover:text-content-primary')}>
            {k === 'all' ? 'Tout' : FINANCIAL_REQUEST_KIND_LABELS[k]}
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        {filtered.map((r) => (
          <div key={r.id} className="bg-surface-card border border-surface-border rounded-2xl p-4 flex items-center gap-4">
            {r.kind === 'pret' ? <Banknote className="w-5 h-5 text-content-brand shrink-0" /> : <Wallet className="w-5 h-5 text-content-brand shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-content-primary truncate">
                {r.staff?.name ?? '—'} · {r.amount.toLocaleString('fr-FR')} {currency}
              </p>
              <p className="text-[11px] text-content-muted mt-0.5">
                {FINANCIAL_REQUEST_KIND_LABELS[r.kind]}
                {r.repayment_months && ` · Remboursement sur ${r.repayment_months} mois`}
              </p>
              {r.reason && <p className="text-[11px] text-content-secondary mt-1 italic">{r.reason}</p>}
            </div>
            <select value={r.status} onChange={(e) => handleStatusChange(r, e.target.value as FinancialRequestStatus)}
              className={cn('input h-9 text-xs font-bold', STATUS_COLOR[r.status])}>
              {(Object.keys(FINANCIAL_REQUEST_STATUS_LABELS) as FinancialRequestStatus[]).map((k) => <option key={k} value={k}>{FINANCIAL_REQUEST_STATUS_LABELS[k]}</option>)}
            </select>
            <button onClick={() => handleDelete(r)} className="p-2 text-content-muted hover:text-status-error rounded-lg transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="py-16 text-center bg-surface-card/20 rounded-3xl border border-dashed border-surface-border">
            <Banknote className="w-8 h-8 text-content-muted mx-auto mb-2 opacity-30" />
            <p className="text-content-muted text-sm italic">Aucune demande</p>
          </div>
        )}
      </div>
      <ConfirmDialog />
    </div>
  );
}
