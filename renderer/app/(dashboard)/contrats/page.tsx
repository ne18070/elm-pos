'use client';
import { toUserError } from '@/lib/user-error';
import { displayCurrency } from '@/lib/utils';

import { useState, useEffect, useRef } from 'react';
import {
  Plus, Car, FileText, Pencil, Trash2, X, Loader2,
  Send, Archive, Share2, CheckCircle, Clock, FileSignature,
  ChevronLeft, Eye, Download, Copy, Check, Bold, Italic,
  List, Heading2, Minus, Type,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import {
  getVehicles, createVehicle, updateVehicle, deleteVehicle, toggleVehicleAvailability,
  getTemplates, createTemplate, updateTemplate, deleteTemplate,
  getContracts, createContract, sendContract, archiveContract, savePdfUrl,
  buildWhatsAppLink, daysCount, fillTemplate, uploadVehicleImage, uploadContractPdf,
  type RentalVehicle, type ContractTemplate, type Contract, type CreateContractInput,
} from '@services/supabase/contracts';
import { getClients, type Client } from '@services/supabase/clients';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Tab = 'contrats' | 'vehicules' | 'modeles';

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  draft:    { label: 'Brouillon',  color: 'bg-slate-700 text-slate-300' },
  sent:     { label: 'Envoyé',     color: 'bg-blue-900/50 text-blue-300' },
  signed:   { label: 'Signé',      color: 'bg-green-900/50 text-green-300' },
  archived: { label: 'Archivé',    color: 'bg-slate-800 text-slate-500' },
};

const TODAY = new Date().toISOString().split('T')[0];
const TOMORROW = new Date(Date.now() + 86400000).toISOString().split('T')[0];

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtMoney(amount: number | null, currency: string) {
  if (amount == null) return '—';
  return `${amount.toLocaleString('fr-FR')} ${displayCurrency(currency)}`;
}

function getAppUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}

// ─── Default contract template ────────────────────────────────────────────────

const DEFAULT_TEMPLATE = `<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #333;">
  <h1 style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px;">CONTRAT DE LOCATION DE VÉHICULE</h1>

  <h2>ENTRE LES SOUSSIGNÉS :</h2>

  <p><strong>LE LOUEUR :</strong><br>
  {{business_name}}<br>
  Représenté par : {{owner_name}}</p>

  <p><strong>LE LOCATAIRE :</strong><br>
  Nom et Prénom : {{client_name}}<br>
  Adresse : {{client_address}}<br>
  Pièce d'identité n° : {{client_id_number}}<br>
  Téléphone : {{client_phone}}</p>

  <h2>OBJET DU CONTRAT :</h2>

  <p>Le loueur met à disposition du locataire le véhicule suivant :</p>
  <p><strong>Véhicule :</strong> {{vehicle_name}}<br>
  <strong>Immatriculation :</strong> {{license_plate}}</p>

  <h2>CONDITIONS DE LOCATION :</h2>
  <ul>
    <li><strong>Date de prise en charge :</strong> {{start_date}}</li>
    <li><strong>Date de restitution :</strong> {{end_date}}</li>
    <li><strong>Lieu de prise en charge :</strong> {{pickup_location}}</li>
    <li><strong>Lieu de restitution :</strong> {{return_location}}</li>
    <li><strong>Tarif journalier :</strong> {{price_per_day}} {{currency}}</li>
    <li><strong>Durée :</strong> {{duration_days}} jours</li>
    <li><strong>Montant total :</strong> {{total_amount}} {{currency}}</li>
    <li><strong>Caution :</strong> {{deposit_amount}} {{currency}}</li>
  </ul>

  <h2>CONDITIONS GÉNÉRALES :</h2>
  <p>Le locataire s'engage à :</p>
  <ul>
    <li>Utiliser le véhicule conformément à sa destination</li>
    <li>Ne pas sous-louer le véhicule</li>
    <li>Restituer le véhicule dans l'état où il l'a reçu</li>
    <li>Signaler immédiatement tout sinistre ou dommage</li>
    <li>Respecter le code de la route</li>
  </ul>

  <p>En cas de sinistre causé par la faute du locataire, celui-ci sera tenu responsable des dommages au-delà de la caution versée.</p>

  <div style="margin-top: 60px; display: flex; justify-content: space-between;">
    <div style="text-align: center; width: 45%;">
      <p><strong>Le Loueur</strong></p>
      <p style="margin-top: 60px;">Signature</p>
    </div>
    <div style="text-align: center; width: 45%;">
      <p><strong>Le Locataire</strong></p>
      <p style="margin-top: 10px;">Lu et approuvé</p>
      <p>Signature électronique :</p>
    </div>
  </div>

  {{signature_block}}
</div>`;

// ─── Page principale ──────────────────────────────────────────────────────────

