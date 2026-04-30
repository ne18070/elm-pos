import { displayCurrency } from '@/lib/utils';
import { type Contract, type RequiredContractDocument } from '@services/supabase/contracts';

export type Tab = 'contrats' | 'vehicules' | 'modeles';

export const STATUS_CFG: Record<string, { label: string; color: string }> = {
  draft:    { label: 'Brouillon',  color: 'bg-surface-input text-content-muted' },
  sent:     { label: 'Envoyé',     color: 'bg-badge-info text-blue-300' },
  signed:   { label: 'Signé',      color: 'bg-badge-success text-status-success' },
  active:   { label: 'En cours',   color: 'bg-badge-warning text-status-warning' },
  archived: { label: 'Archivé',    color: 'bg-surface-card text-content-muted' },
  cancelled:{ label: 'Annulé',     color: 'bg-badge-error text-status-error' },
};

export const PAYMENT_STATUS_CFG = {
  pending: { label: 'Non payé', color: 'bg-badge-error text-status-error'     },
  partial: { label: 'Acompte',  color: 'bg-badge-warning text-status-warning' },
  paid:    { label: 'Payé',     color: 'bg-badge-success text-status-success' },
} as const;

export const TODAY = new Date().toISOString().split('T')[0];
export const TOMORROW = new Date(Date.now() + 86400000).toISOString().split('T')[0];
export const DEFAULT_START_TIME = '09:00';
export const DEFAULT_END_TIME = '18:00';

export function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtMoney(amount: number | null, currency: string) {
  if (amount == null) return '-';
  return `${amount.toLocaleString('fr-FR')} ${displayCurrency(currency)}`;
}

export function fmtTime(t?: string | null) {
  return t ? t.slice(0, 5) : '-';
}

export function toRentalDateTime(date: string, time: string | null | undefined, fallback: string) {
  return new Date(`${date}T${(time || fallback).slice(0, 5)}:00`);
}

export function rentalDaysCount(startDate: string, startTime: string, endDate: string, endTime: string): number {
  const start = toRentalDateTime(startDate, startTime, DEFAULT_START_TIME);
  const end = toRentalDateTime(endDate, endTime, DEFAULT_END_TIME);
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
}

export function isValidRentalPeriod(startDate: string, startTime: string, endDate: string, endTime: string): boolean {
  return toRentalDateTime(endDate, endTime, DEFAULT_END_TIME).getTime() >
    toRentalDateTime(startDate, startTime, DEFAULT_START_TIME).getTime();
}

export function makeRequiredDocument(label: string): RequiredContractDocument {
  const key = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || `document_${Date.now()}`;
  return { key: `${key}_${Date.now()}`, label: label.trim() };
}

export function getAppUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}

export function isClosedContract(c: Contract): boolean {
  return c.status === 'archived' || c.status === 'cancelled';
}

export function paymentStatus(c: Contract): 'pending' | 'partial' | 'paid' {
  if (!c.amount_paid || c.amount_paid <= 0) return 'pending';
  if (c.total_amount && c.amount_paid >= c.total_amount) return 'paid';
  return 'partial';
}

export type ContractAction = 'send' | 'archive' | 'cancel' | 'edit' | 'sign_lessor' | 'inspection_pickup' | 'inspection_return' | 'download_pdf';

export function getContractActions(c: Contract): ContractAction[] {
  const actions: ContractAction[] = [];
  const closed = isClosedContract(c);

  if (closed) return actions;

  if (c.status === 'draft') {
    actions.push('edit', 'cancel');
    if (c.lessor_signature_image) {
      actions.push('send');
    } else {
      actions.push('sign_lessor');
    }
  } else if (c.status === 'sent') {
    actions.push('edit', 'cancel', 'archive');
  } else if (c.status === 'signed') {
    actions.push('edit', 'cancel', 'archive', 'inspection_pickup');
    if (c.pdf_url) actions.push('download_pdf');
  } else if (c.status === 'active') {
    actions.push('edit', 'cancel', 'archive', 'inspection_return');
    if (c.pdf_url) actions.push('download_pdf');
  }

  return actions;
}

export const DEFAULT_TEMPLATE = `<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #333;">
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
