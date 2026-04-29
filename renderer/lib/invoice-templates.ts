import type { Order, Business } from '../../types';
import type { Staff, StaffPayment, StaffAttendance } from '../../services/supabase/staff';
import { formatCurrency } from './utils';

// --- Montant en lettres (français) -------------------------------------------

const _UNITS = [
  '', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  'dix-sept', 'dix-huit', 'dix-neuf',
];
const _TENS = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

function _int2fr(n: number): string {
  if (n === 0) return 'zéro';
  if (n < 20)  return _UNITS[n];
  if (n < 100) {
    const t = Math.floor(n / 10), u = n % 10;
    if (t === 7) return u === 0 ? 'soixante-dix' : 'soixante-' + _UNITS[10 + u];
    if (t === 8) return u === 0 ? 'quatre-vingts' : 'quatre-vingt-' + _UNITS[u];
    if (t === 9) return u === 0 ? 'quatre-vingt-dix' : 'quatre-vingt-' + _UNITS[10 + u];
    return u === 0 ? _TENS[t] : u === 1 ? _TENS[t] + '-et-un' : _TENS[t] + '-' + _UNITS[u];
  }
  if (n < 1000) {
    const h = Math.floor(n / 100), r = n % 100;
    const p = h === 1 ? 'cent' : _int2fr(h) + ' cent';
    return r === 0 ? (h === 1 ? 'cent' : _int2fr(h) + ' cents') : p + ' ' + _int2fr(r);
  }
  if (n < 1_000_000) {
    const t = Math.floor(n / 1000), r = n % 1000;
    const p = t === 1 ? 'mille' : _int2fr(t) + ' mille';
    return r === 0 ? p : p + ' ' + _int2fr(r);
  }
  if (n < 1_000_000_000) {
    const m = Math.floor(n / 1_000_000), r = n % 1_000_000;
    const p = m === 1 ? 'un million' : _int2fr(m) + ' millions';
    return r === 0 ? p : p + ' ' + _int2fr(r);
  }
  const b = Math.floor(n / 1_000_000_000), r = n % 1_000_000_000;
  const p = b === 1 ? 'un milliard' : _int2fr(b) + ' milliards';
  return r === 0 ? p : p + ' ' + _int2fr(r);
}

const _CURRENCY_NAMES: Record<string, [string, string]> = {
  XOF: ['franc CFA',       'francs CFA'],
  EUR: ['euro',             'euros'],
  USD: ['dollar',           'dollars'],
  GBP: ['livre sterling',   'livres sterling'],
  MAD: ['dirham',           'dirhams'],
  DZD: ['dinar algérien',   'dinars algériens'],
  TND: ['dinar tunisien',   'dinars tunisiens'],
};

function amountInWords(amount: number, currency: string): string {
  const int  = Math.floor(Math.abs(amount));
  const dec  = Math.round((Math.abs(amount) - int) * 100);
  const [sg, pl] = _CURRENCY_NAMES[currency] ?? [currency, currency];
  let result = _int2fr(int).toUpperCase() + ' ' + (int > 1 ? pl : sg).toUpperCase();
  if (dec > 0) result += ' ET ' + _int2fr(dec).toUpperCase() + ' CENTIMES';
  return result;
}

// --- Helpers -----------------------------------------------------------------

const PAYMENT_LABELS: Record<string, string> = {
  cash:    'Espèces',
  mobile:  'Mobile Money',
  card:    'Carte bancaire',
  check:   'Chèque',
  bank:    'Virement',
  partial: 'Paiement mixte',
};

const fmt = formatCurrency;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function receiptNum(order: Order): string {
  return '#' + order.id.replace(/-/g, '').toUpperCase().slice(0, 10);
}

function paidAmount(order: Order): number {
  return (order.payments ?? []).reduce((s, p) => s + p.amount, 0);
}

function paymentLines(order: Order, currency: string): string {
  const payments = order.payments ?? [];
  if (payments.length === 0) return '';
  return payments.map((p) =>
    `<tr><td>${PAYMENT_LABELS[p.method] ?? p.method}</td><td style="text-align:right">${fmt(p.amount, currency)}</td></tr>`
  ).join('');
}

// --- Template 1 : Ticket thermique (80mm) ------------------------------------

export function generateThermalReceipt(order: Order, business: Business): string {
  const cur  = business.currency ?? 'XOF';
  const paid = paidAmount(order);
  const change = Math.max(0, paid - order.total);

  const itemsHtml = (order.items ?? []).map((item) => `
    <tr>
      <td colspan="2" style="padding-top:4px;font-weight:600">${item.name}</td>
    </tr>
    <tr>
      <td style="padding-left:8px;color:#555">${item.quantity} × ${fmt(item.price, cur)}</td>
      <td style="text-align:right;font-weight:600">${fmt(item.total, cur)}</td>
    </tr>
    ${item.discount_amount > 0 ? `<tr><td colspan="2" style="padding-left:8px;color:#e53e3e;font-size:10px">Remise: -${fmt(item.discount_amount, cur)}</td></tr>` : ''}
    ${item.notes ? `<tr><td colspan="2" style="padding-left:8px;font-size:10px;color:#888;font-style:italic">${item.notes}</td></tr>` : ''}
  `).join('');

  const couponLine = order.coupon_code
    ? `<tr><td>Coupon (${order.coupon_code})</td><td style="text-align:right;color:#e53e3e">-${fmt(order.discount_amount, cur)}</td></tr>`
    : order.discount_amount > 0
    ? `<tr><td>Remise</td><td style="text-align:right;color:#e53e3e">-${fmt(order.discount_amount, cur)}</td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr"><head>
  <meta charset="UTF-8">
  <title>Ticket ${receiptNum(order)}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      color: #000;
      width: 72mm;
      margin: 0 auto;
      overflow-wrap: anywhere;
    }
    .center   { text-align: center; }
    .right    { text-align: right; }
    .bold     { font-weight: bold; }
    .big      { font-size: 15px; }
    .small    { font-size: 10px; }
    .divider  { border: none; border-top: 1px dashed #000; margin: 6px 0; }
    table     { width: 100%; border-collapse: collapse; }
    td        { padding: 1px 0; vertical-align: top; }
    .total-row td { font-weight: bold; font-size: 13px; padding-top: 4px; }
  </style>
</head><body>

  <!-- En-tête établissement -->
  <div class="center" style="margin-bottom:8px">
    <img src="${business.logo_url || '/logo.png'}" style="max-width:60px;max-height:40px;margin-bottom:4px"><br>
    <div class="bold big">${business.name}</div>
    ${business.denomination && business.denomination !== business.name ? `<div class="small bold" style="margin-top:2px">${business.denomination}</div>` : ''}
    ${business.address ? `<div class="small">${business.address}</div>` : ''}
    ${business.phone   ? `<div class="small">Tél : ${business.phone}</div>` : ''}
    ${business.email   ? `<div class="small">${business.email}</div>` : ''}
  </div>

  <hr class="divider">

  <!-- Infos reçu -->
  <table>
    <tr><td>Reçu</td><td class="right bold">${receiptNum(order)}</td></tr>
    <tr><td>Date</td><td class="right">${fmtDate(order.created_at)} ${fmtTime(order.created_at)}</td></tr>
    ${order.cashier?.full_name ? `<tr><td>Caissier</td><td class="right">${order.cashier.full_name}</td></tr>` : ''}
    ${order.customer_name ? `<tr><td>Client</td><td class="right">${order.customer_name}</td></tr>` : ''}
    ${order.customer_phone ? `<tr><td>Tél.</td><td class="right">${order.customer_phone}</td></tr>` : ''}
  </table>

  <hr class="divider">

  <!-- Articles -->
  <table>${itemsHtml}</table>

  <hr class="divider">

  <!-- Totaux -->
  <table>
    <tr><td>Sous-total</td><td class="right">${fmt(order.subtotal, cur)}</td></tr>
    ${couponLine}
    ${order.tax_amount > 0 ? `<tr><td>TVA</td><td class="right">${fmt(order.tax_amount, cur)}</td></tr>` : ''}
    <tr class="total-row">
      <td>TOTAL</td>
      <td class="right">${fmt(order.total, cur)}</td>
    </tr>
  </table>

  <!-- Montant en lettres -->
  <div class="small" style="margin:4px 0;font-style:italic;line-height:1.4">
    Arrêté à la somme de :<br>
    <strong>${amountInWords(order.total, cur)}</strong>
  </div>

  <hr class="divider">

  <!-- Paiements -->
  <table>
    ${paymentLines(order, cur)}
    ${change > 0 ? `<tr><td>Rendu monnaie</td><td style="text-align:right">${fmt(change, cur)}</td></tr>` : ''}
    ${paid < order.total - 0.01 ? `<tr style="color:#e53e3e"><td>Reste à payer</td><td style="text-align:right">${fmt(order.total - paid, cur)}</td></tr>` : ''}
  </table>

  ${order.coupon_notes ? `<hr class="divider"><div class="small center" style="font-style:italic">${order.coupon_notes}</div>` : ''}
  ${order.notes ? `<hr class="divider"><div class="small" style="font-style:italic">Note : ${order.notes}</div>` : ''}

  <hr class="divider">

  <!-- Pied de page -->
  <div class="center small" style="margin-top:4px">
    ${business.receipt_footer ?? 'Merci de votre visite !'}
  </div>
  <div class="center small" style="margin-top:6px;color:#aaa">
    ${fmtDate(order.created_at)} — ELM APP
  </div>

</body></html>`;
}

