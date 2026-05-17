'use client';
import { jsPDF } from 'jspdf';
import { formatCurrency } from './utils';
import type { Order, Business } from '../../types';
import type { ServiceOrder } from '../../services/supabase/service-orders';

const W      = 80;    // largeur page mm
const MX     = 5;     // marge gauche/droite
const CW     = W - MX * 2; // eslint-disable-line @typescript-eslint/no-unused-vars

/** Élimine les espaces insécables Unicode que jsPDF Helvetica ne supporte pas. */
function sanitize(s: string): string {
  //   no-break,   narrow no-break (séparateur milliers fr-FR),   thin space
  return s.replace(/ | | /g, ' ');
}

type Align = 'left' | 'center' | 'right';

const PAYMENT_LABELS: Record<string, string> = {
  cash:         'Espèces',
  card:         'Carte bancaire',
  mobile_money: 'Mobile Money',
  partial:      'Acompte',
  loyalty:      'Points fidélité',
  room_charge:  'Chambre',
};

/**
 * Génère un PDF de reçu thermique (80 mm) en pur jsPDF,
 * sans dépendance à html2canvas.
 */
export async function generateReceiptPdf(order: Order, business: Business): Promise<Blob> {
  const cur = business.currency ?? 'XOF';
  const fmt = (n: number) => sanitize(formatCurrency(n, cur));

  /* ── Passe 1 : calcul de la hauteur totale ── */
  const totalHeight = estimateHeight(order, business);

  /* ── Passe 2 : rendu ── */
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [W, Math.max(totalHeight, 60)],
  });

  let y = MX;

  function line(size: number, text: string, x: number, align: Align = 'left', bold = false): void {
    pdf.setFontSize(size);
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.text(text, x, y, { align });
    y += size * 0.35 + 1.2;
  }

  function hr(): void {
    pdf.setLineWidth(0.2);
    pdf.setDrawColor(100);
    pdf.line(MX, y, W - MX, y);
    y += 2.5;
  }

  function row(left: string, right: string, size = 8, bold = false): void {
    pdf.setFontSize(size);
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.text(left,      MX,        y);
    pdf.text(right, W - MX, y, { align: 'right' });
    y += size * 0.35 + 1.2;
  }

  /* En-tête */
  line(10, business.name, W / 2, 'center', true);
  if (business.denomination && business.denomination !== business.name)
    line(7, business.denomination, W / 2, 'center', true);
  if (business.address) line(7, business.address, W / 2, 'center');
  if (business.phone)   line(7, `Tél : ${business.phone}`, W / 2, 'center');
  if (business.email)   line(7, business.email, W / 2, 'center');
  y += 1; hr();

  /* Infos reçu */
  const receiptNum = '#' + order.id.replace(/-/g, '').toUpperCase().slice(0, 10);
  const d = new Date(order.created_at);
  row('Reçu', receiptNum);
  row('Date',  d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
  if (order.cashier?.full_name)  row('Caissier', order.cashier.full_name);
  if (order.customer_name)       row('Client',   order.customer_name);
  if (order.customer_phone)      row('Tél.',     order.customer_phone);
  y += 1; hr();

  /* Articles */
  for (const item of order.items ?? []) {
    line(8, item.name, MX, 'left', true);
    row(`  ${item.quantity} × ${fmt(item.price)}`, fmt(item.total));
    if (item.discount_amount > 0) row('  Remise article', `-${fmt(item.discount_amount)}`);
    if (item.notes) line(7, `  ${item.notes}`, MX);
  }
  y += 1; hr();

  /* Totaux */
  row('Sous-total', fmt(order.subtotal));
  if (order.discount_amount > 0) row('Remise', `-${fmt(order.discount_amount)}`);
  if (order.tax_amount > 0)      row(`TVA (${business.tax_rate ?? 0} %)`, fmt(order.tax_amount));
  row('TOTAL', fmt(order.total), 10, true);

  /* Paiements */
  const payments = order.payments ?? [];
  if (payments.length > 0) {
    y += 1; hr();
    for (const p of payments)
      row(PAYMENT_LABELS[p.method] ?? p.method, fmt(p.amount));
    const paid   = payments.reduce((s, p) => s + p.amount, 0);
    const change = Math.max(0, paid - order.total);
    if (change > 0) row('Rendu monnaie', fmt(change));
    const remaining = Math.max(0, order.total - paid);
    if (remaining > 0.01) row('Reste dû', fmt(remaining));
  }

  /* Pied de page */
  y += 2; hr();
  line(7, business.receipt_footer ?? 'Merci de votre visite !', W / 2, 'center');
  line(6, d.toLocaleDateString('fr-FR') + ' — ELM APP', W / 2, 'center');

  return pdf.output('blob');
}

