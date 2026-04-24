'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  Loader2, Plus, Pencil, Layers, Search, 
  Mail, LogIn, X, Save, Copy, Check as CheckIcon,
  Phone as PhoneIcon, Mail as MailIcon, ChevronLeft, ChevronRight,
  Building2
} from 'lucide-react';
import { toUserError } from '@/lib/user-error';
import { displayCurrency, cn } from '@/lib/utils';
import { 
  getAllOrganizationsAdmin, getUnassignedBusinesses,
  createOrganizationAdmin, updateOrganization, switchBusiness,
  type OrganizationWithBusinesses 
} from '@services/supabase/business';
import { createBusinessAdmin } from '@services/supabase/users';
import { SideDrawer } from '@/components/ui/SideDrawer';

const PAGE_SIZE = 12;

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

const getTypeBadge = (type: string) => {
  switch (type) {
    case 'hotel':      return 'bg-blue-500/10 text-status-info border-blue-500/20';
    case 'restaurant': return 'bg-orange-500/10 text-status-orange border-orange-500/20';
    case 'retail':     return 'bg-green-500/10 text-status-success border-green-500/20';
    case 'service':    return 'bg-purple-500/10 text-status-purple border-purple-500/20';
    default:           return 'bg-slate-500/10 text-content-secondary border-slate-500/20';
  }
};

