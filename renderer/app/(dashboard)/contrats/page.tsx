'use client';
import { toUserError } from '@/lib/user-error';
import { displayCurrency } from '@/lib/utils';

import { useState, useEffect, useMemo } from 'react';
import {
  Plus, Car, FileText, Pencil, Trash2, X, Loader2,
  Send, Archive, Share2, CheckCircle, Clock, FileSignature,
  Download, Copy, Check, Banknote, AlertCircle, RefreshCw,
  ExternalLink, XCircle, Search, Filter,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useCan } from '@/hooks/usePermission';
import {
  getVehicles, toggleVehicleAvailability,
  getTemplates, deleteTemplate,
  getContracts, sendContract, archiveContract, cancelContract,
  type RentalVehicle, type ContractTemplate, type Contract,
} from '@services/supabase/contracts';
import { buildPublicBusinessRef } from '@services/supabase/public-business-ref';
import { triggerWhatsAppShare } from '@/lib/whatsapp-direct';

// Shared Components & Utils
import {
  STATUS_CFG, PAYMENT_STATUS_CFG, fmtDate, fmtMoney, fmtTime,
  getAppUrl, isClosedContract, paymentStatus, type Tab
} from './contract-utils';
import { Modal, ConfirmModal } from '@/components/ui/Modal';

// Split Panels
import { VehiclePanel } from './VehiclePanel';
import { TemplatePanel } from './TemplatePanel';
import { ContractFormPanel } from './ContractFormPanel';
import { ContractDetailPanel } from './ContractDetailPanel';

// ------ Local Components --------------------------------------------------------------------------------------------------------------------