export default function ContratsPage() {
  const { business, user } = useAuthStore();
  const { success: notifSuccess, error: notifError } = useNotificationStore();

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

  const [copied, setCopied] = useState(false);

  // ─── Load ────────────────────────────────────────────────────────────────────

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

  // ─── Contract actions ─────────────────────────────────────────────────────

  async function handleSend(c: Contract) {
    try {
      await sendContract(c.id);
      notifSuccess('Contrat envoyé — lien de signature actif 7 jours');
      load();
      if (detailContract?.id === c.id) {
        setDetailContract({ ...detailContract, status: 'sent' });
      }
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

  function contractLink(c: Contract) {
    return `${getAppUrl()}/c/${c.token}`;
  }

  function handleCopyLink(c: Contract) {
    navigator.clipboard.writeText(contractLink(c)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleWhatsApp(c: Contract) {
    if (!c.client_phone) { notifError('Numéro de téléphone client manquant'); return; }
    const link = buildWhatsAppLink(c.client_phone, contractLink(c), c.client_name);
    window.open(link, '_blank');
  }

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  // ─── Detail panel ────────────────────────────────────────────────────────────

  if (detailContract) {
    const c = detailContract;
    const status = STATUS_CFG[c.status] ?? STATUS_CFG.draft;
    const link = contractLink(c);
    return (
      <div className="h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border bg-surface-card shrink-0">
          <button onClick={() => setDetailContract(null)} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors">
            <ChevronLeft className="w-5 h-5 text-slate-400" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white truncate">{c.client_name}</p>
            <p className="text-xs text-slate-400">{fmtDate(c.start_date)} → {fmtDate(c.end_date)}</p>
          </div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.color}`}>{status.label}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Infos */}
          <div className="card p-4 space-y-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Client</h3>
            <p className="text-white font-medium">{c.client_name}</p>
            {c.client_phone && <p className="text-sm text-slate-400">{c.client_phone}</p>}
            {c.client_email && <p className="text-sm text-slate-400">{c.client_email}</p>}
            {c.client_id_number && <p className="text-sm text-slate-400">Pièce : {c.client_id_number}</p>}
            {c.client_address && <p className="text-sm text-slate-400">{c.client_address}</p>}
          </div>

          <div className="card p-4 space-y-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Location</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><p className="text-slate-500">Départ</p><p className="text-white">{fmtDate(c.start_date)}</p></div>
              <div><p className="text-slate-500">Retour</p><p className="text-white">{fmtDate(c.end_date)}</p></div>
              {c.pickup_location && <div><p className="text-slate-500">Lieu prise</p><p className="text-white">{c.pickup_location}</p></div>}
              {c.return_location && <div><p className="text-slate-500">Lieu retour</p><p className="text-white">{c.return_location}</p></div>}
              <div><p className="text-slate-500">Prix/jour</p><p className="text-white">{fmtMoney(c.price_per_day, c.currency)}</p></div>
              <div><p className="text-slate-500">Total</p><p className="text-brand-400 font-semibold">{fmtMoney(c.total_amount, c.currency)}</p></div>
              <div><p className="text-slate-500">Caution</p><p className="text-white">{fmtMoney(c.deposit_amount, c.currency)}</p></div>
            </div>
          </div>

          {c.status === 'signed' && (
            <div className="card p-4 space-y-3">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" /> Signé
              </h3>
              {c.signed_at && <p className="text-sm text-slate-400">Le {fmtDate(c.signed_at)}</p>}
              {c.signature_image && (
                <img src={c.signature_image} alt="signature" className="h-20 bg-white rounded-xl p-2 object-contain" />
              )}
              {c.pdf_url && (
                <a href={c.pdf_url} target="_blank" rel="noreferrer"
                   className="btn-secondary text-sm flex items-center gap-2 w-full justify-center">
                  <Download className="w-4 h-4" /> Télécharger PDF
                </a>
              )}
            </div>
          )}

          {/* Lien de signature */}
          {(c.status === 'sent' || c.status === 'draft') && (
            <div className="card p-4 space-y-3">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Lien de signature</h3>
              {c.status === 'sent' ? (
                <>
                  <div className="flex items-center gap-2 bg-surface-input rounded-xl px-3 py-2">
                    <p className="text-xs text-slate-400 truncate flex-1">{link}</p>
                    <button onClick={() => handleCopyLink(c)} className="shrink-0 text-slate-400 hover:text-white transition-colors">
                      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <button onClick={() => handleWhatsApp(c)} className="btn-primary w-full flex items-center justify-center gap-2 text-sm h-10">
                    <Share2 className="w-4 h-4" /> Envoyer par WhatsApp
                  </button>
                  <p className="text-xs text-slate-500 text-center">
                    Expire le {fmtDate(c.token_expires_at)}
                  </p>
                </>
              ) : (
                <button onClick={() => handleSend(c)} className="btn-primary w-full flex items-center justify-center gap-2 text-sm h-10">
                  <Send className="w-4 h-4" /> Envoyer pour signature
                </button>
              )}
            </div>
          )}

          {/* Contenu du contrat */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Contenu du contrat</h3>
            <div
              className="bg-white rounded-xl p-4 text-sm text-gray-800 overflow-auto max-h-96"
              dangerouslySetInnerHTML={{ __html: c.body }}
            />
          </div>
        </div>

        {/* Footer actions */}
        {c.status !== 'archived' && (
          <div className="shrink-0 p-4 border-t border-surface-border flex gap-2">
            {c.status === 'draft' && (
              <button onClick={() => handleSend(c)} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm h-10">
                <Send className="w-4 h-4" /> Envoyer
              </button>
            )}
            {c.status === 'sent' && (
              <button onClick={() => handleWhatsApp(c)} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm h-10">
                <Share2 className="w-4 h-4" /> WhatsApp
              </button>
            )}
            <button onClick={() => handleArchive(c)} className="btn-secondary flex items-center justify-center gap-2 text-sm h-10 px-4">
              <Archive className="w-4 h-4" /> Archiver
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── Main view ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border bg-surface-card shrink-0">
        <FileSignature className="w-5 h-5 text-brand-400 shrink-0" />
        <h1 className="font-semibold text-white flex-1">Contrats & Location</h1>
        <button
          onClick={() => {
            if (tab === 'vehicules') { setEditVehicle(null); setShowVehiclePanel(true); }
            else if (tab === 'modeles') { setEditTemplate(null); setShowTemplatePanel(true); }
            else { setShowContractPanel(true); }
          }}
          className="btn-primary flex items-center gap-2 text-sm h-9 px-3"
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
        ] as { key: Tab; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-t-xl text-sm font-medium transition-colors
              ${tab === key
                ? 'bg-surface-card text-white border border-b-0 border-surface-border'
                : 'text-slate-400 hover:text-white'}`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-surface-card border border-surface-border rounded-b-xl mx-4 mb-4">

        {/* ── Contrats tab ── */}
        {tab === 'contrats' && (
          <div className="divide-y divide-surface-border">
            {contracts.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
                <FileText className="w-10 h-10" />
                <p className="text-sm">Aucun contrat — créez-en un</p>
              </div>
            )}
            {contracts.map((c) => {
              const st = STATUS_CFG[c.status] ?? STATUS_CFG.draft;
              return (
                <button
                  key={c.id}
                  onClick={() => setDetailContract(c)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-xl bg-brand-900/30 flex items-center justify-center shrink-0">
                    {c.status === 'signed'
                      ? <CheckCircle className="w-5 h-5 text-green-400" />
                      : c.status === 'sent'
                        ? <Clock className="w-5 h-5 text-blue-400" />
                        : <FileText className="w-5 h-5 text-brand-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{c.client_name}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {(c as Contract & { rental_vehicles?: { name: string; license_plate: string | null } }).rental_vehicles?.name ?? '—'}
                      {' · '}{fmtDate(c.start_date)} → {fmtDate(c.end_date)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                    <span className="text-xs text-brand-400 font-medium">{fmtMoney(c.total_amount, c.currency)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Véhicules tab ── */}
        {tab === 'vehicules' && (
          <div className="divide-y divide-surface-border">
            {vehicles.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
                <Car className="w-10 h-10" />
                <p className="text-sm">Aucun véhicule enregistré</p>
              </div>
            )}
            {vehicles.map((v) => {
              // Contrats actifs liés à ce véhicule
              const activeContracts = contracts.filter(
                (c) => c.vehicle_id === v.id && (c.status === 'sent' || c.status === 'signed')
              );
              return (
              <div key={v.id} className="flex items-center gap-3 px-4 py-3">
                {v.image_url
                  ? <img src={v.image_url} alt={v.name} className="w-12 h-12 rounded-xl object-cover shrink-0 border border-surface-border" />
                  : <div className="w-12 h-12 rounded-xl bg-surface-input flex items-center justify-center shrink-0">
                      <Car className="w-6 h-6 text-slate-500" />
                    </div>
                }
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{v.name}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {[v.brand, v.model, v.year].filter(Boolean).join(' · ')}
                    {v.license_plate ? ` — ${v.license_plate}` : ''}
                  </p>
                  <p className="text-xs text-brand-400 mt-0.5">
                    {v.price_per_day.toLocaleString('fr-FR')} {displayCurrency(v.currency)}/jour
                    {v.price_per_hour ? ` · ${v.price_per_hour.toLocaleString('fr-FR')}/h` : ''}
                  </p>
                  {activeContracts.length > 0 && (
                    <button
                      onClick={() => { setTab('contrats'); setDetailContract(activeContracts[0]); }}
                      className="mt-1 text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1"
                    >
                      <FileText className="w-3 h-3" />
                      {activeContracts.length} contrat{activeContracts.length > 1 ? 's' : ''} actif{activeContracts.length > 1 ? 's' : ''} — {activeContracts[0].client_name}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={async () => {
                      try {
                        await toggleVehicleAvailability(v.id, !v.is_available);
                        load();
                      } catch (e) { notifError(toUserError(e)); }
                    }}
                    className={`text-xs px-2 py-0.5 rounded-full transition-colors
                      ${v.is_available
                        ? 'bg-green-900/50 text-green-400 hover:bg-red-900/50 hover:text-red-400'
                        : 'bg-red-900/50 text-red-400 hover:bg-green-900/50 hover:text-green-400'}`}
                  >
                    {v.is_available ? 'Disponible' : 'Indispo'}
                  </button>
                  <button
                    onClick={() => { setEditVehicle(v); setShowVehiclePanel(true); }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}

        {/* ── Modèles tab ── */}
        {tab === 'modeles' && (
          <div className="divide-y divide-surface-border">
            {templates.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
                <FileSignature className="w-10 h-10" />
                <p className="text-sm">Aucun modèle de contrat</p>
              </div>
            )}
            {templates.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <FileText className="w-5 h-5 text-slate-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{t.name}</p>
                  <p className="text-xs text-slate-500">Modifié le {fmtDate(t.updated_at)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => { setEditTemplate(t); setShowTemplatePanel(true); }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm('Supprimer ce modèle ?')) return;
                      try { await deleteTemplate(t.id); load(); } catch (e) { notifError(toUserError(e)); }
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-surface-hover transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Panels ─────────────────────────────────────────────────────────────── */}
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
        <ContractPanel
          vehicles={vehicles}
          templates={templates}
          businessId={business?.id ?? ''}
          userId={user?.id ?? ''}
          businessName={business?.name ?? ''}
          currency={business?.currency ?? 'XOF'}
          onClose={() => setShowContractPanel(false)}
          onSaved={(c) => {
            setShowContractPanel(false);
            load();
            setDetailContract(c);
          }}
          notifError={notifError}
          notifSuccess={notifSuccess}
        />
      )}
    </div>
  );
}

// ─── Vehicle Panel ────────────────────────────────────────────────────────────

function VehiclePanel({
  vehicle, businessId, currency, onClose, onSaved, notifError, notifSuccess,
}: {
  vehicle: RentalVehicle | null;
  businessId: string;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
  notifError: (m: string) => void;
  notifSuccess: (m: string) => void;
}) {
  const [saving, setSaving]         = useState(false);
  const [imageFile, setImageFile]   = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>(vehicle?.image_url ?? '');

  const [form, setForm] = useState({
    name:           vehicle?.name ?? '',
    brand:          vehicle?.brand ?? '',
    model:          vehicle?.model ?? '',
    year:           vehicle?.year?.toString() ?? '',
    license_plate:  vehicle?.license_plate ?? '',
    color:          vehicle?.color ?? '',
    price_per_day:  vehicle?.price_per_day.toString() ?? '0',
    price_per_hour: vehicle?.price_per_hour?.toString() ?? '',
    deposit_amount: vehicle?.deposit_amount.toString() ?? '0',
    currency:       vehicle?.currency ?? currency,
    description:    vehicle?.description ?? '',
    is_available:   vehicle?.is_available ?? true,
  });

  function set(k: string, v: string | boolean) { setForm((f) => ({ ...f, [k]: v })); }

  async function save() {
    if (!form.name.trim()) { notifError('Nom du véhicule requis'); return; }
    setSaving(true);
    try {
      let imageUrl = vehicle?.image_url ?? null;
      if (imageFile) {
        imageUrl = await uploadVehicleImage(businessId, imageFile);
      }
      const payload = {
        name:           form.name.trim(),
        brand:          form.brand || null,
        model:          form.model || null,
        year:           form.year ? parseInt(form.year) : null,
        license_plate:  form.license_plate || null,
        color:          form.color || null,
        price_per_day:  parseFloat(form.price_per_day) || 0,
        price_per_hour: form.price_per_hour ? parseFloat(form.price_per_hour) : null,
        deposit_amount: parseFloat(form.deposit_amount) || 0,
        currency:       form.currency,
        description:    form.description || null,
        image_url:      imageUrl,
        is_available:   form.is_available,
      };
      if (vehicle) {
        await updateVehicle(vehicle.id, payload);
        notifSuccess('Véhicule mis à jour');
      } else {
        await createVehicle(businessId, payload);
        notifSuccess('Véhicule ajouté');
      }
      onSaved();
    } catch (e) {
      notifError(toUserError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SlidePanel title={vehicle ? 'Modifier le véhicule' : 'Nouveau véhicule'} onClose={onClose}>
      <div className="space-y-4">
        {/* Image */}
        <label className="block cursor-pointer">
          <p className="text-xs text-slate-400 mb-1">Photo</p>
          {imagePreview
            ? <div className="relative w-fit">
                <img src={imagePreview} alt="" className="h-32 w-auto rounded-xl object-cover border border-surface-border" />
                <button type="button" onClick={(e) => { e.preventDefault(); setImagePreview(''); setImageFile(null); }}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 rounded-full flex items-center justify-center">
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            : <div className="h-24 border-2 border-dashed border-surface-border rounded-xl flex items-center justify-center text-slate-500 hover:border-brand-500 transition-colors">
                <Car className="w-6 h-6" />
              </div>
          }
          <input type="file" accept="image/*" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setImageFile(f);
              setImagePreview(URL.createObjectURL(f));
            }} />
        </label>

        <Field label="Nom *" value={form.name} onChange={(v) => set('name', v)} placeholder="Toyota Corolla" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Marque" value={form.brand} onChange={(v) => set('brand', v)} placeholder="Toyota" />
          <Field label="Modèle" value={form.model} onChange={(v) => set('model', v)} placeholder="Corolla" />
          <Field label="Année" value={form.year} onChange={(v) => set('year', v)} placeholder="2022" type="number" />
          <Field label="Couleur" value={form.color} onChange={(v) => set('color', v)} placeholder="Blanc" />
        </div>
        <Field label="Immatriculation" value={form.license_plate} onChange={(v) => set('license_plate', v)} placeholder="AB-123-CD" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prix/jour *" value={form.price_per_day} onChange={(v) => set('price_per_day', v)} type="number" />
          <Field label="Prix/heure" value={form.price_per_hour} onChange={(v) => set('price_per_hour', v)} type="number" />
          <Field label="Caution" value={form.deposit_amount} onChange={(v) => set('deposit_amount', v)} type="number" />
          <div>
            <label className="text-xs text-slate-400 block mb-1">Devise</label>
            <select value={form.currency} onChange={(e) => set('currency', e.target.value)}
              className="input w-full text-sm">
              <option value="XOF">XOF (FCFA)</option>
              <option value="XAF">XAF (FCFA)</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Description</label>
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)}
            rows={2} className="input w-full text-sm resize-none" placeholder="Climatisé, GPS…" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.is_available}
            onChange={(e) => set('is_available', e.target.checked)}
            className="rounded border-surface-border" />
          <span className="text-sm text-slate-300">Disponible à la location</span>
        </label>
      </div>

      <div className="flex gap-2 pt-4 border-t border-surface-border mt-6">
        <button onClick={onClose} className="btn-secondary flex-1 h-10 text-sm">Annuler</button>
        <button onClick={save} disabled={saving} className="btn-primary flex-1 h-10 text-sm flex items-center justify-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {vehicle ? 'Mettre à jour' : 'Ajouter'}
        </button>
      </div>
    </SlidePanel>
  );
}

// ─── Template Panel ───────────────────────────────────────────────────────────

const VARIABLES = [
  { key: 'client_name',      label: 'Nom client' },
  { key: 'client_phone',     label: 'Tél client' },
  { key: 'client_id_number', label: 'Pièce identité' },
  { key: 'client_address',   label: 'Adresse client' },
  { key: 'vehicle_name',     label: 'Véhicule' },
  { key: 'license_plate',    label: 'Immatriculation' },
  { key: 'start_date',       label: 'Date départ' },
  { key: 'end_date',         label: 'Date retour' },
  { key: 'duration_days',    label: 'Durée (jours)' },
  { key: 'pickup_location',  label: 'Lieu prise' },
  { key: 'return_location',  label: 'Lieu retour' },
  { key: 'price_per_day',    label: 'Prix/jour' },
  { key: 'total_amount',     label: 'Total' },
  { key: 'deposit_amount',   label: 'Caution' },
  { key: 'currency',         label: 'Devise' },
  { key: 'business_name',    label: 'Établissement' },
];

function TemplatePanel({
  template, businessId, onClose, onSaved, notifError, notifSuccess,
}: {
  template: ContractTemplate | null;
  businessId: string;
  onClose: () => void;
  onSaved: () => void;
  notifError: (m: string) => void;
  notifSuccess: (m: string) => void;
}) {
  const [name, setName]     = useState(template?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  // Initialise le contenu de l'éditeur
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = template?.body ?? DEFAULT_TEMPLATE;
    }
  }, []);

  function getBody(): string {
    return editorRef.current?.innerHTML ?? '';
  }

  // Commandes de mise en forme
  function fmt(cmd: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
  }

  function insertVariable(key: string) {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const span = document.createElement('span');
    span.className = 'var-chip';
    span.style.cssText = 'display:inline-block;background:#1e3a5f;color:#7dd3fc;border:1px solid #2563eb;border-radius:4px;padding:0 4px;font-size:12px;font-family:monospace;user-select:all;';
    span.contentEditable = 'false';
    span.textContent = `{{${key}}}`;
    range.deleteContents();
    range.insertNode(span);
    range.setStartAfter(span);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function insertSeparator() {
    editorRef.current?.focus();
    document.execCommand('insertHTML', false, '<hr style="border:none;border-top:1px solid #ccc;margin:16px 0;">');
  }

  async function save() {
    const body = getBody();
    if (!name.trim()) { notifError('Nom du modèle requis'); return; }
    if (!body.trim()) { notifError('Contenu du modèle requis'); return; }
    setSaving(true);
    try {
      if (template) {
        await updateTemplate(template.id, name.trim(), body.trim());
        notifSuccess('Modèle mis à jour');
      } else {
        await createTemplate(businessId, name.trim(), body.trim());
        notifSuccess('Modèle créé');
      }
      onSaved();
    } catch (e) {
      notifError(toUserError(e));
    } finally {
      setSaving(false);
    }
  }

  const toolbarBtn = (title: string, onClick: () => void, children: React.ReactNode) => (
    <button type="button" title={title} onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className="p-1.5 rounded hover:bg-slate-600 text-slate-300 hover:text-white transition-colors">
      {children}
    </button>
  );

  return (
    <SlidePanel title={template ? 'Modifier le modèle' : 'Nouveau modèle'} onClose={onClose} wide>
      <div className="space-y-4 flex-1">
        <Field label="Nom du modèle *" value={name} onChange={setName} placeholder="Contrat standard" />

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-slate-400 font-medium">Contenu du contrat</label>
            <button type="button" onClick={() => setPreview(!preview)}
              className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300">
              <Eye className="w-3.5 h-3.5" /> {preview ? 'Éditer' : 'Aperçu'}
            </button>
          </div>

          {preview ? (
            <div className="bg-white rounded-xl p-5 text-sm text-gray-800 overflow-auto max-h-[50vh] border border-gray-200"
              dangerouslySetInnerHTML={{ __html: getBody() }} />
          ) : (
            <div className="border border-surface-border rounded-xl overflow-hidden">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-slate-800 border-b border-surface-border">
                {toolbarBtn('Gras', () => fmt('bold'),           <Bold      className="w-3.5 h-3.5" />)}
                {toolbarBtn('Italique', () => fmt('italic'),     <Italic    className="w-3.5 h-3.5" />)}
                <div className="w-px h-4 bg-slate-600 mx-1" />
                {toolbarBtn('Titre', () => fmt('formatBlock', 'h2'), <Heading2  className="w-3.5 h-3.5" />)}
                {toolbarBtn('Paragraphe', () => fmt('formatBlock', 'p'), <Type className="w-3.5 h-3.5" />)}
                {toolbarBtn('Liste', () => fmt('insertUnorderedList'), <List className="w-3.5 h-3.5" />)}
                {toolbarBtn('Séparateur', insertSeparator,      <Minus     className="w-3.5 h-3.5" />)}
              </div>

              {/* Variables */}
              <div className="flex flex-wrap gap-1 px-2 py-1.5 bg-slate-900 border-b border-surface-border">
                <span className="text-[10px] text-slate-500 self-center mr-1">Insérer :</span>
                {VARIABLES.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); insertVariable(key); }}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-800 hover:bg-blue-800/50 transition-colors font-mono"
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Editor area */}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                className="min-h-[320px] max-h-[45vh] overflow-y-auto p-4 text-sm bg-white text-gray-900 focus:outline-none"
                style={{ lineHeight: '1.6' }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 pt-4 border-t border-surface-border mt-6">
        <button onClick={onClose} className="btn-secondary flex-1 h-10 text-sm">Annuler</button>
        <button onClick={save} disabled={saving} className="btn-primary flex-1 h-10 text-sm flex items-center justify-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {template ? 'Mettre à jour' : 'Créer'}
        </button>
      </div>
    </SlidePanel>
  );
}

// ─── Contract Panel ───────────────────────────────────────────────────────────

function ContractPanel({
  vehicles, templates, businessId, userId, businessName, currency, onClose, onSaved, notifError, notifSuccess,
}: {
  vehicles: RentalVehicle[];
  templates: ContractTemplate[];
  businessId: string;
  userId: string;
  businessName: string;
  currency: string;
  onClose: () => void;
  onSaved: (c: Contract) => void;
  notifError: (m: string) => void;
  notifSuccess: (m: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [form, setForm] = useState({
    vehicle_id:       vehicles[0]?.id ?? '',
    template_id:      templates[0]?.id ?? '',
    client_name:      '',
    client_phone:     '',
    client_email:     '',
    client_id_number: '',
    client_address:   '',
    start_date:       TODAY,
    end_date:         TOMORROW,
    pickup_location:  '',
    return_location:  '',
    deposit_amount:   '',
    notes:            '',
  });

  // Client search
  const [clients, setClients]               = useState<Client[]>([]);
  const [clientQuery, setClientQuery]       = useState('');
  const [showDropdown, setShowDropdown]     = useState(false);
  const [clientSelected, setClientSelected] = useState(false);

  useEffect(() => {
    getClients(businessId).then(setClients).catch(() => {});
  }, [businessId]);

  const filteredClients = clientQuery.length >= 1
    ? clients.filter((c) =>
        c.name.toLowerCase().includes(clientQuery.toLowerCase()) ||
        (c.phone ?? '').includes(clientQuery)
      ).slice(0, 8)
    : [];

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  function selectClient(c: Client) {
    setForm((f) => ({
      ...f,
      client_name:    c.name,
      client_phone:   c.phone ?? '',
      client_email:   c.email ?? '',
      client_address: c.address ?? '',
    }));
    setClientQuery(c.name);
    setClientSelected(true);
    setShowDropdown(false);
  }

  function clearClient() {
    setForm((f) => ({ ...f, client_name: '', client_phone: '', client_email: '', client_id_number: '', client_address: '' }));
    setClientQuery('');
    setClientSelected(false);
  }

  const selectedVehicle = vehicles.find((v) => v.id === form.vehicle_id) ?? null;
  const selectedTemplate = templates.find((t) => t.id === form.template_id) ?? null;

  const days = daysCount(form.start_date, form.end_date);
  const pricePerDay = selectedVehicle?.price_per_day ?? 0;
  const totalAmount = pricePerDay * days;
  const depositAmount = parseFloat(form.deposit_amount) || (selectedVehicle?.deposit_amount ?? 0);
  const cur = selectedVehicle?.currency ?? currency;

  function buildBody(): string {
    const templateBody = selectedTemplate?.body ?? DEFAULT_TEMPLATE;
    const vars: Record<string, string> = {
      business_name:    businessName,
      client_name:      form.client_name,
      client_phone:     form.client_phone,
      client_email:     form.client_email,
      client_id_number: form.client_id_number,
      client_address:   form.client_address,
      vehicle_name:     selectedVehicle?.name ?? '—',
      license_plate:    selectedVehicle?.license_plate ?? '—',
      start_date:       fmtDate(form.start_date),
      end_date:         fmtDate(form.end_date),
      pickup_location:  form.pickup_location,
      return_location:  form.return_location,
      price_per_day:    pricePerDay.toLocaleString('fr-FR'),
      duration_days:    days.toString(),
      total_amount:     totalAmount.toLocaleString('fr-FR'),
      deposit_amount:   depositAmount.toLocaleString('fr-FR'),
      currency:         displayCurrency(cur),
      signature_block:  '',
      owner_name:       '',
    };
    return fillTemplate(templateBody, vars);
  }

  async function save() {
    if (!form.client_name.trim()) { notifError('Nom du client requis'); return; }
    if (!form.start_date || !form.end_date) { notifError('Dates requises'); return; }
    if (form.end_date <= form.start_date) { notifError('La date de fin doit être après la date de début'); return; }

    setSaving(true);
    try {
      const input: CreateContractInput = {
        vehicle_id:       form.vehicle_id || null,
        template_id:      form.template_id || null,
        client_name:      form.client_name.trim(),
        client_phone:     form.client_phone.trim(),
        client_email:     form.client_email.trim(),
        client_id_number: form.client_id_number.trim(),
        client_address:   form.client_address.trim(),
        start_date:       form.start_date,
        end_date:         form.end_date,
        pickup_location:  form.pickup_location.trim(),
        return_location:  form.return_location.trim(),
        price_per_day:    pricePerDay,
        deposit_amount:   depositAmount,
        total_amount:     totalAmount,
        currency:         cur,
        body:             buildBody(),
        notes:            form.notes.trim(),
      };
      const contract = await createContract(businessId, userId, input);
      notifSuccess('Contrat créé');
      onSaved(contract);
    } catch (e) {
      notifError(toUserError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SlidePanel title="Nouveau contrat" onClose={onClose} wide>
      <div className="space-y-4">
        {/* Véhicule */}
        <div>
          <label className="text-xs text-slate-400 block mb-1">Véhicule</label>
          {vehicles.length === 0 ? (
            <div className="flex items-center gap-2 input text-sm text-slate-500 cursor-default">
              <Car className="w-4 h-4 shrink-0" />
              Aucun véhicule — ajoutez-en un dans l'onglet Véhicules
            </div>
          ) : (
            <select value={form.vehicle_id} onChange={(e) => set('vehicle_id', e.target.value)}
              className="input w-full text-sm">
              <option value="">— Sans véhicule spécifique —</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}{v.license_plate ? ` (${v.license_plate})` : ''} — {v.price_per_day.toLocaleString('fr-FR')} {displayCurrency(v.currency)}/j
                  {!v.is_available ? ' ⚠ Indisponible' : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Modèle */}
        <div>
          <label className="text-xs text-slate-400 block mb-1">Modèle de contrat</label>
          <select value={form.template_id} onChange={(e) => set('template_id', e.target.value)}
            className="input w-full text-sm">
            <option value="">— Modèle par défaut —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date de départ *" value={form.start_date} onChange={(v) => set('start_date', v)} type="date" />
          <Field label="Date de retour *" value={form.end_date} onChange={(v) => set('end_date', v)} type="date" />
        </div>

        {/* Récap tarif */}
        {selectedVehicle && (
          <div className="bg-brand-900/20 border border-brand-800 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
            <span className="text-slate-400">{days} jour{days > 1 ? 's' : ''} × {pricePerDay.toLocaleString('fr-FR')} {displayCurrency(cur)}/j</span>
            <span className="font-bold text-brand-400">{totalAmount.toLocaleString('fr-FR')} {displayCurrency(cur)}</span>
          </div>
        )}

        <Field label="Caution" value={form.deposit_amount} onChange={(v) => set('deposit_amount', v)}
          type="number" placeholder={depositAmount.toString()} />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Lieu de prise en charge" value={form.pickup_location} onChange={(v) => set('pickup_location', v)} />
          <Field label="Lieu de restitution" value={form.return_location} onChange={(v) => set('return_location', v)} />
        </div>

        {/* Client */}
        <div className="pt-2 border-t border-surface-border">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Client</p>
          <div className="space-y-3">

            {/* Search */}
            <div className="relative">
              <label className="text-xs text-slate-400 block mb-1">Rechercher un client *</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={clientQuery}
                    onChange={(e) => { setClientQuery(e.target.value); setClientSelected(false); setShowDropdown(true); set('client_name', e.target.value); }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                    placeholder="Nom ou téléphone…"
                    className="input w-full text-sm pr-8"
                    autoComplete="off"
                  />
                  {clientSelected && (
                    <button type="button" onClick={clearClient}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Dropdown */}
              {showDropdown && filteredClients.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-surface-card border border-surface-border rounded-xl shadow-xl overflow-hidden">
                  {filteredClients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => selectClient(c)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-brand-900/40 flex items-center justify-center shrink-0 text-brand-400 font-bold text-sm">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{c.name}</p>
                        {c.phone && <p className="text-xs text-slate-400">{c.phone}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {showDropdown && clientQuery.length >= 1 && filteredClients.length === 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-surface-card border border-surface-border rounded-xl px-3 py-2.5 text-xs text-slate-500">
                  Aucun client trouvé — vous pouvez saisir manuellement ci-dessous
                </div>
              )}
            </div>

            {/* Champs préremplis ou manuels */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Téléphone" value={form.client_phone} onChange={(v) => set('client_phone', v)} placeholder="+221 77 000 00 00" />
              <Field label="Email" value={form.client_email} onChange={(v) => set('client_email', v)} type="email" />
            </div>
            <Field label="N° pièce d'identité" value={form.client_id_number} onChange={(v) => set('client_id_number', v)} />
            <Field label="Adresse" value={form.client_address} onChange={(v) => set('client_address', v)} />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs text-slate-400 block mb-1">Notes internes</label>
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)}
            rows={2} className="input w-full text-sm resize-none" placeholder="Notes…" />
        </div>

        {/* Aperçu */}
        <button type="button" onClick={() => setPreview(!preview)}
          className="flex items-center gap-2 text-xs text-brand-400 hover:text-brand-300">
          <Eye className="w-3.5 h-3.5" /> {preview ? 'Masquer l\'aperçu' : 'Aperçu du contrat'}
        </button>
        {preview && (
          <div className="bg-white rounded-xl p-4 text-sm text-gray-800 overflow-auto max-h-72"
            dangerouslySetInnerHTML={{ __html: buildBody() }} />
        )}
      </div>

      <div className="flex gap-2 pt-4 border-t border-surface-border mt-6">
        <button onClick={onClose} className="btn-secondary flex-1 h-10 text-sm">Annuler</button>
        <button onClick={save} disabled={saving} className="btn-primary flex-1 h-10 text-sm flex items-center justify-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Créer le contrat
        </button>
      </div>
    </SlidePanel>
  );
}

// ─── Shared Components ────────────────────────────────────────────────────────

function Field({
  label, value, onChange, placeholder = '', type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="text-xs text-slate-400 block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input w-full text-sm"
      />
    </div>
  );
}

function SlidePanel({
  title, children, onClose, wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <div className={`flex flex-col h-full bg-surface-card border-l border-surface-border shadow-xl overflow-hidden
        ${wide ? 'w-full max-w-2xl' : 'w-full max-w-md'}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border shrink-0">
          <h2 className="font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-between">
          {children}
        </div>
      </div>
    </div>
  );
}
