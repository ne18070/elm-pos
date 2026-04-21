'use client';
import { toUserError } from '@/lib/user-error';
import { displayCurrency } from '@/lib/utils';

import { useEffect, useState } from 'react';
import {
  Loader2, CheckCircle, Clock, XCircle, RefreshCw,
  Upload, Save, Plus, Pencil, Eye, X, ChevronLeft, ChevronRight, BarChart2, Layers, Megaphone,
  Smartphone
} from 'lucide-react';
import { MonitoringTab } from './components/MonitoringTab';
import { ModulesTab } from './components/ModulesTab';
import { MarketingTab } from './components/MarketingTab';
import { EmailTemplatesTab } from './components/EmailTemplatesTab';
import {
  getAllSubscriptions, activateSubscription,
  getPlans, getPaymentSettings, upsertPaymentSettings, upsertPlan,
  uploadQrCode, getSubscriptionRequests, approveSubscriptionRequest, rejectSubscriptionRequest,
  getPublicSubscriptionRequests, rejectPublicRequest,
  type SubscriptionRow, type Plan, type PaymentSettings,
  type SubscriptionRequest, type PublicSubscriptionRequest,
} from '@services/supabase/subscriptions';
import { supabase } from '@/lib/supabase';
import { getIntouchConfig, upsertIntouchConfig, type IntouchConfig } from '@services/supabase/intouch';
import { getAllOrganizations, createOrganization, updateBusiness } from '@services/supabase/business';
import { createBusinessAdmin } from '@services/supabase/users';

