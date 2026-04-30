'use client';

import { useEffect, useState } from 'react';
import { 
  Loader2, CheckCircle, Clock, XCircle, RefreshCw, 
  Smartphone, Search, ChevronLeft, ChevronRight, 
  Settings2, Zap, X, Trash2
} from 'lucide-react';
import { toUserError } from '@/lib/user-error';
import { displayCurrency, cn } from '@/lib/utils';
import { 
  getAllSubscriptions, activateSubscription, getPlans, deleteAccount,
  type SubscriptionRow, type Plan 
} from '@services/supabase/subscriptions';
import { getIntouchConfig, upsertIntouchConfig } from '@services/supabase/intouch';
import { SideDrawer } from '@/components/ui/SideDrawer';

const PAGE_SIZE = 25;

const STATUS_LABEL: Record<string, { label: string; color: string; icon: any }> = {
  active:  { label: 'Actif',   color: 'text-status-success bg-badge-success border-status-success',  icon: CheckCircle },
  trial:   { label: 'Essai',   color: 'text-status-warning bg-badge-warning border-status-warning',  icon: Clock       },
  expired: { label: 'Expiré',  color: 'text-status-error bg-badge-error border-status-error',        icon: XCircle     },
};

function getRowStatus(row: SubscriptionRow): string {
  if (row.status === 'active' && row.expires_at && new Date(row.expires_at) < new Date()) return 'expired';
  if (row.status === 'trial' && row.trial_ends_at && new Date(row.trial_ends_at) < new Date()) return 'expired';
  return row.status;
}

