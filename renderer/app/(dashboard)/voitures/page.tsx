'use client';
import { toUserError } from '@/lib/user-error';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Car, Users, Pencil, Trash2, Loader2, X,
  ImagePlus, Search, Share2, Copy, Check,
  Gauge, Fuel, Settings2, Palette, Printer,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { cn, displayCurrency } from '@/lib/utils';
// ... (omitting some imports for clarity in the tool call if needed, but I should provide enough context)
import { buildPublicBusinessRef } from '@services/supabase/public-business-ref';
import { logAction } from '@services/supabase/logger';
import {
  getVoitures, createVoiture, updateVoiture, deleteVoiture, uploadVoitureImage,
  recordVoitureVente,
  getLeads, updateLeadStatut, deleteLead,
  CARBURANT_LABELS, TRANSMISSION_LABELS, STATUT_CFG, LEAD_STATUT_CFG,
  type Voiture, type VoitureLead, type VoitureStatut, type LeadStatut,
  type Carburant, type Transmission,
} from '@services/supabase/voitures';
import { generateVoitureBonVente, printHtml } from '@/lib/invoice-templates';

// --- Types --------------------------------------------------------------------

type Tab = 'parc' | 'leads';

interface VoitureForm {
  marque:           string;
  modele:           string;
  annee:            string;
  prix:             string;
  kilometrage:      string;
  carburant:        Carburant | '';
  transmission:     Transmission | '';
  couleur:          string;
  description:      string;
  image_principale: string;
  statut:           VoitureStatut;
  owner_type:        'owned' | 'third_party';
  owner_name:        string;
  owner_phone:       string;
  commission_type:   'percent' | 'fixed';
  commission_value:  string;
}

const emptyForm = (): VoitureForm => ({
  marque: '', modele: '', annee: '', prix: '', kilometrage: '',
  carburant: '', transmission: '', couleur: '', description: '',
  image_principale: '', statut: 'disponible',
  owner_type: 'owned', owner_name: '', owner_phone: '', commission_type: 'percent', commission_value: '0',
});

