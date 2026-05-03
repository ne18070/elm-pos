import { useState, useRef } from 'react';
import {
  ChevronLeft, Pencil, Upload, Loader2, ExternalLink, Banknote, AlertCircle, XCircle,
  CheckCircle, Download, PenLine, RotateCcw, Send, Share2, RefreshCw, Copy, Check, Archive,
  FileText, Image as ImageIcon, Trash2
} from 'lucide-react';
import {
  STATUS_CFG, PAYMENT_STATUS_CFG, isClosedContract, fmtDate, fmtTime, fmtMoney, getAppUrl, paymentStatus
} from './contract-utils';
import { InspectionSummary, InspectionForm } from './InspectionForm';
import { SignatureCanvas } from './SignatureCanvas';
import {
  type Contract, type PaymentMethod, type RentalVehicle, type ContractTemplate,
  PAYMENT_METHOD_LABELS, recordPayment, uploadContractDocument, uploadLessorSignature,
  saveLessorSignature, uploadContractPdf, savePdfUrl, saveContractInspection, deleteContractDocument,
} from '@services/supabase/contracts';
import { imageUrlToDataUrl, generateContractPdf, dataUrlToBlob } from '@/lib/contract-pdf';
import { toUserError } from '@/lib/user-error';
import { triggerWhatsAppShare } from '@/lib/whatsapp-direct';
import { useCan } from '@/hooks/usePermission';
import DOMPurify from 'dompurify';