// --- Template 2 : A4 paysage duplicata ---------------------------------------

export function generateA4DuplicateInvoice(order: Order, business: Business): string {
  const cur  = business.currency ?? 'XOF';
  const paid = paidAmount(order);
  const remaining = Math.max(0, order.total - paid);

  // Une seule fonction pour générer le contenu d'un exemplaire
  function buildCopy(copyLabel: string, highlight: string): string {
    const itemsRows = (order.items ?? []).map((item) => `
      <tr>
        <td class="td-name">${item.name}${item.notes ? `<br><span class="note">${item.notes}</span>` : ''}</td>
        <td class="td-num">${item.quantity}</td>
        <td class="td-num">${fmt(item.price, cur)}</td>
        ${order.discount_amount > 0 ? `<td class="td-num">${item.discount_amount > 0 ? '-' + fmt(item.discount_amount, cur) : '—'}</td>` : ''}
        <td class="td-num td-bold">${fmt(item.total, cur)}</td>
      </tr>`).join('');

    const discountCol = order.discount_amount > 0 ? '<th class="th">Remise</th>' : '';

    return `
      <!-- ═══ EN-TÊTE ═══ -->
      <div class="header">
        <div class="biz-info">
          <img src="${business.logo_url || '/logo.png'}" class="logo">
          <div>
            <div class="biz-name">${business.organization_name || business.denomination || business.name}</div>
            ${(business.organization_name || business.denomination) !== business.name ? `<div class="biz-detail" style="font-weight:700;color:#1a202c">${business.denomination || business.name}</div>` : ''}
            ${business.address ? `<div class="biz-detail">${business.address}</div>` : ''}
            ${business.phone   ? `<div class="biz-detail">Tél : ${business.phone}</div>` : ''}
            ${business.email   ? `<div class="biz-detail">${business.email}</div>` : ''}
          </div>
        </div>
        <div class="invoice-meta">
          <div class="invoice-title">FACTURE</div>
          <div class="invoice-num">${receiptNum(order)}</div>
          <div class="invoice-detail">Date : ${fmtDate(order.created_at)}</div>
          <div class="invoice-detail">Heure : ${fmtTime(order.created_at)}</div>
          ${order.cashier?.full_name ? `<div class="invoice-detail">Caissier : ${order.cashier.full_name}</div>` : ''}
        </div>
      </div>

      <!-- ═══ CLIENT ═══ -->
      ${order.customer_name || order.customer_phone ? `
      <div class="client-box">
        <span class="client-label">Client :</span>
        <span class="client-name">${order.customer_name ?? ''}</span>
        ${order.customer_phone ? `<span class="client-phone">  ${order.customer_phone}</span>` : ''}
      </div>` : ''}

      <!-- ═══ ARTICLES ═══ -->
      <table class="items-table">
        <thead>
          <tr>
            <th class="th th-left">Désignation</th>
            <th class="th">Qté</th>
            <th class="th">Prix U.</th>
            ${discountCol}
            <th class="th">Total</th>
          </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
      </table>

      <!-- ═══ TOTAUX ═══ -->
      <div class="totals">
        <table class="totals-table">
          ${order.discount_amount > 0 ? `
          <tr><td>Sous-total brut</td><td>${fmt(order.subtotal, cur)}</td></tr>
          <tr><td>${order.coupon_code ? `Coupon (${order.coupon_code})` : 'Remise'}</td><td style="color:#c0392b">-${fmt(order.discount_amount, cur)}</td></tr>
          ` : ''}
          ${order.tax_amount > 0 ? `<tr><td>TVA</td><td>${fmt(order.tax_amount, cur)}</td></tr>` : ''}
          <tr class="total-final"><td>TOTAL TTC</td><td>${fmt(order.total, cur)}</td></tr>
          <tr><td colspan="2" style="font-size:8px;font-style:italic;color:#4a5568;padding:3px 6px 2px;line-height:1.4;border-bottom:1px solid #e2e8f0">
            Arrêté à la somme de : <strong>${amountInWords(order.total, cur)}</strong>
          </td></tr>
          ${(order.payments ?? []).map((p) =>
            `<tr class="payment-line"><td>${PAYMENT_LABELS[p.method] ?? p.method}</td><td>${fmt(p.amount, cur)}</td></tr>`
          ).join('')}
          ${remaining > 0.01 ? `<tr style="color:#c0392b;font-weight:600"><td>Reste dû</td><td>${fmt(remaining, cur)}</td></tr>` : ''}
        </table>
      </div>

      <div style="display:flex;gap:10px;margin-top:5px">
        <div style="flex:1">
          ${order.coupon_notes ? `<div class="coupon-note">${order.coupon_notes}</div>` : ''}
          ${order.notes ? `<div class="order-note">Note : ${order.notes}</div>` : ''}
          ${business.rib ? `
          <div style="margin-top:8px;padding:6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px">
            <div style="font-size:8px;text-transform:uppercase;color:#64748b;font-weight:800;margin-bottom:2px">Informations bancaires (RIB)</div>
            <div style="font-family:monospace;font-size:9px;color:#1e293b;white-space:pre-wrap">${business.rib}</div>
          </div>` : ''}
        </div>
      </div>

      <!-- ═══ SIGNATURES ═══ -->
      <div class="signatures">
        <div class="sig-box">
          <div class="sig-label">Signature caissier</div>
          <div class="sig-line"></div>
        </div>
        <div class="sig-box">
          <div class="sig-label">Signature client</div>
          <div class="sig-line"></div>
        </div>
      </div>

      <!-- ═══ LABEL EXEMPLAIRE ═══ -->
      <div class="copy-label" style="color:${highlight};border-color:${highlight}">
        ${copyLabel}
      </div>

      ${business.receipt_footer ? `<div class="footer-text">${business.receipt_footer}</div>` : ''}
    `;
  }

  return `<!DOCTYPE html>
<html lang="fr"><head>
  <meta charset="UTF-8">
  <title>Facture ${receiptNum(order)} – ${business.name}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 11px;
      color: #1a202c;
      display: flex;
      gap: 0;
      width: 100%;
      max-width: 277mm;
      min-height: 190mm;
      margin: 0 auto;
    }

    /* -- Les deux colonnes -- */
    .copy {
      flex: 1;
      padding: 6mm 7mm;
      display: flex;
      flex-direction: column;
      gap: 5px;
      overflow: hidden;
    }
    .copy:first-child {
      border-right: 2px dashed #999;
    }

    /* -- En-tête -- */
    .header       { display: flex; justify-content: space-between; align-items: flex-start; }
    .biz-info     { display: flex; align-items: flex-start; gap: 8px; }
    .logo         { max-width: 80px; max-height: 60px; object-fit: contain; }
    .biz-name     { font-size: 14px; font-weight: 800; color: #1a202c; }
    .biz-detail   { font-size: 9px; color: #718096; line-height: 1.4; }
    .invoice-meta { text-align: right; }
    .invoice-title { font-size: 16px; font-weight: 800; color: #4f46e5; letter-spacing: .05em; }
    .invoice-num  { font-size: 12px; font-weight: 700; color: #2d3748; }
    .invoice-detail { font-size: 9px; color: #718096; }

    /* -- Client -- */
    .client-box   { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 4px 8px; font-size: 10px; }
    .client-label { color: #718096; }
    .client-name  { font-weight: 600; margin-left: 4px; }
    .client-phone { color: #718096; margin-left: 4px; }

    /* -- Table articles -- */
    .items-table   { width: 100%; border-collapse: collapse; font-size: 10px; }
    .items-table thead tr { background: #1e293b; }
    .th           { padding: 4px 6px; color: #94a3b8; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; }
    .th-left      { text-align: left; }
    .th           { text-align: right; }
    .items-table tbody tr { border-bottom: 1px solid #f1f5f9; }
    .items-table tbody tr:nth-child(even) { background: #f8fafc; }
    .td-name      { padding: 4px 6px; max-width: 100px; }
    .td-num       { padding: 4px 6px; text-align: right; white-space: nowrap; }
    .td-bold      { font-weight: 700; }
    .note         { font-size: 9px; color: #94a3b8; font-style: italic; }

    /* -- Totaux -- */
    .totals       { display: flex; justify-content: flex-end; }
    .totals-table { border-collapse: collapse; min-width: 140px; }
    .totals-table td { padding: 2px 6px; font-size: 10px; }
    .totals-table td:last-child { text-align: right; font-weight: 600; }
    .total-final  { background: #1e293b; color: #fff; font-size: 12px !important; font-weight: 800 !important; }
    .total-final td { padding: 5px 8px !important; }
    .payment-line td { color: #2f855a; font-size: 9px; }

    /* -- Signatures -- */
    .signatures   { display: flex; gap: 16px; margin-top: auto; }
    .sig-box      { flex: 1; }
    .sig-label    { font-size: 9px; color: #718096; margin-bottom: 2px; }
    .sig-line     { border-bottom: 1px solid #cbd5e0; height: 16px; }

    /* -- Label exemplaire -- */
    .copy-label   {
      text-align: center; font-size: 9px; font-weight: 800;
      letter-spacing: .1em; text-transform: uppercase;
      border: 1.5px solid; border-radius: 3px;
      padding: 2px 6px; align-self: center;
    }
    .coupon-note  { font-size: 9px; color: #744210; background: #fffbeb; border: 1px solid #f6e05e; border-radius: 3px; padding: 2px 6px; }
    .order-note   { font-size: 9px; color: #718096; font-style: italic; }
    .footer-text  { font-size: 9px; color: #a0aec0; text-align: center; }
  </style>
</head><body>

  <!-- ══ EXEMPLAIRE CLIENT (gauche) ══ -->
  <div class="copy">
    ${buildCopy('✦ EXEMPLAIRE CLIENT ✦', '#2f855a')}
  </div>

  <!-- ══ EXEMPLAIRE BOUTIQUE (droite) ══ -->
  <div class="copy">
    ${buildCopy('✦ EXEMPLAIRE BOUTIQUE ✦', '#4f46e5')}
  </div>

</body></html>`;
}

