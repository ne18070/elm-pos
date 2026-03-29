'use client';

import { useEffect, useState } from 'react';
import {
  Loader2, CheckCircle, Clock, XCircle, RefreshCw,
  Upload, Save, Plus, Pencil, Eye, X, ChevronLeft, ChevronRight,
} from 'lucide-react';
import {
  getAllSubscriptions, activateSubscription,
  getPlans, getPaymentSettings, upsertPaymentSettings, upsertPlan,
  uploadQrCode, getSubscriptionRequests, approveSubscriptionRequest, rejectSubscriptionRequest,
  getPublicSubscriptionRequests, rejectPublicRequest,
  type SubscriptionRow, type Plan, type PaymentSettings,
  type SubscriptionRequest, type PublicSubscriptionRequest,
} from '@services/supabase/subscriptions';

type Tab = 'demandes' | 'abonnements' | 'plans' | 'paiement';

const STATUS_LABEL: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  active:  { label: 'Actif',   color: 'text-green-400 bg-green-900/20 border-green-800',  icon: CheckCircle },
  trial:   { label: 'Essai',   color: 'text-amber-400 bg-amber-900/20 border-amber-800',  icon: Clock       },
  expired: { label: 'Expiré',  color: 'text-red-400 bg-red-900/20 border-red-800',        icon: XCircle     },
};

const REQ_STATUS: Record<string, { label: string; color: string }> = {
  pending:  { label: 'En attente', color: 'text-amber-400 bg-amber-900/20 border-amber-800' },
  approved: { label: 'Approuvée',  color: 'text-green-400 bg-green-900/20 border-green-800' },
  rejected: { label: 'Rejetée',    color: 'text-red-400 bg-red-900/20 border-red-800'       },
};

function getRowStatus(row: SubscriptionRow): string {
  if (row.status === 'active' && row.expires_at && new Date(row.expires_at) < new Date()) return 'expired';
  if (row.status === 'trial' && row.trial_ends_at && new Date(row.trial_ends_at) < new Date()) return 'expired';
  return row.status;
}

const PAGE_SIZE = 25;

