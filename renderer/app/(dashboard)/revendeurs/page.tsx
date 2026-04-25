'use client';
import { toUserError } from '@/lib/user-error';

import { useState, useEffect } from 'react';
import {
  Plus, Search, Phone, MapPin, Users, Pencil, Trash2,
  ChevronRight, Check, Gift, Store, Upload, Loader2, Crown,
} from 'lucide-react';
import type { ResellerType } from '@services/supabase/resellers';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { ImportModal } from '@/components/resellers/ImportModal';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import {
  getResellers, createReseller, updateReseller, deleteReseller,
  getResellerClients, createResellerClient, updateResellerClient, deleteResellerClient,
  getResellerOffers, createResellerOffer, updateResellerOffer, deleteResellerOffer,
} from '@services/supabase/resellers';
import { supabase } from '@/lib/supabase';
import type { Reseller, ResellerClient, ResellerOffer } from '@services/supabase/resellers';
import type { Product } from '@pos-types';

const TYPE_LABELS: Record<ResellerType, string> = { gros: 'Gros', demi_gros: 'Demi-gros', detaillant: 'Détaillant' };
const TYPE_COLORS: Record<ResellerType, string> = {
  gros:      'bg-purple-500/10 text-purple-400 border-purple-500/30',
  demi_gros: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  detaillant:'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
};

type Tab = 'revendeurs' | 'offres';
type Panel = null | { type: 'reseller'; item: Reseller | null } | { type: 'client'; reseller: Reseller; item: ResellerClient | null };