function DashboardMetrics({ contracts }: { contracts: Contract[] }) {
  const metrics = useMemo(() => {
    const active = contracts.filter(c => c.status === 'active' || c.status === 'signed');
    const awaiting = contracts.filter(c => c.status === 'sent');
    const unpaid = contracts.filter(c => paymentStatus(c) !== 'paid' && !isClosedContract(c));
    const rentedVehicles = new Set(active.map(c => c.vehicle_id).filter(Boolean)).size;
    
    return [
      { label: 'Contrats actifs', value: active.length, icon: FileText, color: 'text-brand-500' },
      { label: 'Attente signature', value: awaiting.length, icon: Clock, color: 'text-blue-400' },
      { label: 'Paiements dus', value: unpaid.length, icon: Banknote, color: 'text-status-warning' },
      { label: 'Véhicules loués', value: rentedVehicles, icon: Car, color: 'text-status-success' },
    ];
  }, [contracts]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-4 mb-4 mt-2">
      {metrics.map((m) => (
        <div key={m.label} className="card p-3 flex items-center gap-3">
          <div className={`p-2 rounded-xl bg-surface-input ${m.color}`}>
            <m.icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xl font-bold text-content-primary leading-tight">{m.value}</p>
            <p className="text-[10px] text-content-secondary uppercase tracking-wider">{m.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function CancelContractModal({
  onConfirm,
  onClose,
}: {
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('Non-respect des conditions de location');
  return (
    <Modal
      title="Annuler le contrat"
      onClose={onClose}
      footer={
        <div className="flex gap-2 w-full">
          <button onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          <button
            onClick={() => onConfirm(reason)}
            className="btn-primary bg-status-error hover:bg-red-600 border-none flex-1"
          >
            Confirmer l'annulation
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 bg-badge-error/50 border border-status-error/20 rounded-xl p-3">
          <AlertCircle className="w-5 h-5 text-status-error shrink-0 mt-0.5" />
          <p className="text-xs text-status-error leading-relaxed">
            L'annulation est irréversible. Le véhicule sera libéré s'il n'est pas utilisé par un autre contrat actif.
          </p>
        </div>
        <div>
          <label className="text-xs text-content-secondary block mb-1">Motif d'annulation</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="input w-full text-sm resize-none"
            placeholder="Ex: Non-respect des conditions, défaut de paiement..."
            rows={4}
          />
        </div>
      </div>
    </Modal>
  );
}

// ------ Page principale --------------------------------------------------------------------------------------------------------------------

export default function ContratsPage() {
  const { business, user } = useAuthStore();
  const { success: notifSuccess, error: notifError } = useNotificationStore();
  const can = useCan();

  const [tab, setTab]               = useState<Tab>('contrats');
  const [loading, setLoading]       = useState(true);
  const [vehicles, setVehicles]     = useState<RentalVehicle[]>([]);
  const [templates, setTemplates]   = useState<ContractTemplate[]>([]);
  const [contracts, setContracts]   = useState<Contract[]>([]);

  // Panels
  const [showVehiclePanel, setShowVehiclePanel]   = useState(false);
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);
  const [showContractPanel, setShowContractPanel] = useState(false);
  const [detailContract, setDetailContract]       = useState<Contract | null>(null);

  const [editVehicle, setEditVehicle]     = useState<RentalVehicle | null>(null);
  const [editTemplate, setEditTemplate]   = useState<ContractTemplate | null>(null);
  const [editContract, setEditContract]   = useState<Contract | null>(null);

  const [showShare, setShowShare] = useState(false);
  const [copied, setCopied] = useState(false);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Modals
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState<string | null>(null);
  const [confirmCancelContract, setConfirmCancelContract] = useState<Contract | null>(null);

  // ------ Load ----------------------------------------------------------------------------------------------------------------------------------------

  async function load() {
    if (!business) return;
    setLoading(true);
    try {
      const [v, t, c] = await Promise.all([
        getVehicles(business.id),
        getTemplates(business.id),
        getContracts(business.id),
      ]);
      setVehicles(v);
      setTemplates(t);
      setContracts(c);
    } catch (e) {
      notifError(toUserError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [business?.id]);

  // ------ Realtime -----------------------------------------------------------------------------------------------------------------------

  useEffect(() => {
    if (!business?.id) return;
    const handleChanged = () => { load(); };
    window.addEventListener('elm-pos:contracts:changed', handleChanged);
    const handleSigned = (e: Event) => {
      const record = (e as CustomEvent<{ record: Record<string, unknown> }>).detail?.record;
      const clientName = (record?.client_name as string) ?? 'le locataire';
      notifSuccess(`Contrat signe par ${clientName}`);
      load();
    };
    window.addEventListener('elm-pos:contracts:signed', handleSigned);
    return () => {
      window.removeEventListener('elm-pos:contracts:changed', handleChanged);
      window.removeEventListener('elm-pos:contracts:signed', handleSigned);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  // ------ Actions -----------------------------------------------------------------------------------------------------------------------

  async function handleSend(c: Contract) {
    try {
      await sendContract(c.id);
      notifSuccess('Contrat envoyé — lien de signature actif 7 jours');
      load();
    } catch (e) {
      notifError(toUserError(e));
    }
  }

  async function handleArchive(c: Contract) {
    try {
      await archiveContract(c.id);
      notifSuccess('Contrat archivé');
      load();
      if (detailContract?.id === c.id) setDetailContract(null);
    } catch (e) {
      notifError(toUserError(e));
    }
  }

  async function handleDoCancel(c: Contract, reason: string) {
    try {
      await cancelContract(c.id, reason);
      notifSuccess('Contrat annulé');
      setConfirmCancelContract(null);
      load();
      if (detailContract?.id === c.id) setDetailContract(null);
    } catch (e) {
      notifError(toUserError(e));
    }
  }

  // ------ Filtering ---------------------------------------------------------------------------------------------------------------------

  const filteredContracts = useMemo(() => {
    return contracts.filter(c => {
      const matchesSearch = !search || 
        c.client_name.toLowerCase().includes(search.toLowerCase()) ||
        (c.client_phone || '').includes(search) ||
        (c as any).rental_vehicles?.name?.toLowerCase().includes(search.toLowerCase()) ||
        (c as any).rental_vehicles?.license_plate?.toLowerCase().includes(search.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      const matchesPayment = paymentFilter === 'all' || paymentStatus(c) === paymentFilter;
      
      return matchesSearch && matchesStatus && matchesPayment;
    });
  }, [contracts, search, statusFilter, paymentFilter]);

  // ------ Loading ----------------------------------------------------------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  // ------ Detail View ------------------------------------------------------------------------------------------------------------------------

  if (detailContract) {
    return (
      <ContractDetailPanel
        contract={detailContract}
        vehicles={vehicles}
        templates={templates}
        business={business}
        onBack={() => setDetailContract(null)}
        onEdit={() => { setEditContract(detailContract); setShowContractPanel(true); }}
        onRefresh={load}
        notifSuccess={notifSuccess}
        notifError={notifError}
        handleSend={handleSend}
        handleArchive={handleArchive}
        handleCancel={async (c) => setConfirmCancelContract(c)}
      />
    );
  }

  // ------ Main view --------------------------------------------------------------------------------------------------------------------------------

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border bg-surface-card shrink-0">
        <FileSignature className="w-5 h-5 text-content-brand shrink-0" />
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-content-primary">Contrats & Location</h1>
          <p className="text-xs text-content-secondary">Gérez vos locations et contrats</p>
        </div>
        {business?.id && (
          <button
            onClick={() => setShowShare(true)}
            className="btn-secondary flex items-center gap-2 text-sm h-9 px-3"
            title="Partager le catalogue véhicules"
          >
            <Share2 className="w-4 h-4" />
            <span className="hidden sm:inline">Partager</span>
          </button>
        )}
        <button
          onClick={() => {
            if (tab === 'vehicules') { setEditVehicle(null); setShowVehiclePanel(true); }
            else if (tab === 'modeles') { setEditTemplate(null); setShowTemplatePanel(true); }
            else { setShowContractPanel(true); setEditContract(null); }
          }}
          className="btn-primary flex items-center gap-2 text-sm h-9 px-3"
          disabled={
            (tab === 'vehicules' && !can('manage_vehicles')) ||
            (tab === 'modeles' && !can('manage_contract_templates'))
          }
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">
            {tab === 'vehicules' ? 'Véhicule' : tab === 'modeles' ? 'Modèle' : 'Contrat'}
          </span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 pt-3 pb-0 shrink-0">
        {([
          { key: 'contrats',  label: 'Contrats',  icon: FileText },
          { key: 'vehicules', label: 'Véhicules',  icon: Car },
          { key: 'modeles',   label: 'Modèles',    icon: FileSignature },
        ] as { key: Tab; label: string; icon: any }[]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-t-xl text-sm font-medium transition-colors
              ${tab === key
                ? 'bg-surface-card text-content-primary border border-b-0 border-surface-border'
                : 'text-content-secondary hover:text-content-primary'}`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-surface-card border border-surface-border rounded-b-xl mx-4 mb-4">
        
        {/* Dashboard Metrics on Contracts tab */}
        {tab === 'contrats' && <DashboardMetrics contracts={contracts} />}

        {/* Search & Filter Bar */}
        {tab === 'contrats' && (
          <div className="px-4 py-2 border-b border-surface-border bg-surface-card sticky top-0 z-10 space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
                <input
                  type="text"
                  placeholder="Rechercher client, véhicule, immatriculation..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input pl-9 h-9 text-sm w-full"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`p-2 rounded-lg border transition-colors ${showFilters ? 'bg-brand-500/10 border-brand-500 text-brand-500' : 'border-surface-border text-content-secondary hover:bg-surface-hover'}`}
              >
                <Filter className="w-4 h-4" />
              </button>
            </div>

            {showFilters && (
              <div className="flex flex-wrap gap-2 pt-1 animate-in slide-in-from-top-2 duration-200">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="input h-8 text-xs bg-surface-input w-fit"
                >
                  <option value="all">Tous les statuts</option>
                  {Object.entries(STATUS_CFG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                  className="input h-8 text-xs bg-surface-input w-fit"
                >
                  <option value="all">Tous les paiements</option>
                  {Object.entries(PAYMENT_STATUS_CFG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => { setStatusFilter('all'); setPaymentFilter('all'); setSearch(''); }}
                  className="text-xs text-content-muted hover:text-content-primary px-2"
                >
                  Réinitialiser
                </button>
              </div>
            )}
          </div>
        )}

        {/* ---- Contrats tab ---- */}
        {tab === 'contrats' && (
          <div className="divide-y divide-surface-border">
            {filteredContracts.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-content-muted">
                <FileText className="w-10 h-10" />
                <p className="text-sm">
                  {contracts.length === 0 ? 'Aucun contrat — créez-en un' : 'Aucun résultat pour cette recherche'}
                </p>
                {contracts.length > 0 && (
                  <button onClick={() => { setSearch(''); setStatusFilter('all'); setPaymentFilter('all'); }} className="text-xs text-content-brand hover:underline">
                    Effacer les filtres
                  </button>
                )}
              </div>
            )}
            {filteredContracts.map((c) => {
              const st = STATUS_CFG[c.status] ?? STATUS_CFG.draft;
              const vehicle = (c as any).rental_vehicles;
              return (
                <button
                  key={c.id}
                  onClick={() => setDetailContract(c)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-xl bg-badge-brand flex items-center justify-center shrink-0">
                    {c.status === 'signed'
                      ? <CheckCircle className="w-5 h-5 text-status-success" />
                      : c.status === 'sent'
                        ? <Clock className="w-5 h-5 text-blue-400" />
                        : c.status === 'cancelled'
                          ? <XCircle className="w-5 h-5 text-status-error" />
                          : <FileText className="w-5 h-5 text-content-brand" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-content-primary truncate">{c.client_name}</p>
                    <p className="text-xs text-content-secondary truncate">
                      {vehicle?.name ?? '-'} 
                      {' · '}{fmtDate(c.start_date)} {fmtTime(c.start_time)} → {fmtDate(c.end_date)} {fmtTime(c.end_time)}                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                    <span className="text-xs text-content-brand font-medium">{fmtMoney(c.total_amount, c.currency)}</span>
                    {!isClosedContract(c) && (
                      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${PAYMENT_STATUS_CFG[paymentStatus(c)].color}`}>
                        {PAYMENT_STATUS_CFG[paymentStatus(c)].label}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ---- Véhicules tab ---- */}
        {tab === 'vehicules' && (
          <div className="divide-y divide-surface-border">
            {vehicles.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-content-muted">
                <Car className="w-10 h-10" />
                <p className="text-sm">Aucun véhicule enregistré</p>
                <button onClick={() => setShowVehiclePanel(true)} className="btn-primary h-9 px-4 text-xs mt-2">
                  Ajouter un véhicule
                </button>
              </div>
            )}
            {vehicles.map((v) => {
              const activeContracts = contracts.filter(
                (c) => c.vehicle_id === v.id && (c.status === 'sent' || c.status === 'signed' || c.status === 'active')
              );
              return (
              <div key={v.id} className="flex items-center gap-3 px-4 py-3">
                {v.image_url
                  ? <img src={v.image_url} alt={v.name} className="w-12 h-12 rounded-xl object-cover shrink-0 border border-surface-border" />
                  : <div className="w-12 h-12 rounded-xl bg-surface-input flex items-center justify-center shrink-0">
                      <Car className="w-6 h-6 text-content-muted" />
                    </div>
                }
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-content-primary truncate">{v.name}</p>
                  <p className="text-xs text-content-secondary truncate">
                    {[v.brand, v.model, v.year].filter(Boolean).join(' · ')}
                    {v.license_plate ? ` — ${v.license_plate}` : ''}
                  </p>
                  <p className="text-xs text-content-brand mt-0.5">
                    {v.price_per_day.toLocaleString('fr-FR')} {displayCurrency(v.currency)}/jour
                  </p>
                  {activeContracts.length > 0 && (
                    <button
                      onClick={() => { setTab('contrats'); setDetailContract(activeContracts[0]); }}
                      className="mt-1 text-[10px] text-status-warning hover:underline flex items-center gap-1"
                    >
                      <FileText className="w-3 h-3" />
                      En location ({activeContracts[0].client_name})
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={async () => {
                      if (!can('manage_vehicles')) return;
                      try {
                        await toggleVehicleAvailability(v.id, !v.is_available);
                        load();
                      } catch (e) { notifError(toUserError(e)); }
                    }}
                    disabled={!can('manage_vehicles')}
                    className={`text-[10px] px-2 py-0.5 rounded-full transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed
                      ${v.is_available
                        ? 'bg-badge-success text-status-success hover:bg-badge-error hover:text-status-error'
                        : 'bg-badge-error text-status-error hover:bg-badge-success hover:text-status-success'}`}
                  >
                    {v.is_available ? 'Disponible' : 'Indispo'}
                  </button>
                  {can('manage_vehicles') && (
                    <button
                      onClick={() => { setEditVehicle(v); setShowVehiclePanel(true); }}
                      className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}

        {/* ---- Modèles tab ---- */}
        {tab === 'modeles' && (
          <div className="divide-y divide-surface-border">
            {templates.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-content-muted">
                <FileSignature className="w-10 h-10" />
                <p className="text-sm">Aucun modèle de contrat</p>
                <button onClick={() => setShowTemplatePanel(true)} className="btn-primary h-9 px-4 text-xs mt-2">
                  Créer un modèle
                </button>
              </div>
            )}
            {templates.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <FileText className="w-5 h-5 text-content-muted shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-content-primary">{t.name}</p>
                  <p className="text-xs text-content-muted">Modifié le {fmtDate(t.updated_at)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {can('manage_contract_templates') && (
                    <>
                      <button
                        onClick={() => { setEditTemplate(t); setShowTemplatePanel(true); }}
                        className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteTemplate(t.id)}
                        className="p-1.5 rounded-lg text-content-secondary hover:text-status-error hover:bg-surface-hover transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- Panels ------------------------------------------------------------------------------------------------------------------------------ */}
      {showVehiclePanel && (
        <VehiclePanel
          vehicle={editVehicle}
          businessId={business?.id ?? ''}
          currency={business?.currency ?? 'XOF'}
          onClose={() => { setShowVehiclePanel(false); setEditVehicle(null); }}
          onSaved={() => { setShowVehiclePanel(false); setEditVehicle(null); load(); }}
          notifError={notifError}
          notifSuccess={notifSuccess}
        />
      )}

      {showTemplatePanel && (
        <TemplatePanel
          template={editTemplate}
          businessId={business?.id ?? ''}
          onClose={() => { setShowTemplatePanel(false); setEditTemplate(null); }}
          onSaved={() => { setShowTemplatePanel(false); setEditTemplate(null); load(); }}
          notifError={notifError}
          notifSuccess={notifSuccess}
        />
      )}

      {showContractPanel && (
        <ContractFormPanel
          vehicles={vehicles}
          templates={templates}
          contracts={contracts}
          businessId={business?.id ?? ''}
          userId={user?.id ?? ''}
          businessName={business?.name ?? ''}
          currency={business?.currency ?? 'XOF'}
          contract={editContract}
          onClose={() => { setShowContractPanel(false); setEditContract(null); }}
          onSaved={(c) => {
            setShowContractPanel(false);
            setEditContract(null);
            load();
            setDetailContract(c);
          }}
          notifError={notifError}
          notifSuccess={notifSuccess}
        />
      )}

      {/* Share modal */}
      {showShare && business?.id && (
        <Modal title="Partager votre catalogue" onClose={() => setShowShare(false)}>
          <div className="space-y-4">
            <p className="text-sm text-content-secondary">
              Partagez ce lien avec vos clients pour qu'ils puissent voir vos véhicules disponibles et faire une demande de location.
            </p>
            <div className="flex items-center gap-2 bg-surface-input rounded-xl px-3 py-2.5">
              <p className="flex-1 text-xs text-content-secondary truncate font-mono">
                {getAppUrl()}/location/{buildPublicBusinessRef(business.name, business.public_slug)}
              </p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${getAppUrl()}/location/${buildPublicBusinessRef(business.name, business.public_slug)}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="shrink-0 text-content-secondary hover:text-content-primary transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-status-success" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={`${getAppUrl()}/location/${buildPublicBusinessRef(business.name, business.public_slug)}`}
                target="_blank" rel="noopener noreferrer"
                className="btn-secondary flex items-center justify-center gap-2 text-sm h-10"
              >
                <ExternalLink className="w-4 h-4" /> Aperçu
              </a>
              <button
                type="button"
                onClick={() => triggerWhatsAppShare(null, `Réservez votre véhicule en ligne : ${getAppUrl()}/location/${buildPublicBusinessRef(business.name, business.public_slug)}`)}
                className="btn-primary flex items-center justify-center gap-2 text-sm h-10"
              >
                <Share2 className="w-4 h-4" /> WhatsApp
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation Modals */}
      {confirmDeleteTemplate && (
        <ConfirmModal
          title="Supprimer ce modèle ?"
          message="Cette action est irréversible. Les contrats déjà créés avec ce modèle ne seront pas affectés."
          confirmLabel="Supprimer"
          type="danger"
          onConfirm={async () => {
            try {
              await deleteTemplate(confirmDeleteTemplate);
              setConfirmDeleteTemplate(null);
              load();
            } catch (e) { notifError(toUserError(e)); }
          }}
          onCancel={() => setConfirmDeleteTemplate(null)}
        />
      )}

      {confirmCancelContract && (
        <CancelContractModal
          onConfirm={(reason) => handleDoCancel(confirmCancelContract, reason)}
          onClose={() => setConfirmCancelContract(null)}
        />
      )}
    </div>
  );
}
