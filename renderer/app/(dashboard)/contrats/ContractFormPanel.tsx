import { useState, useMemo, useEffect } from 'react';
import { X, Car, AlertCircle, Loader2, Eye } from 'lucide-react';
import { SlidePanel, Field } from './SharedComponents';
import { toUserError } from '@/lib/user-error';
import { displayCurrency } from '@/lib/utils';
import {
  TODAY, TOMORROW, DEFAULT_START_TIME, DEFAULT_END_TIME,
  toRentalDateTime, rentalDaysCount, isValidRentalPeriod, makeRequiredDocument, DEFAULT_TEMPLATE
} from './contract-utils';
import {
  updateContract, createContract, fillTemplate,
  type RentalVehicle, type ContractTemplate, type Contract, type RequiredContractDocument, type CreateContractInput
} from '@services/supabase/contracts';
import { getClients, type Client } from '@services/supabase/clients';
import DOMPurify from 'dompurify';

export function ContractFormPanel({
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
                <span key={doc.key} className="inline-flex items-center gap-1.5 rounded-full bg-surface-input border border-surface-border px-3 py-1 text-xs text-content-primary">
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
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(buildBody()) }} />
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