function Pagination({ total, page, onChange }: { total: number; page: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-surface-border text-sm text-content-muted font-bold uppercase tracking-widest">
      <span>{total} abonnements</span>
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

export default function SubscriptionsPage() {
  const [rows, setRows]             = useState<SubscriptionRow[]>([]);
  const [plans, setPlans]           = useState<Plan[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [activating, setActivating] = useState<string | null>(null);
  const [form, setForm]             = useState<{
    businessId: string; planId: string; days: string; mode: 'jours' | 'mois'; note: string;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [deleteConfirm, setDeleteConfirm] = useState<{ ownerId: string; businessId: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Intouch Config
  const [intouchForm, setIntouchForm] = useState<{
    businessId: string; partner_id: string; api_key: string; merchant_id: string; is_active: boolean;
  } | null>(null);
  const [intouchLoading, setIntouchLoading] = useState(false);
  const [intouchConfigs, setIntouchConfigs] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    try {
      const [subs, configs, plansData] = await Promise.all([
        getAllSubscriptions(),
        (async () => {
           const { data } = await (getIntouchConfig as any).supabase
            .from('intouch_configs_public')
            .select('business_id, is_active');
           const map: Record<string, boolean> = {};
           (data ?? []).forEach((c: any) => { map[c.business_id] = c.is_active; });
           return map;
        })().catch(() => ({})),
        getPlans()
      ]);
      setRows(subs);
      setIntouchConfigs(configs);
      setPlans(plansData);
    } catch { /* pas superadmin */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

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
        api_key:     config?.api_key ?? '', 
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
      load();
    } catch (e) { alert(toUserError(e)); }
    finally { setIntouchLoading(false); }
  }

  async function handleDeleteAccount() {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await deleteAccount(deleteConfirm.ownerId, deleteConfirm.businessId);
      setDeleteConfirm(null);
      await load();
    } catch (e) { alert(toUserError(e)); }
    finally { setDeleting(false); }
  }

  return (
    <div className="p-8 space-y-8 pb-32">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-content-primary tracking-tight uppercase">Clients & Abonnements</h1>
          <p className="text-content-muted text-sm mt-1">Gérez le cycle de vie de vos clients SaaS.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
            <input 
              type="text" 
              placeholder="Rechercher un client..."
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

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-brand-500" /></div>
      ) : (
        <div className="card overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-hover/50 border-b border-surface-border text-content-muted uppercase text-[10px] font-black tracking-widest">
                <tr>
                  <th className="text-left px-6 py-4 font-black">Propriétaire</th>
                  <th className="text-left px-6 py-4 font-black">Établissements</th>
                  <th className="text-left px-6 py-4 font-black">Plan</th>
                  <th className="text-left px-6 py-4 font-black">Statut</th>
                  <th className="text-left px-6 py-4 font-black">Échéance</th>
                  <th className="text-right px-6 py-4 font-black">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/50">
                {pageRows.map((row) => {
                  const st    = getRowStatus(row);
                  const badge = STATUS_LABEL[st] ?? STATUS_LABEL.expired;
                  const Icon  = badge.icon;
                  const bizList = Array.isArray(row.businesses) ? row.businesses : [];
                  return (
                    <tr key={row.owner_id ?? row.business_id} className="hover:bg-surface-hover/30 transition-colors group">
                      <td className="px-6 py-4">
                        <p className="font-black text-content-primary">{row.owner_name ?? '-'}</p>
                        <p className="text-xs text-content-muted">{row.owner_email ?? ''}</p>
                      </td>
                      <td className="px-6 py-4">
                        {bizList.length === 0 ? (
                          <p className="text-sm text-content-muted">{row.business_name ?? '-'}</p>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {bizList.map((b) => (
                              <span key={b.id} className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-surface-card text-content-secondary border border-surface-border">{b.name}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-content-primary font-bold">{row.plan_label ?? '-'}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border", badge.color)}>
                            <Icon className="w-3 h-3" /> {badge.label}
                          </span>
                          {intouchConfigs[row.business_id] && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-tighter border border-status-brand/30 bg-badge-brand text-content-brand">
                              <Smartphone className="w-2.5 h-2.5" /> Mobile-Pay
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-content-secondary text-xs font-medium">
                        {st === 'trial' && row.trial_ends_at
                          ? `Fin essai : ${new Date(row.trial_ends_at).toLocaleDateString('fr-FR')}`
                          : row.expires_at
                            ? new Date(row.expires_at).toLocaleDateString('fr-FR')
                            : '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openIntouch(row.business_id)}
                            className="p-2 rounded-xl bg-surface-card text-content-secondary hover:text-content-brand transition-all border border-surface-border shadow-sm"
                            title="Configurer Paiements"
                          >
                            <Settings2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setForm({ businessId: row.business_id, planId: plans[0]?.id ?? '', days: '1', mode: 'mois', note: '' })}
                            className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-brand-500/20 flex items-center gap-2 active:scale-95"
                          >
                            <Zap className="w-3.5 h-3.5" /> Activer
                          </button>
                          {st === 'expired' && row.owner_id && (
                            <button
                              onClick={() => setDeleteConfirm({ ownerId: row.owner_id!, businessId: row.business_id, name: row.business_name })}
                              className="p-2 rounded-xl bg-surface-card text-status-error/60 hover:text-status-error hover:bg-badge-error transition-all border border-surface-border shadow-sm"
                              title="Supprimer définitivement"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
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

      {/* -- SideDrawers -- */}

      {/* Intouch */}
      <SideDrawer
        isOpen={!!intouchForm}
        onClose={() => setIntouchForm(null)}
        title="Configuration Intouch"
        subtitle="Identifiants spécifiques à l'établissement"
        footer={
          <div className="flex gap-4">
            <button onClick={() => setIntouchForm(null)} className="btn-secondary flex-1 h-12 font-black uppercase tracking-widest text-xs">Annuler</button>
            <button onClick={handleSaveIntouch} disabled={intouchLoading} className="btn-primary flex-1 h-12 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-xl shadow-brand-500/20">
              {intouchLoading && <Loader2 size={16} className="animate-spin" />} Enregistrer
            </button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="p-4 rounded-2xl bg-orange-500/5 border border-orange-500/10 text-status-orange text-xs italic">
            Ces paramètres écrasent les configurations globales de passerelle pour cet établissement uniquement.
          </div>
          <div>
            <label className="label text-[10px] font-black uppercase tracking-widest text-content-muted">Partner ID</label>
            <input className="input h-12" value={intouchForm?.partner_id} onChange={e => setIntouchForm({...intouchForm!, partner_id: e.target.value})} placeholder="MY_PARTNER_ID" />
          </div>
          <div>
            <label className="label text-[10px] font-black uppercase tracking-widest text-content-muted">API Key</label>
            <input type="password" className="input h-12" value={intouchForm?.api_key} onChange={e => setIntouchForm({...intouchForm!, api_key: e.target.value})} placeholder="••••••••••••" />
          </div>
          <div>
            <label className="label text-[10px] font-black uppercase tracking-widest text-content-muted">Merchant ID</label>
            <input className="input h-12" value={intouchForm?.merchant_id} onChange={e => setIntouchForm({...intouchForm!, merchant_id: e.target.value})} placeholder="MY_MERCHANT_ID" />
          </div>
          <label className="flex items-center gap-3 p-4 rounded-2xl bg-surface-input border border-surface-border cursor-pointer group">
            <input type="checkbox" checked={intouchForm?.is_active} onChange={e => setIntouchForm({...intouchForm!, is_active: e.target.checked})} className="w-5 h-5 accent-brand-500" />
            <span className="text-xs font-black text-content-primary uppercase tracking-widest">Activer Intouch pour ce client</span>
          </label>
        </div>
      </SideDrawer>

      {/* Activation Abonnement */}
      <SideDrawer
        isOpen={!!form}
        onClose={() => setForm(null)}
        title="Activer l'abonnement"
        subtitle="Saisie manuelle d'une période de validité"
        footer={
          <div className="flex gap-4">
            <button onClick={() => setForm(null)} className="btn-secondary flex-1 h-12 font-black uppercase tracking-widest text-xs">Annuler</button>
            <button onClick={handleActivate} disabled={!!activating} className="btn-primary flex-1 h-12 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-xl shadow-brand-500/20">
              {activating && <Loader2 size={16} className="animate-spin" />} Confirmer Activation
            </button>
          </div>
        }
      >
        <div className="space-y-6">
          <div>
            <label className="label text-[10px] font-black uppercase tracking-widest text-content-muted">Choisir un Plan</label>
            <select value={form?.planId} onChange={(e) => setForm((f: any) => ({ ...f, planId: e.target.value }))} className="input h-12">
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.label} - {p.price.toLocaleString()} {displayCurrency(p.currency)}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label text-[10px] font-black uppercase tracking-widest text-content-muted">Durée</label>
              <input type="number" value={form?.days} onChange={(e) => setForm((f: any) => ({ ...f, days: e.target.value }))} className="input h-12" min={1} />
            </div>
            <div>
               <label className="label text-[10px] font-black uppercase tracking-widest text-content-muted">Unité</label>
               <div className="flex bg-surface-input rounded-xl p-1 h-12">
                  {(['jours', 'mois'] as const).map(m => (
                    <button key={m} onClick={() => setForm((f: any) => ({ ...f, mode: m }))} className={cn("flex-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all", form?.mode === m ? "bg-brand-600 text-content-primary shadow-lg" : "text-content-muted hover:text-content-primary")}>{m}</button>
                  ))}
               </div>
            </div>
          </div>
          <div>
            <label className="label text-[10px] font-black uppercase tracking-widest text-content-muted">Notes (Paiement, Réf...)</label>
            <textarea value={form?.note} onChange={(e) => setForm((f: any) => ({ ...f, note: e.target.value }))} className="input min-h-[100px] py-4" placeholder="Optionnel..." />
          </div>
        </div>
      </SideDrawer>

      {/* Suppression Définitive */}
      <SideDrawer
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Supprimer le client"
        subtitle="Action irréversible et totale"
        footer={
          <div className="flex gap-4">
            <button onClick={() => setDeleteConfirm(null)} className="btn-secondary flex-1 h-12 font-black uppercase tracking-widest text-xs">Annuler</button>
            <button onClick={handleDeleteAccount} disabled={deleting} className="btn-danger flex-1 h-12 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2">
              {deleting && <Loader2 size={16} className="animate-spin" />} Supprimer tout
            </button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-badge-error/50 border border-status-error/30 text-status-error flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-status-error flex items-center justify-center text-white shrink-0 shadow-lg">
              <Trash2 size={24} />
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-widest leading-tight">Attention</p>
              <p className="text-xs font-bold opacity-80 mt-0.5">La suppression est définitive et immédiate.</p>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-content-secondary leading-relaxed">
              Vous êtes sur le point de supprimer l'établissement <span className="font-black text-content-primary">"{deleteConfirm?.name}"</span> ainsi que le compte de son propriétaire.
            </p>
            
            <div className="p-4 rounded-xl bg-surface-hover/50 border border-surface-border space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-content-muted">Données supprimées :</p>
              <ul className="text-xs font-bold text-content-secondary space-y-1 list-disc pl-4">
                <li>Compte utilisateur Auth (accès révoqué)</li>
                <li>Profil et paramètres de l'établissement</li>
                <li>Catalogue produits et stocks</li>
                <li>Historique des ventes et paiements</li>
                <li>Données clients et fidélité</li>
                <li>Configuration de l'organisation légale</li>
              </ul>
            </div>
          </div>
        </div>
      </SideDrawer>
    </div>
  );
}
