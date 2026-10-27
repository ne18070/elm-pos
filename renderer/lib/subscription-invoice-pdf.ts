'use client';
import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { formatCurrency } from './utils';
import { sanitize } from './pdf-utils';
import type { SubscriptionInvoice, PaymentSettings } from '../../services/supabase/subscriptions';

const W  = 210;  // A4 portrait, mm
const MX = 18;   // marge gauche/droite
const R  = W - MX;

const INK    = [17, 24, 39]   as const;
const MUTED  = [107, 114, 128] as const;
const LINE   = [229, 231, 235] as const;
const BAND   = [243, 244, 246] as const;
const PAID   = [22, 163, 74]   as const;

/** Facture d'abonnement A4, en pur jsPDF. */
export function generateSubscriptionInvoicePdf(
  invoice: SubscriptionInvoice,
  seller: PaymentSettings | null,
): Blob {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const fmt  = (n: number) => sanitize(formatCurrency(n, invoice.currency));
  const date = (iso: string) => format(new Date(iso), 'dd/MM/yyyy');
  const txt  = (s: string, x: number, y: number, opts?: { align?: 'left' | 'right' | 'center' }) =>
    pdf.text(sanitize(s), x, y, opts);

  // -- Vendeur (gauche) ------------------------------------------------------
  let y = 24;
  pdf.setTextColor(...INK);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  txt(seller?.invoice_company_name || 'ELM APP', MX, y);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(...MUTED);
  const sellerLines = [
    ...(seller?.invoice_address ? seller.invoice_address.split('\n') : []),
    seller?.invoice_ninea   ? `NINEA : ${seller.invoice_ninea}` : null,
    seller?.invoice_rccm    ? `RCCM : ${seller.invoice_rccm}`   : null,
    seller?.invoice_email   || null,
    seller?.whatsapp_number ? `Tél. : ${seller.whatsapp_number}` : null,
  ].filter((l): l is string => !!l && !!l.trim());
  for (const line of sellerLines) { y += 4.5; txt(line, MX, y); }

  // -- Titre + références (droite) -------------------------------------------
  pdf.setTextColor(...INK);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  txt('FACTURE', R, 26, { align: 'right' });
  pdf.setFontSize(10);
  txt(`N° ${invoice.invoice_number}`, R, 33, { align: 'right' });
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...MUTED);
  txt(`Date d'émission : ${date(invoice.issued_at)}`, R, 38.5, { align: 'right' });

  // -- Client ----------------------------------------------------------------
  y = Math.max(y, 40) + 14;
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  txt('FACTURÉ À', MX, y);
  pdf.setTextColor(...INK);
  pdf.setFontSize(11);
  y += 6;
  txt(invoice.buyer_legal_name || invoice.buyer_name, MX, y);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(...MUTED);
  if (invoice.buyer_legal_name && invoice.buyer_legal_name !== invoice.buyer_name) {
    y += 4.5; txt(invoice.buyer_name, MX, y);
  }
  if (invoice.buyer_email) { y += 4.5; txt(invoice.buyer_email, MX, y); }

  // -- Tableau ---------------------------------------------------------------
  const cQty = 128, cUnit = 160;
  y += 14;
  pdf.setFillColor(...BAND);
  pdf.rect(MX, y - 5, R - MX, 8, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(...MUTED);
  txt('DÉSIGNATION', MX + 3, y);
  txt('QTÉ', cQty, y, { align: 'right' });
  txt('PRIX UNITAIRE', cUnit, y, { align: 'right' });
  txt('MONTANT', R - 3, y, { align: 'right' });

  y += 10;
  pdf.setTextColor(...INK);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  txt(`Abonnement ELM APP - ${invoice.plan_label}`, MX + 3, y);
  pdf.setFont('helvetica', 'normal');
  txt(String(invoice.quantity), cQty, y, { align: 'right' });
  txt(fmt(invoice.unit_price), cUnit, y, { align: 'right' });
  txt(fmt(invoice.amount), R - 3, y, { align: 'right' });
  pdf.setFontSize(8.5);
  pdf.setTextColor(...MUTED);
  txt(`Période du ${date(invoice.period_start)} au ${date(invoice.period_end)}`, MX + 3, y + 5);

  y += 11;
  pdf.setDrawColor(...LINE);
  pdf.line(MX, y, R, y);

  // -- Total -----------------------------------------------------------------
  y += 10;
  pdf.setFontSize(10);
  pdf.setTextColor(...MUTED);
  txt('Total', cUnit, y, { align: 'right' });
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.setTextColor(...INK);
  txt(fmt(invoice.amount), R - 3, y, { align: 'right' });

  // -- Règlement -------------------------------------------------------------
  y += 16;
  pdf.setDrawColor(...PAID);
  pdf.setTextColor(...PAID);
  pdf.setLineWidth(0.6);
  pdf.roundedRect(MX, y - 6, 34, 10, 2, 2, 'S');
  pdf.setFontSize(11);
  txt('PAYÉE', MX + 17, y + 0.8, { align: 'center' });
  pdf.setLineWidth(0.2);

  if (invoice.payment_note) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(...MUTED);
    const lines = pdf.splitTextToSize(sanitize(`Règlement : ${invoice.payment_note}`), R - MX - 42) as string[];
    pdf.text(lines, MX + 40, y - 1.5);
  }

  // -- Pied de page ----------------------------------------------------------
  pdf.setDrawColor(...LINE);
  pdf.line(MX, 272, R, 272);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(...MUTED);
  txt('Merci pour votre confiance.', MX, 278);
  txt(invoice.invoice_number, R, 278, { align: 'right' });

  return pdf.output('blob');
}

export function downloadSubscriptionInvoice(invoice: SubscriptionInvoice, seller: PaymentSettings | null) {
  const blob = generateSubscriptionInvoicePdf(invoice, seller);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `${invoice.invoice_number}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