function fmtPrice(n: number, currency: string) {
  return new Intl.NumberFormat('fr-FR').format(n) + ' ' + displayCurrency(currency);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function vehicleCommission(total: number, type: 'percent' | 'fixed', value: number) {
  const amount = type === 'fixed' ? value : total * (value / 100);
  return Math.min(total, Math.max(0, amount));
}

function getAppUrl() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

// --- Page ---------------------------------------------------------------------

export default function VoituresPage() {
  const { business }                     = useAuthStore();
  const { success, error: notifError }   = useNotificationStore();
  const currency                         = business?.currency ?? 'XOF';

  const [tab, setTab]               = useState<Tab>('parc');
  const [voitures, setVoitures]     = useState<Voiture[]>([]);
  const [leads, setLeads]           = useState<VoitureLead[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [copied, setCopied]         = useState(false);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing]       = useState<Voiture | null>(null);
  const [form, setForm]             = useState<VoitureForm>(emptyForm());
  const [saving, setSaving]         = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bonVenteVoiture, setBonVenteVoiture] = useState<Voiture | null>(null);

  const loadAll = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      const [v, l] = await Promise.all([
        getVoitures(business.id),
        getLeads(business.id),
      ]);
      setVoitures(v);
      setLeads(l);
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setLoading(false);
    }
  }, [business?.id, notifError]);

  useEffect(() => { loadAll(); }, [loadAll]);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm());
    setDrawerOpen(true);
  }

  function openEdit(v: Voiture) {
    setEditing(v);
    setForm({
      marque:           v.marque,
      modele:           v.modele,
      annee:            v.annee?.toString() ?? '',
      prix:             v.prix.toString(),
      kilometrage:      v.kilometrage?.toString() ?? '',
      carburant:        v.carburant ?? '',
      transmission:     v.transmission ?? '',
      couleur:          v.couleur ?? '',
      description:      v.description ?? '',
      image_principale: v.image_principale ?? '',
      statut:           v.statut,
      owner_type:        v.owner_type ?? 'owned',
      owner_name:        v.owner_name ?? '',
      owner_phone:       v.owner_phone ?? '',
      commission_type:   v.commission_type ?? 'percent',
      commission_value:  v.commission_value?.toString() ?? '0',
    });
    setDrawerOpen(true);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !business?.id) return;
    setUploading(true);
    try {
      const url = await uploadVoitureImage(business.id, file);
      setForm(f => ({ ...f, image_principale: url }));
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!business?.id) return;
    if (!form.marque.trim() || !form.modele.trim() || !form.prix) {
      notifError('Marque, modèle et prix sont obligatoires.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        marque:           form.marque.trim(),
        modele:           form.modele.trim(),
        annee:            form.annee ? parseInt(form.annee) : null,
        prix:             parseFloat(form.prix),
        kilometrage:      form.kilometrage ? parseInt(form.kilometrage) : null,
        carburant:        (form.carburant || null) as Carburant | null,
        transmission:     (form.transmission || null) as Transmission | null,
        couleur:          form.couleur.trim() || null,
        description:      form.description.trim() || null,
        image_principale: form.image_principale || null,
        statut:           form.statut,
        owner_type:        form.owner_type,
        owner_name:        form.owner_type === 'third_party' ? form.owner_name.trim() || null : null,
        owner_phone:       form.owner_type === 'third_party' ? form.owner_phone.trim() || null : null,
        commission_type:   form.commission_type,
        commission_value:  parseFloat(form.commission_value) || 0,
      };
      const becomesVendu = form.statut === 'vendu' && editing?.statut !== 'vendu';
      const label = `${payload.marque} ${payload.modele}`;

      if (editing) {
        await updateVoiture(editing.id, payload);
        logAction({ business_id: business.id, action: 'voiture.updated', entity_type: 'voiture', entity_id: editing.id, metadata: { label, statut: payload.statut } });
        if (becomesVendu) {
          await recordVoitureVente(business.id, { id: editing.id, marque: payload.marque, modele: payload.modele, annee: payload.annee, prix: payload.prix, owner_type: payload.owner_type, owner_name: payload.owner_name, commission_type: payload.commission_type, commission_value: payload.commission_value });
          logAction({ business_id: business.id, action: 'voiture.vendu', entity_type: 'voiture', entity_id: editing.id, metadata: { label, prix: payload.prix } });
        }
        success('Véhicule mis à jour');
      } else {
        const created = await createVoiture(business.id, payload);
        logAction({ business_id: business.id, action: 'voiture.created', entity_type: 'voiture', entity_id: created.id, metadata: { label, statut: payload.statut } });
        if (becomesVendu) {
          await recordVoitureVente(business.id, { id: created.id, marque: payload.marque, modele: payload.modele, annee: payload.annee, prix: payload.prix, owner_type: payload.owner_type, owner_name: payload.owner_name, commission_type: payload.commission_type, commission_value: payload.commission_value });
          logAction({ business_id: business.id, action: 'voiture.vendu', entity_type: 'voiture', entity_id: created.id, metadata: { label, prix: payload.prix } });
        }
        success('Véhicule ajouté');
      }
      setDrawerOpen(false);
      loadAll();
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const v = voitures.find(x => x.id === id);
      await deleteVoiture(id);
      if (v && business?.id) {
        logAction({ business_id: business.id, action: 'voiture.deleted', entity_type: 'voiture', entity_id: id, metadata: { label: `${v.marque} ${v.modele}` } });
      }
      success('Véhicule supprimé');
      loadAll();
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleLeadStatut(id: string, statut: LeadStatut) {
    try {
      await updateLeadStatut(id, statut);
      setLeads(prev => prev.map(l => l.id === id ? { ...l, statut } : l));
    } catch (err) {
      notifError(toUserError(err));
    }
  }

  async function handleDeleteLead(id: string) {
    try {
      await deleteLead(id);
      setLeads(prev => prev.filter(l => l.id !== id));
      success('Contact supprimé');
    } catch (err) {
      notifError(toUserError(err));
    }
  }

  function copyPublicLink() {
    if (!business) return;
    const ref  = buildPublicBusinessRef(business.name, (business as any).public_slug);
    const url  = `${getAppUrl()}/voitures/${ref}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function copyOwnerReportLink(v: Voiture) {
    if (!v.owner_report_token) return;
    const url = `${getAppUrl()}/proprietaire/vehicule/${v.owner_report_token}`;
    await navigator.clipboard.writeText(url);
    success('Lien proprietaire copie');
  }

  const filteredVoitures = voitures.filter(v => {
    const q = search.toLowerCase();
    return !q ||
      v.marque.toLowerCase().includes(q) ||
      v.modele.toLowerCase().includes(q) ||
      (v.couleur?.toLowerCase().includes(q) ?? false);
  });

  const stats = {
    total:      voitures.length,
    disponible: voitures.filter(v => v.statut === 'disponible').length,
    reserve:    voitures.filter(v => v.statut === 'reserve').length,
    vendu:      voitures.filter(v => v.statut === 'vendu').length,
    newLeads:   leads.filter(l => l.statut === 'nouveau').length,
    mandats:    voitures.filter(v => v.owner_type === 'third_party').length,
    commissions: voitures
      .filter(v => v.owner_type === 'third_party' && v.statut === 'vendu')
      .reduce((sum, v) => sum + vehicleCommission(v.prix, v.commission_type, v.commission_value), 0),
    aReverser: voitures
      .filter(v => v.owner_type === 'third_party' && v.statut === 'vendu')
      .reduce((sum, v) => sum + Math.max(0, v.prix - vehicleCommission(v.prix, v.commission_type, v.commission_value)), 0),
  };

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Header */}
      <div className="px-4 sm:px-8 py-5 border-b border-surface-border flex flex-col sm:flex-row sm:items-center gap-3 bg-surface-card shrink-0">
        <div className="flex-1">
          <h1 className="text-xl font-black text-content-primary uppercase tracking-tight">Vente de Voitures</h1>
          <p className="text-xs text-content-muted mt-0.5 font-medium uppercase tracking-widest">Parc automobile & contacts</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyPublicLink}
            className={cn(
              'flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl border transition-colors',
              copied
                ? 'bg-green-500/10 border-green-500/30 text-status-success'
                : 'border-surface-border text-content-secondary hover:text-content-primary hover:bg-surface-hover'
            )}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
            {copied ? 'Copié !' : 'Lien public'}
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Ajouter un véhicule</span>
            <span className="sm:hidden">Ajouter</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 sm:px-8 py-4 grid grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 shrink-0">
        {[
          { label: 'Total',       value: stats.total,      color: 'text-content-primary',  isPrice: false },
          { label: 'Disponible',  value: stats.disponible, color: 'text-status-success',   isPrice: false },
          { label: 'Réservé',     value: stats.reserve,    color: 'text-status-warning',   isPrice: false },
          { label: 'Vendu',       value: stats.vendu,      color: 'text-status-error',     isPrice: false },
          { label: 'Mandats',     value: stats.mandats,    color: 'text-content-brand',    isPrice: false },
          { label: 'À reverser',  value: fmtPrice(stats.aReverser, currency), color: 'text-status-warning', isPrice: true },
        ].map(({ label, value, color, isPrice }) => (
          <div key={label} className="bg-surface-card rounded-xl sm:rounded-2xl border border-surface-border p-2 sm:p-4 text-center">
            <p className={`font-black leading-tight ${color} ${isPrice ? 'text-xs sm:text-base lg:text-xl' : 'text-xl sm:text-2xl'}`}>
              {value}
            </p>
            <p className="text-[9px] sm:text-[11px] text-content-muted font-medium mt-0.5 uppercase tracking-wide">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="px-4 sm:px-8 flex gap-1 border-b border-surface-border shrink-0 bg-surface-card">
        {([
          { id: 'parc',  label: 'Parc auto',  badge: 0 },
          { id: 'leads', label: 'Contacts',   badge: stats.newLeads },
        ] as const).map(({ id, label, badge }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'relative px-4 py-3 text-sm font-bold transition-colors flex items-center gap-2',
              tab === id
                ? 'text-content-brand border-b-2 border-brand-500'
                : 'text-content-secondary hover:text-content-primary'
            )}
          >
            {label}
            {badge > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-content-muted" />
          </div>
        ) : tab === 'parc' ? (
          <ParcTab
            voitures={filteredVoitures}
            currency={currency}
            search={search}
            onSearch={setSearch}
            onEdit={openEdit}
            onDelete={handleDelete}
            deletingId={deletingId}
            onCopyOwnerReport={copyOwnerReportLink}
            onPrintBonVente={setBonVenteVoiture}
          />
        ) : (
          <LeadsTab
            leads={leads}
            onUpdateStatut={handleLeadStatut}
            onDelete={handleDeleteLead}
          />
        )}
      </div>

      {/* Bon de vente modal */}
      {bonVenteVoiture && (
        <BonVenteModal
          voiture={bonVenteVoiture}
          business={business as any}
          onClose={() => setBonVenteVoiture(null)}
        />
      )}

      {/* Add/Edit Drawer */}
      <SideDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? 'Modifier le véhicule' : 'Nouveau véhicule'}
        subtitle={editing ? `${editing.marque} ${editing.modele}` : undefined}
        closeOnBackdrop={false}
        footer={
          <div className="flex gap-3">
            <button
              onClick={() => setDrawerOpen(false)}
              className="flex-1 py-3 rounded-xl border border-surface-border text-content-secondary hover:bg-surface-hover font-bold transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white font-bold transition-colors flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editing ? 'Enregistrer' : 'Ajouter'}
            </button>
          </div>
        }
      >
        <VoitureForm
          form={form}
          onChange={(patch) => setForm(f => ({ ...f, ...patch }))}
          onImageUpload={handleImageUpload}
          uploading={uploading}
        />
      </SideDrawer>
    </div>
  );
}

// --- BonVenteModal ------------------------------------------------------------

function BonVenteModal({ voiture, business, onClose }: {
  voiture:  Voiture;
  business: { name: string; address?: string; phone?: string; logo_url?: string; currency?: string; receipt_footer?: string };
  onClose:  () => void;
}) {
  const [form, setForm] = useState({ buyer_name: '', buyer_phone: '', buyer_address: '', payment_method: 'cash' });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  function handlePrint() {
    if (!form.buyer_name.trim()) return;
    const html = generateVoitureBonVente({
      id:               voiture.id,
      sale_date:        new Date().toISOString().slice(0, 10),
      marque:           voiture.marque,
      modele:           voiture.modele,
      annee:            voiture.annee ?? null,
      couleur:          voiture.couleur ?? null,
      kilometrage:      voiture.kilometrage ?? null,
      carburant:        voiture.carburant ?? null,
      transmission:     voiture.transmission ?? null,
      description:      voiture.description ?? null,
      prix:             voiture.prix,
      owner_type:       voiture.owner_type ?? 'owned',
      owner_name:       voiture.owner_name ?? null,
      owner_phone:      voiture.owner_phone ?? null,
      commission_type:  voiture.commission_type ?? 'percent',
      commission_value: voiture.commission_value ?? 0,
      buyer_name:       form.buyer_name.trim(),
      buyer_phone:      form.buyer_phone.trim() || null,
      buyer_address:    form.buyer_address.trim() || null,
      payment_method:   form.payment_method,
    }, business as any);
    printHtml(html);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface-card rounded-2xl shadow-xl w-full max-w-sm flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-surface-border">
          <div>
            <h2 className="text-content-primary font-semibold">Bon de vente</h2>
            <p className="text-xs text-content-secondary mt-0.5">{voiture.marque} {voiture.modele}</p>
          </div>
          <button onClick={onClose} className="text-content-secondary hover:text-content-primary"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="label">Acheteur <span className="text-status-error">*</span></label>
            <input className="input" value={form.buyer_name} onChange={e => set('buyer_name', e.target.value)} placeholder="Nom complet" autoFocus />
          </div>
          <div>
            <label className="label">Téléphone</label>
            <input className="input" value={form.buyer_phone} onChange={e => set('buyer_phone', e.target.value)} placeholder="+221 77 000 00 00" />
          </div>
          <div>
            <label className="label">Adresse</label>
            <input className="input" value={form.buyer_address} onChange={e => set('buyer_address', e.target.value)} placeholder="Adresse de l'acheteur" />
          </div>
          <div>
            <label className="label">Mode de paiement</label>
            <select className="input" value={form.payment_method} onChange={e => set('payment_method', e.target.value)}>
              <option value="cash">Espèces</option>
              <option value="bank">Virement bancaire</option>
              <option value="check">Chèque</option>
              <option value="mobile">Mobile Money</option>
              <option value="card">Carte bancaire</option>
              <option value="partial">Paiement mixte</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          <button
            onClick={handlePrint}
            disabled={!form.buyer_name.trim()}
            className="flex-1 flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-xl transition-colors text-sm"
          >
            <Printer className="w-4 h-4" /> Imprimer
          </button>
        </div>
      </div>
    </div>
  );
}

// --- ParcTab ------------------------------------------------------------------

function ParcTab({
  voitures, currency, search, onSearch, onEdit, onDelete, deletingId, onCopyOwnerReport, onPrintBonVente,
}: {
  voitures:   Voiture[];
  currency:   string;
  search:     string;
  onSearch:   (s: string) => void;
  onEdit:     (v: Voiture) => void;
  onDelete:   (id: string) => void;
  deletingId: string | null;
  onCopyOwnerReport: (v: Voiture) => void;
  onPrintBonVente:   (v: Voiture) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="input pl-9 w-full"
          placeholder="Rechercher marque, modèle, couleur..."
        />
      </div>

      {voitures.length === 0 ? (
        <div className="py-16 text-center text-content-muted">
          <Car className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Aucun véhicule</p>
          <p className="text-sm mt-1">Ajoutez votre premier véhicule</p>
        </div>
      ) : (
        <div className="space-y-3">
          {voitures.map((v) => {
            const cfg = STATUT_CFG[v.statut];
            return (
              <div
                key={v.id}
                className="bg-surface-card rounded-2xl border border-surface-border overflow-hidden flex"
              >
                {v.image_principale ? (
                  <img src={v.image_principale} alt="" className="w-20 sm:w-28 h-20 sm:h-28 object-cover shrink-0" />
                ) : (
                  <div className="w-20 sm:w-28 h-20 sm:h-28 bg-surface-input flex items-center justify-center shrink-0">
                    <Car className="w-7 h-7 sm:w-9 sm:h-9 text-content-muted" />
                  </div>
                )}
                <div className="flex-1 p-2.5 sm:p-3 min-w-0 flex flex-col justify-between">
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="min-w-0">
                      <p className="font-bold text-content-primary text-sm truncate">
                        {v.marque} {v.modele} {v.annee ? `(${v.annee})` : ''}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {v.kilometrage != null && (
                          <span className="flex items-center gap-0.5 text-[10px] text-content-secondary">
                            <Gauge className="w-2.5 h-2.5" />{v.kilometrage.toLocaleString('fr-FR')} km
                          </span>
                        )}
                        {v.carburant && (
                          <span className="flex items-center gap-0.5 text-[10px] text-content-secondary">
                            <Fuel className="w-2.5 h-2.5" />{CARBURANT_LABELS[v.carburant]}
                          </span>
                        )}
                        {v.transmission && (
                          <span className="flex items-center gap-0.5 text-[10px] text-content-secondary">
                            <Settings2 className="w-2.5 h-2.5" />{TRANSMISSION_LABELS[v.transmission]}
                          </span>
                        )}
                        {v.couleur && (
                          <span className="flex items-center gap-0.5 text-[10px] text-content-secondary">
                            <Palette className="w-2.5 h-2.5" />{v.couleur}
                          </span>
                        )}
                      </div>
                      {v.owner_type === 'third_party' && (
                        <p className="text-[10px] text-content-brand font-bold mt-1 truncate">
                          Mandat: {v.owner_name ?? 'proprietaire tiers'} - commission {v.commission_type === 'percent' ? `${v.commission_value}%` : fmtPrice(v.commission_value, currency)}
                        </p>
                      )}
                    </div>
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="font-black text-content-primary text-sm">{fmtPrice(v.prix, currency)}</p>
                    <div className="flex items-center gap-1">
                      {v.owner_type === 'third_party' && v.owner_report_token && (
                        <button
                          onClick={() => onCopyOwnerReport(v)}
                          className="p-1.5 rounded-lg text-content-secondary hover:text-status-success hover:bg-green-500/10 transition-colors"
                          title="Copier le lien proprietaire"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => onPrintBonVente(v)}
                        className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-input transition-colors"
                        title="Imprimer bon de vente"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onEdit(v)}
                        className="p-1.5 rounded-lg text-content-secondary hover:text-content-brand hover:bg-brand-500/10 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDelete(v.id)}
                        disabled={deletingId === v.id}
                        className="p-1.5 rounded-lg text-content-secondary hover:text-status-error hover:bg-red-500/10 transition-colors disabled:opacity-50"
                      >
                        {deletingId === v.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- LeadsTab -----------------------------------------------------------------

function LeadsTab({
  leads, onUpdateStatut, onDelete,
}: {
  leads:           VoitureLead[];
  onUpdateStatut:  (id: string, s: LeadStatut) => void;
  onDelete:        (id: string) => void;
}) {
  if (leads.length === 0) {
    return (
      <div className="py-16 text-center text-content-muted">
        <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Aucun contact pour l'instant</p>
        <p className="text-sm mt-1">Les demandes du catalogue public apparaîtront ici</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {leads.map((lead) => {
        const cfg = LEAD_STATUT_CFG[lead.statut];
        return (
          <div key={lead.id} className="bg-surface-card rounded-2xl border border-surface-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-content-primary text-sm">{lead.nom}</p>
                  <a
                    href={`tel:${lead.telephone}`}
                    className="text-xs text-content-brand hover:underline font-medium"
                  >
                    {lead.telephone}
                  </a>
                </div>
                {lead.voitures && (
                  <p className="text-xs text-content-secondary mt-0.5">
                    {(lead.voitures as any).marque} {(lead.voitures as any).modele}
                    {(lead.voitures as any).annee ? ` (${(lead.voitures as any).annee})` : ''}
                  </p>
                )}
                {lead.message && (
                  <p className="text-xs text-content-muted mt-1 line-clamp-2 italic">{lead.message}</p>
                )}
                <p className="text-[10px] text-content-muted mt-1">{fmtDate(lead.created_at)}</p>
              </div>
              <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.color}`}>
                {cfg.label}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-surface-border">
              {(['nouveau', 'contacte', 'converti'] as LeadStatut[]).map((s) => (
                <button
                  key={s}
                  onClick={() => onUpdateStatut(lead.id, s)}
                  className={cn(
                    'flex-1 text-[10px] font-bold py-1.5 rounded-lg transition-colors border',
                    lead.statut === s
                      ? 'bg-brand-500/10 border-brand-500/30 text-content-brand'
                      : 'border-surface-border text-content-muted hover:text-content-primary hover:bg-surface-hover'
                  )}
                >
                  {LEAD_STATUT_CFG[s].label}
                </button>
              ))}
              <button
                onClick={() => onDelete(lead.id)}
                className="p-1.5 rounded-lg text-content-muted hover:text-status-error hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- VoitureForm --------------------------------------------------------------

function VoitureForm({
  form, onChange, onImageUpload, uploading,
}: {
  form:           VoitureForm;
  onChange:       (patch: Partial<VoitureForm>) => void;
  onImageUpload:  (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploading:      boolean;
}) {
  return (
    <div className="space-y-5">
      {/* Image */}
      <div>
        <label className="label">Photo du véhicule</label>
        <div className="mt-1.5">
          {form.image_principale ? (
            <div className="relative rounded-2xl overflow-hidden">
              <img src={form.image_principale} alt="preview" className="w-full h-48 object-cover" />
              <button
                onClick={() => onChange({ image_principale: '' })}
                className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-surface-border rounded-2xl cursor-pointer hover:border-brand-500/50 hover:bg-brand-500/5 transition-colors">
              {uploading ? (
                <Loader2 className="w-6 h-6 animate-spin text-content-muted" />
              ) : (
                <>
                  <ImagePlus className="w-8 h-8 text-content-muted mb-2" />
                  <span className="text-xs text-content-muted">Cliquez pour ajouter une photo</span>
                </>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={onImageUpload} disabled={uploading} />
            </label>
          )}
        </div>
      </div>

      {/* Marque + Modèle */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Marque *</label>
          <input
            value={form.marque}
            onChange={(e) => onChange({ marque: e.target.value })}
            className="input w-full mt-1.5"
            placeholder="Toyota, BMW..."
          />
        </div>
        <div>
          <label className="label">Modèle *</label>
          <input
            value={form.modele}
            onChange={(e) => onChange({ modele: e.target.value })}
            className="input w-full mt-1.5"
            placeholder="Corolla, X5..."
          />
        </div>
      </div>

      {/* Année + Prix */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Année</label>
          <input
            type="number"
            value={form.annee}
            onChange={(e) => onChange({ annee: e.target.value })}
            className="input w-full mt-1.5"
            placeholder="2020"
            min="1900"
            max={new Date().getFullYear() + 1}
          />
        </div>
        <div>
          <label className="label">Prix *</label>
          <input
            type="number"
            value={form.prix}
            onChange={(e) => onChange({ prix: e.target.value })}
            className="input w-full mt-1.5"
            placeholder="0"
            min="0"
          />
        </div>
      </div>

      {/* Kilométrage */}
      <div>
        <label className="label">Kilométrage</label>
        <input
          type="number"
          value={form.kilometrage}
          onChange={(e) => onChange({ kilometrage: e.target.value })}
          className="input w-full mt-1.5"
          placeholder="50 000"
          min="0"
        />
      </div>

      {/* Carburant + Transmission */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Carburant</label>
          <select
            value={form.carburant}
            onChange={(e) => onChange({ carburant: e.target.value as Carburant | '' })}
            className="input w-full mt-1.5"
          >
            <option value="">—</option>
            {(Object.entries(CARBURANT_LABELS) as [Carburant, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Transmission</label>
          <select
            value={form.transmission}
            onChange={(e) => onChange({ transmission: e.target.value as Transmission | '' })}
            className="input w-full mt-1.5"
          >
            <option value="">—</option>
            {(Object.entries(TRANSMISSION_LABELS) as [Transmission, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Couleur */}
      <div>
        <label className="label">Couleur</label>
        <input
          value={form.couleur}
          onChange={(e) => onChange({ couleur: e.target.value })}
          className="input w-full mt-1.5"
          placeholder="Blanc, Noir, Gris..."
        />
      </div>

      {/* Description */}
      <div>
        <label className="label">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className="input w-full mt-1.5 resize-none"
          rows={3}
          placeholder="Détails, équipements, état général..."
        />
      </div>

      <div className="pt-3 border-t border-surface-border space-y-3">
        <p className="text-xs font-semibold text-content-secondary uppercase tracking-wider">Proprietaire & commission</p>
        <div>
          <label className="label">Proprietaire du vehicule</label>
          <select
            value={form.owner_type}
            onChange={(e) => onChange({ owner_type: e.target.value as 'owned' | 'third_party' })}
            className="input w-full mt-1.5"
          >
            <option value="owned">Vehicule propre</option>
            <option value="third_party">Vehicule confie par un proprietaire</option>
          </select>
        </div>
        {form.owner_type === 'third_party' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Nom proprietaire</label>
                <input
                  value={form.owner_name}
                  onChange={(e) => onChange({ owner_name: e.target.value })}
                  className="input w-full mt-1.5"
                  placeholder="Nom complet"
                />
              </div>
              <div>
                <label className="label">Telephone</label>
                <input
                  value={form.owner_phone}
                  onChange={(e) => onChange({ owner_phone: e.target.value })}
                  className="input w-full mt-1.5"
                  placeholder="+221..."
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Type commission</label>
                <select
                  value={form.commission_type}
                  onChange={(e) => onChange({ commission_type: e.target.value as 'percent' | 'fixed' })}
                  className="input w-full mt-1.5"
                >
                  <option value="percent">Pourcentage</option>
                  <option value="fixed">Montant fixe</option>
                </select>
              </div>
              <div>
                <label className="label">Commission</label>
                <input
                  type="number"
                  value={form.commission_value}
                  onChange={(e) => onChange({ commission_value: e.target.value })}
                  className="input w-full mt-1.5"
                  min="0"
                  placeholder={form.commission_type === 'percent' ? '10' : '50000'}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Statut */}
      <div>
        <label className="label">Statut</label>
        <div className="flex gap-2 mt-1.5">
          {(['disponible', 'reserve', 'vendu'] as VoitureStatut[]).map((s) => {
            const cfg = STATUT_CFG[s];
            return (
              <button
                key={s}
                onClick={() => onChange({ statut: s })}
                className={cn(
                  'flex-1 py-2 rounded-xl text-xs font-bold transition-colors border',
                  form.statut === s
                    ? `${cfg.color} border-transparent`
                    : 'border-surface-border text-content-muted hover:bg-surface-hover'
                )}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
