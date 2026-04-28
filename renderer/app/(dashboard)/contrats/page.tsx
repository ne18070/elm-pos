'use client';
import { toUserError } from '@/lib/user-error';
import { displayCurrency } from '@/lib/utils';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus, Car, FileText, Pencil, Trash2, X, Loader2,
  Send, Archive, Share2, CheckCircle, Clock, FileSignature,
  ChevronLeft, Eye, Download, Copy, Check, Bold, Italic,
  List, Heading2, Minus, Type, Banknote, AlertCircle, RefreshCw,
  PenLine, RotateCcw, ExternalLink, XCircle, Upload,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import {
  getVehicles, createVehicle, updateVehicle, deleteVehicle, toggleVehicleAvailability,
  getTemplates, createTemplate, updateTemplate, deleteTemplate,
  getContracts, createContract, updateContract, sendContract, archiveContract, cancelContract, savePdfUrl,
  saveContractInspection,
  buildWhatsAppLink, fillTemplate, uploadVehicleImage, uploadContractPdf,
  recordPayment, uploadLessorSignature, saveLessorSignature,
  uploadContractDocument,
  PAYMENT_METHOD_LABELS,
  type RentalVehicle, type ContractTemplate, type Contract, type ContractInspection, type CreateContractInput,
  type PaymentMethod, type RequiredContractDocument,
} from '@services/supabase/contracts';
import { generateContractPdf, imageUrlToDataUrl, dataUrlToBlob } from '@/lib/contract-pdf';
import { getClients, type Client } from '@services/supabase/clients';
import { buildPublicBusinessRef } from '@services/supabase/public-business-ref';

// ------ Helpers ------------------------------------------------------------------------------------------------------------------------------------

type Tab = 'contrats' | 'vehicules' | 'modeles';

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  draft:    { label: 'Brouillon',  color: 'bg-surface-input text-content-muted' },
  sent:     { label: 'Envoyé',     color: 'bg-badge-info text-blue-300' },
  signed:   { label: 'Signé',      color: 'bg-badge-success text-status-success' },
  active:   { label: 'En cours',   color: 'bg-badge-warning text-status-warning' },
  archived: { label: 'Archivé',    color: 'bg-surface-card text-content-muted' },
  cancelled:{ label: 'Annulé',     color: 'bg-badge-error text-status-error' },
};

const PAYMENT_STATUS_CFG = {
  pending: { label: 'Non payé', color: 'bg-badge-error text-status-error'     },
  partial: { label: 'Acompte',  color: 'bg-badge-warning text-status-warning' },
  paid:    { label: 'Payé',     color: 'bg-badge-success text-status-success' },
} as const;

const TODAY = new Date().toISOString().split('T')[0];
const TOMORROW = new Date(Date.now() + 86400000).toISOString().split('T')[0];
const DEFAULT_START_TIME = '09:00';
const DEFAULT_END_TIME = '18:00';

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtMoney(amount: number | null, currency: string) {
  if (amount == null) return '-';
  return `${amount.toLocaleString('fr-FR')} ${displayCurrency(currency)}`;
}

function fmtTime(t?: string | null) {
  return t ? t.slice(0, 5) : '-';
}

function toRentalDateTime(date: string, time: string | null | undefined, fallback: string) {
  return new Date(`${date}T${(time || fallback).slice(0, 5)}:00`);
}

function rentalDaysCount(startDate: string, startTime: string, endDate: string, endTime: string): number {
  const start = toRentalDateTime(startDate, startTime, DEFAULT_START_TIME);
  const end = toRentalDateTime(endDate, endTime, DEFAULT_END_TIME);
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
}

function isValidRentalPeriod(startDate: string, startTime: string, endDate: string, endTime: string): boolean {
  return toRentalDateTime(endDate, endTime, DEFAULT_END_TIME).getTime() >
    toRentalDateTime(startDate, startTime, DEFAULT_START_TIME).getTime();
}

function makeRequiredDocument(label: string): RequiredContractDocument {
  const key = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || `document_${Date.now()}`;
  return { key: `${key}_${Date.now()}`, label: label.trim() };
}

function getAppUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}

function isClosedContract(c: Contract): boolean {
  return c.status === 'archived' || c.status === 'cancelled';
}

// ------ Default contract template ------------------------------------------------------------------------------------------------

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
    <li><strong>Date de prise en charge :</strong> {{start_date}} à {{start_time}}</li>
    <li><strong>Date de restitution :</strong> {{end_date}} à {{end_time}}</li>
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

  <table style="width: 100%; margin-top: 60px; border-collapse: collapse;">
    <tr>
      <td style="width: 50%; text-align: center; vertical-align: top; padding: 10px;">
        <p style="margin: 0 0 8px 0;"><strong>Le Loueur</strong></p>
        <div style="height: 80px; border-top: 1px solid #ccc; margin-top: 8px;">{{lessor_signature_block}}</div>
      </td>
      <td style="width: 50%; text-align: center; vertical-align: top; padding: 10px;">
        <p style="margin: 0 0 4px 0;"><strong>Le Locataire</strong></p>
        <p style="margin: 0 0 8px 0; font-size: 12px; color: #666;">Lu et approuvé</p>
        <div style="height: 80px; border-top: 1px solid #ccc; margin-top: 8px;">{{signature_block}}</div>
      </td>
    </tr>
  </table>
