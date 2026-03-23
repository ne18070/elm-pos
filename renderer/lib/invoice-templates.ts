import type { Order, Business } from '../../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  cash:    'Espèces',
  mobile:  'Mobile Money',
  card:    'Carte bancaire',
  check:   'Chèque',
  bank:    'Virement',
  partial: 'Paiement mixte',
};

function fmt(amount: number, currency = 'XOF'): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount) + '\u00a0' + currency;
}

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

// ─── Template 1 : Ticket thermique (80mm) ────────────────────────────────────

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
    ${business.logo_url ? `<img src="${business.logo_url}" style="max-width:60px;max-height:40px;margin-bottom:4px"><br>` : ''}
    <div class="bold big">${business.name}</div>
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
    ${fmtDate(order.created_at)} — Elm POS
  </div>

</body></html>`;
}

// ─── Template 2 : A4 paysage duplicata ───────────────────────────────────────

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
          ${business.logo_url ? `<img src="${business.logo_url}" class="logo">` : ''}
          <div>
            <div class="biz-name">${business.name}</div>
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
          ${(order.payments ?? []).map((p) =>
            `<tr class="payment-line"><td>${PAYMENT_LABELS[p.method] ?? p.method}</td><td>${fmt(p.amount, cur)}</td></tr>`
          ).join('')}
          ${remaining > 0.01 ? `<tr style="color:#c0392b;font-weight:600"><td>Reste dû</td><td>${fmt(remaining, cur)}</td></tr>` : ''}
        </table>
      </div>

      ${order.coupon_notes ? `<div class="coupon-note">${order.coupon_notes}</div>` : ''}
      ${order.notes ? `<div class="order-note">Note : ${order.notes}</div>` : ''}

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
      width: 277mm;
      height: 190mm;
    }

    /* ── Les deux colonnes ── */
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

    /* ── En-tête ── */
    .header       { display: flex; justify-content: space-between; align-items: flex-start; }
    .biz-info     { display: flex; align-items: flex-start; gap: 8px; }
    .logo         { max-width: 40px; max-height: 30px; object-fit: contain; }
    .biz-name     { font-size: 14px; font-weight: 800; color: #1a202c; }
    .biz-detail   { font-size: 9px; color: #718096; line-height: 1.4; }
    .invoice-meta { text-align: right; }
    .invoice-title { font-size: 16px; font-weight: 800; color: #4f46e5; letter-spacing: .05em; }
    .invoice-num  { font-size: 12px; font-weight: 700; color: #2d3748; }
    .invoice-detail { font-size: 9px; color: #718096; }

    /* ── Client ── */
    .client-box   { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 4px 8px; font-size: 10px; }
    .client-label { color: #718096; }
    .client-name  { font-weight: 600; margin-left: 4px; }
    .client-phone { color: #718096; margin-left: 4px; }

    /* ── Table articles ── */
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

    /* ── Totaux ── */
    .totals       { display: flex; justify-content: flex-end; }
    .totals-table { border-collapse: collapse; min-width: 140px; }
    .totals-table td { padding: 2px 6px; font-size: 10px; }
    .totals-table td:last-child { text-align: right; font-weight: 600; }
    .total-final  { background: #1e293b; color: #fff; font-size: 12px !important; font-weight: 800 !important; }
    .total-final td { padding: 5px 8px !important; }
    .payment-line td { color: #2f855a; font-size: 9px; }

    /* ── Signatures ── */
    .signatures   { display: flex; gap: 16px; margin-top: auto; }
    .sig-box      { flex: 1; }
    .sig-label    { font-size: 9px; color: #718096; margin-bottom: 2px; }
    .sig-line     { border-bottom: 1px solid #cbd5e0; height: 16px; }

    /* ── Label exemplaire ── */
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

// ─── Ouvrir et imprimer ───────────────────────────────────────────────────────

export function printHtml(html: string): void {
  const w = window.open('', '_blank', 'width=1000,height=750');
  if (!w) { alert('Autorisez les pop-ups pour imprimer.'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 500);
}