export default function StructuresPage() {
  const [orgs, setOrgs]             = useState<OrganizationWithBusinesses[]>([]);
  const [unassigned, setUnassigned] = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [orgModal, setOrgModal]     = useState<'new' | OrganizationWithBusinesses | null>(null);
  const [adminModal, setAdminModal] = useState<any | null>(null);
  const [saving, setSaving]         = useState(false);
  const [switching, setSwitching]   = useState<string | null>(null);
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const [orgsData, unassignedData] = await Promise.all([
        getAllOrganizationsAdmin(),
        getUnassignedBusinesses(),
      ]);
      setOrgs(orgsData);
      setUnassigned(unassignedData);
    } catch (e) {
      alert(toUserError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSwitch = async (bizId: string) => {
    setSwitching(bizId);
    try {
      await switchBusiness(bizId);
      window.location.href = '/';
    } catch (e) { alert(toUserError(e)); setSwitching(null); }
  };

  const handleCreateOrg = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await createOrganizationAdmin({
        legal_name:   fd.get('legal_name') as string,
        denomination: fd.get('denomination') as string || undefined,
        rib:          fd.get('rib') as string || undefined,
        currency:     (fd.get('currency') as string) || 'XOF',
      });
      setOrgModal(null);
      await load();
    } catch (e) { alert(toUserError(e)); }
    finally { setSaving(false); }
  };

  const handleUpdateOrg = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!orgModal || orgModal === 'new') return;
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await updateOrganization(orgModal.id, {
        legal_name:   fd.get('legal_name') as string,
        denomination: fd.get('denomination') as string || undefined,
        rib:          fd.get('rib') as string || undefined,
      });
      setOrgModal(null);
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
        email:       fd.get('email') as string,
        password:    fd.get('password') as string,
        full_name:   fd.get('full_name') as string,
        role:        'owner',
      });
      setAdminModal(null);
      await load();
    } catch (e) { alert(toUserError(e)); }
    finally { setSaving(false); }
  };

  const filteredOrgs = useMemo(() => {
    const q = search.toLowerCase();
    return orgs.filter(o => 
      !search ||
      o.legal_name.toLowerCase().includes(q) ||
      (o.denomination && o.denomination.toLowerCase().includes(q)) ||
      (o.owner_email && o.owner_email.toLowerCase().includes(q)) ||
      o.businesses.some(b => b.name.toLowerCase().includes(q))
    ).sort((a, b) => a.legal_name.localeCompare(b.legal_name));
  }, [orgs, search]);

  const filteredUnassigned = useMemo(() => {
    const q = search.toLowerCase();
    return unassigned.filter(b => 
      !search ||
      b.name.toLowerCase().includes(q) ||
      (b.denomination && b.denomination.toLowerCase().includes(q))
    );
  }, [unassigned, search]);

  const totalPages = Math.ceil(filteredOrgs.length / PAGE_SIZE);
  const pagedOrgs = filteredOrgs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search]);

  // ── Render Drawer Footer ──
  const renderOrgFooter = () => (
    <div className="flex gap-4">
      <button type="button" onClick={() => setOrgModal(null)} className="btn-secondary flex-1 h-12 font-black uppercase tracking-widest text-xs">Annuler</button>
      <button form="org-form" type="submit" disabled={saving} className="btn-primary flex-1 h-12 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-xl shadow-brand-500/20">
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        {orgModal === 'new' ? 'Créer Organisation' : 'Sauvegarder'}
      </button>
    </div>
  );

  const renderAdminFooter = () => (
    <div className="flex gap-4">
      <button type="button" onClick={() => setAdminModal(null)} className="btn-secondary flex-1 h-12 font-black uppercase tracking-widest text-xs">Annuler</button>
      <button form="admin-form" type="submit" disabled={saving} className="btn-primary flex-1 h-12 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-xl shadow-brand-500/20">
        {saving && <Loader2 className="w-4 h-4 animate-spin" />} Créer le profil
      </button>
    </div>
  );

  return (
    <div className="p-8 space-y-8 pb-32">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-content-primary tracking-tight uppercase">Organisations</h1>
          <p className="text-content-muted text-sm mt-1">Gérez les entités légales et leurs établissements rattachés.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
            <input 
              type="text" 
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="bg-surface-card border border-surface-border rounded-xl pl-10 pr-4 h-11 text-sm focus:ring-1 focus:ring-brand-500 w-64 transition-all"
            />
          </div>
          <button 
            onClick={() => setOrgModal('new')}
            className="btn-primary h-11 px-6 flex items-center gap-2 shadow-lg shadow-brand-500/20"
          >
            <Plus className="w-5 h-5" />
            <span>Nouvelle Org</span>
          </button>
        </div>
      </div>

      {/* Architecture Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 rounded-3xl bg-brand-500/5 border border-brand-500/10 flex gap-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-500/10 flex items-center justify-center shrink-0">
            <Layers className="text-content-brand" size={24} />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-black text-content-primary uppercase tracking-widest">Organisations</p>
            <p className="text-[11px] text-content-secondary leading-relaxed">
              Représente l'<b>entité légale</b> (Raison sociale). C'est ici qu'est rattaché l'<b>abonnement unique</b> et les informations de facturation (RIB).
            </p>
          </div>
        </div>
        <div className="p-5 rounded-3xl bg-blue-500/5 border border-blue-500/10 flex gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center shrink-0">
            <Building2 size={24} className="text-status-info" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-black text-content-primary uppercase tracking-widest">Établissements</p>
            <p className="text-[11px] text-content-secondary leading-relaxed">
              Unités physiques rattachées (Restaurant, Boutique, Hôtel). Chaque site possède ses propres coordonnées, stocks et terminaux de vente.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-brand-500" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {pagedOrgs.map((org) => (
              <div key={org.id} className="card p-0 border-surface-border hover:border-brand-500/50 transition-all group relative overflow-hidden flex flex-col">
                <div className="absolute -top-4 -right-4 p-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                  <Layers className="w-24 h-24" />
                </div>

                <div className="p-6 flex-1 space-y-4">
                  <div className="flex items-start justify-between relative z-10">
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-[10px] font-black text-content-brand uppercase tracking-[0.15em]">Organisation</p>
                      <h3 className="text-lg font-black text-content-primary tracking-tight truncate">{org.legal_name}</h3>
                      {org.denomination && org.denomination !== org.legal_name && (
                        <p className="text-xs text-content-secondary italic truncate">{org.denomination}</p>
                      )}
                    </div>
                    <button
                      onClick={() => setOrgModal(org)}
                      className="p-2 rounded-lg hover:bg-surface-input text-content-secondary hover:text-content-primary transition-all shrink-0"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-2 py-3 border-y border-surface-border/50">
                    {org.owner_email && (
                      <div className="flex justify-between items-center group/info">
                        <span className="text-[10px] font-bold text-content-muted uppercase tracking-widest flex items-center gap-1">
                          <MailIcon className="w-2.5 h-2.5" /> Propriétaire
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-content-primary truncate max-w-[150px]">{org.owner_name ?? org.owner_email}</span>
                          <CopyButton text={org.owner_email} className="opacity-0 group-hover/info:opacity-100 scale-75" />
                        </div>
                      </div>
                    )}
                    {org.rib && (
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-content-muted uppercase tracking-widest">RIB</span>
                        <span className="text-[10px] font-mono text-content-secondary bg-surface-input px-2 py-1 rounded border border-surface-border truncate max-w-[150px]">
                          {org.rib}
                        </span>
                      </div>
                    )}
                  </div>

                  {org.businesses.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">
                        Établissements · {org.businesses.length}
                      </p>
                      {org.businesses.map((biz) => (
                        <div key={biz.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-surface-input border border-surface-border">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-content-primary truncate">{biz.name}</p>
                            <span className={`text-[10px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded border ${getTypeBadge(biz.type)}`}>
                              {biz.type}
                            </span>
                          </div>
                          <button
                            onClick={() => handleSwitch(biz.id)}
                            disabled={!!switching}
                            className="p-1.5 rounded-lg hover:bg-brand-500/10 text-content-brand hover:text-content-brand transition-all shrink-0"
                            title="Accéder"
                          >
                            {switching === biz.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="px-6 py-3 bg-surface-hover/50 border-t border-surface-border flex items-center justify-between">
                  <span className="text-[10px] font-bold text-content-muted uppercase tracking-widest">
                    {org.businesses.length} établissement{org.businesses.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-xs text-status-success font-bold">✅ {org.owner_name ? 'Assignée' : 'Sans owner'}</span>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-12">
              <button 
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="p-2 rounded-xl bg-surface-card border border-surface-border text-content-secondary hover:text-content-primary disabled:opacity-20 transition-all"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={cn(
                      "w-10 h-10 rounded-xl font-bold text-sm transition-all",
                      page === p ? "bg-brand-600 text-content-primary shadow-lg shadow-brand-500/20" : "bg-surface-card border border-surface-border text-content-muted hover:text-content-primary"
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button 
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
                className="p-2 rounded-xl bg-surface-card border border-surface-border text-content-secondary hover:text-content-primary disabled:opacity-20 transition-all"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {filteredUnassigned.length > 0 && (
            <div className="mt-16 space-y-6">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-black text-status-warning uppercase tracking-widest">Établissements orphelins</h2>
                <div className="h-px flex-1 bg-amber-500/20" />
                <span className="text-xs font-bold text-status-warning/50">{filteredUnassigned.length} orphelins</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredUnassigned.map((biz: any) => (
                  <div key={biz.id} className="card p-0 border-amber-500/20 hover:border-amber-500/40 transition-all group relative overflow-hidden flex flex-col">
                    <div className="p-6 flex-1 space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <span className={`text-[10px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-md border ${getTypeBadge(biz.type)}`}>{biz.type}</span>
                          <h3 className="text-lg font-black text-content-primary tracking-tight mt-1">{biz.name}</h3>
                          {biz.denomination && <p className="text-xs text-content-secondary italic">{biz.denomination}</p>}
                        </div>
                        <button onClick={() => handleSwitch(biz.id)} disabled={!!switching} className="p-2 rounded-lg hover:bg-brand-500/10 text-content-brand hover:text-content-brand transition-all shrink-0">
                          {switching === biz.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="px-6 py-4 bg-amber-500/5 border-t border-amber-500/20 flex items-center justify-between">
                      <span className="text-xs text-status-warning font-bold">⚠️ Sans organisation</span>
                      <button onClick={() => setAdminModal(biz)} className="text-[10px] font-black uppercase tracking-widest text-content-brand hover:text-content-brand transition-all flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500/5 border border-brand-500/10 hover:bg-brand-500/10">
                        <Plus className="w-3 h-3" /> Créer Admin
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── SideDrawers ── */}
      <SideDrawer
        isOpen={!!orgModal}
        onClose={() => setOrgModal(null)}
        title={orgModal === 'new' ? 'Nouvelle Organisation' : 'Modifier Organisation'}
        subtitle="Configuration de l'entité légale"
        footer={renderOrgFooter()}
      >
        <form id="org-form" onSubmit={orgModal === 'new' ? handleCreateOrg : handleUpdateOrg} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="label text-[10px] uppercase font-bold tracking-widest text-content-muted">Raison sociale *</label>
              <input name="legal_name" defaultValue={orgModal !== 'new' ? orgModal?.legal_name : ''} required className="input h-12" placeholder="Ex: SARL Le Gourmet Afrique" />
            </div>
            <div>
              <label className="label text-[10px] uppercase font-bold tracking-widest text-content-muted">Dénomination commerciale</label>
              <input name="denomination" defaultValue={orgModal !== 'new' ? orgModal?.denomination : ''} className="input h-12" placeholder="Ex: Restaurant Le Gourmet" />
            </div>
            <div>
              <label className="label text-[10px] uppercase font-bold tracking-widest text-content-muted">Devise de facturation</label>
              <select name="currency" defaultValue={orgModal !== 'new' ? orgModal?.currency : 'XOF'} className="input h-12">
                <option value="XOF">XOF — Franc CFA</option>
                <option value="EUR">EUR — Euro</option>
                <option value="USD">USD — Dollar US</option>
              </select>
            </div>
            <div>
              <label className="label text-[10px] uppercase font-bold tracking-widest text-content-muted">RIB / Coordonnées bancaires</label>
              <textarea name="rib" defaultValue={orgModal !== 'new' ? orgModal?.rib : ''} className="input min-h-[120px] py-4 text-xs font-mono leading-relaxed" placeholder="Saisir le RIB complet pour les factures..." />
            </div>
          </div>
        </form>
      </SideDrawer>

      <SideDrawer
        isOpen={!!adminModal}
        onClose={() => setAdminModal(null)}
        title="Créer Profil Admin"
        subtitle="Accès propriétaire à l'établissement"
        footer={renderAdminFooter()}
      >
        <form id="admin-form" onSubmit={handleCreateAdmin} className="space-y-6">
          <div className="p-5 rounded-2xl bg-brand-500/5 border border-brand-500/10 flex items-center gap-4 mb-2">
            <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0">
               <Layers className="text-content-brand" size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Établissement rattaché</p>
              <p className="text-sm font-bold text-content-primary">{adminModal?.name}</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="label text-[10px] uppercase font-bold tracking-widest text-content-muted">Nom complet</label>
              <input name="full_name" required className="input h-12" placeholder="Prénom et Nom" />
            </div>
            <div>
              <label className="label text-[10px] uppercase font-bold tracking-widest text-content-muted">Email de connexion</label>
              <input name="email" type="email" required className="input h-12" placeholder="admin@exemple.com" />
            </div>
            <div>
              <label className="label text-[10px] uppercase font-bold tracking-widest text-content-muted">Mot de passe provisoire</label>
              <input name="password" type="password" required className="input h-12" placeholder="••••••••" minLength={8} />
              <p className="text-[10px] text-content-muted mt-2 italic">L'utilisateur pourra changer son mot de passe après sa première connexion.</p>
            </div>
          </div>
        </form>
      </SideDrawer>
    </div>
  );
}