function Pagination({ total, page, onChange }: { total: number; page: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border text-sm text-slate-400">
      <span>{total} entrée{total !== 1 ? 's' : ''}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(page - 1)} disabled={page === 1}
          className="p-1.5 rounded-lg hover:bg-surface-input disabled:opacity-30 transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
          <button key={p} onClick={() => onChange(p)}
            className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors
              ${p === page ? 'bg-brand-600 text-white' : 'hover:bg-surface-input'}`}>
            {p}
          </button>
        ))}
        <button onClick={() => onChange(page + 1)} disabled={page === pages}
          className="p-1.5 rounded-lg hover:bg-surface-input disabled:opacity-30 transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Onglet Demandes ───────────────────────────────────────────────────────────

function RequestsTab({ plans }: { plans: Plan[] }) {
  const [rows, setRows]           = useState<SubscriptionRequest[]>([]);
  const [publicRows, setPublicRows] = useState<PublicSubscriptionRequest[]>([]);
  const [loading, setLoading]     = useState(true);
  const [preview, setPreview]     = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectId, setRejectId]   = useState<{ id: string; isPublic: boolean } | null>(null);
  const [approveForm, setApproveForm] = useState<{
    requestId: string; businessId: string; planId: string;
    days: string; mode: 'jours' | 'mois'; note: string;
  } | null>(null);
  const [approvePublicForm, setApprovePublicForm] = useState<{
    req: PublicSubscriptionRequest; planId: string;
    days: string; mode: 'jours' | 'mois'; note: string;
  } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([
        getSubscriptionRequests().catch(() => [] as SubscriptionRequest[]),
        getPublicSubscriptionRequests().catch(() => [] as PublicSubscriptionRequest[]),
      ]);
      setRows(r);
      setPublicRows(p);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function handleApprove() {
    if (!approveForm) return;
    setProcessing(approveForm.requestId);
    const totalDays = approveForm.mode === 'mois'
      ? (parseInt(approveForm.days) || 1) * 30
      : parseInt(approveForm.days) || 30;
    try {
      await approveSubscriptionRequest(
        approveForm.requestId, approveForm.businessId,
        approveForm.planId, totalDays, approveForm.note || undefined,
      );
      setApproveForm(null);
      await load();
    } catch (e) { alert(String(e)); }
    finally { setProcessing(null); }
  }

  async function handleApprovePublic() {
    if (!approvePublicForm) return;
    setProcessing(approvePublicForm.req.id);
    const totalDays = approvePublicForm.mode === 'mois'
      ? (parseInt(approvePublicForm.days) || 1) * 30
      : parseInt(approvePublicForm.days) || 30;
    try {
      const { approvePublicRequest } = await import('@services/supabase/subscriptions');
      await approvePublicRequest(
        approvePublicForm.req.id,
        approvePublicForm.req,
        approvePublicForm.planId,
        totalDays,
        approvePublicForm.note || undefined,
      );
      setApprovePublicForm(null);
      await load();
    } catch (e) { alert(String(e)); }
    finally { setProcessing(null); }
  }

  async function handleReject() {
    if (!rejectId) return;
    setProcessing(rejectId.id);
    try {
      if (rejectId.isPublic) {
        await rejectPublicRequest(rejectId.id, rejectNote || undefined);
      } else {
        await rejectSubscriptionRequest(rejectId.id, rejectNote || undefined);
      }
      setRejectId(null);
      setRejectNote('');
      await load();
    } catch (e) { alert(String(e)); }
    finally { setProcessing(null); }
  }

  const [page, setPage] = useState(1);

  // All rows merged and sorted: pending first, then by date desc
  const allRequests = [
    ...rows.map((r) => ({ ...r, isPublic: false as const })),
    ...publicRows.map((r) => ({ ...r, isPublic: true as const, business_id: '' })),
  ].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const pendingCount = allRequests.filter((r) => r.status === 'pending').length;
  const pageRows = allRequests.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          {pendingCount} demande{pendingCount !== 1 ? 's' : ''} en attente
        </p>
        <button onClick={load} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" /> Actualiser
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-400" /></div>
      ) : allRequests.length === 0 ? (
        <p className="text-center text-slate-500 py-12">Aucune demande reçue</p>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-surface-border text-xs text-slate-400 uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">Établissement</th>
                  <th className="text-left px-4 py-3 font-medium">Contact</th>
                  <th className="text-left px-4 py-3 font-medium">Plan</th>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Statut</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {pageRows.map((req) => {
                  const badge = REQ_STATUS[req.status] ?? REQ_STATUS.pending;
                  return (
                    <tr key={req.id} className={`hover:bg-surface-hover transition-colors ${req.status !== 'pending' ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{req.business_name}</p>
                        {req.note && <p className="text-xs text-slate-500 italic mt-0.5">&ldquo;{req.note}&rdquo;</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {'email' in req ? (
                          <>
                            <p>{(req as PublicSubscriptionRequest).email}</p>
                            {(req as PublicSubscriptionRequest).phone && <p className="text-xs text-slate-500">{(req as PublicSubscriptionRequest).phone}</p>}
                            {(req as PublicSubscriptionRequest).password && (
                              <p className="text-xs text-green-400">MDP fourni</p>
                            )}
                          </>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        <p>{req.plan_label ?? '—'}</p>
                        {req.plan_price != null && (
                          <p className="text-xs text-slate-500">{req.plan_price.toLocaleString('fr-FR')} {req.plan_currency}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                        <p>{new Date(req.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                        <p className="text-xs">{new Date(req.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
                      </td>
                      <td className="px-4 py-3">
                        {req.isPublic ? (
                          <span className="text-xs px-2 py-0.5 rounded-full border text-amber-400 bg-amber-900/20 border-amber-800">Prospect</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full border text-blue-400 bg-blue-900/20 border-blue-700">Compte</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${badge.color}`}>{badge.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {req.receipt_url && (
                            <button onClick={() => setPreview(req.receipt_url!)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-input transition-colors">
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          {req.status === 'pending' && (
                            <>
                              {req.isPublic ? (
                                <button
                                  onClick={() => setApprovePublicForm({ req: req as PublicSubscriptionRequest, planId: req.plan_id ?? plans[0]?.id ?? '', days: '1', mode: 'mois', note: '' })}
                                  disabled={!!processing}
                                  className="px-2.5 py-1 text-xs rounded-lg border border-green-800 text-green-400 hover:bg-green-900/30 transition-colors disabled:opacity-50"
                                >Approuver</button>
                              ) : (
                                <button
                                  onClick={() => setApproveForm({ requestId: req.id, businessId: req.business_id, planId: req.plan_id ?? plans[0]?.id ?? '', days: '1', mode: 'mois', note: '' })}
                                  disabled={!!processing}
                                  className="px-2.5 py-1 text-xs rounded-lg border border-green-800 text-green-400 hover:bg-green-900/30 transition-colors disabled:opacity-50"
                                >Approuver</button>
                              )}
                              <button
                                onClick={() => { setRejectId({ id: req.id, isPublic: req.isPublic }); setRejectNote(''); }}
                                disabled={!!processing}
                                className="px-2.5 py-1 text-xs rounded-lg border border-red-800 text-red-400 hover:bg-red-900/30 transition-colors disabled:opacity-50"
                              >Rejeter</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination total={allRequests.length} page={page} onChange={setPage} />
        </div>
      )}

      {/* Aperçu reçu */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreview(null)}
        >
          <div className="relative max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <img src={preview} alt="reçu" className="w-full h-auto rounded-2xl" />
            <button
              onClick={() => setPreview(null)}
              className="absolute -top-3 -right-3 w-8 h-8 bg-red-600 rounded-full flex items-center justify-center"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      )}

      {/* Modal approbation */}
      {approveForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card p-6 w-full max-w-sm space-y-4">
            <h2 className="font-semibold text-white">Approuver la demande</h2>

            <div>
              <label className="label">Plan</label>
              <select
                value={approveForm.planId}
                onChange={(e) => setApproveForm((f) => f && { ...f, planId: e.target.value })}
                className="input"
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.label} — {p.price.toLocaleString('fr-FR')} {p.currency}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Durée</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={approveForm.days}
                  onChange={(e) => setApproveForm((f) => f && { ...f, days: e.target.value })}
                  className="input flex-1"
                  min={1}
                />
                <div className="flex rounded-xl border border-surface-border overflow-hidden shrink-0">
                  {(['jours', 'mois'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setApproveForm((f) => f && { ...f, mode: m })}
                      className={`px-3 py-2 text-sm font-medium transition-colors
                        ${approveForm.mode === m ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                = {approveForm.mode === 'mois'
                  ? `${(parseInt(approveForm.days) || 1) * 30} jours`
                  : `${parseInt(approveForm.days) || 0} jour${parseInt(approveForm.days) > 1 ? 's' : ''}`}
              </p>
            </div>

            <div>
              <label className="label">Note (optionnel)</label>
              <input
                type="text"
                value={approveForm.note}
                onChange={(e) => setApproveForm((f) => f && { ...f, note: e.target.value })}
                className="input"
                placeholder="Ex : Wave #REF123"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setApproveForm(null)} className="btn-secondary px-5">Annuler</button>
              <button
                onClick={handleApprove}
                disabled={!!processing}
                className="btn-primary px-5 flex items-center gap-2"
              >
                {processing && <Loader2 className="w-4 h-4 animate-spin" />}
                Activer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal approbation prospect */}
      {approvePublicForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card p-6 w-full max-w-sm space-y-4">
            <h2 className="font-semibold text-white">Approuver le prospect</h2>
            <p className="text-xs text-slate-400">
              Un compte sera créé pour <span className="text-slate-200">{approvePublicForm.req.email}</span>
              {approvePublicForm.req.password
                ? ' avec le mot de passe fourni.'
                : ' avec un mot de passe généré automatiquement.'}
            </p>

            <div>
              <label className="label">Plan</label>
              <select
                value={approvePublicForm.planId}
                onChange={(e) => setApprovePublicForm((f) => f && { ...f, planId: e.target.value })}
                className="input"
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.label} — {p.price.toLocaleString('fr-FR')} {p.currency}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Durée</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={approvePublicForm.days}
                  onChange={(e) => setApprovePublicForm((f) => f && { ...f, days: e.target.value })}
                  className="input flex-1"
                  min={1}
                />
                <div className="flex rounded-xl border border-surface-border overflow-hidden shrink-0">
                  {(['jours', 'mois'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setApprovePublicForm((f) => f && { ...f, mode: m })}
                      className={`px-3 py-2 text-sm font-medium transition-colors
                        ${approvePublicForm.mode === m ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="label">Note (optionnel)</label>
              <input
                type="text"
                value={approvePublicForm.note}
                onChange={(e) => setApprovePublicForm((f) => f && { ...f, note: e.target.value })}
                className="input"
                placeholder="Ex : Wave #REF123"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setApprovePublicForm(null)} className="btn-secondary px-5">Annuler</button>
              <button
                onClick={handleApprovePublic}
                disabled={!!processing}
                className="btn-primary px-5 flex items-center gap-2"
              >
                {processing && <Loader2 className="w-4 h-4 animate-spin" />}
                Créer le compte
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal rejet */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card p-6 w-full max-w-sm space-y-4">
            <h2 className="font-semibold text-white">Rejeter la demande</h2>
            <div>
              <label className="label">Raison (optionnel)</label>
              <input
                type="text"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                className="input"
                placeholder="Ex : Reçu illisible"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setRejectId(null)} className="btn-secondary px-5">Annuler</button>
              <button
                onClick={handleReject}
                disabled={!!processing}
                className="btn-danger px-5 flex items-center gap-2"
              >
                {processing && <Loader2 className="w-4 h-4 animate-spin" />}
                Rejeter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ── Onglet Abonnements ────────────────────────────────────────────────────────

function SubscriptionsTab({ plans }: { plans: Plan[] }) {
  const [rows, setRows]             = useState<SubscriptionRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [activating, setActivating] = useState<string | null>(null);
  const [form, setForm]             = useState<{
    businessId: string; planId: string; days: string; mode: 'jours' | 'mois'; note: string;
  } | null>(null);

  async function load() {
    setLoading(true);
    try { setRows(await getAllSubscriptions()); } catch { /* pas superadmin */ }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search]);

  const filtered = rows.filter((r) =>
    !search ||
    r.business_name.toLowerCase().includes(search.toLowerCase()) ||
    (r.owner_email ?? '').toLowerCase().includes(search.toLowerCase())
  );
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleActivate() {
    if (!form) return;
    setActivating(form.businessId);
    const totalDays = form.mode === 'mois'
      ? (parseInt(form.days) || 1) * 30
      : parseInt(form.days) || 30;
    try {
      await activateSubscription(form.businessId, form.planId, totalDays, form.note || undefined);
      setForm(null);
      await load();
    } catch (e) { alert(String(e)); }
    finally { setActivating(null); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par établissement ou email…"
          className="input flex-1 max-w-sm"
        />
        <button onClick={load} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" /> Actualiser
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-400" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-slate-500 py-12">Aucun abonnement trouvé</p>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-surface-border text-xs text-slate-400 uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">Établissement</th>
                  <th className="text-left px-4 py-3 font-medium">Propriétaire</th>
                  <th className="text-left px-4 py-3 font-medium">Plan</th>
                  <th className="text-left px-4 py-3 font-medium">Statut</th>
                  <th className="text-left px-4 py-3 font-medium">Échéance</th>
                  <th className="text-right px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {pageRows.map((row) => {
                  const st    = getRowStatus(row);
                  const badge = STATUS_LABEL[st] ?? STATUS_LABEL.expired;
                  const Icon  = badge.icon;
                  return (
                    <tr key={row.business_id} className="hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{row.business_name}</p>
                        {row.payment_note && <p className="text-xs text-slate-500 italic mt-0.5">&ldquo;{row.payment_note}&rdquo;</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        <p>{row.owner_name ?? '—'}</p>
                        <p className="text-xs text-slate-500">{row.owner_email ?? ''}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{row.plan_label ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${badge.color}`}>
                          <Icon className="w-3 h-3" /> {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {st === 'trial' && row.trial_ends_at
                          ? `Essai → ${new Date(row.trial_ends_at).toLocaleDateString('fr-FR')}`
                          : row.expires_at
                            ? new Date(row.expires_at).toLocaleDateString('fr-FR')
                            : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setForm({ businessId: row.business_id, planId: plans[0]?.id ?? '', days: '1', mode: 'mois', note: '' })}
                          className="btn-primary text-xs px-3 py-1.5"
                        >
                          Activer
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination total={filtered.length} page={page} onChange={setPage} />
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card p-6 w-full max-w-sm space-y-4">
            <h2 className="font-semibold text-white">Activer l'abonnement</h2>
            <div>
              <label className="label">Plan</label>
              <select value={form.planId} onChange={(e) => setForm((f) => f && { ...f, planId: e.target.value })} className="input">
                {plans.map((p) => <option key={p.id} value={p.id}>{p.label} — {p.price.toLocaleString('fr-FR')} {p.currency}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Durée</label>
              <div className="flex gap-2">
                <input type="number" value={form.days} onChange={(e) => setForm((f) => f && { ...f, days: e.target.value })} className="input flex-1" min={1} />
                <div className="flex rounded-xl border border-surface-border overflow-hidden shrink-0">
                  {(['jours', 'mois'] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setForm((f) => f && { ...f, mode: m })}
                      className={`px-3 py-2 text-sm font-medium transition-colors ${form.mode === m ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                = {form.mode === 'mois' ? `${(parseInt(form.days)||1)*30} jours` : `${parseInt(form.days)||0} jour${parseInt(form.days)>1?'s':''}`}
              </p>
            </div>
            <div>
              <label className="label">Note (optionnel)</label>
              <input type="text" value={form.note} onChange={(e) => setForm((f) => f && { ...f, note: e.target.value })} className="input" placeholder="Ex : Wave #REF123" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setForm(null)} className="btn-secondary px-5">Annuler</button>
              <button onClick={handleActivate} disabled={!!activating || !form.planId} className="btn-primary px-5 flex items-center gap-2">
                {activating && <Loader2 className="w-4 h-4 animate-spin" />} Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Onglet Plans ──────────────────────────────────────────────────────────────

function PlansTab() {
  const [plans, setPlans]     = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Plan> | null>(null);
  const [saving, setSaving]   = useState(false);

  async function load() {
    setLoading(true);
    try { setPlans(await getPlans()); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    try { await upsertPlan(editing); setEditing(null); await load(); }
    catch (e) { alert(String(e)); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setEditing({ name: '', label: '', price: 0, currency: 'XOF', duration_days: 30, features: [], is_active: true, sort_order: 0 })} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> Nouveau plan
        </button>
      </div>
      <div className="space-y-2">
        {plans.map((plan) => (
          <div key={plan.id} className="card p-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-white">{plan.label}</p>
                {!plan.is_active && <span className="text-xs text-slate-500 border border-slate-700 px-1.5 py-0.5 rounded">Inactif</span>}
              </div>
              <p className="text-sm text-brand-400">{plan.price.toLocaleString('fr-FR')} {plan.currency} / {plan.duration_days}j</p>
              <p className="text-xs text-slate-500 mt-0.5">{plan.features.join(' · ')}</p>
            </div>
            <button onClick={() => setEditing({ ...plan })} className="btn-secondary p-2"><Pencil className="w-4 h-4" /></button>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="font-semibold text-white">{editing.id ? 'Modifier le plan' : 'Nouveau plan'}</h2>
            {[
              { field: 'label', label: 'Nom affiché', type: 'text' },
              { field: 'name', label: 'Identifiant', type: 'text' },
              { field: 'price', label: 'Prix', type: 'number' },
              { field: 'currency', label: 'Devise', type: 'text' },
              { field: 'duration_days', label: 'Durée (jours)', type: 'number' },
              { field: 'sort_order', label: "Ordre d'affichage", type: 'number' },
            ].map(({ field, label, type }) => (
              <div key={field}>
                <label className="label">{label}</label>
                <input type={type} value={(editing as Record<string, unknown>)[field] as string ?? ''} onChange={(e) => setEditing((p) => p && ({ ...p, [field]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))} className="input" />
              </div>
            ))}
            <div>
              <label className="label">Fonctionnalités (une par ligne)</label>
              <textarea value={(editing.features ?? []).join('\n')} onChange={(e) => setEditing((p) => p && ({ ...p, features: e.target.value.split('\n').filter(Boolean) }))} className="input min-h-[80px] resize-y" />
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={editing.is_active ?? true} onChange={(e) => setEditing((p) => p && ({ ...p, is_active: e.target.checked }))} className="w-4 h-4 accent-brand-500" />
              <span className="text-sm text-white">Plan actif</span>
            </label>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditing(null)} className="btn-secondary px-5">Annuler</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary px-5 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} <Save className="w-4 h-4" /> Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Onglet Paramètres paiement ────────────────────────────────────────────────

function PaymentTab() {
  const [, setSettings]   = useState<PaymentSettings | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState({ wave_qr_url: '', om_qr_url: '', whatsapp_number: '' });
  const [uploading, setUploading] = useState<'wave' | 'om' | null>(null);

  useEffect(() => {
    getPaymentSettings().then((s) => {
      setSettings(s);
      setForm({ wave_qr_url: s?.wave_qr_url ?? '', om_qr_url: s?.om_qr_url ?? '', whatsapp_number: s?.whatsapp_number ?? '' });
    }).finally(() => setLoading(false));
  }, []);

  async function handleUpload(type: 'wave' | 'om', file: File) {
    setUploading(type);
    try { const url = await uploadQrCode(type, file); setForm((f) => ({ ...f, [`${type}_qr_url`]: url })); }
    catch (e) { alert(String(e)); }
    finally { setUploading(null); }
  }

  async function handleSave() {
    setSaving(true);
    try { await upsertPaymentSettings(form); setSettings({ ...form }); }
    catch (e) { alert(String(e)); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-400" /></div>;

  return (
    <div className="max-w-lg space-y-6">
      <div className="card p-5 space-y-4">
        <h3 className="font-semibold text-white">Numéro WhatsApp</h3>
        <div>
          <label className="label">Numéro (format international)</label>
          <input type="text" value={form.whatsapp_number} onChange={(e) => setForm((f) => ({ ...f, whatsapp_number: e.target.value }))} className="input" placeholder="+33746436801" />
        </div>
      </div>
      {([{ type: 'wave' as const, label: 'QR Code Wave', field: 'wave_qr_url' }, { type: 'om' as const, label: 'QR Code Orange Money', field: 'om_qr_url' }]).map(({ type, label, field }) => (
        <div key={type} className="card p-5 space-y-4">
          <h3 className="font-semibold text-white">{label}</h3>
          {(form as Record<string, string>)[field] && (
            <img src={(form as Record<string, string>)[field]} alt={label} className="w-40 h-40 object-contain rounded-xl border border-surface-border" />
          )}
          <label className="btn-secondary cursor-pointer flex items-center gap-2 w-fit text-sm">
            {uploading === type ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {(form as Record<string, string>)[field] ? "Remplacer l'image" : "Uploader l'image"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(type, e.target.files[0])} />
          </label>
        </div>
      ))}
      <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
        {saving && <Loader2 className="w-4 h-4 animate-spin" />} <Save className="w-4 h-4" /> Enregistrer les paramètres
      </button>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function BackofficePage() {
  const [tab, setTab]     = useState<Tab>('demandes');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    getPlans().then(setPlans).catch(() => {});
    Promise.all([
      getSubscriptionRequests().catch(() => []),
      getPublicSubscriptionRequests().catch(() => []),
    ]).then(([reqs, pub]) => {
      setPendingCount(
        reqs.filter((r) => r.status === 'pending').length +
        pub.filter((r) => r.status === 'pending').length
      );
    });
  }, []);

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: 'demandes',    label: 'Demandes',           badge: pendingCount },
    { id: 'abonnements', label: 'Abonnements'                             },
    { id: 'plans',       label: 'Plans & tarifs'                          },
    { id: 'paiement',    label: 'Paramètres paiement'                     },
  ];

  return (
    <div className="p-6 overflow-y-auto" style={{ height: 'calc(100vh - 57px)' }}>
      <div className="flex gap-1 bg-surface-input rounded-xl p-1 w-fit mb-6 flex-wrap">
        {TABS.map(({ id, label, badge }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === id ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            {label}
            {badge != null && badge > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'demandes'    && <RequestsTab plans={plans} />}
      {tab === 'abonnements' && <SubscriptionsTab plans={plans} />}
      {tab === 'plans'       && <PlansTab />}
      {tab === 'paiement'    && <PaymentTab />}
    </div>
  );
}