type Tab = 'monitoring' | 'demandes' | 'abonnements' | 'plans' | 'paiement' | 'modules' | 'marketing' | 'emails' | 'structures';

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
    } catch (e) { alert(toUserError(e)); }
    finally { setProcessing(null); }
  }

  async function handleApprovePublic() {
    if (!approvePublicForm) return;
    setProcessing(approvePublicForm.req.id);
    const totalDays = approvePublicForm.mode === 'mois'
      ? (parseInt(approvePublicForm.days) || 1) * 30
      : parseInt(approvePublicForm.days) || 30;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/approve-business', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          requestId:    approvePublicForm.req.id,
          email:        approvePublicForm.req.email,
          fullName:     approvePublicForm.req.full_name,
          password:     approvePublicForm.req.password ?? undefined,
          businessName: approvePublicForm.req.business_name,
          denomination: approvePublicForm.req.denomination,
          planId:       approvePublicForm.planId,
          days:         totalDays,
          note:         approvePublicForm.note || undefined,
          planLabel:    approvePublicForm.req.plan_label ?? 'Pro',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error ?? 'Erreur serveur');
      }
      setApprovePublicForm(null);
      await load();
    } catch (e) { alert(toUserError(e)); }
    finally { setProcessing(null); }
  }

  async function handleReject() {
    if (!rejectId) return;
    setProcessing(rejectId.id);
    try {
      if (rejectId.isPublic) {
        const pubReq = publicRows.find(r => r.id === rejectId.id);
        await rejectPublicRequest(rejectId.id, rejectNote || undefined, pubReq);
      } else {
        await rejectSubscriptionRequest(rejectId.id, rejectNote || undefined);
      }
      setRejectId(null);
      setRejectNote('');
      await load();
    } catch (e) { alert(toUserError(e)); }
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
                          <p className="text-xs text-slate-500">{req.plan_price.toLocaleString('fr-FR')} {displayCurrency(req.plan_currency ?? '')}</p>
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
                  <option key={p.id} value={p.id}>{p.label} — {p.price.toLocaleString('fr-FR')} {displayCurrency(p.currency)}</option>
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
                  <option key={p.id} value={p.id}>{p.label} — {p.price.toLocaleString('fr-FR')} {displayCurrency(p.currency)}</option>
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

  // Intouch Config
  const [intouchForm, setIntouchForm] = useState<{
    businessId: string; partner_id: string; api_key: string; merchant_id: string; is_active: boolean;
  } | null>(null);
  const [intouchLoading, setIntouchLoading] = useState(false);
  const [intouchConfigs, setIntouchConfigs] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    try {
      const [subs, configs] = await Promise.all([
        getAllSubscriptions(),
        (async () => {
           const { data } = await (getIntouchConfig as any).supabase
            .from('intouch_configs_public')
            .select('business_id, is_active');
           const map: Record<string, boolean> = {};
           (data ?? []).forEach((c: any) => { map[c.business_id] = c.is_active; });
           return map;
        })().catch(() => ({})),
      ]);
      setRows(subs);
      setIntouchConfigs(configs);
    } catch { /* pas superadmin */ }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search]);

  const q = search.toLowerCase();
  const filtered = rows.filter((r) =>
    !search ||
    r.business_name.toLowerCase().includes(q) ||
    (r.owner_email ?? '').toLowerCase().includes(q) ||
    (r.owner_name ?? '').toLowerCase().includes(q) ||
    (Array.isArray(r.businesses) && r.businesses.some((b) => b.name.toLowerCase().includes(q)))
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
    } catch (e) { alert(toUserError(e)); }
    finally { setActivating(null); }
  }

  async function openIntouch(businessId: string) {
    setIntouchLoading(true);
    try {
      const config = await getIntouchConfig(businessId) as any;
      setIntouchForm({
        businessId,
        partner_id:  config?.partner_id ?? '',
        api_key:     config?.api_key ?? '', // Only visible if superadmin has access to base table
        merchant_id: config?.merchant_id ?? '',
        is_active:   config?.is_active ?? false,
      });
    } catch (e) { alert(toUserError(e)); }
    finally { setIntouchLoading(false); }
  }

  async function handleSaveIntouch() {
    if (!intouchForm) return;
    setIntouchLoading(true);
    try {
      await upsertIntouchConfig(intouchForm.businessId, {
        partner_id:  intouchForm.partner_id,
        api_key:     intouchForm.api_key,
        merchant_id: intouchForm.merchant_id,
        is_active:   intouchForm.is_active,
      });
      setIntouchForm(null);
    } catch (e) { alert(toUserError(e)); }
    finally { setIntouchLoading(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom, email, établissement…"
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
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-surface-border text-xs text-slate-400 uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">Compte propriétaire</th>
                  <th className="text-left px-4 py-3 font-medium">Établissements</th>
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
                  const bizList = Array.isArray(row.businesses) ? row.businesses : [];
                  return (
                    <tr key={row.owner_id ?? row.business_id} className="hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{row.owner_name ?? '—'}</p>
                        <p className="text-xs text-slate-500">{row.owner_email ?? ''}</p>
                        {row.payment_note && <p className="text-xs text-slate-500 italic mt-0.5">&ldquo;{row.payment_note}&rdquo;</p>}
                      </td>
                      <td className="px-4 py-3">
                        {bizList.length === 0 ? (
                          <p className="text-sm text-slate-500">{row.business_name ?? '—'}</p>
                        ) : (
                          <div className="space-y-0.5">
                            {bizList.map((b) => (
                              <p key={b.id} className="text-xs text-slate-300">{b.name}</p>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{row.plan_label ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${badge.color}`}>
                            <Icon className="w-3 h-3" /> {badge.label}
                          </span>
                          {intouchConfigs[row.business_id] && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border border-brand-800 bg-brand-900/20 text-brand-400">
                              <Smartphone className="w-2.5 h-2.5" /> Mobile-Pay
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {st === 'trial' && row.trial_ends_at
                          ? `Essai → ${new Date(row.trial_ends_at).toLocaleDateString('fr-FR')}`
                          : row.expires_at
                            ? new Date(row.expires_at).toLocaleDateString('fr-FR')
                            : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openIntouch(row.business_id)}
                            className="btn-secondary text-[10px] px-2 py-1"
                          >
                            Intouch
                          </button>
                          <button
                            onClick={() => setForm({ businessId: row.business_id, planId: plans[0]?.id ?? '', days: '1', mode: 'mois', note: '' })}
                            className="btn-primary text-xs px-3 py-1.5"
                          >
                            Activer
                          </button>
                        </div>
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

      {/* Modal Intouch */}
      {intouchForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card p-6 w-full max-w-sm space-y-4">
            <h2 className="font-semibold text-white">Configuration Intouch</h2>
            <p className="text-xs text-slate-400 italic">Identifiants pour cet établissement spécifique.</p>

            <div>
              <label className="label">Partner ID</label>
              <input
                type="text"
                value={intouchForm.partner_id}
                onChange={(e) => setIntouchForm({ ...intouchForm, partner_id: e.target.value })}
                className="input"
                placeholder="Ex : MY_PARTNER_ID"
              />
            </div>

            <div>
              <label className="label">API Key</label>
              <input
                type="password"
                value={intouchForm.api_key}
                onChange={(e) => setIntouchForm({ ...intouchForm, api_key: e.target.value })}
                className="input"
                placeholder="••••••••••••"
              />
            </div>

            <div>
              <label className="label">Merchant ID</label>
              <input
                type="text"
                value={intouchForm.merchant_id}
                onChange={(e) => setIntouchForm({ ...intouchForm, merchant_id: e.target.value })}
                className="input"
                placeholder="Ex : MY_MERCHANT_ID"
              />
            </div>

            <label className="flex items-center gap-3 cursor-pointer py-2">
              <input
                type="checkbox"
                checked={intouchForm.is_active}
                onChange={(e) => setIntouchForm({ ...intouchForm, is_active: e.target.checked })}
                className="w-4 h-4 accent-brand-500"
              />
              <span className="text-sm text-white">Paiements Intouch activés</span>
            </label>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setIntouchForm(null)} className="btn-secondary px-5">Annuler</button>
              <button
                onClick={handleSaveIntouch}
                disabled={intouchLoading}
                className="btn-primary px-5 flex items-center gap-2"
              >
                {intouchLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card p-6 w-full max-w-sm space-y-4">
            <h2 className="font-semibold text-white">Activer l'abonnement</h2>
            <div>
              <label className="label">Plan</label>
              <select value={form.planId} onChange={(e) => setForm((f) => f && { ...f, planId: e.target.value })} className="input">
                {plans.map((p) => <option key={p.id} value={p.id}>{p.label} — {p.price.toLocaleString('fr-FR')} {displayCurrency(p.currency)}</option>)}
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
    catch (e) { alert(toUserError(e)); }
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
              <p className="text-sm text-brand-400">{plan.price.toLocaleString('fr-FR')} {displayCurrency(plan.currency)} / {plan.duration_days}j</p>
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
              { field: 'sort_order', label: "Ordre d'affichage", type: 'number' },
            ].map(({ field, label, type }) => (
              <div key={field}>
                <label className="label">{label}</label>
                <input type={type} value={(editing as Record<string, unknown>)[field] as string ?? ''} onChange={(e) => setEditing((p) => p && ({ ...p, [field]: type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))} className="input" />
              </div>
            ))}
            <div>
              <label className="label">Période de facturation</label>
              <div className="flex gap-2 mb-2">
                {[{ label: 'Mensuel', days: 30 }, { label: 'Annuel', days: 365 }].map(({ label, days }) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setEditing((p) => p && ({ ...p, duration_days: days }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors
                      ${editing.duration_days === days
                        ? 'bg-brand-600 border-brand-500 text-white'
                        : 'border-surface-border text-slate-400 hover:text-white'}`}>
                    {label} ({days}j)
                  </button>
                ))}
              </div>
              <input type="number" value={editing.duration_days ?? 30} onChange={(e) => setEditing((p) => p && ({ ...p, duration_days: parseFloat(e.target.value) || 30 }))} className="input" placeholder="Durée personnalisée en jours" />
            </div>
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

// ── Onglet Structures (Organisations) ─────────────────────────────────────────

function StructuresTab() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'new' | any | null>(null);
  const [adminModal, setAdminModal] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setOrgs(await getAllOrganizations()); }
    catch (e) { alert(toUserError(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await createOrganization({
        name: fd.get('name') as string,
        type: (fd.get('type') as any) || 'retail',
        denomination: fd.get('denomination') as string,
        rib: fd.get('rib') as string,
      });
      setModal(null);
      await load();
    } catch (e) { alert(toUserError(e)); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await updateBusiness(modal.id, {
        name: fd.get('name') as string,
        denomination: fd.get('denomination') as string,
        rib: fd.get('rib') as string,
      });
      setModal(null);
      await load();
    } catch (e) { alert(toUserError(e)); }
    finally { setSaving(false); }
  };

  const handleCreateAdmin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await createBusinessAdmin({
        business_id: adminModal.id,
        email:     fd.get('email') as string,
        password:  fd.get('password') as string,
        full_name: fd.get('full_name') as string,
        role:      'owner',
      });
      setAdminModal(null);
      await load();
    } catch (e) { alert(toUserError(e)); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-400" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2"><Layers className="w-5 h-5 text-brand-400" /> Gestion des Structures</h2>
        <button onClick={() => setModal('new')} className="btn-primary flex items-center gap-2 px-6"><Plus className="w-4 h-4" /> Nouvelle Structure</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {orgs.map(org => (
          <div key={org.id} className="card p-6 border-surface-border hover:border-brand-500/50 transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-20 transition-opacity">
              <Layers className="w-20 h-20" />
            </div>
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-400">
                <Layers className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setModal(org)} className="p-2 rounded-lg hover:bg-surface-input text-slate-400 hover:text-white transition-all"><Pencil className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="space-y-1 mb-6">
              <h3 className="text-lg font-black text-white tracking-tight">{org.name}</h3>
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{org.type}</p>
            </div>
            <div className="space-y-3 py-4 border-t border-surface-border">
              <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Dénomination</span><span className="text-sm text-slate-300 font-medium truncate max-w-[150px] text-right">{org.denomination || '—'}</span></div>
              <div className="flex justify-between items-center"><span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">RIB</span><span className="text-[10px] font-mono text-slate-400 bg-surface-input px-2 py-1 rounded border border-surface-border truncate max-w-[150px]">{org.rib || 'Non renseigné'}</span></div>
            </div>
            <div className="pt-4 border-t border-surface-border flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Propriétaire</span>
                <span className="text-xs text-white font-bold">{org.owner_id ? '✅ Assigné' : '⚠️ Non assigné'}</span>
              </div>
              {!org.owner_id && (
                <button onClick={() => setAdminModal(org)} className="text-[10px] font-black uppercase tracking-widest text-brand-400 hover:text-brand-300 transition-all flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500/5 border border-brand-500/10 hover:bg-brand-500/10"><Plus className="w-3 h-3" /> Créer Admin</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {(modal === 'new' || (modal && typeof modal === 'object')) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 animate-in fade-in duration-300">
          <div className="card w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-surface-border flex items-center justify-between bg-surface-hover">
              <h3 className="text-xl font-black text-white tracking-tight">{modal === 'new' ? 'NOUVELLE STRUCTURE' : 'MODIFIER STRUCTURE'}</h3>
              <button onClick={() => setModal(null)} className="p-2 hover:bg-surface-input rounded-xl text-slate-500 transition-colors"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={modal === 'new' ? handleCreate : handleUpdate} className="p-8 space-y-6">
              <div className="space-y-4">
                <div><label className="label">Nom commercial</label><input name="name" defaultValue={modal?.name} required className="input h-12" placeholder="Ex: Restaurant Le Gourmet" /></div>
                <div><label className="label">Dénomination sociale</label><input name="denomination" defaultValue={modal?.denomination} className="input h-12" placeholder="Ex: SARL Le Gourmet Afrique" /></div>
                <div><label className="label">RIB / Coordonnées bancaires</label><textarea name="rib" defaultValue={modal?.rib} className="input min-h-[100px] py-3" placeholder="Saisir le RIB complet..." /></div>
                {modal === 'new' && (
                  <div>
                    <label className="label">Type d'activité</label>
                    <select name="type" className="input h-12">
                      <option value="retail">Commerce de détail</option>
                      <option value="restaurant">Restaurant</option>
                      <option value="hotel">Hôtel</option>
                      <option value="service">Services</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setModal(null)} className="btn-secondary flex-1 h-12 font-black uppercase tracking-widest text-xs">Annuler</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 h-12 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} {modal === 'new' ? 'Créer la structure' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {adminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 animate-in fade-in duration-300">
          <div className="card w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-surface-border flex items-center justify-between bg-surface-hover">
              <h3 className="text-xl font-black text-white tracking-tight uppercase">CRÉER PROFIL ADMIN</h3>
              <button onClick={() => setAdminModal(null)} className="p-2 hover:bg-surface-input rounded-xl text-slate-500 transition-colors"><X className="w-6 h-6" /></button>
            </div>
            <div className="px-8 pt-6 pb-2">
              <div className="p-4 rounded-2xl bg-brand-500/5 border border-brand-500/10 flex items-center gap-4">
                <Layers className="w-10 h-10 text-brand-400 opacity-50" />
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Rattachement à</p>
                  <p className="text-sm font-bold text-white">{adminModal.name}</p>
                </div>
              </div>
            </div>
            <form onSubmit={handleCreateAdmin} className="p-8 space-y-6">
              <div className="space-y-4">
                <div><label className="label">Nom complet</label><input name="full_name" required className="input h-12" placeholder="Prénom et Nom" /></div>
                <div><label className="label">Email</label><input name="email" type="email" required className="input h-12" placeholder="admin@exemple.com" /></div>
                <div><label className="label">Mot de passe provisoire</label><input name="password" type="password" required className="input h-12" placeholder="••••••••" minLength={8} /></div>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setAdminModal(null)} className="btn-secondary flex-1 h-12 font-black uppercase tracking-widest text-xs">Annuler</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 h-12 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Créer le profil
                </button>
              </div>
            </form>
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
    catch (e) { alert(toUserError(e)); }
    finally { setUploading(null); }
  }

  async function handleSave() {
    setSaving(true);
    try { await upsertPaymentSettings(form); setSettings({ ...form }); }
    catch (e) { alert(toUserError(e)); }
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
  const [tab, setTab]     = useState<Tab>('structures');
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

  const TABS: { id: Tab; label: string; badge?: number; icon?: typeof BarChart2 }[] = [
    { id: 'structures',  label: 'Structures',          icon: Layers                   },
    { id: 'monitoring',  label: 'Monitoring',          icon: BarChart2                },
    { id: 'demandes',    label: 'Demandes',            badge: pendingCount            },
    { id: 'abonnements', label: 'Abonnements'                                         },
    { id: 'plans',       label: 'Plans & tarifs'                                      },
    { id: 'marketing',   label: 'Marketing',           icon: Megaphone                },
    { id: 'emails',      label: 'Templates email'                                     },
    { id: 'paiement',    label: 'Paramètres paiement'                                 },
    { id: 'modules',     label: 'Modules & Types', icon: Layers                       },
  ];

  return (
    <div className="p-6 overflow-y-auto" style={{ height: 'calc(100vh - 57px)' }}>
      <div className="flex gap-1 bg-surface-input rounded-xl p-1 w-fit mb-6 flex-wrap">
        {TABS.map(({ id, label, badge, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`relative flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${tab === id ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {label}
            {badge != null && badge > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'structures'  && <StructuresTab />}
      {tab === 'monitoring'  && <MonitoringTab />}
      {tab === 'demandes'    && <RequestsTab plans={plans} />}
      {tab === 'abonnements' && <SubscriptionsTab plans={plans} />}
      {tab === 'plans'       && <PlansTab />}
      {tab === 'marketing'   && <MarketingTab />}
      {tab === 'emails'      && <EmailTemplatesTab />}
      {tab === 'paiement'    && <PaymentTab />}
      {tab === 'modules'     && <ModulesTab />}
    </div>
  );
}