export default function RevendeursPage() {
  const { business } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();

  const [tab, setTab]               = useState<Tab>('revendeurs');
  const [search, setSearch]         = useState('');
  const [resellers, setResellers]   = useState<Reseller[]>([]);
  const [selected, setSelected]     = useState<Reseller | null>(null);
  const [clients, setClients]       = useState<ResellerClient[]>([]);
  const [offers, setOffers]         = useState<ResellerOffer[]>([]);
  const [products, setProducts]     = useState<Product[]>([]);
  const [panel, setPanel]           = useState<Panel>(null);
  const [importType, setImportType] = useState<'resellers' | 'clients' | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [deletingClients, setDeletingClients] = useState(false);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);

  const [zoneFilter, setZoneFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<ResellerType | ''>('');

  // Formulaires
  const [rForm, setRForm] = useState<{
    name: string; phone: string; email: string; address: string;
    zone: string; notes: string; type: ResellerType; chef_id: string; is_active: boolean;
  }>({ name: '', phone: '', email: '', address: '', zone: '', notes: '', type: 'gros', chef_id: '', is_active: true });
  const [cForm, setCForm] = useState({ name: '', phone: '', address: '' });
  const [oForm, setOForm] = useState({ product_id: '', reseller_id: '' as string | null, min_qty: '', bonus_qty: '1', label: '', is_active: true });

  useEffect(() => {
    if (!business) return;
    load();
    loadProducts();
  }, [business]);

  useEffect(() => {
    if (selected) loadClients(selected.id);
  }, [selected]);

  async function load() {
    if (!business) return;
    setLoading(true);
    try {
      const [r, o] = await Promise.all([
        getResellers(business.id),
        getResellerOffers(business.id),
      ]);
      setResellers(r);
      setOffers(o);
      if (r.length > 0 && !selected) setSelected(r[0]);
    } catch (e) { notifError(toUserError(e)); }
    finally { setLoading(false); }
  }

  async function loadClients(resellerId: string) {
    try {
      setClients(await getResellerClients(resellerId));
    } catch (e) { notifError(toUserError(e)); }
  }

  async function loadProducts() {
    if (!business) return;
    const { data } = await supabase
      .from('products')
      .select('id, name, price, wholesale_price, unit')
      .eq('business_id', business.id)
      .eq('is_active', true)
      .order('name');
    setProducts((data ?? []) as unknown as Product[]);
  }

  // ── CRUD Revendeur ─────────────────────────────────────────────────────────

  function openResellerPanel(item: Reseller | null) {
    setRForm(item
      ? { name: item.name, phone: item.phone ?? '', email: item.email ?? '', address: item.address ?? '', zone: item.zone ?? '', notes: item.notes ?? '', type: item.type ?? 'gros', chef_id: item.chef_id ?? '', is_active: item.is_active }
      : { name: '', phone: '', email: '', address: '', zone: '', notes: '', type: 'gros', chef_id: '', is_active: true }
    );
    setPanel({ type: 'reseller', item });
  }

  async function saveReseller() {
    if (!business || !rForm.name.trim()) return;
    setSaving(true);
    try {
      const payload = { ...rForm, chef_id: rForm.chef_id || null };
      if (panel?.type === 'reseller' && panel.item) {
        const updated = await updateReseller(panel.item.id, payload);
        setResellers((prev) => prev.map((r) => r.id === updated.id ? updated : r));
        if (selected?.id === updated.id) setSelected(updated);
        success('Revendeur mis à jour');
      } else {
        const created = await createReseller(business.id, payload);
        setResellers((prev) => [...prev, created]);
        setSelected(created);
        success('Revendeur créé');
      }
      setPanel(null);
    } catch (e) { notifError(toUserError(e)); }
    finally { setSaving(false); }
  }

  async function removeReseller(id: string) {
    if (!confirm('Supprimer ce revendeur et tous ses clients ?')) return;
    try {
      await deleteReseller(id);
      setResellers((prev) => prev.filter((r) => r.id !== id));
      if (selected?.id === id) setSelected(resellers.find((r) => r.id !== id) ?? null);
      success('Revendeur supprimé');
    } catch (e) { notifError(toUserError(e)); }
  }

  // ── CRUD Client ────────────────────────────────────────────────────────────

  function openClientPanel(reseller: Reseller, item: ResellerClient | null) {
    setCForm(item ? { name: item.name, phone: item.phone ?? '', address: item.address ?? '' } : { name: '', phone: '', address: '' });
    setPanel({ type: 'client', reseller, item });
  }

  async function saveClient() {
    if (!business || panel?.type !== 'client' || !cForm.name.trim()) return;
    setSaving(true);
    try {
      if (panel.item) {
        const updated = await updateResellerClient(panel.item.id, cForm);
        setClients((prev) => prev.map((c) => c.id === updated.id ? updated : c));
        success('Client mis à jour');
      } else {
        const created = await createResellerClient(panel.reseller.id, business.id, cForm);
        setClients((prev) => [...prev, created]);
        success('Client ajouté');
      }
      setPanel(null);
    } catch (e) { notifError(toUserError(e)); }
    finally { setSaving(false); }
  }

  async function removeClient(id: string) {
    if (!confirm('Supprimer ce client ?')) return;
    try {
      await deleteResellerClient(id);
      setClients((prev) => prev.filter((c) => c.id !== id));
      setSelectedClientIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
      success('Client supprimé');
    } catch (e) { notifError(toUserError(e)); }
  }

  async function removeSelectedClients() {
    if (selectedClientIds.size === 0) return;
    if (!confirm(`Supprimer ${selectedClientIds.size} client(s) ?`)) return;
    setDeletingClients(true);
    try {
      await Promise.all([...selectedClientIds].map((id) => deleteResellerClient(id)));
      setClients((prev) => prev.filter((c) => !selectedClientIds.has(c.id)));
      setSelectedClientIds(new Set());
      success(`${selectedClientIds.size} client(s) supprimé(s)`);
    } catch (e) { notifError(toUserError(e)); }
    finally { setDeletingClients(false); }
  }

  function toggleClientSelect(id: string) {
    setSelectedClientIds((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  function toggleAllClients() {
    if (selectedClientIds.size === filteredClients.length && filteredClients.length > 0) {
      setSelectedClientIds(new Set());
    } else {
      setSelectedClientIds(new Set(filteredClients.map((c) => c.id)));
    }
  }

  // ── CRUD Offre ─────────────────────────────────────────────────────────────

  function openOfferPanel() {
    setOForm({ product_id: '', reseller_id: null, min_qty: '', bonus_qty: '1', label: '', is_active: true });
    setPanel({ type: 'reseller', item: null }); // réutilise panel mais on est sur tab offres
  }

  async function saveOffer() {
    if (!business || !oForm.product_id || !oForm.min_qty) return;
    setSaving(true);
    try {
      const created = await createResellerOffer(business.id, {
        product_id:  oForm.product_id,
        reseller_id: oForm.reseller_id || null,
        min_qty:     parseFloat(oForm.min_qty),
        bonus_qty:   parseFloat(oForm.bonus_qty) || 1,
        label:       oForm.label || null,
        is_active:   oForm.is_active,
      });
      setOffers((prev) => [created, ...prev]);
      setPanel(null);
      success('Offre créée');
    } catch (e) { notifError(toUserError(e)); }
    finally { setSaving(false); }
  }

  async function toggleOffer(offer: ResellerOffer) {
    try {
      const updated = await updateResellerOffer(offer.id, { is_active: !offer.is_active });
      setOffers((prev) => prev.map((o) => o.id === updated.id ? { ...o, is_active: updated.is_active } : o));
    } catch (e) { notifError(toUserError(e)); }
  }

  async function removeOffer(id: string) {
    if (!confirm('Supprimer cette offre ?')) return;
    try {
      await deleteResellerOffer(id);
      setOffers((prev) => prev.filter((o) => o.id !== id));
      success('Offre supprimée');
    } catch (e) { notifError(toUserError(e)); }
  }

  const zones = [...new Set(resellers.map((r) => r.zone).filter(Boolean))] as string[];

  const filteredResellers = resellers.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch = r.name.toLowerCase().includes(q) || (r.phone ?? '').includes(q);
    const matchZone   = !zoneFilter || r.zone === zoneFilter;
    const matchType   = !typeFilter || r.type === typeFilter;
    return matchSearch && matchZone && matchType;
  });

  const filteredClients = clients.filter((c) =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.phone ?? '').includes(clientSearch) ||
    (c.address ?? '').toLowerCase().includes(clientSearch.toLowerCase())
  );

  const isPanelOffer = tab === 'offres' && panel?.type === 'reseller' && panel.item === null && oForm.product_id !== undefined;

  return (
    <div className="h-full flex flex-col">
      {/* ── Header ── */}
      <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-content-primary">Revendeurs</h1>
          <p className="text-xs text-content-muted">{resellers.length} vendeur{resellers.length !== 1 ? 's' : ''} marché</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setTab('revendeurs'); setPanel(null); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === 'revendeurs' ? 'bg-brand-600 text-white' : 'btn-secondary'}`}
          >
            <Store className="w-4 h-4 inline mr-1.5" />Revendeurs
          </button>
          <button
            onClick={() => { setTab('offres'); setPanel(null); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === 'offres' ? 'bg-brand-600 text-white' : 'btn-secondary'}`}
          >
            <Gift className="w-4 h-4 inline mr-1.5" />Offres volume
          </button>
          <div className="h-8 w-px bg-surface-border self-center" />
          <button
            onClick={() => setImportType('resellers')}
            className="btn-secondary px-3 py-2 text-xs flex items-center gap-1.5 whitespace-nowrap"
            title="Importer revendeurs CSV"
          >
            <Upload className="w-3.5 h-3.5" /> Importer revendeurs
          </button>
          <button
            onClick={() => setImportType('clients')}
            className="btn-secondary px-3 py-2 text-xs flex items-center gap-1.5 whitespace-nowrap"
            title="Importer clients CSV"
          >
            <Upload className="w-3.5 h-3.5" /> Importer clients
          </button>
        </div>
      </div>

      {/* ── Tab Revendeurs ── */}
      {tab === 'revendeurs' && (
        <div className="flex flex-1 overflow-hidden">

          {/* Liste revendeurs */}
          <div className="w-64 border-r border-surface-border flex flex-col shrink-0">
            <div className="p-3 border-b border-surface-border space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-muted" />
                <input
                  className="input pl-8 h-8 text-sm"
                  placeholder="Chercher…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-1.5">
                <select
                  className="input h-7 text-xs flex-1 py-0"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as ResellerType | '')}
                >
                  <option value="">Tous types</option>
                  {(Object.keys(TYPE_LABELS) as ResellerType[]).map((t) => (
                    <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                  ))}
                </select>
                {zones.length > 0 && (
                  <select
                    className="input h-7 text-xs flex-1 py-0"
                    value={zoneFilter}
                    onChange={(e) => setZoneFilter(e.target.value)}
                  >
                    <option value="">Toutes zones</option>
                    {zones.map((z) => <option key={z} value={z}>{z}</option>)}
                  </select>
                )}
              </div>
              <button onClick={() => openResellerPanel(null)} className="btn-primary w-full h-8 text-sm flex items-center justify-center gap-1">
                <Plus className="w-3.5 h-3.5 shrink-0" /> Nouveau revendeur
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading && <p className="text-center text-content-muted text-sm py-8">Chargement…</p>}
              {filteredResellers.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className={`w-full text-left px-3 py-3 border-b border-surface-border transition-colors flex items-center gap-2
                    ${selected?.id === r.id ? 'bg-badge-brand' : 'hover:bg-surface-hover'}`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold
                    ${selected?.id === r.id ? 'bg-brand-600 text-white' : 'bg-surface-input text-content-brand'}`}>
                    {r.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-content-primary truncate">{r.name}</p>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${TYPE_COLORS[r.type ?? 'gros']}`}>
                        {TYPE_LABELS[r.type ?? 'gros']}
                      </span>
                      {r.zone && <span className="text-[9px] text-content-muted">{r.zone}</span>}
                      {r.chef_id && <Crown className="w-2.5 h-2.5 text-yellow-500" />}
                    </div>
                  </div>
                  {!r.is_active && <span className="text-xs text-status-warning shrink-0">Inactif</span>}
                  <ChevronRight className="w-3.5 h-3.5 text-content-muted shrink-0" />
                </button>
              ))}
              {!loading && filteredResellers.length === 0 && (
                <p className="text-center text-content-muted text-sm py-8">Aucun revendeur</p>
              )}
            </div>
          </div>

          {/* Détail revendeur sélectionné */}
          <div className="flex-1 overflow-y-auto p-6">
            {!selected ? (
              <div className="flex flex-col items-center justify-center h-full text-content-muted gap-3 text-center">
                <Store className="w-12 h-12 opacity-20" />
                {resellers.length === 0 ? (
                  <>
                    <p className="text-content-primary font-medium">Aucun revendeur enregistré</p>
                    <p className="text-sm max-w-xs">Créez votre premier revendeur pour commencer à gérer ses clients.</p>
                    <button onClick={() => openResellerPanel(null)} className="btn-primary flex items-center gap-2 mt-2">
                      <Plus className="w-4 h-4" /> Nouveau revendeur
                    </button>
                  </>
                ) : (
                  <p>Sélectionnez un revendeur</p>
                )}
              </div>
            ) : (
              <div className="max-w-2xl space-y-6">
                {/* Info revendeur */}
                <div className="card p-5 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-bold text-content-primary">{selected.name}</h2>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${TYPE_COLORS[selected.type ?? 'gros']}`}>
                        {TYPE_LABELS[selected.type ?? 'gros']}
                      </span>
                    </div>
                    {selected.phone && <p className="text-sm text-content-secondary flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{selected.phone}</p>}
                    {selected.zone && <p className="text-sm text-content-secondary flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />Zone : {selected.zone}</p>}
                    {selected.address && <p className="text-sm text-content-secondary flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{selected.address}</p>}
                    {selected.chef_id && (
                      <p className="text-sm text-yellow-500 flex items-center gap-1">
                        <Crown className="w-3.5 h-3.5" />Chef : {resellers.find((r) => r.id === selected.chef_id)?.name ?? '—'}
                      </p>
                    )}
                    {selected.notes && <p className="text-sm text-content-muted italic mt-1">{selected.notes}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => openResellerPanel(selected)} className="btn-secondary p-2">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => removeReseller(selected.id)} className="p-2 rounded-xl text-status-error hover:bg-badge-error transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Clients du revendeur */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-content-primary flex items-center gap-2">
                      <Users className="w-4 h-4 text-content-brand" />
                      Clients ({clients.length})
                    </h3>
                    <div className="flex items-center gap-2">
                      {selectedClientIds.size > 0 && (
                        <button
                          onClick={removeSelectedClients}
                          disabled={deletingClients}
                          className="h-8 text-xs px-3 flex items-center gap-1 rounded-lg bg-badge-error text-status-error hover:bg-badge-error transition-colors disabled:opacity-50"
                        >
                          {deletingClients
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                          Supprimer ({selectedClientIds.size})
                        </button>
                      )}
                      <button onClick={() => openClientPanel(selected, null)} className="btn-secondary h-8 text-xs px-3 flex items-center gap-1">
                        <Plus className="w-3.5 h-3.5 shrink-0" /> Ajouter
                      </button>
                    </div>
                  </div>

                  {clients.length > 0 && (
                    <div className="flex items-center gap-2 mb-3">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-muted" />
                        <input
                          className="input pl-8 h-8 text-sm w-full"
                          placeholder="Rechercher un client…"
                          value={clientSearch}
                          onChange={(e) => setClientSearch(e.target.value)}
                        />
                      </div>
                      <button
                        onClick={toggleAllClients}
                        className="h-8 text-xs px-3 btn-secondary shrink-0"
                        title={selectedClientIds.size === filteredClients.length && filteredClients.length > 0 ? 'Tout désélectionner' : 'Tout sélectionner'}
                      >
                        {selectedClientIds.size === filteredClients.length && filteredClients.length > 0 ? 'Désélect.' : 'Tout'}
                      </button>
                    </div>
                  )}

                  {clients.length === 0 && (
                    <p className="text-sm text-content-muted text-center py-6 card">Aucun client enregistré</p>
                  )}
                  {clients.length > 0 && filteredClients.length === 0 && (
                    <p className="text-sm text-content-muted text-center py-6 card">Aucun résultat</p>
                  )}

                  <div className="space-y-2">
                    {filteredClients.map((c) => {
                      const isChecked = selectedClientIds.has(c.id);
                      return (
                      <div
                        key={c.id}
                        onClick={() => toggleClientSelect(c.id)}
                        className={`card p-3 flex items-center gap-3 cursor-pointer transition-colors ${isChecked ? 'border border-brand-600 bg-badge-brand' : 'hover:bg-surface-hover'}`}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isChecked ? 'bg-brand-600 border-brand-600' : 'border-surface-border'}`}>
                          {isChecked && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="w-8 h-8 rounded-full bg-surface-input flex items-center justify-center shrink-0 text-xs font-bold text-content-primary">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-content-primary truncate">{c.name}</p>
                          {c.phone && <p className="text-xs text-content-muted">{c.phone}</p>}
                          {c.address && <p className="text-xs text-content-muted truncate">{c.address}</p>}
                        </div>
                        <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => openClientPanel(selected, c)} className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-hover">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => removeClient(c.id)} className="p-1.5 rounded-lg text-content-secondary hover:text-status-error hover:bg-badge-error">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab Offres volume ── */}
      {tab === 'offres' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-content-secondary">
                Offres automatiques déclenchées selon la quantité achetée
              </p>
              <button
                onClick={() => { setOForm({ product_id: '', reseller_id: null, min_qty: '', bonus_qty: '1', label: '', is_active: true }); setPanel({ type: 'reseller', item: null }); }}
                className="btn-primary h-9 text-sm flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4 shrink-0" /> Nouvelle offre
              </button>
            </div>

            {offers.length === 0 && (
              <div className="text-center py-12 text-content-muted card">
                <Gift className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p>Aucune offre volume configurée</p>
                <p className="text-xs mt-1">Ex : pour 100 cartons achetés → 1 offert</p>
              </div>
            )}

            {offers.map((o) => (
              <div key={o.id} className={`card p-4 flex items-center gap-4 ${!o.is_active ? 'opacity-50' : ''}`}>
                <div className="w-10 h-10 rounded-xl bg-badge-warning border border-status-warning flex items-center justify-center shrink-0">
                  <Gift className="w-5 h-5 text-status-warning" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-content-primary">
                    {o.product_name ?? 'Produit'} — {o.min_qty} → {o.bonus_qty} offert{o.bonus_qty > 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-content-muted">
                    {o.reseller_id ? (resellers.find((r) => r.id === o.reseller_id)?.name ?? 'Revendeur spécifique') : 'Tous les revendeurs'}
                    {o.label ? ` · ${o.label}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleOffer(o)}
                    className={`w-8 h-5 rounded-full transition-colors ${o.is_active ? 'bg-brand-600' : 'bg-surface-input'}`}
                  >
                    <span className={`block w-3.5 h-3.5 bg-white rounded-full shadow transition-transform mx-auto ${o.is_active ? 'translate-x-1.5' : '-translate-x-1.5'}`} />
                  </button>
                  <button onClick={() => removeOffer(o.id)} className="p-1.5 rounded-lg text-content-secondary hover:text-status-error hover:bg-badge-error">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Panneau : Revendeur ── */}
      <SideDrawer
        isOpen={!!panel && panel.type === 'reseller' && tab === 'revendeurs'}
        onClose={() => setPanel(null)}
        title={panel?.item ? 'Modifier revendeur' : 'Nouveau revendeur'}
        maxWidth="max-w-sm"
        footer={
          <button onClick={saveReseller} disabled={saving || !rForm.name.trim()} className="btn-primary w-full h-10">
            {saving ? 'Enregistrement…' : <><Check className="w-4 h-4 mr-2 inline" /> Enregistrer</>}
          </button>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Nom <span className="text-status-error">*</span></label>
            <input className="input" value={rForm.name} onChange={(e) => setRForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex : Modou Fall" />
          </div>

          {/* Type de vendeur */}
          <div>
            <label className="label">Type de vendeur <span className="text-status-error">*</span></label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(TYPE_LABELS) as [ResellerType, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRForm((f) => ({ ...f, type: key }))}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-colors ${
                    rForm.type === key
                      ? `${TYPE_COLORS[key]} border-current`
                      : 'border-surface-border text-content-muted hover:border-surface-hover'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Zone</label>
            <input className="input" value={rForm.zone} onChange={(e) => setRForm((f) => ({ ...f, zone: e.target.value }))} placeholder="Ex : Médina, Sandaga, Pikine…" list="zone-list" />
            <datalist id="zone-list">
              {zones.map((z) => <option key={z} value={z} />)}
            </datalist>
          </div>

          <div>
            <label className="label">Chef / Superviseur</label>
            <select className="input" value={rForm.chef_id} onChange={(e) => setRForm((f) => ({ ...f, chef_id: e.target.value }))}>
              <option value="">— Aucun chef assigné —</option>
              {resellers
                .filter((r) => !panel || panel.type !== 'reseller' || !panel.item || r.id !== panel.item.id)
                .map((r) => (
                  <option key={r.id} value={r.id}>{r.name} ({TYPE_LABELS[r.type ?? 'gros']})</option>
                ))}
            </select>
          </div>

          <div>
            <label className="label">Téléphone</label>
            <input className="input" value={rForm.phone} onChange={(e) => setRForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+221 77 000 00 00" />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={rForm.email} onChange={(e) => setRForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className="label">Adresse</label>
            <input className="input" value={rForm.address} onChange={(e) => setRForm((f) => ({ ...f, address: e.target.value }))} placeholder="Ex : Marché Sandaga, stand 12" />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input min-h-[80px] resize-none" value={rForm.notes} onChange={(e) => setRForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setRForm((f) => ({ ...f, is_active: !f.is_active }))}
              className={`w-10 h-6 rounded-full transition-colors ${rForm.is_active ? 'bg-brand-600' : 'bg-surface-input'}`}
            >
              <span className={`block w-4 h-4 bg-white rounded-full shadow mt-1 transition-transform ${rForm.is_active ? 'translate-x-5' : 'translate-x-1'}`} />
            </div>
            <span className="text-sm text-content-primary">Actif</span>
          </label>
        </div>
      </SideDrawer>

      {/* ── Panneau : Client revendeur ── */}
      <SideDrawer
        isOpen={!!panel && panel.type === 'client'}
        onClose={() => setPanel(null)}
        title={panel?.item ? 'Modifier client' : 'Ajouter un client'}
        maxWidth="max-w-sm"
        footer={
          <button onClick={saveClient} disabled={saving || !cForm.name.trim()} className="btn-primary w-full h-10">
            {saving ? 'Enregistrement…' : <><Check className="w-4 h-4 mr-2 inline" /> Enregistrer</>}
          </button>
        }
      >
        <div className="space-y-4">
          {panel?.type === 'client' && (
            <p className="text-xs text-content-muted">Client de <strong className="text-content-primary">{panel.reseller.name}</strong></p>
          )}
          <div>
            <label className="label">Nom <span className="text-status-error">*</span></label>
            <input className="input" value={cForm.name} onChange={(e) => setCForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex : Fatou Diop" autoFocus />
          </div>
          <div>
            <label className="label">Téléphone</label>
            <input className="input" value={cForm.phone} onChange={(e) => setCForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <label className="label">Adresse</label>
            <input className="input" value={cForm.address} onChange={(e) => setCForm((f) => ({ ...f, address: e.target.value }))} />
          </div>
        </div>
      </SideDrawer>

      {/* ── Modal Import CSV ── */}
      {importType && (
        <ImportModal
          businessId={business?.id ?? ''}
          resellers={resellers}
          type={importType}
          onClose={() => setImportType(null)}
          onDone={() => { load(); if (importType === 'clients' && selected) loadClients(selected.id); }}
        />
      )}

      {/* ── Panneau : Offre volume ── */}
      <SideDrawer
        isOpen={!!panel && panel.type === 'reseller' && panel.item === null && tab === 'offres'}
        onClose={() => setPanel(null)}
        title="Nouvelle offre volume"
        maxWidth="max-w-sm"
        footer={
          <button onClick={saveOffer} disabled={saving || !oForm.product_id || !oForm.min_qty} className="btn-primary w-full h-10">
            {saving ? 'Enregistrement…' : <><Check className="w-4 h-4 mr-2 inline" /> Créer l'offre</>}
          </button>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Produit <span className="text-status-error">*</span></label>
            <select className="input" value={oForm.product_id} onChange={(e) => setOForm((f) => ({ ...f, product_id: e.target.value }))}>
              <option value="">Choisir un produit…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Revendeur concerné</label>
            <select className="input" value={oForm.reseller_id ?? ''} onChange={(e) => setOForm((f) => ({ ...f, reseller_id: e.target.value || null }))}>
              <option value="">Tous les revendeurs</option>
              {resellers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Seuil (qté min) <span className="text-status-error">*</span></label>
              <input className="input" type="number" value={oForm.min_qty} onChange={(e) => setOForm((f) => ({ ...f, min_qty: e.target.value }))} placeholder="100" />
            </div>
            <div>
              <label className="label">Qté offerte</label>
              <input className="input" type="number" value={oForm.bonus_qty} onChange={(e) => setOForm((f) => ({ ...f, bonus_qty: e.target.value }))} placeholder="1" />
            </div>
          </div>
          <div>
            <label className="label">Libellé (optionnel)</label>
            <input className="input" value={oForm.label} onChange={(e) => setOForm((f) => ({ ...f, label: e.target.value }))} placeholder="Ex : 1 carton offert pour 100 achetés" />
          </div>
          {oForm.product_id && oForm.min_qty && (
            <div className="p-3 rounded-xl bg-badge-warning border border-status-warning text-sm text-status-warning">
              <Gift className="w-4 h-4 inline mr-1.5" />
              Pour {oForm.min_qty} {products.find((p) => p.id === oForm.product_id)?.name ?? '…'} achetés → <strong>{oForm.bonus_qty} offert{Number(oForm.bonus_qty) > 1 ? 's' : ''}</strong>
            </div>
          )}
        </div>
      </SideDrawer>
    </div>
  );
}