// --- Facture hôtel -----------------------------------------------------------

export interface HotelInvoiceData {
  id:              string;
  check_in:        string;
  check_out:       string;
  num_guests:      number;
  price_per_night: number;
  total_room:      number;
  total_services:  number;
  total:           number;
  paid_amount:     number;
  notes?:          string | null;
  actual_check_in?:  string | null;
  actual_check_out?: string | null;
  guest?: {
    full_name:    string;
    phone?:       string | null;
    email?:       string | null;
    id_type?:     string | null;
    id_number?:   string | null;
    nationality?: string | null;
  } | null;
  room?: {
    number: string;
    type:   string;
    floor?: string | null;
  } | null;
}

export interface HotelServiceData {
  label:        string;
  amount:       number;
  service_date: string;
}

const ROOM_TYPE_LABELS: Record<string, string> = {
  simple:    'Simple',
  double:    'Double',
  twin:      'Twin',
  suite:     'Suite',
  familiale: 'Familiale',
};

export function generateHotelInvoice(
  res:      HotelInvoiceData,
  services: HotelServiceData[],
  business: Business,
): string {
  const cur     = business.currency ?? 'XOF';
  const balance = Math.max(0, res.total - res.paid_amount);
  const nights  = Math.max(1, Math.round(
    (new Date(res.check_out).getTime() - new Date(res.check_in).getTime()) / 86_400_000
  ));
  const invoiceNum = res.id.replace(/-/g, '').toUpperCase().slice(0, 8);
  const printDate  = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const servicesRows = services.map((s) => `
    <tr>
      <td>${s.label}</td>
      <td class="r">${fmtDate(s.service_date)}</td>
      <td class="r bold">${fmt(s.amount, cur)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8">
<title>Facture hôtel ${invoiceNum}</title>
<style>
  @page { size: A4 portrait; margin: 15mm 15mm 15mm 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
  .biz-name { font-size: 18px; font-weight: 700; color: #1a1a1a; }
  .biz-detail { font-size: 11px; color: #555; margin-top: 2px; }
  .logo { max-height: 60px; max-width: 100px; object-fit: contain; margin-bottom: 6px; display: block; }
  .inv-title { font-size: 22px; font-weight: 700; color: #1a1a1a; text-align: right; }
  .inv-meta { font-size: 11px; color: #555; text-align: right; margin-top: 4px; }
  .divider { border: none; border-top: 1px solid #ccc; margin: 14px 0; }
  .divider-dark { border: none; border-top: 2px solid #1a1a1a; margin: 14px 0; }
  .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; font-weight: 600; margin-bottom: 6px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
  .info-label { font-size: 10px; color: #888; text-transform: uppercase; }
  .info-val { font-size: 13px; font-weight: 600; color: #1a1a1a; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1a1a1a; color: #fff; padding: 6px 10px; text-align: left; font-size: 11px; }
  th.r { text-align: right; }
  td { padding: 6px 10px; font-size: 12px; border-bottom: 1px solid #eee; }
  td.r { text-align: right; }
  td.bold { font-weight: 600; }
  .totals { margin-top: 16px; width: 280px; margin-left: auto; }
  .totals td { border: none; padding: 4px 10px; }
  .totals tr.total-row td { font-size: 14px; font-weight: 700; border-top: 2px solid #1a1a1a; padding-top: 8px; }
  .totals tr.paid-row td { color: #16a34a; }
  .totals tr.balance-row td { color: #d97706; font-weight: 600; }
  .words { font-size: 11px; font-style: italic; color: #444; margin: 12px 0; line-height: 1.5; }
  .footer { margin-top: 24px; text-align: center; font-size: 11px; color: #888; }
  .stamp { display: inline-block; border: 2px solid #16a34a; color: #16a34a; font-size: 18px; font-weight: 700;
           letter-spacing: 0.1em; padding: 6px 20px; border-radius: 4px; transform: rotate(-8deg);
           margin-top: 12px; }
</style>
</head><body>

<!-- En-tête -->
<div class="header">
  <div>
    ${business.logo_url ? `<img src="${business.logo_url}" class="logo">` : ''}
    <div class="biz-name">${business.name}</div>
    ${business.address ? `<div class="biz-detail">${business.address}</div>` : ''}
    ${business.phone   ? `<div class="biz-detail">Tél : ${business.phone}</div>` : ''}
    ${business.email   ? `<div class="biz-detail">${business.email}</div>` : ''}
  </div>
  <div>
    <div class="inv-title">FACTURE HÔTEL</div>
    <div class="inv-meta">N° ${invoiceNum}</div>
    <div class="inv-meta">Date : ${printDate}</div>
  </div>
</div>

<hr class="divider-dark">

<!-- Infos client + séjour -->
<div class="info-grid">
  <div>
    <div class="section-title">Client</div>
    <div class="info-val">${res.guest?.full_name ?? '—'}</div>
    ${res.guest?.phone      ? `<div class="biz-detail">Tél : ${res.guest.phone}</div>` : ''}
    ${res.guest?.email      ? `<div class="biz-detail">${res.guest.email}</div>` : ''}
    ${res.guest?.nationality ? `<div class="biz-detail">Nationalité : ${res.guest.nationality}</div>` : ''}
    ${res.guest?.id_number  ? `<div class="biz-detail">${res.guest.id_type ?? 'Pièce'} : ${res.guest.id_number}</div>` : ''}
  </div>
  <div>
    <div class="section-title">Chambre</div>
    <div class="info-val">Chambre ${res.room?.number ?? '—'} — ${ROOM_TYPE_LABELS[res.room?.type ?? ''] ?? res.room?.type ?? '—'}</div>
    ${res.room?.floor ? `<div class="biz-detail">Étage : ${res.room.floor}</div>` : ''}
    <div class="biz-detail" style="margin-top:6px">Arrivée : <strong>${fmtDate(res.check_in)}</strong></div>
    <div class="biz-detail">Départ : <strong>${fmtDate(res.check_out)}</strong></div>
    <div class="biz-detail">${nights} nuit${nights > 1 ? 's' : ''} · ${res.num_guests} personne${res.num_guests > 1 ? 's' : ''}</div>
  </div>
</div>

<!-- Détail hébergement -->
<table>
  <thead>
    <tr>
      <th>Désignation</th>
      <th class="r">Nuits</th>
      <th class="r">Prix / nuit</th>
      <th class="r">Montant</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Hébergement — Chambre ${res.room?.number ?? ''} (${ROOM_TYPE_LABELS[res.room?.type ?? ''] ?? ''})</td>
      <td class="r">${nights}</td>
      <td class="r">${fmt(res.price_per_night, cur)}</td>
      <td class="r bold">${fmt(res.total_room, cur)}</td>
    </tr>
  </tbody>
</table>

${services.length > 0 ? `
<!-- Prestations -->
<table style="margin-top:12px">
  <thead>
    <tr>
      <th>Prestation</th>
      <th class="r">Date</th>
      <th class="r">Montant</th>
    </tr>
  </thead>
  <tbody>${servicesRows}</tbody>
</table>` : ''}

${res.notes ? `<div class="biz-detail" style="margin-top:10px;font-style:italic">Note : ${res.notes}</div>` : ''}

<!-- Totaux -->
<table class="totals">
  <tr>
    <td>Hébergement</td>
    <td class="r">${fmt(res.total_room, cur)}</td>
  </tr>
  ${res.total_services > 0 ? `<tr><td>Prestations</td><td class="r">${fmt(res.total_services, cur)}</td></tr>` : ''}
  <tr class="total-row">
    <td>TOTAL</td>
    <td class="r">${fmt(res.total, cur)}</td>
  </tr>
  ${res.paid_amount > 0 ? `<tr class="paid-row"><td>Payé</td><td class="r">-${fmt(res.paid_amount, cur)}</td></tr>` : ''}
  ${balance > 0 ? `<tr class="balance-row"><td>Reste à payer</td><td class="r">${fmt(balance, cur)}</td></tr>` : ''}
</table>

<!-- Montant en lettres -->
<div class="words">
  Arrêté la présente facture à la somme de :<br>
  <strong>${amountInWords(res.total, cur)}</strong>
</div>

${balance <= 0 && res.paid_amount > 0 ? '<div style="text-align:right"><span class="stamp">SOLDÉ</span></div>' : ''}

<hr class="divider">

<!-- Pied de page -->
<div class="footer">
  ${business.receipt_footer ? `<p>${business.receipt_footer}</p>` : ''}
  <p style="margin-top:4px">Édité le ${printDate} · ${business.name} · Elm Hôtel</p>
</div>

</body></html>`;
}

// --- Bulletin de paie --------------------------------------------------------

export function generateStaffPayslip(
  staff: Staff,
  payment: StaffPayment,
  business: Business,
): string {
  const cur = business.currency ?? 'XOF';
  const payslipNum = payment.id.replace(/-/g, '').toUpperCase().slice(0, 8);
  const printDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8">
<title>Bulletin de paie ${staff.name} - ${payslipNum}</title>
<style>
  @page { size: A4 portrait; margin: 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11px; color: #1f2937; line-height: 1.5; }
  .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
  .biz-name { font-size: 18px; font-weight: 800; color: #111827; }
  .biz-detail { font-size: 10px; color: #6b7280; margin-top: 2px; }
  .doc-title { text-align: right; }
  .doc-title h1 { font-size: 20px; font-weight: 800; color: #4f46e5; margin-bottom: 4px; }
  .doc-title p { font-size: 11px; color: #6b7280; }
  
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 30px; }
  .box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f9fafb; }
  .label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; margin-bottom: 4px; }
  .val { font-size: 12px; font-weight: 700; color: #111827; }
  
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #1f2937; color: #ffffff; padding: 8px 12px; text-align: left; font-size: 10px; text-transform: uppercase; }
  td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; }
  .r { text-align: right; }
  .bold { font-weight: 700; }
  
  .totals-container { display: flex; justify-content: flex-end; }
  .totals-table { width: 280px; }
  .totals-table td { padding: 6px 12px; border: none; }
  .total-row { background: #4f46e5; color: #ffffff; }
  .total-row td { font-size: 14px; font-weight: 800; padding: 10px 12px; }
  
  .footer { margin-top: 50px; border-top: 1px solid #e5e7eb; padding-top: 20px; text-align: center; font-size: 10px; color: #9ca3af; }
  .signatures { display: flex; justify-content: space-between; margin-top: 40px; }
  .sig-box { width: 200px; text-align: center; }
  .sig-label { font-size: 10px; font-weight: 600; color: #4b5563; margin-bottom: 40px; }
  .sig-line { border-bottom: 1px solid #d1d5db; }
</style>
</head><body>

<div class="header">
  <div>
    <div class="biz-name">${business.name}</div>
    ${business.address ? `<div class="biz-detail">${business.address}</div>` : ''}
    ${business.phone ? `<div class="biz-detail">Tél : ${business.phone}</div>` : ''}
    ${business.email ? `<div class="biz-detail">${business.email}</div>` : ''}
  </div>
  <div class="doc-title">
    <h1>BULLETIN DE PAIE</h1>
    <p>N° ${payslipNum} — Édité le ${printDate}</p>
  </div>
</div>

<div class="grid">
  <div class="box">
    <div class="label">Salarié</div>
    <div class="val">${staff.name}</div>
    <div class="biz-detail">Poste : ${staff.position ?? '—'}</div>
    <div class="biz-detail">Département : ${staff.department ?? '—'}</div>
  </div>
  <div class="box">
    <div class="label">Période</div>
    <div class="val">${fmtDate(payment.period_start)} au ${fmtDate(payment.period_end)}</div>
    <div class="biz-detail">Mode de paiement : ${payment.payment_method}</div>
    <div class="biz-detail">Date de paiement : ${payment.payment_date ? fmtDate(payment.payment_date) : '—'}</div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Désignation</th>
      <th class="r">Base / Quantité</th>
      <th class="r">Taux</th>
      <th class="r">Montant</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Salaire de base (${staff.salary_type})</td>
      <td class="r">${staff.salary_type === 'hourly' ? (payment.hours_worked ?? '—') + ' h' : (payment.days_worked ?? '—') + ' j'}</td>
      <td class="r">${fmt(staff.salary_rate, cur)}</td>
      <td class="r bold">${fmt(payment.base_amount, cur)}</td>
    </tr>
    ${payment.bonuses > 0 ? `
    <tr>
      <td>Primes et gratifications</td>
      <td class="r">—</td>
      <td class="r">—</td>
      <td class="r bold">+ ${fmt(payment.bonuses, cur)}</td>
    </tr>` : ''}
    ${payment.deductions > 0 ? `
    <tr>
      <td>Retenues et avances</td>
      <td class="r">—</td>
      <td class="r">—</td>
      <td class="r bold" style="color:#dc2626">- ${fmt(payment.deductions, cur)}</td>
    </tr>` : ''}
  </tbody>
</table>

<div class="totals-container">
  <table class="totals-table">
    <tr>
      <td>Total Brut</td>
      <td class="r">${fmt(payment.base_amount + payment.bonuses, cur)}</td>
    </tr>
    <tr>
      <td>Total Retenues</td>
      <td class="r" style="color:#dc2626">-${fmt(payment.deductions, cur)}</td>
    </tr>
    <tr class="total-row">
      <td>NET À PAYER</td>
      <td class="r">${fmt(payment.net_amount, cur)}</td>
    </tr>
  </table>
</div>

<div style="margin-top:20px; font-style:italic; font-size:10px;">
  Arrêté le présent bulletin de paie à la somme de :<br>
  <strong style="text-transform: uppercase;">${amountInWords(payment.net_amount, cur)}</strong>
</div>

${payment.notes ? `
<div style="margin-top:20px; padding:10px; background:#fef3c7; border-radius:6px; font-size:10px; color:#92400e;">
  <strong>Notes :</strong> ${payment.notes}
</div>` : ''}

<div class="signatures">
  <div class="sig-box">
    <div class="sig-label">Signature de l'employeur</div>
    <div class="sig-line"></div>
  </div>
  <div class="sig-box">
    <div class="sig-label">Signature du salarié</div>
    <div class="sig-line"></div>
  </div>
</div>

<div class="footer">
  ${business.receipt_footer ?? 'Merci pour votre contribution au développement de l\'entreprise.'}<br>
  Document généré par ELM APP
</div>

</body></html>`;
}

// --- Feuille de présence -----------------------------------------------------

export function generateStaffAttendanceSheet(
  staff: Staff,
  attendance: StaffAttendance[],
  year: number,
  month: number,
  business: Business,
): string {
  const monthName = new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(new Date(year, month - 1));
  const daysInMonth = new Date(year, month, 0).getDate();
  const printDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const ATTENDANCE_LABELS: Record<string, string> = {
    present:  'Présent',
    absent:   'Absent',
    half_day: 'Demi-journée',
    leave:    'Congé',
    holiday:  'Férié',
  };

  const rows = Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const record = attendance.find((a) => a.date === dateStr);
    const dayOfWeek = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(new Date(year, month - 1, d));
    const isWeekend = new Date(year, month - 1, d).getDay() === 0 || new Date(year, month - 1, d).getDay() === 6;

    return `
      <tr class="${isWeekend ? 'weekend' : ''}">
        <td>${String(d).padStart(2, '0')}/${String(month).padStart(2, '0')}</td>
        <td>${dayOfWeek.toUpperCase()}</td>
        <td class="bold">${record ? ATTENDANCE_LABELS[record.status] ?? record.status : '—'}</td>
        <td class="r">${record?.clock_in ?? '—'}</td>
        <td class="r">${record?.clock_out ?? '—'}</td>
        <td class="r">${record?.hours_worked ? record.hours_worked + ' h' : '—'}</td>
        <td class="small italic">${record?.notes ?? ''}</td>
      </tr>
    `;
  }).join('');

  // Stats
  const present  = attendance.filter(a => a.status === 'present').length;
  const halfDays = attendance.filter(a => a.status === 'half_day').length;
  const absent   = attendance.filter(a => a.status === 'absent').length;
  const totalDays = present + (halfDays * 0.5);

  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8">
<title>Feuille de présence ${staff.name} - ${monthName} ${year}</title>
<style>
  @page { size: A4 portrait; margin: 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11px; color: #1f2937; line-height: 1.4; }
  .header { display: flex; justify-content: space-between; margin-bottom: 25px; border-bottom: 2px solid #1f2937; padding-bottom: 15px; }
  .biz-name { font-size: 18px; font-weight: 800; color: #111827; }
  .biz-detail { font-size: 10px; color: #6b7280; }
  .doc-title { text-align: right; }
  .doc-title h1 { font-size: 18px; font-weight: 800; color: #111827; }
  
  .info-bar { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 20px; padding: 12px; background: #f3f4f6; border-radius: 8px; }
  .info-item { display: flex; flex-direction: column; }
  .label { font-size: 9px; text-transform: uppercase; color: #6b7280; font-weight: 600; }
  .val { font-size: 12px; font-weight: 700; color: #111827; }
  
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #1f2937; color: #ffffff; padding: 8px 10px; text-align: left; font-size: 9px; text-transform: uppercase; }
  td { padding: 6px 10px; border-bottom: 1px solid #e5e7eb; }
  .r { text-align: right; }
  .bold { font-weight: 700; }
  .weekend { background: #f9fafb; color: #9ca3af; }
  
  .stats { display: flex; gap: 30px; margin-bottom: 30px; padding: 15px; border: 1px dashed #d1d5db; border-radius: 8px; }
  .stat-item { text-align: center; }
  .stat-val { font-size: 16px; font-weight: 800; color: #4f46e5; }
  
  .signatures { display: flex; justify-content: space-between; margin-top: 40px; }
  .sig-box { width: 200px; text-align: center; }
  .sig-label { font-size: 10px; font-weight: 600; margin-bottom: 50px; }
  .sig-line { border-bottom: 1px solid #d1d5db; }
  .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #9ca3af; border-top: 1px solid #f3f4f6; padding-top: 15px; }
</style>
</head><body>

<div class="header">
  <div>
    <div class="biz-name">${business.name}</div>
    <div class="biz-detail">${business.address ?? ''}</div>
    <div class="biz-detail">${business.phone ?? ''}</div>
  </div>
  <div class="doc-title">
    <h1>FEUILLE DE PRÉSENCE</h1>
    <p style="text-transform: uppercase; font-weight: 700; color: #4f46e5;">${monthName} ${year}</p>
  </div>
</div>

<div class="info-bar">
  <div class="info-item">
    <span class="label">Employé</span>
    <span class="val">${staff.name}</span>
  </div>
  <div class="info-item">
    <span class="label">Poste</span>
    <span class="val">${staff.position ?? '—'}</span>
  </div>
  <div class="info-item">
    <span class="label">Département</span>
    <span class="val">${staff.department ?? '—'}</span>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th style="width: 60px;">Date</th>
      <th style="width: 60px;">Jour</th>
      <th>Statut</th>
      <th class="r">Arrivée</th>
      <th class="r">Départ</th>
      <th class="r">Heures</th>
      <th>Notes</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>

<div class="stats">
  <div class="stat-item">
    <div class="label">Jours Présents</div>
    <div class="stat-val">${present}</div>
  </div>
  <div class="stat-item">
    <div class="label">Demi-journées</div>
    <div class="stat-val">${halfDays}</div>
  </div>
  <div class="stat-item">
    <div class="label">Total Travaillé</div>
    <div class="stat-val">${totalDays} j</div>
  </div>
  <div class="stat-item">
    <div class="label">Absences</div>
    <div class="stat-val" style="color: #dc2626;">${absent}</div>
  </div>
</div>

<div class="signatures">
  <div class="sig-box">
    <div class="sig-label">Visa Employeur</div>
    <div class="sig-line"></div>
  </div>
  <div class="sig-box">
    <div class="sig-label">Signature Employé</div>
    <div class="sig-line"></div>
  </div>
</div>

<div class="footer">
  Imprimé le ${printDate} — Document généré par ELM APP
</div>

</body></html>`;
}

// --- Reçu d'honoraires (Juridique) -------------------------------------------

export interface HonorairesReceiptData {
  id:              string;
  date:            string;
  dossier_ref?:    string | null;
  client_name:     string;
  client_phone?:   string | null;
  client_address?: string | null;
  tribunal?:       string | null;
  nature?:         string | null;
  items:           Array<{ label: string; amount: number }>;
  total:           number;
  paid:            number;
  payment_method?: string | null;
  notes?:          string | null;
}

export function generateHonorairesReceipt(data: HonorairesReceiptData, business: Business): string {
  const cur      = business.currency ?? 'XOF';
  const balance  = Math.max(0, data.total - data.paid);
  const docNum   = data.id.replace(/-/g, '').toUpperCase().slice(0, 8);
  const printDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const itemsRows = data.items.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${item.label}</td>
      <td class="r bold">${fmt(item.amount, cur)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8">
<title>Reçu Honoraires ${docNum}</title>
<style>
  @page { size: A4 portrait; margin: 18mm 15mm 15mm 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Georgia', serif; font-size: 12px; color: #1a202c; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
  .biz-left { max-width: 220px; }
  .biz-name { font-size: 16px; font-weight: 700; color: #1a202c; font-family: 'Segoe UI', sans-serif; }
  .biz-detail { font-size: 10px; color: #718096; margin-top: 2px; line-height: 1.5; }
  .biz-type { font-size: 10px; font-weight: 700; color: #4a5568; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 4px; }
  .doc-right { text-align: right; }
  .doc-title { font-size: 22px; font-weight: 800; color: #1a202c; letter-spacing: 0.04em; font-family: 'Segoe UI', sans-serif; }
  .doc-num { font-size: 12px; color: #718096; margin-top: 4px; }
  .doc-date { font-size: 11px; color: #4a5568; margin-top: 2px; }

  .divider-dark { border: none; border-top: 2px solid #1a202c; margin: 14px 0; }
  .divider { border: none; border-top: 1px solid #e2e8f0; margin: 12px 0; }

  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
  .info-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; background: #f8fafc; }
  .info-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: #718096; font-weight: 700; margin-bottom: 5px; font-family: 'Segoe UI', sans-serif; }
  .info-val { font-size: 13px; font-weight: 700; color: #1a202c; }
  .info-sub { font-size: 10px; color: #718096; margin-top: 2px; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-family: 'Segoe UI', sans-serif; }
  th { background: #1a202c; color: #fff; padding: 7px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
  th.r { text-align: right; }
  td { padding: 8px 10px; border-bottom: 1px solid #edf2f7; font-size: 11px; }
  .r { text-align: right; }
  .bold { font-weight: 700; }

  .totals { width: 260px; margin-left: auto; font-family: 'Segoe UI', sans-serif; }
  .totals td { padding: 4px 10px; border: none; font-size: 11px; }
  .totals td:last-child { text-align: right; font-weight: 600; }
  .total-row { background: #1a202c; color: #fff; }
  .total-row td { font-size: 13px; font-weight: 800; padding: 7px 10px; }
  .paid-row td { color: #276749; }
  .balance-row td { color: #c05621; font-weight: 700; }

  .words { font-size: 11px; font-style: italic; color: #4a5568; margin: 12px 0; line-height: 1.6; }
  .legal { margin-top: 24px; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 9px; color: #718096; line-height: 1.6; font-family: 'Segoe UI', sans-serif; }
  .signatures { display: flex; gap: 30px; margin-top: 28px; font-family: 'Segoe UI', sans-serif; }
  .sig-box { flex: 1; }
  .sig-label { font-size: 10px; font-weight: 600; color: #4a5568; margin-bottom: 3px; }
  .sig-line { border-bottom: 1px solid #cbd5e0; height: 40px; }
  .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #a0aec0; border-top: 1px solid #f0f0f0; padding-top: 12px; font-family: 'Segoe UI', sans-serif; }
  ${balance <= 0 && data.paid > 0 ? `.stamp { display: inline-block; border: 2.5px solid #276749; color: #276749; font-size: 18px; font-weight: 800; letter-spacing: 0.1em; padding: 5px 18px; border-radius: 4px; transform: rotate(-10deg); }` : ''}
</style>
</head><body>

<div class="header">
  <div class="biz-left">
    ${business.logo_url ? `<img src="${business.logo_url}" style="max-height:50px;max-width:90px;object-fit:contain;display:block;margin-bottom:6px">` : ''}
    <div class="biz-name">${business.name}</div>
    ${business.denomination && business.denomination !== business.name ? `<div class="biz-type">${business.denomination}</div>` : ''}
    ${business.address ? `<div class="biz-detail">${business.address}</div>` : ''}
    ${business.phone   ? `<div class="biz-detail">Tél : ${business.phone}</div>` : ''}
    ${business.email   ? `<div class="biz-detail">${business.email}</div>` : ''}
  </div>
  <div class="doc-right">
    <div class="doc-title">REÇU D'HONORAIRES</div>
    <div class="doc-num">N° ${docNum}</div>
    <div class="doc-date">Date : ${fmtDate(data.date)}</div>
    <div class="doc-date">Émis le : ${printDate}</div>
  </div>
</div>

<hr class="divider-dark">

<div class="info-grid">
  <div class="info-box">
    <div class="info-label">Client</div>
    <div class="info-val">${data.client_name}</div>
    ${data.client_phone   ? `<div class="info-sub">Tél : ${data.client_phone}</div>` : ''}
    ${data.client_address ? `<div class="info-sub">${data.client_address}</div>` : ''}
  </div>
  <div class="info-box">
    <div class="info-label">Dossier</div>
    ${data.dossier_ref ? `<div class="info-val">${data.dossier_ref}</div>` : '<div class="info-val">—</div>'}
    ${data.tribunal ? `<div class="info-sub">Tribunal : ${data.tribunal}</div>` : ''}
    ${data.nature   ? `<div class="info-sub">Nature : ${data.nature}</div>` : ''}
  </div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:32px;text-align:left">N°</th>
      <th style="text-align:left">Désignation des prestations</th>
      <th class="r" style="width:130px">Montant</th>
    </tr>
  </thead>
  <tbody>${itemsRows}</tbody>
</table>

<div style="display:flex;justify-content:flex-end">
  <table class="totals">
    ${data.total !== data.items.reduce((s, i) => s + i.amount, 0) ? `<tr><td>Sous-total</td><td>${fmt(data.items.reduce((s, i) => s + i.amount, 0), cur)}</td></tr>` : ''}
    <tr class="total-row"><td>TOTAL HONORAIRES</td><td>${fmt(data.total, cur)}</td></tr>
    ${data.paid > 0 ? `<tr class="paid-row"><td>Payé (${PAYMENT_LABELS[data.payment_method ?? ''] ?? data.payment_method ?? 'Espèces'})</td><td>-${fmt(data.paid, cur)}</td></tr>` : ''}
    ${balance > 0.01 ? `<tr class="balance-row"><td>Reste dû</td><td>${fmt(balance, cur)}</td></tr>` : ''}
  </table>
</div>

<div class="words">
  Arrêté le présent reçu à la somme de :<br>
  <strong>${amountInWords(data.total, cur)}</strong>
</div>

${balance <= 0 && data.paid > 0 ? '<div style="text-align:right;margin-top:8px"><span class="stamp">SOLDÉ</span></div>' : ''}

${data.notes ? `<div style="margin-top:14px;font-size:10px;font-style:italic;color:#4a5568">Note : ${data.notes}</div>` : ''}

<div class="legal">
  Le présent reçu tient lieu de quittance pour les honoraires perçus. Conformément aux règles déontologiques de la profession, les honoraires sont librement convenus entre l'avocat et son client.
  ${business.rib ? `<br><br><strong>Informations bancaires :</strong> ${business.rib}` : ''}
</div>

<div class="signatures">
  <div class="sig-box">
    <div class="sig-label">Signature de l'avocat / conseil</div>
    <div class="sig-line"></div>
    <div style="font-size:9px;color:#a0aec0;margin-top:4px;text-align:center">${business.name}</div>
  </div>
  <div class="sig-box">
    <div class="sig-label">Signature du client</div>
    <div class="sig-line"></div>
    <div style="font-size:9px;color:#a0aec0;margin-top:4px;text-align:center">${data.client_name}</div>
  </div>
</div>

<div class="footer">
  ${business.receipt_footer ?? ''}<br>
  Document généré par ELM APP — ${printDate}
</div>

</body></html>`;
}

// --- Bon de vente véhicule (Voitures) ----------------------------------------

export interface VoitureBonVenteData {
  id:                string;
  sale_date:         string;
  marque:            string;
  modele:            string;
  annee?:            number | null;
  couleur?:          string | null;
  kilometrage?:      number | null;
  carburant?:        string | null;
  transmission?:     string | null;
  description?:      string | null;
  prix:              number;
  owner_type:        'owned' | 'third_party';
  owner_name?:       string | null;
  owner_phone?:      string | null;
  commission_type?:  'percent' | 'fixed';
  commission_value?: number;
  buyer_name:        string;
  buyer_phone?:      string | null;
  buyer_address?:    string | null;
  payment_method?:   string | null;
  notes?:            string | null;
}

const CARBURANT_FR: Record<string, string> = {
  essence: 'Essence', diesel: 'Diesel', hybride: 'Hybride',
  electrique: 'Électrique', gpl: 'GPL',
};
const TRANSMISSION_FR: Record<string, string> = {
  manuelle: 'Manuelle', automatique: 'Automatique', semi_auto: 'Semi-automatique',
};

export function generateVoitureBonVente(data: VoitureBonVenteData, business: Business): string {
  const cur       = business.currency ?? 'XOF';
  const docNum    = data.id.replace(/-/g, '').toUpperCase().slice(0, 8);
  const printDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const commission = data.owner_type === 'third_party' && data.commission_value
    ? data.commission_type === 'fixed'
      ? data.commission_value
      : data.prix * (data.commission_value / 100)
    : 0;
  const aReverser = data.owner_type === 'third_party' ? Math.max(0, data.prix - commission) : 0;

  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8">
<title>Bon de vente ${data.marque} ${data.modele} — ${docNum}</title>
<style>
  @page { size: A4 portrait; margin: 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a202c; }

  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
  .biz-name { font-size: 17px; font-weight: 800; color: #1a202c; }
  .biz-detail { font-size: 10px; color: #718096; margin-top: 2px; }
  .doc-right { text-align: right; }
  .doc-title { font-size: 20px; font-weight: 800; color: #1a202c; letter-spacing: 0.03em; }
  .doc-num { font-size: 12px; color: #718096; margin-top: 4px; }

  .divider-dark { border: none; border-top: 2px solid #1a202c; margin: 14px 0; }
  .divider { border: none; border-top: 1px solid #e2e8f0; margin: 12px 0; }

  .vehicle-band { background: #1a202c; color: #fff; padding: 12px 16px; border-radius: 8px; margin-bottom: 18px; }
  .vehicle-name { font-size: 22px; font-weight: 800; letter-spacing: 0.02em; }
  .vehicle-specs { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 8px; }
  .spec { font-size: 11px; color: #a0aec0; }
  .spec strong { color: #e2e8f0; }

  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 18px; }
  .info-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; background: #f8fafc; }
  .info-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: #718096; font-weight: 700; margin-bottom: 5px; }
  .info-val { font-size: 13px; font-weight: 700; color: #1a202c; }
  .info-sub { font-size: 10px; color: #718096; margin-top: 2px; }

  .price-box { background: #1a202c; color: #fff; border-radius: 8px; padding: 14px 18px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center; }
  .price-label { font-size: 11px; color: #a0aec0; text-transform: uppercase; letter-spacing: 0.06em; }
  .price-val { font-size: 26px; font-weight: 800; }
  .price-words { font-size: 10px; color: #a0aec0; margin-top: 4px; font-style: italic; }

  .mandate-box { border: 1px solid #f6e05e; background: #fffbeb; border-radius: 6px; padding: 10px 12px; margin-bottom: 16px; font-size: 10px; color: #744210; }
  .mandate-title { font-weight: 700; font-size: 11px; margin-bottom: 6px; }

  .conditions { font-size: 10px; color: #718096; line-height: 1.7; margin-top: 16px; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; }
  .conditions strong { color: #4a5568; }

  .signatures { display: flex; gap: 24px; margin-top: 28px; }
  .sig-box { flex: 1; }
  .sig-label { font-size: 10px; font-weight: 700; color: #4a5568; margin-bottom: 3px; }
  .sig-sub { font-size: 9px; color: #a0aec0; margin-top: 2px; }
  .sig-line { border-bottom: 1px solid #cbd5e0; height: 48px; }

  .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #a0aec0; border-top: 1px solid #f0f0f0; padding-top: 12px; }
</style>
</head><body>

<div class="header">
  <div>
    ${business.logo_url ? `<img src="${business.logo_url}" style="max-height:50px;max-width:90px;object-fit:contain;display:block;margin-bottom:6px">` : ''}
    <div class="biz-name">${business.name}</div>
    ${business.address ? `<div class="biz-detail">${business.address}</div>` : ''}
    ${business.phone   ? `<div class="biz-detail">Tél : ${business.phone}</div>` : ''}
  </div>
  <div class="doc-right">
    <div class="doc-title">BON DE VENTE</div>
    <div class="doc-num">N° ${docNum}</div>
    <div class="doc-num" style="color:#4a5568">Date : ${fmtDate(data.sale_date)}</div>
  </div>
</div>

<div class="vehicle-band">
  <div class="vehicle-name">${data.marque} ${data.modele}${data.annee ? ` (${data.annee})` : ''}</div>
  <div class="vehicle-specs">
    ${data.couleur     ? `<span class="spec"><strong>Couleur :</strong> ${data.couleur}</span>` : ''}
    ${data.kilometrage != null ? `<span class="spec"><strong>Kilométrage :</strong> ${data.kilometrage.toLocaleString('fr-FR')} km</span>` : ''}
    ${data.carburant   ? `<span class="spec"><strong>Carburant :</strong> ${CARBURANT_FR[data.carburant] ?? data.carburant}</span>` : ''}
    ${data.transmission ? `<span class="spec"><strong>Boîte :</strong> ${TRANSMISSION_FR[data.transmission] ?? data.transmission}</span>` : ''}
  </div>
  ${data.description ? `<div style="font-size:10px;color:#a0aec0;margin-top:8px;font-style:italic">${data.description}</div>` : ''}
</div>

<div class="info-grid">
  <div class="info-box">
    <div class="info-label">Vendeur</div>
    <div class="info-val">${business.name}</div>
    ${business.phone ? `<div class="info-sub">Tél : ${business.phone}</div>` : ''}
    ${business.address ? `<div class="info-sub">${business.address}</div>` : ''}
  </div>
  <div class="info-box">
    <div class="info-label">Acheteur</div>
    <div class="info-val">${data.buyer_name}</div>
    ${data.buyer_phone   ? `<div class="info-sub">Tél : ${data.buyer_phone}</div>` : ''}
    ${data.buyer_address ? `<div class="info-sub">${data.buyer_address}</div>` : ''}
  </div>
</div>

<div class="price-box">
  <div>
    <div class="price-label">Prix de vente</div>
    <div class="price-val">${fmt(data.prix, cur)}</div>
    <div class="price-words">${amountInWords(data.prix, cur)}</div>
  </div>
  <div style="text-align:right">
    <div class="price-label">Mode de paiement</div>
    <div style="font-size:14px;font-weight:700;margin-top:4px">${PAYMENT_LABELS[data.payment_method ?? ''] ?? data.payment_method ?? 'À définir'}</div>
  </div>
</div>

${data.owner_type === 'third_party' && data.owner_name ? `
<div class="mandate-box">
  <div class="mandate-title">Véhicule en mandat — Propriétaire tiers</div>
  <div>Propriétaire : <strong>${data.owner_name}</strong>${data.owner_phone ? ` · ${data.owner_phone}` : ''}</div>
  <div style="margin-top:4px">
    Commission agence : <strong>${data.commission_type === 'percent' ? `${data.commission_value}% = ${fmt(commission, cur)}` : fmt(commission, cur)}</strong>
    &nbsp;·&nbsp; À reverser au propriétaire : <strong>${fmt(aReverser, cur)}</strong>
  </div>
</div>` : ''}

${data.notes ? `<div style="font-size:10px;font-style:italic;color:#4a5568;margin-bottom:14px">Observations : ${data.notes}</div>` : ''}

<div class="conditions">
  <strong>Conditions de vente :</strong><br>
  Le soussigné acheteur reconnaît avoir examiné le véhicule désigné ci-dessus et l'avoir acheté en l'état, après essai. Le transfert de propriété est effectif à la date de signature du présent bon de vente et après règlement intégral du prix convenu. Le vendeur certifie que le véhicule est libre de tout gage, opposition ou nantissement.
</div>

<div class="signatures">
  <div class="sig-box">
    <div class="sig-label">Le vendeur</div>
    <div class="sig-sub">${business.name}</div>
    <div class="sig-line"></div>
    <div style="font-size:9px;color:#a0aec0;margin-top:4px">Date et signature</div>
  </div>
  <div class="sig-box">
    <div class="sig-label">L'acheteur</div>
    <div class="sig-sub">${data.buyer_name} — « Lu et approuvé »</div>
    <div class="sig-line"></div>
    <div style="font-size:9px;color:#a0aec0;margin-top:4px">Date et signature</div>
  </div>
  ${data.owner_type === 'third_party' && data.owner_name ? `
  <div class="sig-box">
    <div class="sig-label">Le propriétaire</div>
    <div class="sig-sub">${data.owner_name}</div>
    <div class="sig-line"></div>
    <div style="font-size:9px;color:#a0aec0;margin-top:4px">Date et signature</div>
  </div>` : ''}
</div>

<div class="footer">
  ${business.receipt_footer ?? ''}<br>
  Document généré par ELM APP — ${printDate}
</div>

</body></html>`;
}

// --- Bon de livraison revendeur (Grossiste) -----------------------------------

export interface ResellerBonLivraisonData {
  id:               string;
  date:             string;
  reseller_name:    string;
  reseller_phone?:  string | null;
  reseller_address?: string | null;
  reseller_zone?:   string | null;
  reseller_type?:   'gros' | 'demi_gros' | 'detaillant';
  client_name?:     string | null;
  items: Array<{
    name:     string;
    quantity: number;
    unit?:    string;
    price:    number;
    total:    number;
  }>;
  subtotal:         number;
  discount?:        number;
  total:            number;
  paid?:            number;
  payment_method?:  string | null;
  notes?:           string | null;
}

const RESELLER_TYPE_FR: Record<string, string> = {
  gros:       'Grossiste',
  demi_gros:  'Demi-grossiste',
  detaillant: 'Détaillant',
};

export function generateResellerBonLivraison(data: ResellerBonLivraisonData, business: Business): string {
  const cur       = business.currency ?? 'XOF';
  const docNum    = data.id.replace(/-/g, '').toUpperCase().slice(0, 8);
  const printDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const paid      = data.paid ?? 0;
  const balance   = Math.max(0, data.total - paid);

  const itemsRows = data.items.map((item, i) => `
    <tr>
      <td style="text-align:center;color:#718096">${i + 1}</td>
      <td>${item.name}</td>
      <td style="text-align:center">${item.quantity} ${item.unit ?? 'pièce'}</td>
      <td style="text-align:right">${fmt(item.price, cur)}</td>
      <td style="text-align:right;font-weight:700">${fmt(item.total, cur)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8">
<title>Bon de livraison ${docNum} — ${data.reseller_name}</title>
<style>
  @page { size: A4 portrait; margin: 14mm 14mm 14mm 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a202c; }

  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
  .biz-name { font-size: 17px; font-weight: 800; color: #1a202c; }
  .biz-detail { font-size: 10px; color: #718096; margin-top: 2px; }
  .doc-right { text-align: right; }
  .doc-title { font-size: 20px; font-weight: 800; color: #1a202c; letter-spacing: 0.03em; }
  .doc-meta { font-size: 11px; color: #718096; margin-top: 3px; }

  .divider-dark { border: none; border-top: 2px solid #1a202c; margin: 12px 0; }
  .divider { border: none; border-top: 1px solid #e2e8f0; margin: 10px 0; }

  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  .info-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 9px 12px; background: #f8fafc; }
  .info-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: #718096; font-weight: 700; margin-bottom: 4px; }
  .info-val { font-size: 13px; font-weight: 700; color: #1a202c; }
  .info-sub { font-size: 10px; color: #718096; margin-top: 2px; }
  .badge { display: inline-block; font-size: 9px; font-weight: 700; padding: 2px 8px; border-radius: 20px; background: #ebf4ff; color: #2b6cb0; border: 1px solid #bee3f8; margin-top: 4px; }

  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead tr { background: #1a202c; }
  th { color: #e2e8f0; padding: 7px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; }
  th:first-child { text-align: center; width: 32px; }
  tbody tr { border-bottom: 1px solid #edf2f7; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  td { padding: 7px 10px; }

  .totals { width: 240px; margin-left: auto; margin-top: 14px; }
  .totals td { padding: 4px 8px; font-size: 11px; border: none; }
  .totals td:last-child { text-align: right; font-weight: 600; }
  .total-row { background: #1a202c; color: #fff; }
  .total-row td { font-size: 13px; font-weight: 800; padding: 7px 10px; }
  .paid-row td { color: #276749; }
  .balance-row td { color: #c05621; font-weight: 700; }

  .words { font-size: 10px; font-style: italic; color: #4a5568; margin-top: 10px; line-height: 1.6; }

  .signatures { display: flex; gap: 20px; margin-top: 28px; }
  .sig-box { flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; }
  .sig-label { font-size: 10px; font-weight: 700; color: #4a5568; margin-bottom: 3px; }
  .sig-sub { font-size: 9px; color: #a0aec0; margin-bottom: 10px; }
  .sig-line { border-bottom: 1px solid #cbd5e0; height: 36px; }

  .footer { margin-top: 16px; text-align: center; font-size: 10px; color: #a0aec0; border-top: 1px solid #f0f0f0; padding-top: 10px; }

  @media print {
    .copy-divider { border: none; border-top: 2px dashed #999; margin: 20px 0; page-break-before: auto; }
  }
</style>
</head><body>

<div class="header">
  <div>
    ${business.logo_url ? `<img src="${business.logo_url}" style="max-height:46px;max-width:80px;object-fit:contain;display:block;margin-bottom:5px">` : ''}
    <div class="biz-name">${business.name}</div>
    ${business.address ? `<div class="biz-detail">${business.address}</div>` : ''}
    ${business.phone   ? `<div class="biz-detail">Tél : ${business.phone}</div>` : ''}
    ${business.email   ? `<div class="biz-detail">${business.email}</div>` : ''}
  </div>
  <div class="doc-right">
    <div class="doc-title">BON DE LIVRAISON</div>
    <div class="doc-meta">N° ${docNum}</div>
    <div class="doc-meta">Date : ${fmtDate(data.date)}</div>
    <div class="doc-meta">Édité le : ${printDate}</div>
  </div>
</div>

<hr class="divider-dark">

<div class="info-grid">
  <div class="info-box">
    <div class="info-label">Revendeur</div>
    <div class="info-val">${data.reseller_name}</div>
    ${data.reseller_type ? `<span class="badge">${RESELLER_TYPE_FR[data.reseller_type] ?? data.reseller_type}</span>` : ''}
    ${data.reseller_zone  ? `<div class="info-sub" style="margin-top:4px">Zone : ${data.reseller_zone}</div>` : ''}
    ${data.reseller_phone ? `<div class="info-sub">Tél : ${data.reseller_phone}</div>` : ''}
    ${data.reseller_address ? `<div class="info-sub">${data.reseller_address}</div>` : ''}
  </div>
  <div class="info-box">
    <div class="info-label">Livraison</div>
    <div class="info-val">${fmtDate(data.date)}</div>
    ${data.client_name ? `<div class="info-sub">Client final : ${data.client_name}</div>` : ''}
    ${data.payment_method ? `<div class="info-sub">Paiement : ${PAYMENT_LABELS[data.payment_method] ?? data.payment_method}</div>` : ''}
    ${data.notes ? `<div class="info-sub" style="font-style:italic">${data.notes}</div>` : ''}
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>#</th>
      <th style="text-align:left">Désignation</th>
      <th style="text-align:center">Quantité</th>
      <th style="text-align:right">Prix unit.</th>
      <th style="text-align:right">Total</th>
    </tr>
  </thead>
  <tbody>${itemsRows}</tbody>
</table>

<div style="display:flex;justify-content:flex-end">
  <table class="totals">
    ${data.discount && data.discount > 0 ? `
    <tr><td>Sous-total</td><td>${fmt(data.subtotal, cur)}</td></tr>
    <tr><td>Remise</td><td style="color:#c05621">-${fmt(data.discount, cur)}</td></tr>
    ` : ''}
    <tr class="total-row"><td>TOTAL</td><td>${fmt(data.total, cur)}</td></tr>
    ${paid > 0 ? `<tr class="paid-row"><td>Payé</td><td>-${fmt(paid, cur)}</td></tr>` : ''}
    ${balance > 0.01 ? `<tr class="balance-row"><td>Reste dû</td><td>${fmt(balance, cur)}</td></tr>` : ''}
  </table>
</div>

<div class="words">
  Arrêté à la somme de : <strong>${amountInWords(data.total, cur)}</strong>
</div>

<div class="signatures">
  <div class="sig-box">
    <div class="sig-label">Livreur / Dépôt</div>
    <div class="sig-sub">${business.name}</div>
    <div class="sig-line"></div>
  </div>
  <div class="sig-box">
    <div class="sig-label">Revendeur — Reçu conforme</div>
    <div class="sig-sub">${data.reseller_name}${data.reseller_zone ? ` · Zone ${data.reseller_zone}` : ''}</div>
    <div class="sig-line"></div>
  </div>
</div>

<div class="footer">
  ${business.receipt_footer ?? ''}<br>
  Document généré par ELM APP — ${printDate}
</div>

</body></html>`;
}

// --- Bon de travail (Prestation de service) -----------------------------------

export interface ServiceReceiptData {
  id:              string;
  order_number:    number;
  created_at:      string;
  started_at?:      string | null;
  finished_at?:     string | null;
  paid_at?:         string | null;
  subject_ref?:     string | null;
  subject_info?:    string | null;
  client_name?:     string | null;
  client_phone?:    string | null;
  assigned_name?:   string | null;
  status:           string;
  notes?:           string | null;
  items:            Array<{ name: string; price: number; quantity: number; total: number }>;
  total:            number;
  paid_amount:      number;
  payment_method?:  string | null;
}

export function generateServiceOrderReceipt(data: ServiceReceiptData, business: Business): string {
  const cur = business.currency ?? 'XOF';
  const balance = Math.max(0, data.total - data.paid_amount);
  const otNum = 'OT-' + String(data.order_number).padStart(4, '0');
  const printDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const printTime = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const orderDate = fmtDate(data.created_at);

  const itemsRows = data.items.map(i => `
    <tr>
      <td style="padding:3px 0">${i.name}${i.quantity > 1 ? ` × ${i.quantity}` : ''}</td>
      <td style="text-align:right;font-weight:600;white-space:nowrap">${fmt(i.total, cur)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<title>${otNum}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', Courier, monospace; font-size: 11px; color: #000; width: 72mm; margin: 0 auto; overflow-wrap: anywhere; }
  .center { text-align: center; }
  .biz-name { font-size: 15px; font-weight: bold; }
  .ot-num { font-size: 20px; font-weight: bold; letter-spacing: 3px; margin: 6px 0; }
  hr { border: none; border-top: 1px dashed #888; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; vertical-align: top; }
  .label { color: #555; font-size: 10px; }
  .val { font-weight: 600; }
  .total-row td { font-size: 13px; font-weight: 800; border-top: 1px solid #000; padding-top: 5px; margin-top: 4px; }
  .paid-row td { color: #16a34a; }
  .balance-row td { color: #dc2626; font-weight: 700; }
  .stamp { display: inline-block; border: 3px solid #16a34a; color: #16a34a; font-size: 16px; font-weight: 900; padding: 2px 12px; transform: rotate(-4deg); letter-spacing: 3px; margin: 8px 0; }
  .footer { font-size: 9px; color: #666; margin-top: 8px; }
</style>
</head><body>

<div class="center">
  <div class="biz-name">${business.name}</div>
  ${business.address ? `<div class="label">${business.address}</div>` : ''}
  ${(business as any).phone ? `<div class="label">${(business as any).phone}</div>` : ''}
  <hr>
  <div class="ot-num">${otNum}</div>
  <div class="label">${orderDate} — ${printTime}</div>
</div>

<hr>

${data.subject_ref ? `
<table>
  <tr><td class="label">Référence</td><td class="val" style="text-align:right;font-size:13px">${data.subject_ref}</td></tr>
  ${data.subject_info ? `<tr><td colspan="2" style="text-align:center;font-size:10px">${data.subject_info}</td></tr>` : ''}
</table>
<hr>
` : ''}

${data.client_name ? `
<table>
  <tr><td class="label">Client</td><td style="text-align:right">${data.client_name}</td></tr>
  ${data.client_phone ? `<tr><td class="label">Tél</td><td style="text-align:right">${data.client_phone}</td></tr>` : ''}
  ${data.assigned_name ? `<tr><td class="label">Technicien</td><td style="text-align:right">${data.assigned_name}</td></tr>` : ''}
</table>
<hr>
` : (data.assigned_name ? `<table><tr><td class="label">Technicien</td><td style="text-align:right">${data.assigned_name}</td></tr></table><hr>` : '')}

${(() => {
  const rows = [
    ['Créé',    data.created_at],
    ['Démarré', data.started_at],
    ['Terminé', data.finished_at],
    ['Payé',    data.paid_at],
  ].filter(([, ts]) => !!ts).map(([label, ts]) => {
    const d = new Date(ts as string);
    const dt = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
             + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `<tr><td class="label">${label}</td><td style="text-align:right">${dt}</td></tr>`;
  }).join('');

  const durMin = data.started_at && data.finished_at
    ? Math.round((new Date(data.finished_at).getTime() - new Date(data.started_at).getTime()) / 60000)
    : null;
  const dur = durMin !== null
    ? `<tr><td class="label">Durée</td><td style="text-align:right;font-weight:700">${durMin >= 60 ? `${Math.floor(durMin/60)}h ` : ''}${durMin % 60}min</td></tr>`
    : '';

  return rows ? `<table>${rows}${dur}</table><hr>` : '';
})()}

<table>${itemsRows}</table>

<hr>

<table>
  <tr class="total-row"><td>TOTAL</td><td style="text-align:right">${fmt(data.total, cur)}</td></tr>
  ${data.paid_amount > 0 ? `<tr class="paid-row"><td>Payé${data.payment_method ? ` (${PAYMENT_LABELS[data.payment_method] ?? data.payment_method})` : ''}</td><td style="text-align:right">-${fmt(data.paid_amount, cur)}</td></tr>` : ''}
  ${balance > 0 ? `<tr class="balance-row"><td>Reste dû</td><td style="text-align:right">${fmt(balance, cur)}</td></tr>` : ''}
</table>

${data.status === 'paye' ? '<div class="center"><span class="stamp">PAYÉ</span></div>' : ''}

${data.notes ? `<hr><div class="label" style="font-style:italic">Note : ${data.notes}</div>` : ''}

<hr>
<div class="footer center">
  ${business.receipt_footer ? `<p>${business.receipt_footer}</p>` : ''}
  <p>Merci de votre confiance</p>
  <p>Imprimé le ${printDate} à ${printTime} · ELM</p>
</div>

</body></html>`;
}

// --- Ouvrir et imprimer -------------------------------------------------------

export function printHtml(html: string): void {
  const w = window.open('', '_blank', 'width=1000,height=750');
  if (!w) { alert('Autorisez les pop-ups pour imprimer.'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 500);
}
