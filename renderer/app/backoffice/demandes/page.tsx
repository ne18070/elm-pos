'use client';

import { useEffect, useState, useMemo } from 'react';
import { 
  Loader2, CheckCircle, Clock, XCircle, RefreshCw, 
  Search, Eye, X, Copy, Check as CheckIcon,
  ChevronLeft, ChevronRight, Check
} from 'lucide-react';
import { toUserError } from '@/lib/user-error';
import { displayCurrency, cn } from '@/lib/utils';
import { 
  getSubscriptionRequests, approveSubscriptionRequest, rejectSubscriptionRequest,
  getPublicSubscriptionRequests, rejectPublicRequest, getPlans,
  type Plan 
} from '@services/supabase/subscriptions';
import { type SubscriptionRequest, type PublicSubscriptionRequest } from '@pos-types';
import { supabase } from '@/lib/supabase';
import { SideDrawer } from '@/components/ui/SideDrawer';

const PAGE_SIZE = 25;

const REQ_STATUS: Record<string, { label: string; color: string }> = {
  pending:  { label: 'En attente', color: 'text-status-warning bg-badge-warning border-status-warning' },
  approved: { label: 'Approuvée',  color: 'text-status-success bg-badge-success border-status-success' },
  rejected: { label: 'Rejetée',    color: 'text-status-error bg-badge-error border-status-error'       },
};

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className={cn("p-1 hover:bg-surface-input rounded transition-colors", className)} title="Copier">
      {copied ? <CheckIcon className="w-3 h-3 text-status-success" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function Pagination({ total, page, onChange }: { total: number; page: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-surface-border text-sm text-content-muted font-bold uppercase tracking-widest">
      <span>{total} demandes</span>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(page - 1)} disabled={page === 1}
          className="p-2 rounded-xl bg-surface-card border border-surface-border disabled:opacity-20 transition-all hover:text-content-primary">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-content-primary px-4">Page {page} / {pages}</span>
        <button onClick={() => onChange(page + 1)} disabled={page === pages}
          className="p-2 rounded-xl bg-surface-card border border-surface-border disabled:opacity-20 transition-all hover:text-content-primary">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function RequestsPage() {
  const [rows, setRows]           = useState<SubscriptionRequest[]>([]);
  const [publicRows, setPublicRows] = useState<PublicSubscriptionRequest[]>([]);
  const [plans, setPlans]         = useState<Plan[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [preview, setPreview]     = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectId, setRejectId]   = useState<{ id: string; isPublic: boolean } | null>(null);
  const [approveForm, setApproveForm] = useState<{
    requestId: string; businessId: string; planId: string;
    days: string; mode: 'jours' | 'mois'; note: string;
  } | null>(null);
  const [approvePublicForm, setApprovePublicForm] = useState<{
    req: any; planId: string;
    days: string; mode: 'jours' | 'mois'; note: string;
  } | null>(null);
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const [r, p, pl] = await Promise.all([
        getSubscriptionRequests().catch(() => [] as SubscriptionRequest[]),
        getPublicSubscriptionRequests().catch(() => [] as PublicSubscriptionRequest[]),
        getPlans().catch(() => [] as Plan[]),
      ]);
      setRows(r);
      setPublicRows(p);
      setPlans(pl);
    } finally { setLoading(false); }
  };
  
  useEffect(() => { load(); }, []);

  const onApprove = async () => {
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
  };

  const onApprovePublic = async () => {
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
          fullName:     (approvePublicForm.req as any).full_name,
          businessName: approvePublicForm.req.business_name,
          denomination: (approvePublicForm.req as any).denomination,
          planId:       approvePublicForm.planId,
          days:         totalDays,
          note:         approvePublicForm.note || undefined,
          planLabel:    approvePublicForm.req.plan_label ?? 'Pro',
          // Note: Le mot de passe n'est plus envoyé, l'API doit déclencher une invitation
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
  };

  const onReject = async () => {
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
  };

  const allRequests = useMemo(() => {
    const merged = [
      ...rows.map((r) => ({ ...r, isPublic: false as const })),
      ...publicRows.map((r) => ({ ...r, isPublic: true as const, business_id: '' })),
    ];
    const q = search.toLowerCase();
    return merged.filter(r => 
      !search || 
      r.business_name.toLowerCase().includes(q) || 
      ('email' in r && (r as PublicSubscriptionRequest).email.toLowerCase().includes(q)) ||
      ('full_name' in r && ((r as PublicSubscriptionRequest).full_name || '').toLowerCase().includes(q))
    ).sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [rows, publicRows, search]);

  const pendingCount = allRequests.filter((r) => r.status === 'pending').length;
  const pageRows = allRequests.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <div className="p-8 space-y-8 pb-32">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-content-primary tracking-tight uppercase">Demandes Clients</h1>
          <p className="text-content-secondary text-sm mt-1">Gérez les inscriptions et les validations de paiement.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
            <input 
              type="text" 
              placeholder="Rechercher une demande..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="bg-surface-card border border-surface-border rounded-xl pl-10 pr-4 h-11 text-sm focus:ring-1 focus:ring-brand-500 w-64 transition-all"
            />
          </div>
          <button onClick={load} className="btn-secondary h-11 px-4 flex items-center gap-2">
            <RefreshCw className={loading ? 'animate-spin' : ''} size={16} />
            <span>Actualiser</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-6 border-l-4 border-l-status-warning bg-badge-warning/50">
          <p className="text-[10px] font-black text-content-muted uppercase tracking-[0.2em]">En attente</p>
          <p className="text-3xl font-black text-content-primary mt-1">{pendingCount}</p>
        </div>
        <div className="card p-6 border-l-4 border-l-status-info bg-badge-info/50">
          <p className="text-[10px] font-black text-content-muted uppercase tracking-[0.2em]">Total</p>
          <p className="text-3xl font-black text-content-primary mt-1">{allRequests.length}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-brand-500" /></div>
      ) : (
        <div className="card overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-hover/50 border-b border-surface-border text-content-muted uppercase text-[10px] font-black tracking-widest">
                <tr>
                  <th className="text-left px-6 py-4 font-black">Établissement</th>
                  <th className="text-left px-6 py-4 font-black">Contact</th>
                  <th className="text-left px-6 py-4 font-black">Plan souhaité</th>
                  <th className="text-left px-6 py-4 font-black">Date</th>
                  <th className="text-left px-6 py-4 font-black">Type</th>
                  <th className="text-left px-6 py-4 font-black">Statut</th>
                  <th className="text-right px-6 py-4 font-black">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/50">
                {pageRows.map((req) => {
                  const badge = REQ_STATUS[req.status] ?? REQ_STATUS.pending;
                  return (
                    <tr key={req.id} className={cn("hover:bg-surface-hover/30 transition-colors", req.status !== 'pending' && "opacity-50")}>
                      <td className="px-6 py-4">
                        <p className="font-black text-content-primary leading-tight">{req.business_name}</p>
                        {'denomination' in req && (req as PublicSubscriptionRequest).denomination && (
                          <p className="text-[9px] text-content-muted font-bold uppercase mt-1 tracking-tighter italic">{ (req as PublicSubscriptionRequest).denomination }</p>
                        )}
                        {req.note && <p className="text-[10px] text-content-brand italic mt-1">&ldquo;{req.note}&rdquo;</p>}
                      </td>
                      <td className="px-6 py-4">
                        {'email' in req ? (
                          <div className="space-y-0.5 group">
                            <p className="font-bold text-content-primary">{(req as PublicSubscriptionRequest).full_name || '-'}</p>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-content-secondary font-medium">{(req as PublicSubscriptionRequest).email}</span>
                              <CopyButton text={(req as PublicSubscriptionRequest).email} className="opacity-0 group-hover:opacity-100 scale-75" />
                            </div>
                          </div>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4 text-content-secondary font-bold">
                        {req.plan_label ?? '-'}
                        {req.plan_price != null && (
                          <p className="text-[10px] text-content-muted font-bold">{req.plan_price.toLocaleString()} {displayCurrency(req.plan_currency ?? '')}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-content-secondary whitespace-nowrap">
                        <p className="text-xs font-bold text-content-primary/80">{new Date(req.created_at).toLocaleDateString('fr-FR')}</p>
                        <p className="text-[10px] font-medium">{new Date(req.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
                      </td>
                      <td className="px-6 py-4">
                        {req.isPublic 
                          ? <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border border-status-warning/30 bg-badge-warning text-status-warning">Prospect</span> 
                          : <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border border-status-info/30 bg-badge-info text-status-info">Compte</span>
                        }
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn("text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md border", badge.color)}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {req.receipt_url && (
                            <button onClick={() => setPreview(req.receipt_url!)} className="p-2 rounded-xl bg-surface-card text-content-secondary hover:text-content-primary transition-all border border-surface-border shadow-sm" title="Voir le reçu"><Eye size={16} /></button>
                          )}
                          {req.status === 'pending' && (
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={() => req.isPublic ? setApprovePublicForm({ req, planId: req.plan_id ?? plans[0]?.id ?? '', days: '1', mode: 'mois', note: '' }) : setApproveForm({ requestId: req.id, businessId: req.business_id, planId: req.plan_id ?? plans[0]?.id ?? '', days: '1', mode: 'mois', note: '' })}
                                className="bg-badge-success text-status-success hover:bg-status-success hover:text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95"
                              >
                                Approuver
                              </button>
                              <button 
                                onClick={() => setRejectId({ id: req.id, isPublic: req.isPublic })}
                                className="bg-badge-error text-status-error hover:bg-status-error hover:text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95"
                              >
                                Rejeter
                              </button>
                            </div>
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

      {/* 髫ｨ貂可髫ｨ貂可 SideDrawers 髫ｨ貂可髫ｨ貂可 */}
      
      {/* Approbation Compte Existant */}
      <SideDrawer
        isOpen={!!approveForm}
        onClose={() => setApproveForm(null)}
        title="Approuver la demande"
        subtitle="Activation d'un compte client existant"
        footer={
          <div className="flex gap-4">
            <button onClick={() => setApproveForm(null)} className="btn-secondary flex-1 h-12 font-black uppercase tracking-widest text-xs">Annuler</button>
            <button onClick={onApprove} disabled={!!processing} className="btn-primary flex-1 h-12 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-xl shadow-brand-500/20">
              {processing && <Loader2 size={16} className="animate-spin" />} Activer l'accès
            </button>
          </div>
        }
      >
        <div className="space-y-6">
          <div>
            <label className="label text-[10px] font-black uppercase tracking-widest text-content-muted">Choix du Plan</label>
            <select value={approveForm?.planId} onChange={(e) => setApproveForm((f: any) => ({ ...f, planId: e.target.value }))} className="input h-12">
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.label} ({p.price.toLocaleString()} {displayCurrency(p.currency)})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label text-[10px] font-black uppercase tracking-widest text-content-muted">Durée</label>
              <input type="number" value={approveForm?.days} onChange={(e) => setApproveForm((f: any) => ({ ...f, days: e.target.value }))} className="input h-12" min={1} />
            </div>
            <div>
               <label className="label text-[10px] font-black uppercase tracking-widest text-content-muted">Unité</label>
               <div className="flex bg-surface-input rounded-xl p-1 h-12">
                  {(['jours', 'mois'] as const).map(m => (
                    <button key={m} onClick={() => setApproveForm((f: any) => ({ ...f, mode: m }))} className={cn("flex-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all", approveForm?.mode === m ? "bg-brand-600 text-white shadow-lg" : "text-content-muted hover:text-content-secondary")}>{m}</button>
                  ))}
               </div>
            </div>
          </div>
          <div>
            <label className="label text-[10px] font-black uppercase tracking-widest text-content-muted">Note interne (Optionnel)</label>
            <textarea value={approveForm?.note} onChange={(e) => setApproveForm((f: any) => ({ ...f, note: e.target.value }))} className="input min-h-[100px] py-4" placeholder="Ex: Paiement Wave reçu le 21/04..." />
          </div>
        </div>
      </SideDrawer>

      {/* Approbation Prospect (Nouveau Compte) */}
      <SideDrawer
        isOpen={!!approvePublicForm}
        onClose={() => setApprovePublicForm(null)}
        title="Créer Nouveau Compte"
        subtitle="Validation d'un nouveau prospect"
        footer={
          <div className="flex gap-4">
            <button onClick={() => setApprovePublicForm(null)} className="btn-secondary flex-1 h-12 font-black uppercase tracking-widest text-xs">Annuler</button>
            <button onClick={onApprovePublic} disabled={!!processing} className="btn-primary flex-1 h-12 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-xl shadow-brand-500/20">
              {processing && <Loader2 size={16} className="animate-spin" />} Créer & Envoyer Accès
            </button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-brand-500/5 border border-brand-500/10">
            <p className="text-[10px] font-black text-content-muted uppercase tracking-widest mb-1">Prospect</p>
            <p className="text-sm font-bold text-content-primary">{approvePublicForm?.req.email}</p>
            <p className="text-xs text-content-muted mt-2 italic">
               Un compte sera créé pour cet email avec le mot de passe fourni ou généré.
            </p>
          </div>

          <div>
            <label className="label text-[10px] font-black uppercase tracking-widest text-content-muted">Plan</label>
            <select value={approvePublicForm?.planId} onChange={(e) => setApprovePublicForm((f: any) => ({ ...f, planId: e.target.value }))} className="input h-12">
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.label} ({p.price.toLocaleString()} {displayCurrency(p.currency)})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label text-[10px] font-black uppercase tracking-widest text-content-muted">Durée</label>
              <input type="number" value={approvePublicForm?.days} onChange={(e) => setApprovePublicForm((f: any) => ({ ...f, days: e.target.value }))} className="input h-12" min={1} />
            </div>
            <div>
               <label className="label text-[10px] font-black uppercase tracking-widest text-content-muted">Unité</label>
               <div className="flex bg-surface-input rounded-xl p-1 h-12">
                  {(['jours', 'mois'] as const).map(m => (
                    <button key={m} onClick={() => setApprovePublicForm((f: any) => ({ ...f, mode: m }))} className={cn("flex-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all", approvePublicForm?.mode === m ? "bg-brand-600 text-white shadow-lg" : "text-content-muted hover:text-content-secondary")}>{m}</button>
                  ))}
               </div>
            </div>
          </div>
        </div>
      </SideDrawer>

      {/* Rejet */}
      <SideDrawer
        isOpen={!!rejectId}
        onClose={() => setRejectId(null)}
        title="Rejeter la demande"
        subtitle="Action irréversible"
        footer={
          <div className="flex gap-4">
            <button onClick={() => setRejectId(null)} className="btn-secondary flex-1 h-12 font-black uppercase tracking-widest text-xs">Annuler</button>
            <button onClick={onReject} disabled={!!processing} className="btn-danger flex-1 h-12 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2">
              {processing && <Loader2 size={16} className="animate-spin" />} Confirmer Rejet
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-badge-error/50 border border-status-error/30 text-status-error flex items-center gap-3">
             <XCircle size={24} />
             <p className="text-sm font-bold leading-tight">La demande sera marquée comme rejetée et ne pourra plus être modifiée.</p>
          </div>
          <div>
            <label className="label text-[10px] font-black uppercase tracking-widest text-content-muted">Motif du rejet (Optionnel)</label>
            <textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} className="input min-h-[120px] py-4" placeholder="Ex: Reçu illisible ou non valide..." autoFocus />
          </div>
        </div>
      </SideDrawer>

      {/* Aperçu Reçu */}
      {preview && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 p-4 animate-in fade-in duration-300" onClick={() => setPreview(null)}>
          <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
             <img src={preview} alt="reçu" className="w-full h-auto rounded-3xl shadow-2xl border border-white/10" />
             <button onClick={() => setPreview(null)} className="absolute -top-4 -right-4 w-10 h-10 bg-red-600 rounded-full flex items-center justify-center text-white shadow-xl hover:bg-red-700 transition-colors"><X size={20} /></button>
          </div>
        </div>
      )}
      </div>
    </>
  );
}