/* ── Estimateur de hauteur (sans dessin) ── */
function estimateHeight(order: Order, business: Business): number {
  const lh = (size: number) => size * 0.35 + 1.2;
  let h = MX * 2;
  h += lh(10);                                               // nom entreprise
  if (business.denomination && business.denomination !== business.name) h += lh(7);
  if (business.address) h += lh(7);
  if (business.phone)   h += lh(7);
  if (business.email)   h += lh(7);
  h += 1 + 2.5;                                             // hr
  h += lh(8) * 2;                                           // reçu + date
  if (order.cashier?.full_name) h += lh(8);
  if (order.customer_name)      h += lh(8);
  if (order.customer_phone)     h += lh(8);
  h += 1 + 2.5;                                             // hr
  for (const item of order.items ?? []) {
    h += lh(8) + lh(8);
    if (item.discount_amount > 0) h += lh(8);
    if (item.notes) h += lh(7);
  }
  h += 1 + 2.5;                                             // hr
  h += lh(8);                                               // sous-total
  if (order.discount_amount > 0) h += lh(8);
  if (order.tax_amount > 0)      h += lh(8);
  h += lh(10);                                              // total
  const payments = order.payments ?? [];
  if (payments.length > 0) {
    h += 1 + 2.5;
    h += lh(8) * payments.length;
    const paid = payments.reduce((s, p) => s + p.amount, 0);
    if (paid - order.total > 0)  h += lh(8);
    if (order.total - paid > 0.01) h += lh(8);
  }
  h += 2 + 2.5 + lh(7) + lh(6);                           // footer
  return h;
}

const STATUS_LABELS: Record<string, string> = {
  attente:  'En attente',
  en_cours: 'En cours',
  pause:    'En pause',
  termine:  'Terminé',
  paye:     'Payé',
  annule:   'Annulé',
};

/** Génère un PDF de reçu pour un ordre de service (sans html2canvas). */
export async function generateServiceOrderPdf(
  order: ServiceOrder,
  business: Business,
): Promise<Blob> {
  const cur = business.currency ?? 'XOF';
  const fmt = (n: number) => sanitize(formatCurrency(n, cur));
  const lh  = (size: number) => size * 0.35 + 1.2;

  // Estimation hauteur
  let hEst = MX * 2 + lh(10);
  if (business.address) hEst += lh(7);
  if (business.phone)   hEst += lh(7);
  hEst += 1 + 2.5;
  hEst += lh(9) + lh(8) * 3;       // OT + date + client + statut
  if (order.subject_ref) hEst += lh(8);
  hEst += 1 + 2.5;
  hEst += lh(8) * (order.items?.length ?? 0) * 2;
  hEst += 1 + 2.5 + lh(10) + lh(8) * 2;
  if (order.notes) hEst += lh(7) * 2;
  hEst += 2 + 2.5 + lh(7);

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [W, Math.max(hEst + 20, 80)],
  });

  let y = MX;

  function line(size: number, text: string, x: number, align: Align = 'left', bold = false) {
    pdf.setFontSize(size);
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.text(text, x, y, { align });
    y += lh(size);
  }
  function hr() {
    pdf.setLineWidth(0.2);
    pdf.setDrawColor(100);
    pdf.line(MX, y, W - MX, y);
    y += 2.5;
  }
  function row(left: string, right: string, size = 8, bold = false) {
    pdf.setFontSize(size);
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.text(left, MX, y);
    pdf.text(right, W - MX, y, { align: 'right' });
    y += lh(size);
  }

  // En-tête
  line(10, business.name, W / 2, 'center', true);
  if (business.address) line(7, business.address, W / 2, 'center');
  if (business.phone)   line(7, `Tél : ${business.phone}`, W / 2, 'center');
  y += 1; hr();

  // Infos OT
  const otRef = `OT-${String(order.order_number).padStart(4, '0')}`;
  const d = new Date(order.created_at);
  line(9, `Ordre de service ${otRef}`, W / 2, 'center', true);
  row('Date',   d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
  row('Statut', STATUS_LABELS[order.status] ?? order.status);
  if (order.client_name)  row('Client',  order.client_name);
  if (order.client_phone) row('Tél.',    order.client_phone);
  if (order.subject_ref)  row('Appareil', order.subject_ref);
  if (order.subject_info) line(7, `  ${order.subject_info}`, MX);
  y += 1; hr();

  // Articles / prestations
  for (const item of order.items ?? []) {
    line(8, item.name, MX, 'left', true);
    const qtyLabel = item.quantity > 1 ? `  × ${item.quantity}` : '';
    row(qtyLabel, fmt(item.total));
  }
  y += 1; hr();

  // Totaux
  row('Sous-total', fmt(order.total));
  row('Payé',      fmt(order.paid_amount));
  const remaining = Math.max(0, order.total - order.paid_amount);
  if (remaining > 0.01) row('Reste dû', fmt(remaining));
  row('TOTAL', fmt(order.total), 10, true);

  // Tampon PAYÉ
  if (order.status === 'paye') {
    y += 3;
    const stampW = 32;
    const stampH = 10;
    const stampX = (W - stampW) / 2;
    pdf.setLineWidth(0.8);
    pdf.setDrawColor(0, 140, 0);
    pdf.rect(stampX, y, stampW, stampH);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 140, 0);
    pdf.text('PAYÉ', W / 2, y + 7, { align: 'center' });
    pdf.setTextColor(0, 0, 0);
    pdf.setDrawColor(100);
    y += stampH + 3;
  }

  // Notes
  if (order.notes) {
    y += 1; hr();
    line(7, 'Notes :', MX);
    line(7, order.notes, MX);
  }

  y += 2; hr();
  line(6, d.toLocaleDateString('fr-FR') + ' — ELM APP', W / 2, 'center');

  return pdf.output('blob');
}