export function ContractDetailPanel({
  contract: c,
  vehicles,
  templates,
  business,
  onBack,
  onEdit,
  onRefresh,
  notifSuccess,
  notifError,
  handleSend,
  handleArchive,
  handleCancel,
}: {
  contract: Contract;
  vehicles: RentalVehicle[];
  templates: ContractTemplate[];
  business: any;
  onBack: () => void;
  onEdit: () => void;
  onRefresh: () => void;
  notifSuccess: (m: string) => void;
  notifError: (m: string) => void;
  handleSend: (c: Contract) => Promise<void>;
  handleArchive: (c: Contract) => Promise<void>;
  handleCancel: (c: Contract) => Promise<void>;
}) {
  const [detailContract, setDetailContract] = useState<Contract>(c);
  const [paymentForm, setPaymentForm] = useState<{
    amount_paid: string; payment_date: string; payment_method: PaymentMethod;
  }>({ amount_paid: '', payment_date: new Date().toISOString().split('T')[0], payment_method: 'cash' });
  const [savingPayment, setSavingPayment] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [deletingDocument, setDeletingDocument] = useState<string | null>(null);
  const [savingInspection, setSavingInspection] = useState(false);
  const [inspectionEditor, setInspectionEditor] = useState<'pickup' | 'return' | null>(null);
  const [inspectionForm, setInspectionForm] = useState({
    mileage: '',
    fuel_level: 'full',
    condition: 'ok',
    notes: '',
    charges: '',
  });

  const can = useCan();

  // Signature loueur
  const [lessorSigOpen, setLessorSigOpen]   = useState(false);
  const [lessorSigTab, setLessorSigTab]     = useState<'draw' | 'upload'>('draw');
  const [lessorSigFile, setLessorSigFile]   = useState<string | null>(null); // data URL
  const [savingLessorSig, setSavingLessorSig] = useState(false);
  const lessorCanvasRef   = useRef<HTMLCanvasElement>(null);
  const lessorHasStrokes  = useRef(false);

  const [copied, setCopied] = useState(false);

  const status = STATUS_CFG[detailContract.status] ?? STATUS_CFG.draft;
  const link = `${getAppUrl()}/c/${detailContract.token}`;
  const documentsCount = detailContract.documents?.length ?? 0;

  function formatUploadDate(value?: string | null) {
    if (!value) return '';
    return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  async function handleRecordPayment() {
    if (!business) return;
    const amount = parseFloat(paymentForm.amount_paid);
    if (!amount || amount <= 0) { notifError('Montant invalide'); return; }
    setSavingPayment(true);
    try {
      await recordPayment(detailContract.id, business.id, {
        amount_paid:    amount,
        payment_date:   paymentForm.payment_date,
        payment_method: paymentForm.payment_method,
      }, { client_name: detailContract.client_name, total_amount: detailContract.total_amount });
      notifSuccess('Paiement enregistré et écriture comptable créée');
      onRefresh();
      setDetailContract({
        ...detailContract,
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

  async function handleUploadDocuments(files: FileList | null | undefined) {
    if (!files || files.length === 0) return;
    setUploadingDocument(true);
    try {
      let documents = detailContract.documents ?? [];
      for (const file of Array.from(files)) {
        documents = await uploadContractDocument(detailContract.id, file, documents);
      }
      const updated = { ...detailContract, documents };
      setDetailContract(updated);
      onRefresh();
      notifSuccess(files.length > 1 ? 'Documents ajoutés au contrat' : 'Document ajouté au contrat');
    } catch (e) {
      notifError(toUserError(e));
    } finally {
      setUploadingDocument(false);
    }
  }

  async function handleDeleteDocument(documentUrl: string, documentName: string) {
    if (!window.confirm(`Supprimer le document "${documentName}" ?`)) return;
    setDeletingDocument(documentUrl);
    try {
      const documents = await deleteContractDocument(detailContract.id, documentUrl, detailContract.documents ?? []);
      setDetailContract({ ...detailContract, documents });
      onRefresh();
      notifSuccess('Document supprimé du contrat');
    } catch (e) {
      notifError(toUserError(e));
    } finally {
      setDeletingDocument(null);
    }
  }

  async function handleSaveLessorSignature(sigDataUrl: string) {
    setSavingLessorSig(true);
    try {
      const blob = dataUrlToBlob(sigDataUrl);
      const url  = await uploadLessorSignature(detailContract.id, blob);
      await saveLessorSignature(detailContract.id, url);

      // Regénérer le PDF avec les deux signatures
      try {
        const clientSrc = detailContract.signature_image
          ? await imageUrlToDataUrl(detailContract.signature_image)
          : '';
        if (clientSrc) {
          const pdfBlob = await generateContractPdf(detailContract.body, clientSrc, sigDataUrl);
          const pdfUrl  = await uploadContractPdf(detailContract.token, pdfBlob);
          await savePdfUrl(detailContract.token, pdfUrl);
          const updated = { ...detailContract, lessor_signature_image: url, pdf_url: pdfUrl };
          setDetailContract(updated);
        } else {
          const updated = { ...detailContract, lessor_signature_image: url };
          setDetailContract(updated);
        }
      } catch {
        const updated = { ...detailContract, lessor_signature_image: url };
        setDetailContract(updated);
      }

      setLessorSigOpen(false);
      lessorHasStrokes.current = false;
      onRefresh();
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

  function fillInspectionForm(type: 'pickup' | 'return') {
    const inspection = type === 'pickup' ? detailContract.pickup_inspection : detailContract.return_inspection;
    setInspectionForm({
      mileage: inspection?.mileage?.toString() ?? '',
      fuel_level: inspection?.fuel_level ?? 'full',
      condition: inspection?.condition ?? 'ok',
      notes: inspection?.notes ?? '',
      charges: inspection?.charges?.toString() ?? '',
    });
  }

  async function handleSaveInspection(type: 'pickup' | 'return') {
    const parsedMileage = inspectionForm.mileage ? parseInt(inspectionForm.mileage, 10) : null;
    const charges = type === 'return' && inspectionForm.charges ? parseFloat(inspectionForm.charges) : 0;
    setSavingInspection(true);
    try {
      const updated = await saveContractInspection(detailContract.id, type, {
        mileage: Number.isFinite(parsedMileage) ? parsedMileage : null,
        fuel_level: inspectionForm.fuel_level || null,
        condition: inspectionForm.condition || null,
        notes: inspectionForm.notes.trim() || null,
        charges,
      });
      setDetailContract(updated);
      onRefresh();
      notifSuccess(type === 'pickup' ? 'Etat de depart enregistre' : 'Retour enregistre et contrat archive');
      setInspectionEditor(null);
    } catch (e) {
      notifError(toUserError(e));
    } finally {
      setSavingInspection(false);
    }
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleWhatsApp() {
    if (!detailContract.client_phone) { notifError('Numéro de téléphone client manquant'); return; }
    triggerWhatsAppShare(
      detailContract.client_phone,
      `Bonjour ${detailContract.client_name}, voici votre lien de signature : ${link}`
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border bg-surface-card shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors">
          <ChevronLeft className="w-5 h-5 text-content-secondary" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-content-primary truncate">{detailContract.client_name}</p>
          <p className="text-xs text-content-secondary">
            {fmtDate(detailContract.start_date)} {fmtTime(detailContract.start_time)} → {fmtDate(detailContract.end_date)} {fmtTime(detailContract.end_time)}
          </p>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.color}`}>{status.label}</span>
        {!isClosedContract(detailContract) && (
          <button
            onClick={onEdit}
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
          <p className="text-content-primary font-medium">{detailContract.client_name}</p>
          {detailContract.client_phone && <p className="text-sm text-content-secondary">{detailContract.client_phone}</p>}
          {detailContract.client_email && <p className="text-sm text-content-secondary">{detailContract.client_email}</p>}
          {detailContract.client_id_number && <p className="text-sm text-content-secondary">Pièce : {detailContract.client_id_number}</p>}
          {detailContract.client_address && <p className="text-sm text-content-secondary">{detailContract.client_address}</p>}
        </div>

        <div className="card p-4 space-y-2">
          <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider">Location</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><p className="text-content-muted">Départ</p><p className="text-content-primary">{fmtDate(detailContract.start_date)} à {fmtTime(detailContract.start_time)}</p></div>
            <div><p className="text-content-muted">Retour</p><p className="text-content-primary">{fmtDate(detailContract.end_date)} à {fmtTime(detailContract.end_time)}</p></div>
            {detailContract.pickup_location && <div><p className="text-content-muted">Lieu prise</p><p className="text-content-primary">{detailContract.pickup_location}</p></div>}
            {detailContract.return_location && <div><p className="text-content-muted">Lieu retour</p><p className="text-content-primary">{detailContract.return_location}</p></div>}
            <div><p className="text-content-muted">Prix/jour</p><p className="text-content-primary">{fmtMoney(detailContract.price_per_day, detailContract.currency)}</p></div>
            <div><p className="text-content-muted">Total</p><p className="text-content-brand font-semibold">{fmtMoney(detailContract.total_amount, detailContract.currency)}</p></div>
            <div><p className="text-content-muted">Caution</p><p className="text-content-primary">{fmtMoney(detailContract.deposit_amount, detailContract.currency)}</p></div>
            {detailContract.extra_charges != null && detailContract.extra_charges > 0 && (
              <div><p className="text-content-muted">Frais retour</p><p className="text-status-warning">{fmtMoney(detailContract.extra_charges, detailContract.currency)}</p></div>
            )}
          </div>
        </div>

        <div className="card p-4 space-y-4">
          <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider">Etat du vehicule</h3>

          <InspectionSummary
            title="Depart"
            inspection={detailContract.pickup_inspection}
            actionLabel={detailContract.pickup_inspection ? 'Modifier depart' : 'Faire le check-in'}
            disabled={isClosedContract(detailContract) || (detailContract.status !== 'signed' && detailContract.status !== 'active')}
            onEdit={() => {
              fillInspectionForm('pickup');
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
              onSave={() => handleSaveInspection('pickup')}
            />
          )}

          <InspectionSummary
            title="Retour"
            inspection={detailContract.return_inspection}
            actionLabel={detailContract.return_inspection ? 'Modifier retour' : 'Faire le check-out'}
            disabled={isClosedContract(detailContract) || !detailContract.pickup_inspection}
            onEdit={() => {
              fillInspectionForm('return');
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
              onSave={() => handleSaveInspection('return')}
            />
          )}
        </div>

        <div className="card p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider">Documents joints</h3>
              <p className="mt-1 text-xs text-content-muted">
                {documentsCount > 0
                  ? `${documentsCount} fichier${documentsCount > 1 ? 's' : ''} ajouté${documentsCount > 1 ? 's' : ''}`
                  : 'Aucun fichier ajouté'}
              </p>
            </div>
            {!isClosedContract(detailContract) && (
              <label className="btn-secondary h-9 px-3 text-xs flex items-center gap-2 cursor-pointer shrink-0">
                {uploadingDocument ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {uploadingDocument ? 'Envoi...' : 'Ajouter'}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  multiple
                  className="hidden"
                  disabled={uploadingDocument}
                  onChange={(e) => {
                    handleUploadDocuments(e.target.files);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
            )}
          </div>
          {detailContract.required_documents && detailContract.required_documents.length > 0 && (
            <div className="rounded-xl bg-surface-input px-3 py-2">
              <p className="text-xs text-content-secondary mb-1">Requis avant signature</p>
              <div className="flex flex-wrap gap-1.5">
                {detailContract.required_documents.map((doc) => (
                  <span key={doc.key} className="rounded-full bg-surface-card border border-surface-border px-2 py-0.5 text-[11px] text-content-secondary">
                    {doc.label}
                  </span>
                ))}
              </div>
            </div>
          )}
          {detailContract.documents && detailContract.documents.length > 0 ? (
            <div className="grid gap-2">
              {detailContract.documents.map((doc, idx) => (
                <div
                  key={`${doc.url}-${idx}`}
                  className="group flex items-center gap-3 rounded-xl border border-surface-border bg-surface-input px-3 py-2.5 text-sm hover:bg-surface-hover transition-colors"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-card border border-surface-border text-content-brand">
                    {doc.type?.startsWith('image/') ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-content-primary">{doc.name}</p>
                    <p className="text-[11px] text-content-muted">
                      {doc.type?.includes('pdf') ? 'PDF' : doc.type?.startsWith('image/') ? 'Image' : 'Fichier'}
                      {doc.uploaded_at ? ` - ${formatUploadDate(doc.uploaded_at)}` : ''}
                    </p>
                  </div>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-card transition-colors"
                    title="Ouvrir le document"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  {!isClosedContract(detailContract) && (
                    <button
                      type="button"
                      onClick={() => handleDeleteDocument(doc.url, doc.name)}
                      disabled={deletingDocument === doc.url}
                      className="p-1.5 rounded-lg text-content-secondary hover:text-status-error hover:bg-surface-card transition-colors disabled:opacity-50"
                      title="Supprimer le document"
                    >
                      {deletingDocument === doc.url
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-surface-border bg-surface-input px-4 py-5 text-center">
              <FileText className="mx-auto mb-2 h-7 w-7 text-content-muted" />
              <p className="text-sm font-medium text-content-primary">Aucun document joint</p>
              <p className="mt-1 text-xs text-content-secondary">Ajoutez une CNI, un permis, un passeport ou un justificatif.</p>
            </div>
          )}
        </div>

        {/* ---- Paiement ---- */}
        {!isClosedContract(detailContract) && (
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider flex items-center gap-2">
                <Banknote className="w-4 h-4" /> Paiement encaissé
              </h3>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PAYMENT_STATUS_CFG[paymentStatus(detailContract)].color}`}>
                {PAYMENT_STATUS_CFG[paymentStatus(detailContract)].label}
              </span>
            </div>

            {/* Résumé si déjà payé */}
            {detailContract.amount_paid != null && detailContract.amount_paid > 0 && (
              <div className="bg-surface-input rounded-xl p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-content-secondary">Montant encaissé</span>
                  <span className="text-status-success font-semibold">{fmtMoney(detailContract.amount_paid, detailContract.currency)}</span>
                </div>
                {detailContract.total_amount != null && detailContract.amount_paid < detailContract.total_amount && (
                  <div className="flex justify-between">
                    <span className="text-content-secondary">Reste dû</span>
                    <span className="text-status-warning font-semibold">{fmtMoney(detailContract.total_amount - detailContract.amount_paid, detailContract.currency)}</span>
                  </div>
                )}
                {detailContract.payment_date && (
                  <div className="flex justify-between">
                    <span className="text-content-secondary">Date</span>
                    <span className="text-content-secondary">{fmtDate(detailContract.payment_date)}</span>
                  </div>
                )}
                {detailContract.payment_method && (
                  <div className="flex justify-between">
                    <span className="text-content-secondary">Méthode</span>
                    <span className="text-content-secondary">{PAYMENT_METHOD_LABELS[detailContract.payment_method]}</span>
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
                    placeholder={detailContract.total_amount?.toString() ?? '0'}
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
                onClick={handleRecordPayment}
                disabled={savingPayment || !paymentForm.amount_paid}
                className="btn-primary w-full flex items-center justify-center gap-2 text-sm h-10 disabled:opacity-50"
              >
                {savingPayment
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <><Banknote className="w-4 h-4" />{detailContract.amount_paid ? 'Mettre à jour le paiement' : 'Enregistrer le paiement'}</>}
              </button>
              {detailContract.amount_paid != null && detailContract.amount_paid > 0 && (
                <p className="text-[11px] text-content-muted text-center flex items-center justify-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Une écriture comptable est automatiquement créée / mise à jour
                </p>
              )}
            </div>
          </div>
        )}

        {detailContract.status === 'cancelled' && (
          <div className="card p-4 space-y-2 border-status-error/40">
            <h3 className="text-xs font-semibold text-status-error uppercase tracking-wider flex items-center gap-2">
              <XCircle className="w-4 h-4" /> Contrat annulé
            </h3>
            {detailContract.cancelled_at && <p className="text-sm text-content-secondary">Le {fmtDate(detailContract.cancelled_at)}</p>}
            {detailContract.cancellation_reason && (
              <p className="text-sm text-content-primary whitespace-pre-wrap">{detailContract.cancellation_reason}</p>
            )}
          </div>
        )}

        {/* ---- Contrat signé : lecture seule ---- */}
        {detailContract.status === 'signed' && (
          <div className="card p-4 space-y-3">
            <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-status-success" /> Signé
            </h3>
            {detailContract.signed_at && <p className="text-sm text-content-secondary">Le {fmtDate(detailContract.signed_at)}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-xs text-content-muted mb-2">Loueur</p>
                {detailContract.lessor_signature_image
                  ? <img src={detailContract.lessor_signature_image} alt="signature loueur" className="h-14 bg-white rounded-xl p-2 object-contain mx-auto" />
                  : <p className="text-xs text-content-muted italic">Non signé</p>}
              </div>
              <div className="text-center">
                <p className="text-xs text-content-muted mb-2">Locataire</p>
                {detailContract.signature_image
                  ? <img src={detailContract.signature_image} alt="signature locataire" className="h-14 bg-white rounded-xl p-2 object-contain mx-auto" />
                  : <p className="text-xs text-content-muted italic">Non signé</p>}
              </div>
            </div>
            {detailContract.pdf_url && (
              <a href={detailContract.pdf_url} target="_blank" rel="noreferrer"
                 className="btn-secondary text-sm flex items-center gap-2 w-full justify-center">
                <Download className="w-4 h-4" /> Télécharger PDF
              </a>
            )}
          </div>
        )}

        {/* ---- Signature du loueur + envoi (draft) ---- */}
        {detailContract.status === 'draft' && (
          <div className="card p-4 space-y-4">
            <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider flex items-center gap-2">
              <PenLine className="w-4 h-4" /> Votre signature (loueur)
            </h3>

            {detailContract.lessor_signature_image && !lessorSigOpen ? (
              <div className="space-y-2">
                <img src={detailContract.lessor_signature_image} alt="signature loueur" className="h-16 bg-white rounded-xl p-2 object-contain" />
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
                      <SignatureCanvas
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
                      handleSaveLessorSignature(lessorCanvasRef.current!.toDataURL('image/png'));
                    } else {
                      if (!lessorSigFile) { notifError('Veuillez choisir une image'); return; }
                      handleSaveLessorSignature(lessorSigFile);
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
              {!detailContract.lessor_signature_image && (
                <p className="text-xs text-status-warning mb-2 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" /> Signez le contrat avant de l'envoyer
                </p>
              )}
              <button onClick={() => handleSend(detailContract)}
                      className="btn-primary w-full flex items-center justify-center gap-2 text-sm h-10">
                <Send className="w-4 h-4" /> Envoyer pour signature
              </button>
            </div>
          </div>
        )}

        {/* ---- Lien actif (sent) ---- */}
        {detailContract.status === 'sent' && (
          <div className="card p-4 space-y-3">
            <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider">Lien de signature</h3>
            <div className="flex items-center gap-2 bg-surface-input rounded-xl px-3 py-2">
              <p className="text-xs text-content-secondary truncate flex-1">{link}</p>
              <button onClick={handleCopyLink} className="shrink-0 text-content-secondary hover:text-content-primary transition-colors">
                {copied ? <Check className="w-4 h-4 text-status-success" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={handleWhatsApp} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm h-10">
                <Share2 className="w-4 h-4" /> WhatsApp
              </button>
              <button onClick={() => handleSend(detailContract)} className="btn-secondary flex items-center justify-center gap-2 text-sm h-10 px-3" title="Regénérer le lien (nouveau token, 7 jours)">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-content-muted text-center">
              Expire le {fmtDate(detailContract.token_expires_at)}
            </p>
          </div>
        )}

        {/* Contenu du contrat */}
        <div className="card p-4">
          <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wider mb-3">Contenu du contrat</h3>
          <div
            className="bg-white rounded-xl p-4 text-sm text-gray-800 overflow-auto max-h-96"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(detailContract.body) }}
          />
        </div>
      </div>

      {/* Footer actions */}
      {!isClosedContract(detailContract) && (
        <div className="shrink-0 p-4 border-t border-surface-border flex gap-2">
          {detailContract.status === 'sent' && (
            <button onClick={handleWhatsApp} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm h-10">
              <Share2 className="w-4 h-4" /> WhatsApp
            </button>
          )}
          <button onClick={() => handleCancel(detailContract)} className="btn-secondary flex items-center justify-center gap-2 text-sm h-10 px-4 text-status-error">
            <XCircle className="w-4 h-4" /> Annuler
          </button>
          <button onClick={() => handleArchive(detailContract)} className="btn-secondary flex items-center justify-center gap-2 text-sm h-10 px-4">
            <Archive className="w-4 h-4" /> Archiver
          </button>
        </div>
      )}
    </div>
  );
}
