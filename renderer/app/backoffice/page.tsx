'use client';

import { useEffect, useState } from 'react';
import {
  Loader2, CheckCircle, Clock, XCircle, RefreshCw,
  Upload, Save, Plus, Pencil, Eye, X,
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

  const pending       = rows.filter((r) => r.status === 'pending');
  const others        = rows.filter((r) => r.status !== 'pending');
  const publicPending = publicRows.filter((r) => r.status === 'pending');
  const publicOthers  = publicRows.filter((r) => r.status !== 'pending');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">
            {pending.length} demande{pending.length !== 1 ? 's' : ''} en attente
          </p>
        </div>
        <button onClick={load} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" /> Actualiser
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-400" /></div>
      ) : (
        <>
          {/* Demandes en attente */}
          {pending.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">En attente</h3>
              {pending.map((req) => (
                <RequestCard
                  key={req.id}
                  req={req}
                  processing={processing}
                  onPreview={setPreview}
                  onApprove={(r) => setApproveForm({
                    requestId: r.id,
                    businessId: r.business_id,
                    planId: r.plan_id ?? plans[0]?.id ?? '',
                    days: '1', mode: 'mois', note: '',
                  })}
                  onReject={(id, isPublic) => { setRejectId({ id, isPublic: !!isPublic }); setRejectNote(''); }}
                />
              ))}
            </div>
          )}

          {/* Prospects (demandes publiques en attente) */}
          {publicPending.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-amber-500 uppercase tracking-wider">Prospects (sans compte)</h3>
              {publicPending.map((req) => (
                <div key={req.id} className="card p-4 flex items-start gap-4">
                  {req.receipt_url ? (
                    <button onClick={() => setPreview(req.receipt_url!)}
                      className="relative shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-surface-border hover:opacity-80 transition-opacity group">
                      <img src={req.receipt_url} alt="reçu" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Eye className="w-5 h-5 text-white" />
                      </div>
                    </button>
                  ) : (
                    <div className="shrink-0 w-16 h-16 rounded-xl border border-surface-border bg-surface-input flex items-center justify-center">
                      <span className="text-xs text-slate-500 text-center leading-tight">Plan gratuit</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="font-medium text-white text-sm">{req.business_name}</p>
                    <p className="text-xs text-slate-400">{req.email}{req.phone ? ` · ${req.phone}` : ''}</p>
                    <p className="text-xs text-slate-500">
                      Plan : <span className="text-slate-300">{req.plan_label}</span>
                      {req.plan_price != null && <> · {req.plan_price.toLocaleString('fr-FR')} {req.plan_currency}</>}
                    </p>
                    {req.password && (
                      <p className="text-xs text-green-400">Mot de passe fourni</p>
                    )}
                    <p className="text-xs text-slate-500">
                      {new Date(req.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs border text-amber-400 bg-amber-900/20 border-amber-800">
                      En attente
                    </span>
                    <button
                      onClick={() => setApprovePublicForm({
                        req,
                        planId: req.plan_id ?? plans[0]?.id ?? '',
                        days: '1', mode: 'mois', note: '',
                      })}
                      disabled={!!processing}
                      className="px-3 py-1.5 text-xs rounded-lg border border-green-800 text-green-400 hover:bg-green-900/30 transition-colors"
                    >
                      Approuver
                    </button>
                    <button
                      onClick={() => { setRejectId({ id: req.id, isPublic: true }); setRejectNote(''); }}
                      disabled={!!processing}
                      className="px-3 py-1.5 text-xs rounded-lg border border-red-800 text-red-400 hover:bg-red-900/30 transition-colors"
                    >
                      Rejeter
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Demandes traitées */}
          {(others.length > 0 || publicOthers.length > 0) && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Traitées</h3>
              {others.map((req) => (
                <RequestCard key={req.id} req={req} processing={processing} onPreview={setPreview} />
              ))}
              {publicOthers.map((req) => (
                <div key={req.id} className="card p-4 flex items-center gap-4 opacity-60">
                  {req.receipt_url ? (
                    <img src={req.receipt_url} alt="reçu" className="w-12 h-12 object-cover rounded-lg border border-surface-border shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg border border-surface-border bg-surface-input shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{req.business_name}</p>
                    <p className="text-xs text-slate-500">{req.email}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${REQ_STATUS[req.status]?.color ?? REQ_STATUS.pending.color}`}>
                    {REQ_STATUS[req.status]?.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {rows.length === 0 && publicRows.length === 0 && (
            <p className="text-center text-slate-500 py-12">Aucune demande reçue</p>
          )}
        </>
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

function RequestCard({
  req, processing, onPreview, onApprove, onReject,
}: {
  req: SubscriptionRequest;
  processing: string | null;
  onPreview: (url: string) => void;
  onApprove?: (req: SubscriptionRequest) => void;
  onReject?: (id: string, isPublic?: boolean) => void;
}) {
  const badge = REQ_STATUS[req.status] ?? REQ_STATUS.pending;

  return (
    <div className="card p-4 flex items-start gap-4">
      {/* Miniature reçu */}
      <button
        onClick={() => onPreview(req.receipt_url)}
        className="relative shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-surface-border
                   hover:opacity-80 transition-opacity group"
      >
        <img src={req.receipt_url} alt="reçu" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity
                        flex items-center justify-center">
          <Eye className="w-5 h-5 text-white" />
        </div>
      </button>

      {/* Infos */}
      <div className="flex-1 min-w-0 space-y-1">
        <p className="font-medium text-white text-sm truncate">{req.business_name}</p>
        <p className="text-xs text-slate-400">
          Plan : <span className="text-slate-300">{req.plan_label}</span>
          {req.plan_price != null && (
            <> · {req.plan_price.toLocaleString('fr-FR')} {req.plan_currency}</>
          )}
        </p>
        <p className="text-xs text-slate-500">
          {new Date(req.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
        {req.note && <p className="text-xs text-slate-400 italic">"{req.note}"</p>}
      </div>

      {/* Statut + actions */}
      <div className="shrink-0 flex flex-col items-end gap-2">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${badge.color}`}>
          {badge.label}
        </span>

        {req.status === 'pending' && onApprove && onReject && (
          <div className="flex gap-2">
            <button
              onClick={() => onReject(req.id, false)}
              disabled={!!processing}
              className="px-3 py-1.5 text-xs rounded-lg border border-red-800 text-red-400
                         hover:bg-red-900/30 transition-colors disabled:opacity-50"
            >
              Rejeter
            </button>
            <button
              onClick={() => onApprove(req)}
              disabled={!!processing}
              className="btn-primary text-xs px-3 py-1.5"
            >
              {processing === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Approuver'}
            </button>
          </div>
        )}
      </div>
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

  const filtered = rows.filter((r) =>
    !search ||
    r.business_name.toLowerCase().includes(search.toLowerCase()) ||
    (r.owner_email ?? '').toLowerCase().includes(search.toLowerCase())
  );

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
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => {
            const st    = getRowStatus(row);
            const badge = STATUS_LABEL[st] ?? STATUS_LABEL.expired;
            const Icon  = badge.icon;
            return (
              <div key={row.business_id} className="card p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-surface-input border border-surface-border
                                flex items-center justify-center text-brand-400 font-bold shrink-0">
                  {row.business_name.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white text-sm truncate">{row.business_name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {row.owner_name ?? '—'} · {row.owner_email ?? '—'}
                  </p>
                  {row.payment_note && (
                    <p className="text-xs text-slate-400 mt-0.5 italic">"{row.payment_note}"</p>
                  )}
                </div>

                <div className="text-right shrink-0 space-y-1">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${badge.color}`}>
                    <Icon className="w-3 h-3" /> {badge.label}
                  </span>
                  {row.expires_at && (
                    <p className="text-xs text-slate-500">
                      Exp. {new Date(row.expires_at).toLocaleDateString('fr-FR')}
                    </p>
                  )}
                  {st === 'trial' && row.trial_ends_at && (
                    <p className="text-xs text-slate-500">
                      Essai → {new Date(row.trial_ends_at).toLocaleDateString('fr-FR')}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => setForm({ businessId: row.business_id, planId: plans[0]?.id ?? '', days: '1', mode: 'mois', note: '' })}
                  className="btn-primary text-sm px-4 shrink-0"
                >
                  Activer
                </button>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-center text-slate-500 py-12">Aucun abonnement trouvé</p>
          )}
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
    <div className="p-6 max-w-4xl mx-auto overflow-y-auto" style={{ height: 'calc(100vh - 57px)' }}>
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