</div>`;

// ------ Component: Signature Canvas --------------------------------------------------------------------------------------------

function LessorSignatureCanvas({
  canvasRef, hasStrokesRef, onDrawStart
}: {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  hasStrokesRef: React.MutableRefObject<boolean>;
  onDrawStart?: () => void;
}) {
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function getPos(e: MouseEvent | Touch) {
      const r = canvas!.getBoundingClientRect();
      const scaleX = canvas!.width / r.width;
      const scaleY = canvas!.height / r.height;
      return { x: (e.clientX - r.left) * scaleX, y: (e.clientY - r.top) * scaleY };
    }

    function start(x: number, y: number) {
      drawing.current = true;
      hasStrokesRef.current = true;
      const ctx = canvas!.getContext('2d');
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1e293b';
      if (onDrawStart) onDrawStart();
    }

    function move(x: number, y: number) {
      if (!drawing.current) return;
      const ctx = canvas!.getContext('2d');
      if (!ctx) return;
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    function stop() { drawing.current = false; }

    // Native touch listeners (passive: false for e.preventDefault)
    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const pos = getPos(e.touches[0]);
      start(pos.x, pos.y);
    };
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const pos = getPos(e.touches[0]);
      move(pos.x, pos.y);
    };
    const handleTouchEnd = () => stop();

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  handleTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   handleTouchEnd);

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove',  handleTouchMove);
      canvas.removeEventListener('touchend',   handleTouchEnd);
    };
  }, [canvasRef, hasStrokesRef]);

  return (
    <canvas
      ref={canvasRef}
      width={500}
      height={150}
      className="w-full touch-none cursor-crosshair"
      style={{ display: 'block' }}
      onMouseDown={(e) => {
        const pos = {
          x: (e.clientX - e.currentTarget.getBoundingClientRect().left) * (e.currentTarget.width / e.currentTarget.getBoundingClientRect().width),
          y: (e.clientY - e.currentTarget.getBoundingClientRect().top) * (e.currentTarget.height / e.currentTarget.getBoundingClientRect().height)
        };
        // Re-calculate pos inside to be safe with React event
        const r = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - r.left) * (e.currentTarget.width / r.width);
        const y = (e.clientY - r.top) * (e.currentTarget.height / r.height);
        drawing.current = true;
        hasStrokesRef.current = true;
        const ctx = e.currentTarget.getContext('2d');
        if (ctx) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.strokeStyle = '#1e293b';
        }
        if (onDrawStart) onDrawStart();
      }}
      onMouseMove={(e) => {
        if (!drawing.current) return;
        const r = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - r.left) * (e.currentTarget.width / r.width);
        const y = (e.clientY - r.top) * (e.currentTarget.height / r.height);
        const ctx = e.currentTarget.getContext('2d');
        if (ctx) {
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      }}
      onMouseUp={() => { drawing.current = false; }}
      onMouseLeave={() => { drawing.current = false; }}
    />
  );
}

// ------ Page principale --------------------------------------------------------------------------------------------------------------------

function InspectionSummary({
  title,
  inspection,
  actionLabel,
  disabled,
  onEdit,
}: {
  title: string;
  inspection: ContractInspection | null;
  actionLabel: string;
  disabled: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="rounded-xl bg-surface-input p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-content-primary">{title}</p>
        <button type="button" onClick={onEdit} disabled={disabled}
          className="text-xs px-2 py-1 rounded-lg border border-surface-border text-content-secondary hover:text-content-primary hover:bg-surface-hover disabled:opacity-40">
          {actionLabel}
        </button>
      </div>
      {inspection ? (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <p><span className="text-content-muted">Km:</span> {inspection.mileage?.toLocaleString('fr-FR') ?? '-'}</p>
          <p><span className="text-content-muted">Carburant:</span> {inspection.fuel_level ?? '-'}</p>
          <p><span className="text-content-muted">Etat:</span> {inspection.condition ?? '-'}</p>
          <p><span className="text-content-muted">Date:</span> {fmtDate(inspection.done_at)}</p>
          {inspection.notes && <p className="col-span-2 text-content-secondary">{inspection.notes}</p>}
        </div>
      ) : (
        <p className="text-xs text-content-muted">Non renseigne.</p>
      )}
    </div>
  );
}

function InspectionForm({
  form,
  onChange,
  showCharges,
  saving,
  onCancel,
  onSave,
}: {
  form: { mileage: string; fuel_level: string; condition: string; notes: string; charges: string };
  onChange: (patch: Partial<{ mileage: string; fuel_level: string; condition: string; notes: string; charges: string }>) => void;
  showCharges: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="rounded-xl border border-surface-border p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label text-xs">Kilometrage</label><input type="number" className="input text-sm h-9" value={form.mileage} onChange={(e) => onChange({ mileage: e.target.value })} /></div>
        <div><label className="label text-xs">Carburant</label><select className="input text-sm h-9" value={form.fuel_level} onChange={(e) => onChange({ fuel_level: e.target.value })}><option value="full">Plein</option><option value="three_quarters">3/4</option><option value="half">1/2</option><option value="quarter">1/4</option><option value="empty">Vide</option></select></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label text-xs">Etat</label><select className="input text-sm h-9" value={form.condition} onChange={(e) => onChange({ condition: e.target.value })}><option value="ok">Bon etat</option><option value="dirty">Sale</option><option value="damaged">Dommage constate</option><option value="mechanical_issue">Probleme mecanique</option></select></div>
        {showCharges && <div><label className="label text-xs">Frais retour</label><input type="number" className="input text-sm h-9" value={form.charges} onChange={(e) => onChange({ charges: e.target.value })} /></div>}
      </div>
      <div><label className="label text-xs">Notes</label><textarea className="input text-sm resize-none" rows={2} value={form.notes} onChange={(e) => onChange({ notes: e.target.value })} /></div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1 h-9 text-sm">Annuler</button>
        <button type="button" onClick={onSave} disabled={saving} className="btn-primary flex-1 h-9 text-sm flex items-center justify-center gap-2 disabled:opacity-60">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}Enregistrer</button>
      </div>
    </div>
  );
}

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
  const [editContract, setEditContract]   = useState<Contract | null>(null);

  const [copied, setCopied] = useState(false);
  const [showShare, setShowShare] = useState(false);

  // Payment
  const [paymentForm, setPaymentForm] = useState<{
    amount_paid: string; payment_date: string; payment_method: PaymentMethod;
  }>({ amount_paid: '', payment_date: new Date().toISOString().split('T')[0], payment_method: 'cash' });
  const [savingPayment, setSavingPayment] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [savingInspection, setSavingInspection] = useState(false);
  const [inspectionEditor, setInspectionEditor] = useState<'pickup' | 'return' | null>(null);
  const [inspectionForm, setInspectionForm] = useState({
    mileage: '',
    fuel_level: 'full',
    condition: 'ok',
    notes: '',
    charges: '',
  });

  // Signature loueur
  const [lessorSigOpen, setLessorSigOpen]   = useState(false);
  const [lessorSigTab, setLessorSigTab]     = useState<'draw' | 'upload'>('draw');
  const [lessorSigFile, setLessorSigFile]   = useState<string | null>(null); // data URL
  const [savingLessorSig, setSavingLessorSig] = useState(false);
  const lessorCanvasRef   = useRef<HTMLCanvasElement>(null);
  const lessorHasStrokes  = useRef(false);

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

  // ------ Realtime: notification quand un locataire signe ------------------------------------------

  useEffect(() => {
    if (!business?.id) return;

    // Rafraîchissement général (INSERT/UPDATE sur contracts)
    const handleChanged = () => { load(); };
    window.addEventListener('elm-pos:contracts:changed', handleChanged);

    // Notification spéciale : contrat signé par le locataire
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

  // ------ Contract actions ----------------------------------------------------------------------------------------------------------

  async function handleSend(c: Contract) {
    try {
      await sendContract(c.id);
      notifSuccess('Contrat envoyé — lien de signature actif 7 jours');
      const [v, t, freshContracts] = await Promise.all([
        getVehicles(business!.id),
        getTemplates(business!.id),
        getContracts(business!.id),
      ]);
      setVehicles(v);
      setTemplates(t);
      setContracts(freshContracts);
      if (detailContract?.id === c.id) {
        const fresh = freshContracts.find((x) => x.id === c.id);
        if (fresh) setDetailContract(fresh);
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

  async function handleCancel(c: Contract) {
    const reason = window.prompt(
      'Motif d\'annulation du contrat',
      'Non-respect des conditions de location'
    );
    if (reason === null) return;

    const confirmed = window.confirm(
      'Annuler ce contrat ? Le vehicule sera remis disponible si aucun autre contrat actif ne l\'utilise.'
    );
    if (!confirmed) return;

    try {
      await cancelContract(c.id, reason);
      notifSuccess('Contrat annulé');
      load();
      setDetailContract({
        ...c,
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason.trim() || null,
      });
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

  async function handleRecordPayment(c: Contract) {
    if (!business) return;
    const amount = parseFloat(paymentForm.amount_paid);
    if (!amount || amount <= 0) { notifError('Montant invalide'); return; }
    setSavingPayment(true);
    try {
      await recordPayment(c.id, business.id, {
        amount_paid:    amount,
        payment_date:   paymentForm.payment_date,
        payment_method: paymentForm.payment_method,
      }, { client_name: c.client_name, total_amount: c.total_amount });
      notifSuccess('Paiement enregistré et écriture comptable créée');
      load();
      setDetailContract({
        ...c,
        amount_paid:    amount,
        payment_date:   paymentForm.payment_date,
        payment_method: paymentForm.payment_method,
      });
    } catch (e) {
      notifError(toUserError(e));
    } finally {
      setSavingPayment(false);
    }
  }

  async function handleUploadDocuments(c: Contract, files: FileList | null | undefined) {
    if (!files || files.length === 0) return;
    setUploadingDocument(true);
    try {
      let documents = c.documents ?? [];
      for (const file of Array.from(files)) {
        documents = await uploadContractDocument(c.id, file, documents);
      }
      const updated = { ...c, documents };
      setDetailContract(updated);
      setContracts((prev) => prev.map((x) => x.id === c.id ? updated : x));
      notifSuccess(files.length > 1 ? 'Documents ajoutés au contrat' : 'Document ajouté au contrat');
    } catch (e) {
      notifError(toUserError(e));
    } finally {
      setUploadingDocument(false);
    }
  }

  async function handleSaveLessorSignature(c: Contract, sigDataUrl: string) {
    setSavingLessorSig(true);
    try {
      const blob = dataUrlToBlob(sigDataUrl);
      const url  = await uploadLessorSignature(c.id, blob);
      await saveLessorSignature(c.id, url);

      // Regénérer le PDF avec les deux signatures
      try {
        const clientSrc = c.signature_image
          ? await imageUrlToDataUrl(c.signature_image)
          : '';
        if (clientSrc) {
          const pdfBlob = await generateContractPdf(c.body, clientSrc, sigDataUrl);
          const pdfUrl  = await uploadContractPdf(c.token, pdfBlob);
          await savePdfUrl(c.token, pdfUrl);
          const updated = { ...c, lessor_signature_image: url, pdf_url: pdfUrl };
          setDetailContract(updated);
          setContracts((prev) => prev.map((x) => x.id === c.id ? updated : x));
        } else {
          const updated = { ...c, lessor_signature_image: url };
          setDetailContract(updated);
          setContracts((prev) => prev.map((x) => x.id === c.id ? updated : x));
        }
      } catch {
        const updated = { ...c, lessor_signature_image: url };
        setDetailContract(updated);
        setContracts((prev) => prev.map((x) => x.id === c.id ? updated : x));
      }

      setLessorSigOpen(false);
      lessorHasStrokes.current = false;
      notifSuccess('Signature du loueur enregistrée');
    } catch (e) {
      notifError(toUserError(e));
    } finally {
      setSavingLessorSig(false);
    }
  }

  function lessorClearCanvas() {
    const canvas = lessorCanvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    lessorHasStrokes.current = false;
  }

  function paymentStatus(c: Contract): 'pending' | 'partial' | 'paid' {
    if (!c.amount_paid || c.amount_paid <= 0) return 'pending';
    if (c.total_amount && c.amount_paid >= c.total_amount) return 'paid';
    return 'partial';
  }

  function fillInspectionForm(c: Contract, type: 'pickup' | 'return') {
    const inspection = type === 'pickup' ? c.pickup_inspection : c.return_inspection;
    setInspectionForm({
      mileage: inspection?.mileage?.toString() ?? '',
      fuel_level: inspection?.fuel_level ?? 'full',
      condition: inspection?.condition ?? 'ok',
      notes: inspection?.notes ?? '',
      charges: inspection?.charges?.toString() ?? '',
    });
  }

  async function handleSaveInspection(c: Contract, type: 'pickup' | 'return') {
    const parsedMileage = inspectionForm.mileage ? parseInt(inspectionForm.mileage, 10) : null;
    const charges = type === 'return' && inspectionForm.charges ? parseFloat(inspectionForm.charges) : 0;
    setSavingInspection(true);
    try {
      const updated = await saveContractInspection(c.id, type, {
        mileage: Number.isFinite(parsedMileage) ? parsedMileage : null,
        fuel_level: inspectionForm.fuel_level || null,
        condition: inspectionForm.condition || null,
        notes: inspectionForm.notes.trim() || null,
        charges,
      });
      setDetailContract(updated);
      setContracts((prev) => prev.map((x) => x.id === updated.id ? updated : x));
      await load();
      notifSuccess(type === 'pickup' ? 'Etat de depart enregistre' : 'Retour enregistre et contrat archive');
      setInspectionEditor(null);
    } catch (e) {
      notifError(toUserError(e));
    } finally {
      setSavingInspection(false);
    }
  }


  // ------ Loading ----------------------------------------------------------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  // ------ Detail panel ------------------------------------------------------------------------------------------------------------------------

  if (detailContract) {
    const c = detailContract;
    const status = STATUS_CFG[c.status] ?? STATUS_CFG.draft;
    const link = contractLink(c);
    return (
      <>
      <div className="h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border bg-surface-card shrink-0">
          <button onClick={() => setDetailContract(null)} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors">
            <ChevronLeft className="w-5 h-5 text-content-secondary" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-content-primary truncate">{c.client_name}</p>
            <p className="text-xs text-content-secondary">
              {fmtDate(c.start_date)} {fmtTime(c.start_time)} → {fmtDate(c.end_date)} {fmtTime(c.end_time)}
            </p>
          </div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.color}`}>{status.label}</span>
          {!isClosedContract(c) && (
            <button
              onClick={() => { setEditContract(c); setShowContractPanel(true); }}
              className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors"
              title="Modifier le contrat"
            >
              <Pencil className="w-4 h-4 text-content-secondary" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Infos */}
          <div className="card p-4 space-y-2">
            <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider">Client</h3>
            <p className="text-content-primary font-medium">{c.client_name}</p>
            {c.client_phone && <p className="text-sm text-content-secondary">{c.client_phone}</p>}
            {c.client_email && <p className="text-sm text-content-secondary">{c.client_email}</p>}
            {c.client_id_number && <p className="text-sm text-content-secondary">Pièce : {c.client_id_number}</p>}
            {c.client_address && <p className="text-sm text-content-secondary">{c.client_address}</p>}
          </div>

          <div className="card p-4 space-y-2">
            <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider">Location</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><p className="text-content-muted">Départ</p><p className="text-content-primary">{fmtDate(c.start_date)} à {fmtTime(c.start_time)}</p></div>
              <div><p className="text-content-muted">Retour</p><p className="text-content-primary">{fmtDate(c.end_date)} à {fmtTime(c.end_time)}</p></div>
              {c.pickup_location && <div><p className="text-content-muted">Lieu prise</p><p className="text-content-primary">{c.pickup_location}</p></div>}
              {c.return_location && <div><p className="text-content-muted">Lieu retour</p><p className="text-content-primary">{c.return_location}</p></div>}
              <div><p className="text-content-muted">Prix/jour</p><p className="text-content-primary">{fmtMoney(c.price_per_day, c.currency)}</p></div>
              <div><p className="text-content-muted">Total</p><p className="text-content-brand font-semibold">{fmtMoney(c.total_amount, c.currency)}</p></div>
              <div><p className="text-content-muted">Caution</p><p className="text-content-primary">{fmtMoney(c.deposit_amount, c.currency)}</p></div>
              {c.extra_charges != null && c.extra_charges > 0 && (
                <div><p className="text-content-muted">Frais retour</p><p className="text-status-warning">{fmtMoney(c.extra_charges, c.currency)}</p></div>
              )}
            </div>
          </div>

          <div className="card p-4 space-y-4">
            <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider">Etat du vehicule</h3>

            <InspectionSummary
              title="Depart"
              inspection={c.pickup_inspection}
              actionLabel={c.pickup_inspection ? 'Modifier depart' : 'Faire le check-in'}
              disabled={isClosedContract(c) || (c.status !== 'signed' && c.status !== 'active')}
              onEdit={() => {
                fillInspectionForm(c, 'pickup');
                setInspectionEditor(inspectionEditor === 'pickup' ? null : 'pickup');
              }}
            />
            {inspectionEditor === 'pickup' && (
              <InspectionForm
                form={inspectionForm}
                onChange={(patch) => setInspectionForm((f) => ({ ...f, ...patch }))}
                showCharges={false}
                saving={savingInspection}
                onCancel={() => setInspectionEditor(null)}
                onSave={() => handleSaveInspection(c, 'pickup')}
              />
            )}

            <InspectionSummary
              title="Retour"
              inspection={c.return_inspection}
              actionLabel={c.return_inspection ? 'Modifier retour' : 'Faire le check-out'}
              disabled={isClosedContract(c) || !c.pickup_inspection}
              onEdit={() => {
                fillInspectionForm(c, 'return');
                setInspectionEditor(inspectionEditor === 'return' ? null : 'return');
              }}
            />
            {inspectionEditor === 'return' && (
              <InspectionForm
                form={inspectionForm}
                onChange={(patch) => setInspectionForm((f) => ({ ...f, ...patch }))}
                showCharges
                saving={savingInspection}
                onCancel={() => setInspectionEditor(null)}
                onSave={() => handleSaveInspection(c, 'return')}
              />
            )}
          </div>

          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider">Documents joints</h3>
              {!isClosedContract(c) && (
                <label className="btn-secondary h-8 px-3 text-xs flex items-center gap-2 cursor-pointer">
                  {uploadingDocument ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Ajouter
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    multiple
                    className="hidden"
                    disabled={uploadingDocument}
                    onChange={(e) => {
                      handleUploadDocuments(c, e.target.files);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
              )}
            </div>
            {c.required_documents && c.required_documents.length > 0 && (
              <div className="rounded-xl bg-surface-input px-3 py-2">
                <p className="text-xs text-content-secondary mb-1">Requis avant signature</p>
                <div className="flex flex-wrap gap-1.5">
                  {c.required_documents.map((doc) => (
                    <span key={doc.key} className="rounded-full bg-surface-card border border-surface-border px-2 py-0.5 text-[11px] text-content-secondary">
                      {doc.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {c.documents && c.documents.length > 0 ? (
              <div className="space-y-2">
                {c.documents.map((doc, idx) => (
                  <a
                    key={`${doc.url}-${idx}`}
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 rounded-xl bg-surface-input px-3 py-2 text-sm hover:bg-surface-hover"
                  >
                    <span className="text-white truncate">{doc.name}</span>
                    <ExternalLink className="w-4 h-4 text-content-secondary shrink-0" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-content-secondary">Aucun document joint. Vous pouvez ajouter une CNI, un permis ou un justificatif.</p>
            )}
          </div>

          {/* ---- Paiement ---- */}
          {!isClosedContract(c) && (
            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider flex items-center gap-2">
                  <Banknote className="w-4 h-4" /> Paiement encaissé
                </h3>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PAYMENT_STATUS_CFG[paymentStatus(c)].color}`}>
                  {PAYMENT_STATUS_CFG[paymentStatus(c)].label}
                </span>
              </div>

              {/* Résumé si déjà payé */}
              {c.amount_paid != null && c.amount_paid > 0 && (
                <div className="bg-surface-input rounded-xl p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-content-secondary">Montant encaissé</span>
                    <span className="text-status-success font-semibold">{fmtMoney(c.amount_paid, c.currency)}</span>
                  </div>
                  {c.total_amount != null && c.amount_paid < c.total_amount && (
                    <div className="flex justify-between">
                      <span className="text-content-secondary">Reste dû</span>
                      <span className="text-status-warning font-semibold">{fmtMoney(c.total_amount - c.amount_paid, c.currency)}</span>
                    </div>
                  )}
                  {c.payment_date && (
                    <div className="flex justify-between">
                      <span className="text-content-secondary">Date</span>
                      <span className="text-content-secondary">{fmtDate(c.payment_date)}</span>
                    </div>
                  )}
                  {c.payment_method && (
                    <div className="flex justify-between">
                      <span className="text-content-secondary">Méthode</span>
                      <span className="text-content-secondary">{PAYMENT_METHOD_LABELS[c.payment_method]}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Formulaire enregistrement */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label text-xs">Montant encaissé</label>
                    <input
                      type="number"
                      className="input text-sm h-9"
                      placeholder={c.total_amount?.toString() ?? '0'}
                      value={paymentForm.amount_paid}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, amount_paid: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="label text-xs">Date</label>
                    <input
                      type="date"
                      className="input text-sm h-9"
                      value={paymentForm.payment_date}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, payment_date: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="label text-xs">Méthode de paiement</label>
                  <select
                    className="input text-sm h-10"
                    value={paymentForm.payment_method}
                    onChange={(e) => setPaymentForm((p) => ({ ...p, payment_method: e.target.value as PaymentMethod }))}
                  >
                    {(Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => handleRecordPayment(c)}
                  disabled={savingPayment || !paymentForm.amount_paid}
                  className="btn-primary w-full flex items-center justify-center gap-2 text-sm h-10 disabled:opacity-50"
                >
                  {savingPayment
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <><Banknote className="w-4 h-4" />{c.amount_paid ? 'Mettre à jour le paiement' : 'Enregistrer le paiement'}</>}
                </button>
                {c.amount_paid != null && c.amount_paid > 0 && (
                  <p className="text-[11px] text-content-muted text-center flex items-center justify-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Une écriture comptable est automatiquement créée / mise à jour
                  </p>
                )}
              </div>
            </div>
          )}

          {c.status === 'cancelled' && (
            <div className="card p-4 space-y-2 border-status-error/40">
              <h3 className="text-xs font-semibold text-status-error uppercase tracking-wider flex items-center gap-2">
                <XCircle className="w-4 h-4" /> Contrat annulé
              </h3>
              {c.cancelled_at && <p className="text-sm text-content-secondary">Le {fmtDate(c.cancelled_at)}</p>}
              {c.cancellation_reason && (
                <p className="text-sm text-white whitespace-pre-wrap">{c.cancellation_reason}</p>
              )}
            </div>
          )}

          {/* ---- Contrat signé : lecture seule ---- */}
          {c.status === 'signed' && (
            <div className="card p-4 space-y-3">
              <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-status-success" /> Signé
              </h3>
              {c.signed_at && <p className="text-sm text-content-secondary">Le {fmtDate(c.signed_at)}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center">
                  <p className="text-xs text-content-muted mb-2">Loueur</p>
                  {c.lessor_signature_image
                    ? <img src={c.lessor_signature_image} alt="signature loueur" className="h-14 bg-white rounded-xl p-2 object-contain mx-auto" />
                    : <p className="text-xs text-content-muted italic">Non signé</p>}
                </div>
                <div className="text-center">
                  <p className="text-xs text-content-muted mb-2">Locataire</p>
                  {c.signature_image
                    ? <img src={c.signature_image} alt="signature locataire" className="h-14 bg-white rounded-xl p-2 object-contain mx-auto" />
                    : <p className="text-xs text-content-muted italic">Non signé</p>}
                </div>
              </div>
              {c.pdf_url && (
                <a href={c.pdf_url} target="_blank" rel="noreferrer"
                   className="btn-secondary text-sm flex items-center gap-2 w-full justify-center">
                  <Download className="w-4 h-4" /> Télécharger PDF
                </a>
              )}
            </div>
          )}

          {/* ---- Signature du loueur + envoi (draft) ---- */}
          {c.status === 'draft' && (
            <div className="card p-4 space-y-4">
              <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider flex items-center gap-2">
                <PenLine className="w-4 h-4" /> Votre signature (loueur)
              </h3>

              {c.lessor_signature_image && !lessorSigOpen ? (
                <div className="space-y-2">
                  <img src={c.lessor_signature_image} alt="signature loueur" className="h-16 bg-white rounded-xl p-2 object-contain" />
                  <button onClick={() => { setLessorSigOpen(true); setLessorSigTab('draw'); lessorClearCanvas(); }}
                          className="text-xs text-content-secondary hover:text-content-primary transition-colors flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" /> Remplacer
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Tabs */}
                  <div className="flex gap-1 bg-surface-input rounded-lg p-1">
                    {(['draw', 'upload'] as const).map((t) => (
                      <button key={t}
                              onClick={() => { setLessorSigTab(t); setLessorSigFile(null); lessorClearCanvas(); }}
                              className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${lessorSigTab === t ? 'bg-brand-600 text-white' : 'text-content-secondary hover:text-content-primary'}`}>
                        {t === 'draw' ? 'Dessiner' : 'Uploader'}
                      </button>
                    ))}
                  </div>

                  {lessorSigTab === 'draw' && (
                    <div>
                      <div className="border border-dashed border-surface-border rounded-xl overflow-hidden bg-white">
                        <LessorSignatureCanvas
                          canvasRef={lessorCanvasRef}
                          hasStrokesRef={lessorHasStrokes}
                        />
                      </div>
                      <div className="flex justify-end mt-1">
                        <button onClick={lessorClearCanvas} className="text-xs text-content-secondary hover:text-content-primary flex items-center gap-1">
                          <RotateCcw className="w-3 h-3" /> Effacer
                        </button>
                      </div>
                    </div>
                  )}

                  {lessorSigTab === 'upload' && (
                    <label className="block cursor-pointer">
                      <div className="border border-dashed border-surface-border rounded-xl p-4 text-center hover:border-brand-500 transition-colors">
                        {lessorSigFile
                          ? <img src={lessorSigFile} alt="preview" className="h-16 mx-auto object-contain" />
                          : <p className="text-xs text-content-secondary">Cliquez pour choisir une image (PNG/JPG)</p>}
                      </div>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                        const file = e.target.files?.[0]; if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => setLessorSigFile(reader.result as string);
                        reader.readAsDataURL(file);
                      }} />
                    </label>
                  )}

                  <button
                    disabled={savingLessorSig}
                    onClick={() => {
                      if (lessorSigTab === 'draw') {
                        if (!lessorHasStrokes.current) { notifError('Veuillez dessiner votre signature'); return; }
                        handleSaveLessorSignature(c, lessorCanvasRef.current!.toDataURL('image/png'));
                      } else {
                        if (!lessorSigFile) { notifError('Veuillez choisir une image'); return; }
                        handleSaveLessorSignature(c, lessorSigFile);
                      }
                    }}
                    className="btn-primary w-full flex items-center justify-center gap-2 text-sm h-9 disabled:opacity-60">
                    {savingLessorSig
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <><CheckCircle className="w-4 h-4" /> Enregistrer ma signature</>}
                  </button>
                </div>
              )}

              <div className="border-t border-surface-border pt-3">
                {!c.lessor_signature_image && (
                  <p className="text-xs text-status-warning mb-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" /> Signez le contrat avant de l'envoyer
                  </p>
                )}
                <button onClick={() => handleSend(c)}
                        className="btn-primary w-full flex items-center justify-center gap-2 text-sm h-10">
                  <Send className="w-4 h-4" /> Envoyer pour signature
                </button>
              </div>
            </div>
          )}

          {/* ---- Lien actif (sent) ---- */}
          {c.status === 'sent' && (
            <div className="card p-4 space-y-3">
              <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider">Lien de signature</h3>
              <div className="flex items-center gap-2 bg-surface-input rounded-xl px-3 py-2">
                <p className="text-xs text-content-secondary truncate flex-1">{link}</p>
                <button onClick={() => handleCopyLink(c)} className="shrink-0 text-content-secondary hover:text-content-primary transition-colors">
                  {copied ? <Check className="w-4 h-4 text-status-success" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleWhatsApp(c)} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm h-10">
                  <Share2 className="w-4 h-4" /> WhatsApp
                </button>
                <button onClick={() => handleSend(c)} className="btn-secondary flex items-center justify-center gap-2 text-sm h-10 px-3" title="Regénérer le lien (nouveau token, 7 jours)">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-content-muted text-center">
                Expire le {fmtDate(c.token_expires_at)}
              </p>
            </div>
          )}

          {/* Contenu du contrat */}
          <div className="card p-4">
            <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider mb-3">Contenu du contrat</h3>
            <div
              className="bg-white rounded-xl p-4 text-sm text-gray-800 overflow-auto max-h-96"
              dangerouslySetInnerHTML={{ __html: c.body }}
            />
          </div>
        </div>

        {/* Footer actions */}
        {!isClosedContract(c) && (
          <div className="shrink-0 p-4 border-t border-surface-border flex gap-2">
            {c.status === 'sent' && (
              <button onClick={() => handleWhatsApp(c)} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm h-10">
                <Share2 className="w-4 h-4" /> WhatsApp
              </button>
            )}
            <button onClick={() => handleCancel(c)} className="btn-secondary flex items-center justify-center gap-2 text-sm h-10 px-4 text-status-error">
              <XCircle className="w-4 h-4" /> Annuler
            </button>
            <button onClick={() => handleArchive(c)} className="btn-secondary flex items-center justify-center gap-2 text-sm h-10 px-4">
              <Archive className="w-4 h-4" /> Archiver
            </button>
          </div>
        )}
      </div>

      {/* Overlay d'édition — doit être dans ce return pour être au-dessus du detail */}
      {showContractPanel && (
        <ContractPanel
          vehicles={vehicles}
          templates={templates}
          contracts={contracts}
          businessId={business?.id ?? ''}
          userId={user?.id ?? ''}
          businessName={business?.name ?? ''}
          currency={business?.currency ?? 'XOF'}
          contract={editContract}
          onClose={() => { setShowContractPanel(false); setEditContract(null); }}
          onSaved={(saved) => {
            setShowContractPanel(false);
            setEditContract(null);
            load();
            setDetailContract(saved);
          }}
          notifError={notifError}
          notifSuccess={notifSuccess}
        />
      )}
      </>
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
          <p className="text-xs text-content-secondary">Baux, locations de véhicules et modèles de contrats réutilisables</p>
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

        {/* ---- Contrats tab ---- */}
        {tab === 'contrats' && (
          <div className="divide-y divide-surface-border">
            {contracts.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-content-muted">
                <FileText className="w-10 h-10" />
                <p className="text-sm">Aucun contrat — créez-en un</p>
              </div>
            )}
            {contracts.map((c) => {
              const st = STATUS_CFG[c.status] ?? STATUS_CFG.draft;
              return (
                <button
                  key={c.id}
                  onClick={() => { setDetailContract(c); setLessorSigOpen(false); setLessorSigFile(null); }}
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
                      {(c as Contract & { rental_vehicles?: { name: string; license_plate: string | null } }).rental_vehicles?.name ?? '-'} 
                      {' · '}{fmtDate(c.start_date)} {fmtTime(c.start_time)} → {fmtDate(c.end_date)} {fmtTime(c.end_time)}                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                    <span className="text-xs text-content-brand font-medium">{fmtMoney(c.total_amount, c.currency)}</span>
                    {!isClosedContract(c) && (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${PAYMENT_STATUS_CFG[paymentStatus(c)].color}`}>
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
              </div>
            )}
            {vehicles.map((v) => {
              // Contrats actifs liés à ce véhicule
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
                    {v.price_per_hour ? ` · ${v.price_per_hour.toLocaleString('fr-FR')}/h` : ''}
                  </p>
                  {v.owner_type === 'third_party' && (
                    <p className="text-[10px] text-status-warning mt-0.5">
                      Mandat: {v.owner_name ?? 'propriétaire tiers'} · commission {v.commission_type === 'percent' ? `${v.commission_value}%` : `${v.commission_value.toLocaleString('fr-FR')} ${displayCurrency(v.currency)}`}
                    </p>
                  )}
                  {activeContracts.length > 0 && (
                    <button
                      onClick={() => { setTab('contrats'); setDetailContract(activeContracts[0]); }}
                      className="mt-1 text-[10px] text-status-warning hover:text-status-warning flex items-center gap-1"
                    >
                      <FileText className="w-3 h-3" />
                      {activeContracts.length} contrat{activeContracts.length > 1 ? 's' : ''} actif{activeContracts.length > 1 ? 's' : ''} — {activeContracts[0].client_name}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {v.owner_type === 'third_party' && v.owner_report_token && (
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(`${getAppUrl()}/proprietaire/vehicule/${v.owner_report_token}`);
                        notifSuccess('Lien proprietaire copie');
                      }}
                      className="p-1.5 rounded-lg text-content-secondary hover:text-status-success hover:bg-green-500/10 transition-colors"
                      title="Copier le lien proprietaire"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      try {
                        await toggleVehicleAvailability(v.id, !v.is_available);
                        load();
                      } catch (e) { notifError(toUserError(e)); }
                    }}
                    className={`text-xs px-2 py-0.5 rounded-full transition-colors
                      ${v.is_available
                        ? 'bg-badge-success text-status-success hover:bg-badge-error hover:text-status-error'
                        : 'bg-badge-error text-status-error hover:bg-badge-success hover:text-status-success'}`}
                  >
                    {v.is_available ? 'Disponible' : 'Indispo'}
                  </button>
                  <button
                    onClick={() => { setEditVehicle(v); setShowVehiclePanel(true); }}
                    className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
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
                  <button
                    onClick={() => { setEditTemplate(t); setShowTemplatePanel(true); }}
                    className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm('Supprimer ce modèle ?')) return;
                      try { await deleteTemplate(t.id); load(); } catch (e) { notifError(toUserError(e)); }
                    }}
                    className="p-1.5 rounded-lg text-content-secondary hover:text-status-error hover:bg-surface-hover transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
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
        <ContractPanel
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowShare(false)} />
          <div className="relative bg-surface-card border border-surface-border rounded-2xl p-5 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-content-primary">Partager votre catalogue</h3>
              <button onClick={() => setShowShare(false)} className="p-1.5 rounded-lg hover:bg-surface-hover text-content-secondary">
                <X className="w-4 h-4" />
              </button>
            </div>
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
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Réservez votre véhicule en ligne : ${getAppUrl()}/location/${buildPublicBusinessRef(business.name, business.public_slug)}`)}`}
                target="_blank" rel="noopener noreferrer"
                className="btn-primary flex items-center justify-center gap-2 text-sm h-10"
              >
                <Share2 className="w-4 h-4" /> WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ------ Vehicle Panel ------------------------------------------------------------------------------------------------------------------------

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
    owner_type:      vehicle?.owner_type ?? 'owned',
    owner_name:      vehicle?.owner_name ?? '',
    owner_phone:     vehicle?.owner_phone ?? '',
    commission_type: vehicle?.commission_type ?? 'percent',
    commission_value: vehicle?.commission_value?.toString() ?? '0',
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
        owner_type:      form.owner_type as 'owned' | 'third_party',
        owner_name:      form.owner_type === 'third_party' ? form.owner_name.trim() || null : null,
        owner_phone:     form.owner_type === 'third_party' ? form.owner_phone.trim() || null : null,
        commission_type: form.commission_type as 'percent' | 'fixed',
        commission_value: parseFloat(form.commission_value) || 0,
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
          <p className="text-xs text-content-secondary mb-1">Photo</p>
          {imagePreview
            ? <div className="relative w-fit">
                <img src={imagePreview} alt="" className="h-32 w-auto rounded-xl object-cover border border-surface-border" />
                <button type="button" onClick={(e) => { e.preventDefault(); setImagePreview(''); setImageFile(null); }}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 rounded-full flex items-center justify-center">
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            : <div className="h-24 border-2 border-dashed border-surface-border rounded-xl flex items-center justify-center text-content-muted hover:border-brand-500 transition-colors">
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
            <label className="text-xs text-content-secondary block mb-1">Devise</label>
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
          <label className="text-xs text-content-secondary block mb-1">Description</label>
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)}
            rows={2} className="input w-full text-sm resize-none" placeholder="Climatisé, GPS…" />
        </div>
        <div className="pt-3 border-t border-surface-border space-y-3">
          <p className="text-xs font-semibold text-content-secondary uppercase tracking-wider">Propriété & commission</p>
          <div>
            <label className="text-xs text-content-secondary block mb-1">Propriétaire du véhicule</label>
            <select value={form.owner_type as string} onChange={(e) => set('owner_type', e.target.value)}
              className="input w-full text-sm">
              <option value="owned">Véhicule propre à l'entreprise</option>
              <option value="third_party">Véhicule confié par un tiers</option>
            </select>
          </div>
          {form.owner_type === 'third_party' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nom propriétaire" value={form.owner_name as string} onChange={(v) => set('owner_name', v)} />
                <Field label="Téléphone propriétaire" value={form.owner_phone as string} onChange={(v) => set('owner_phone', v)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-content-secondary block mb-1">Type commission</label>
                  <select value={form.commission_type as string} onChange={(e) => set('commission_type', e.target.value)}
                    className="input w-full text-sm">
                    <option value="percent">Pourcentage</option>
                    <option value="fixed">Montant fixe</option>
                  </select>
                </div>
                <Field
                  label={form.commission_type === 'percent' ? 'Commission (%)' : 'Commission fixe'}
                  value={form.commission_value as string}
                  onChange={(v) => set('commission_value', v)}
                  type="number"
                />
              </div>
            </>
          )}
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.is_available}
            onChange={(e) => set('is_available', e.target.checked)}
            className="rounded border-surface-border" />
          <span className="text-sm text-content-primary">Disponible à la location</span>
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

// ------ Template Panel ----------------------------------------------------------------------------------------------------------------------

const VARIABLES = [
  { key: 'client_name',      label: 'Nom client' },
  { key: 'client_phone',     label: 'Tél client' },
  { key: 'client_id_number', label: 'Pièce identité' },
  { key: 'client_address',   label: 'Adresse client' },
  { key: 'vehicle_name',     label: 'Véhicule' },
  { key: 'license_plate',    label: 'Immatriculation' },
  { key: 'start_date',       label: 'Date départ' },
  { key: 'start_time',       label: 'Heure départ' },
  { key: 'end_date',         label: 'Date retour' },
  { key: 'end_time',         label: 'Heure retour' },
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
    if (!editorRef.current) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = editorRef.current.innerHTML;
    // Remplacer les chips de variables par leur texte brut {{key}}
    tmp.querySelectorAll('.var-chip').forEach((el) => {
      el.replaceWith(el.textContent ?? '');
    });
    // Remplacer les blocs visuels de signature par leur placeholder brut {{type}}
    tmp.querySelectorAll('[data-sigblock]').forEach((el) => {
      const type = el.getAttribute('data-sigblock') ?? '';
      el.replaceWith(`{{${type}}}`);
    });
    return tmp.innerHTML;
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

  function insertSignatureBlock(type: 'signature_block' | 'lessor_signature_block') {
    editorRef.current?.focus();
    const isLessor = type === 'lessor_signature_block';
    const color  = isLessor ? '#92400e' : '#166534';
    const bg     = isLessor ? '#fffbeb' : '#f0fdf4';
    const border = isLessor ? '#d97706' : '#16a34a';
    const label  = isLessor ? 'Signature du Loueur' : 'Signature du Locataire';
    document.execCommand('insertHTML', false,
      `<div data-sigblock="${type}" contenteditable="false"
           style="display:block;border:2px dashed ${border};background:${bg};text-align:center;padding:14px 10px;margin:8px 0;border-radius:6px;">
         <span style="font-family:monospace;font-size:11px;color:${color};">{{${type}}}</span>
         <p style="margin:4px 0 0;font-size:11px;color:${color};">✍️ ${label}</p>       </div>`
    );
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
      className="p-1.5 rounded hover:bg-surface-hover text-content-secondary hover:text-content-primary transition-colors">
      {children}
    </button>
  );

  return (
    <SlidePanel title={template ? 'Modifier le modèle' : 'Nouveau modèle'} onClose={onClose} wide>
      <div className="space-y-4 flex-1">
        <Field label="Nom du modèle *" value={name} onChange={setName} placeholder="Contrat standard" />

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-content-secondary font-medium">Contenu du contrat</label>
            <button type="button" onClick={() => setPreview(!preview)}
              className="flex items-center gap-1 text-xs text-content-brand hover:text-content-brand">
              <Eye className="w-3.5 h-3.5" /> {preview ? 'Éditer' : 'Aperçu'}
            </button>
          </div>

          {preview ? (
            <div className="bg-white rounded-xl p-5 text-sm text-gray-800 overflow-auto max-h-[50vh] border border-gray-200"
              dangerouslySetInnerHTML={{ __html: getBody() }} />
          ) : (
            <div className="border border-surface-border rounded-xl overflow-hidden">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-surface-card border-b border-surface-border">
                {toolbarBtn('Gras', () => fmt('bold'),           <Bold      className="w-3.5 h-3.5" />)}
                {toolbarBtn('Italique', () => fmt('italic'),     <Italic    className="w-3.5 h-3.5" />)}
                <div className="w-px h-4 bg-surface-border mx-1" />
                {toolbarBtn('Titre', () => fmt('formatBlock', 'h2'), <Heading2  className="w-3.5 h-3.5" />)}
                {toolbarBtn('Paragraphe', () => fmt('formatBlock', 'p'), <Type className="w-3.5 h-3.5" />)}
                {toolbarBtn('Liste', () => fmt('insertUnorderedList'), <List className="w-3.5 h-3.5" />)}
                {toolbarBtn('Séparateur', insertSeparator,      <Minus     className="w-3.5 h-3.5" />)}
              </div>

              {/* Variables */}
              <div className="flex flex-wrap gap-1 px-2 py-1.5 bg-surface border-b border-surface-border">
                <span className="text-[10px] text-content-muted self-center mr-1">Insérer :</span>
                {VARIABLES.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); insertVariable(key); }}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-badge-info text-blue-300 border border-blue-800 hover:bg-blue-800/50 transition-colors font-mono"
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* Blocs de signature */}
              <div className="flex flex-wrap gap-2 px-2 py-1.5 bg-surface-overlay border-b border-surface-border">
                <span className="text-[10px] text-content-muted self-center mr-1">Signatures :</span>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); insertSignatureBlock('lessor_signature_block'); }}
                  className="text-[10px] px-2 py-1 rounded bg-badge-warning text-status-warning border border-status-warning hover:bg-amber-800/50 transition-colors font-medium flex items-center gap-1"
                >
                  <PenLine className="w-3 h-3" /> Zone signature Loueur
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); insertSignatureBlock('signature_block'); }}
                  className="text-[10px] px-2 py-1 rounded bg-badge-success text-status-success border border-status-success hover:bg-green-800/50 transition-colors font-medium flex items-center gap-1"
                >
                  <PenLine className="w-3 h-3" /> Zone signature Locataire
                </button>
                <span className="text-[10px] text-content-muted self-center">← cliquer positionne le curseur, puis cliquer le bouton</span>
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

// ------ Contract Panel ----------------------------------------------------------------------------------------------------------------------

function ContractPanel({
  vehicles, templates, contracts: allContracts, businessId, userId, businessName, currency, onClose, onSaved, notifError, notifSuccess,
  contract,
}: {
  vehicles: RentalVehicle[];
  templates: ContractTemplate[];
  contracts: Contract[];
  businessId: string;
  userId: string;
  businessName: string;
  currency: string;
  contract?: Contract | null;
  onClose: () => void;
  onSaved: (c: Contract) => void;
  notifError: (m: string) => void;
  notifSuccess: (m: string) => void;
}) {
  const isEdit = !!contract;
  const needsInvalidation = isEdit && (contract.status === 'signed' || contract.status === 'sent');

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    vehicle_id:       contract?.vehicle_id ?? vehicles[0]?.id ?? '',
    template_id:      contract?.template_id ?? templates[0]?.id ?? '',
    client_name:      contract?.client_name ?? '',
    client_phone:     contract?.client_phone ?? '',
    client_email:     contract?.client_email ?? '',
    client_id_number: contract?.client_id_number ?? '',
    client_address:   contract?.client_address ?? '',
    start_date:       contract?.start_date ?? TODAY,
    start_time:       contract?.start_time?.slice(0, 5) ?? DEFAULT_START_TIME,
    end_date:         contract?.end_date ?? TOMORROW,
    end_time:         contract?.end_time?.slice(0, 5) ?? DEFAULT_END_TIME,
    pickup_location:  contract?.pickup_location ?? '',
    return_location:  contract?.return_location ?? '',
    deposit_amount:   contract?.deposit_amount?.toString() ?? '',
    required_document_label: '',
    notes:            contract?.notes ?? '',
  });
  const [requiredDocuments, setRequiredDocuments] = useState<RequiredContractDocument[]>(
    contract?.required_documents ?? []
  );

  // Véhicules déjà réservés pour la période sélectionnée
  const bookedVehicleIds = useMemo(() => {
    if (!form.start_date || !form.end_date || !form.start_time || !form.end_time) return new Set<string>();
    const selectedStart = toRentalDateTime(form.start_date, form.start_time, DEFAULT_START_TIME);
    const selectedEnd = toRentalDateTime(form.end_date, form.end_time, DEFAULT_END_TIME);
    return new Set(
      allContracts
        .filter((c) => {
          if (!c.vehicle_id || (c.status !== 'sent' && c.status !== 'signed' && c.status !== 'active') || c.id === contract?.id) return false;
          const contractStart = toRentalDateTime(c.start_date, c.start_time, DEFAULT_START_TIME);
          const contractEnd = toRentalDateTime(c.end_date, c.end_time, DEFAULT_END_TIME);
          return contractStart < selectedEnd && contractEnd > selectedStart;
        })
        .map((c) => c.vehicle_id as string)
    );
  }, [allContracts, form.start_date, form.start_time, form.end_date, form.end_time, contract?.id]);
  const [preview, setPreview] = useState(false);

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

  function addRequiredDocument() {
    const label = form.required_document_label.trim();
    if (!label) return;
    setRequiredDocuments((prev) => [...prev, makeRequiredDocument(label)]);
    set('required_document_label', '');
  }

  function removeRequiredDocument(key: string) {
    setRequiredDocuments((prev) => prev.filter((doc) => doc.key !== key));
  }

  const selectedVehicle = vehicles.find((v) => v.id === form.vehicle_id) ?? null;
  const selectedTemplate = templates.find((t) => t.id === form.template_id) ?? null;

  const days = rentalDaysCount(form.start_date, form.start_time, form.end_date, form.end_time);
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
      vehicle_name:     selectedVehicle?.name ?? '-',
      license_plate:    selectedVehicle?.license_plate ?? '-',
      price_per_day:    pricePerDay.toLocaleString('fr-FR'),
      duration_days:    days.toString(),
      total_amount:     totalAmount.toLocaleString('fr-FR'),
      deposit_amount:   depositAmount.toLocaleString('fr-FR'),
      currency:         displayCurrency(cur),
      owner_name:       '',
    };
    return fillTemplate(templateBody, vars);
  }

  async function save() {
    if (!form.client_name.trim()) { notifError('Nom du client requis'); return; }
    if (!form.start_date || !form.end_date || !form.start_time || !form.end_time) { notifError('Date et heure requises'); return; }
    if (!isValidRentalPeriod(form.start_date, form.start_time, form.end_date, form.end_time)) {
      notifError('La restitution doit être après la prise en charge');
      return;
    }
    if (form.vehicle_id && bookedVehicleIds.has(form.vehicle_id)) {
      notifError('Ce véhicule est déjà réservé pour cette période. Choisissez d\'autres dates ou un autre véhicule.');
      return;
    }

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
        start_time:       form.start_time,
        end_date:         form.end_date,
        end_time:         form.end_time,
        pickup_location:  form.pickup_location.trim(),
        return_location:  form.return_location.trim(),
        price_per_day:    pricePerDay,
        deposit_amount:   depositAmount,
        total_amount:     totalAmount,
        currency:         cur,
        body:             buildBody(),
        required_documents: requiredDocuments,
        notes:            form.notes.trim(),
      };

      if (isEdit && contract) {
        const updated = await updateContract(contract.id, input, needsInvalidation);
        notifSuccess(needsInvalidation
          ? 'Contrat modifié — signature invalidée, à refaire signer'
          : 'Contrat modifié');
        onSaved(updated);
      } else {
        const created = await createContract(businessId, userId, input);
        notifSuccess('Contrat créé');
        onSaved(created);
      }
    } catch (e) {
      notifError(toUserError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SlidePanel title={isEdit ? 'Modifier le contrat' : 'Nouveau contrat'} onClose={onClose} wide>
      <div className="space-y-4">

        {/* Avertissement invalidation */}
        {needsInvalidation && (
          <div className="flex items-start gap-3 bg-badge-warning border border-status-warning rounded-xl px-4 py-3">
            <AlertCircle className="w-5 h-5 text-status-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-status-warning">Ce contrat sera invalidé</p>
              <p className="text-xs text-status-warning mt-0.5">
                {contract?.status === 'signed'
                  ? 'La signature du locataire sera effacée. Le contrat devra être renvoyé et resigné.'
                  : 'Le lien envoyé au locataire deviendra invalide. Un nouveau lien devra être envoyé.'}
              </p>
            </div>
          </div>
        )}

        {/* Véhicule */}
        <div>
          <label className="text-xs text-content-secondary block mb-1">Véhicule</label>
          {vehicles.length === 0 ? (
            <div className="flex items-center gap-2 input text-sm text-content-muted cursor-default">
              <Car className="w-4 h-4 shrink-0" />
              Aucun véhicule — ajoutez-en un dans l'onglet Véhicules
            </div>
          ) : (
            <>
              <select value={form.vehicle_id} onChange={(e) => set('vehicle_id', e.target.value)}
                className="input w-full text-sm">
                <option value="">Sans vehicule specifique</option>
                {vehicles.map((v) => {
                  const booked = bookedVehicleIds.has(v.id);
                  return (
                    <option key={v.id} value={v.id} disabled={booked}>
                      {v.name}{v.license_plate ? ` (${v.license_plate})` : ''} — {v.price_per_day.toLocaleString('fr-FR')} {displayCurrency(v.currency)}/j
                      {booked ? ' ✓ Déjà loué sur cette période' : (!v.is_available ? ' ✗ Indisponible' : '')}
                    </option>
                  );
                })}
              </select>
              {form.vehicle_id && bookedVehicleIds.has(form.vehicle_id) && (
                <p className="mt-1.5 text-xs text-status-error flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  Ce véhicule est déjà réservé sur cette période. Choisissez d'autres dates ou un autre véhicule.
                </p>
              )}
            </>
          )}
        </div>

        {/* Modèle */}
        <div>
          <label className="text-xs text-content-secondary block mb-1">Modèle de contrat</label>
          <select value={form.template_id} onChange={(e) => set('template_id', e.target.value)}
            className="input w-full text-sm">
            <option value="">Modele par defaut</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Dates et heures */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date de départ *" value={form.start_date} onChange={(v) => set('start_date', v)} type="date" />
          <Field label="Heure de départ *" value={form.start_time} onChange={(v) => set('start_time', v)} type="time" />
          <Field label="Date de retour *" value={form.end_date} onChange={(v) => set('end_date', v)} type="date" />
          <Field label="Heure de retour *" value={form.end_time} onChange={(v) => set('end_time', v)} type="time" />
        </div>

        {/* Récap tarif */}
        {selectedVehicle && (
          <div className="bg-badge-brand border border-brand-800 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
            <span className="text-content-secondary">{days} jour{days > 1 ? 's' : ''} à {pricePerDay.toLocaleString('fr-FR')} {displayCurrency(cur)}/j</span>
            <span className="font-bold text-content-brand">{totalAmount.toLocaleString('fr-FR')} {displayCurrency(cur)}</span>
          </div>
        )}

        <Field label="Caution" value={form.deposit_amount} onChange={(v) => set('deposit_amount', v)}
          type="number" placeholder={depositAmount.toString()} />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Lieu de prise en charge" value={form.pickup_location} onChange={(v) => set('pickup_location', v)} />
          <Field label="Lieu de restitution" value={form.return_location} onChange={(v) => set('return_location', v)} />
        </div>

        <div className="pt-2 border-t border-surface-border">
          <p className="text-xs font-semibold text-content-secondary uppercase tracking-wider mb-3">Documents requis avant signature</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={form.required_document_label}
              onChange={(e) => set('required_document_label', e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addRequiredDocument();
                }
              }}
              placeholder="Ex: CNI, permis, passeport, justificatif..."
              className="input flex-1 text-sm"
            />
            <button type="button" onClick={addRequiredDocument} className="btn-secondary h-10 px-3 text-sm">
              Ajouter
            </button>
          </div>
          {requiredDocuments.length > 0 ? (
            <div className="flex flex-wrap gap-2 mt-3">
              {requiredDocuments.map((doc) => (
                <span key={doc.key} className="inline-flex items-center gap-1.5 rounded-full bg-surface-input border border-surface-border px-3 py-1 text-xs text-white">
                  {doc.label}
                  <button type="button" onClick={() => removeRequiredDocument(doc.key)} className="text-content-secondary hover:text-status-error">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-content-secondary mt-2">Aucun document obligatoire. Le client pourra signer sans upload préalable.</p>
          )}
        </div>

        {/* Client */}
        <div className="pt-2 border-t border-surface-border">
          <p className="text-xs font-semibold text-content-secondary uppercase tracking-wider mb-3">Client</p>
          <div className="space-y-3">

            {/* Search */}
            <div className="relative">
              <label className="text-xs text-content-secondary block mb-1">Rechercher un client *</label>
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
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-content-secondary hover:text-content-primary">
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
                      <div className="w-8 h-8 rounded-lg bg-badge-brand flex items-center justify-center shrink-0 text-content-brand font-bold text-sm">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-content-primary truncate">{c.name}</p>
                        {c.phone && <p className="text-xs text-content-secondary">{c.phone}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {showDropdown && clientQuery.length >= 1 && filteredClients.length === 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-surface-card border border-surface-border rounded-xl px-3 py-2.5 text-xs text-content-muted">
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
          <label className="text-xs text-content-secondary block mb-1">Notes internes</label>
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)}
            rows={2} className="input w-full text-sm resize-none" placeholder="Notes…" />
        </div>

        {/* Aperçu */}
        <button type="button" onClick={() => setPreview(!preview)}
          className="flex items-center gap-2 text-xs text-content-brand hover:text-content-brand">
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
          {isEdit
            ? (needsInvalidation ? 'Modifier et invalider' : 'Enregistrer les modifications')
            : 'Créer le contrat'}
        </button>
      </div>
    </SlidePanel>
  );
}

// ------ Shared Components ----------------------------------------------------------------------------------------------------------------

function Field({
  label, value, onChange, placeholder = '', type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="text-xs text-content-secondary block mb-1">{label}</label>
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
          <h2 className="font-semibold text-content-primary">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors">
            <X className="w-5 h-5 text-content-secondary" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-between">
          {children}
        </div>
      </div>
    </div>
  );
}



