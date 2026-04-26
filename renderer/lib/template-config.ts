import type { Order, Business } from '../../types';

// --- Block types --------------------------------------------------------------

export type BlockType =
  | 'header'
  | 'receipt-info'
  | 'items'
  | 'totals'
  | 'payment'
  | 'footer'
  | 'custom-text'
  | 'custom-image';

export interface TemplateBlock {
  id:      string;
  type:    BlockType;
  enabled: boolean;
  label?:  string;         // editor label (custom blocks)
  // custom-text
  content?:   string;
  textAlign?: 'left' | 'center' | 'right';
  textBold?:  boolean;
  textSize?:  'xs' | 'sm' | 'md' | 'lg';
  // custom-image
  dataUrl?:       string;  // base64 data URL
  imageAlt?:      string;
  imageMaxWidth?: string;  // e.g. "80px" or "60%"
  imageAlign?:    'left' | 'center' | 'right';
}

export const DEFAULT_BLOCKS: TemplateBlock[] = [
  { id: 'b-header',       type: 'header',       enabled: true },
  { id: 'b-receipt-info', type: 'receipt-info',  enabled: true },
  { id: 'b-items',        type: 'items',         enabled: true },
  { id: 'b-totals',       type: 'totals',        enabled: true },
  { id: 'b-payment',      type: 'payment',       enabled: true },
  { id: 'b-footer',       type: 'footer',        enabled: true },
];

export const BLOCK_LABELS: Record<BlockType, string> = {
  'header':       'En-tête établissement',
  'receipt-info': 'Informations reçu',
  'items':        'Tableau articles',
  'totals':       'Totaux',
  'payment':      'Paiement',
  'footer':       'Pied de page',
  'custom-text':  'Zone texte libre',
  'custom-image': 'Image personnalisée',
};

// --- TemplateConfig -----------------------------------------------------------

export interface TemplateConfig {
  id:     string;
  name:   string;
  format: 'thermal' | 'a4-landscape' | 'a4-portrait' | 'a5-portrait';
  copies: 1 | 2;
  blocks?: TemplateBlock[];

  // Style
  primaryColor: string;
  accentColor:  string;
  fontFamily:   'mono' | 'sans' | 'serif';

  // Header
  showLogo:     boolean;
  showAddress:  boolean;
  showPhone:    boolean;
  showEmail:    boolean;
  headerExtra:  string;

  // Receipt info
  showReceiptNum: boolean;
  showDate:       boolean;
  showCashier:    boolean;
  showCustomer:   boolean;

  // Items table
  showUnitPrice:    boolean;
  showItemDiscount: boolean;
  showItemNotes:    boolean;

  // Totals
  showSubtotal:      boolean;
  showCoupon:        boolean;
  showTax:           boolean;
  showAmountInWords: boolean;

  // Payment
  showPaymentDetails: boolean;
  showChange:         boolean;
  showBalance:        boolean;

  // Footer
  showSignatures: boolean;
  showQRCode:     boolean;
  footerText:     string;

  // Copies config
  copy1Label: string;
  copy2Label: string;
  copy1Color: string;
  copy2Color: string;
}

// --- Default templates --------------------------------------------------------

export const DEFAULT_THERMAL: TemplateConfig = {
  id: 'thermal-default',
  name: 'Ticket thermique',
  format: 'thermal',
  copies: 1,
  blocks: DEFAULT_BLOCKS.map(b => ({ ...b })),
  primaryColor: '#1e293b',
  accentColor: '#22c55e',
  fontFamily: 'mono',
  showLogo: true,
  showAddress: true,
  showPhone: true,
  showEmail: false,
  headerExtra: '',
  showReceiptNum: true,
  showDate: true,
  showCashier: true,
  showCustomer: true,
  showUnitPrice: true,
  showItemDiscount: true,
  showItemNotes: true,
  showSubtotal: true,
  showCoupon: true,
  showTax: true,
  showAmountInWords: true,
  showPaymentDetails: true,
  showChange: true,
  showBalance: true,
  showSignatures: false,
  showQRCode: false,
  footerText: 'Merci de votre visite !',
  copy1Label: '✦ EXEMPLAIRE CLIENT ✦',
  copy2Label: '✦ EXEMPLAIRE BOUTIQUE ✦',
  copy1Color: '#22c55e',
  copy2Color: '#4f46e5',
};

export const DEFAULT_A4_DUPLICATE: TemplateConfig = {
  id: 'a4-duplicate-default',
  name: 'Facture A4 duplicata',
  format: 'a4-landscape',
  copies: 2,
  blocks: DEFAULT_BLOCKS.map(b => ({ ...b })),
  primaryColor: '#1e293b',
  accentColor: '#4f46e5',
  fontFamily: 'sans',
  showLogo: true,
  showAddress: true,
  showPhone: true,
  showEmail: true,
  headerExtra: '',
  showReceiptNum: true,
  showDate: true,
  showCashier: true,
  showCustomer: true,
  showUnitPrice: true,
  showItemDiscount: true,
  showItemNotes: true,
  showSubtotal: true,
  showCoupon: true,
  showTax: true,
  showAmountInWords: true,
  showPaymentDetails: true,
  showChange: false,
  showBalance: true,
  showSignatures: true,
  showQRCode: false,
  footerText: '',
  copy1Label: '✦ EXEMPLAIRE CLIENT ✦',
  copy2Label: '✦ EXEMPLAIRE BOUTIQUE ✦',
  copy1Color: '#22c55e',
  copy2Color: '#4f46e5',
};

export const BUILTIN_TEMPLATES: TemplateConfig[] = [DEFAULT_THERMAL, DEFAULT_A4_DUPLICATE];

// --- Storage helpers ----------------------------------------------------------

const storageKey = (businessId: string) => `invoice_templates_${businessId}`;

function migrateConfig(config: TemplateConfig): TemplateConfig {
  if (config.blocks && config.blocks.length > 0) return config;
  return { ...config, blocks: DEFAULT_BLOCKS.map(b => ({ ...b })) };
}

export function getTemplates(businessId: string): TemplateConfig[] {
  if (typeof window === 'undefined') return BUILTIN_TEMPLATES;
  try {
    const raw = localStorage.getItem(storageKey(businessId));
    if (!raw) return BUILTIN_TEMPLATES;
    const parsed = (JSON.parse(raw) as TemplateConfig[]).map(migrateConfig);
    return parsed.length > 0 ? parsed : BUILTIN_TEMPLATES;
  } catch {
    return BUILTIN_TEMPLATES;
  }
}

export function saveTemplates(businessId: string, templates: TemplateConfig[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKey(businessId), JSON.stringify(templates));
}

export function createTemplate(businessId: string, base?: Partial<TemplateConfig>): TemplateConfig {
  const id = `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const tpl: TemplateConfig = {
    ...DEFAULT_THERMAL,
    blocks: DEFAULT_BLOCKS.map(b => ({ ...b })),
    ...base,
    id,
  };
  const existing = getTemplates(businessId);
  saveTemplates(businessId, [...existing, tpl]);
  return tpl;
}

// --- Helpers ------------------------------------------------------------------

const _UNITS = [
  '', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  'dix-sept', 'dix-huit', 'dix-neuf',
];
const _TENS = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

function _int2fr(n: number): string {
  if (n === 0) return 'zéro';
  if (n < 20) return _UNITS[n];
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
  XOF: ['franc CFA', 'francs CFA'],
  EUR: ['euro', 'euros'],
  USD: ['dollar', 'dollars'],
  GBP: ['livre sterling', 'livres sterling'],
  MAD: ['dirham', 'dirhams'],
  DZD: ['dinar algérien', 'dinars algériens'],
  TND: ['dinar tunisien', 'dinars tunisiens'],
};

function amountInWords(amount: number, currency: string): string {
  const int = Math.floor(Math.abs(amount));
  const dec = Math.round((Math.abs(amount) - int) * 100);
  const [sg, pl] = _CURRENCY_NAMES[currency] ?? [currency, currency];
  let result = _int2fr(int).toUpperCase() + ' ' + (int > 1 ? pl : sg).toUpperCase();
  if (dec > 0) result += ' ET ' + _int2fr(dec).toUpperCase() + ' CENTIMES';
  return result;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Espèces', mobile: 'Mobile Money', card: 'Carte bancaire',
  check: 'Chèque', bank: 'Virement', partial: 'Paiement mixte',
};

const CURRENCY_LABEL: Record<string, string> = { XOF: 'FCFA', XAF: 'FCFA' };

function fmt(amount: number, currency = 'XOF'): string {
  const label = CURRENCY_LABEL[currency] ?? currency;
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount) + '\u00a0' + label;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function receiptNum(order: any): string {
  return '#' + String(order.id).replace(/-/g, '').toUpperCase().slice(0, 10);
}
function paidAmount(order: any): number {
  return ((order.payments ?? []) as any[]).reduce((s: number, p: any) => s + p.amount, 0);
}
function fontStack(f: TemplateConfig['fontFamily']): string {
  if (f === 'mono')  return "'Courier New', Courier, monospace";
  if (f === 'serif') return "Georgia, 'Times New Roman', serif";
  return "'Segoe UI', Arial, sans-serif";
}

// --- Custom block renderers ---------------------------------------------------

function renderCustomText(block: TemplateBlock, isThermal: boolean): string {
  const align = block.textAlign ?? 'left';
  const bold  = block.textBold ? 'font-weight:bold;' : '';
  const sizeMap: Record<string, string> = { xs: '9px', sm: '10px', md: '12px', lg: '14px' };
  const size = sizeMap[block.textSize ?? 'sm'];
  const content = block.content ?? '';
  if (isThermal) {
    return `<div style="text-align:${align};${bold}font-size:${size};margin:4px 0">${content}</div>`;
  }
  return `<div style="text-align:${align};${bold}font-size:${size};margin:6px 0;color:#2d3748">${content}</div>`;
}

function renderCustomImage(block: TemplateBlock, isThermal: boolean): string {
  if (!block.dataUrl) return '';
  const maxW  = block.imageMaxWidth ?? (isThermal ? '60%' : '30%');
  const align = block.imageAlign ?? 'center';
  const marginAuto = align === 'center' ? 'margin-left:auto;margin-right:auto;' : align === 'right' ? 'margin-left:auto;' : '';
  return `<div style="text-align:${align};margin:${isThermal ? '4px' : '6px'} 0">
    <img src="${block.dataUrl}" alt="${block.imageAlt ?? ''}"
         style="max-width:${maxW};display:block;${marginAuto}" />
  </div>`;
}

// --- Section renderers --------------------------------------------------------

type RenderCtx = {
  order:     any;
  business:  any;
  config:    TemplateConfig;
  extra?:    { resellerName?: string; resellerClientName?: string; resellerClientPhone?: string };
  cur:       string;
  paid:      number;
  change:    number;
  remaining: number;
  itemsHtml: string;
  couponLine:string;
};

function renderHeader(ctx: RenderCtx, isThermal: boolean): string {
  const { business: biz, config } = ctx;
  if (isThermal) {
    return `
      <div class="center" style="margin-bottom:8px" data-section="header">
        ${config.showLogo && biz.logo_url ? `<img src="${biz.logo_url}" style="max-width:60px;max-height:40px;margin-bottom:4px"><br>` : ''}
        <div class="bold big">${biz.name}</div>
        ${config.showAddress && biz.address ? `<div class="small">${biz.address}</div>` : ''}
        ${config.showPhone   && biz.phone   ? `<div class="small">Tél : ${biz.phone}</div>` : ''}
        ${config.showEmail   && biz.email   ? `<div class="small">${biz.email}</div>` : ''}
        ${config.headerExtra ? `<div class="small" style="margin-top:2px">${config.headerExtra}</div>` : ''}
      </div>
      <hr class="divider">`;
  }
  // A4
  return `
    <div class="header" data-section="header">
      <div class="biz-info">
        ${config.showLogo && biz.logo_url ? `<img src="${biz.logo_url}" class="logo">` : ''}
        <div>
          <div class="biz-name">${biz.name}</div>
          ${config.showAddress && biz.address ? `<div class="biz-detail">${biz.address}</div>` : ''}
          ${config.showPhone   && biz.phone   ? `<div class="biz-detail">Tél : ${biz.phone}</div>` : ''}
          ${config.showEmail   && biz.email   ? `<div class="biz-detail">${biz.email}</div>` : ''}
          ${config.headerExtra ? `<div class="biz-detail" style="margin-top:2px">${config.headerExtra}</div>` : ''}
        </div>
      </div>
      <div class="invoice-meta">
        <div class="invoice-title" style="color:${config.accentColor}">FACTURE</div>
        ${config.showReceiptNum ? `<div class="invoice-num">${receiptNum(ctx.order)}</div>` : ''}
        ${config.showDate ? `<div class="invoice-detail">Date : ${fmtDate(ctx.order.created_at)}</div>` : ''}
        ${config.showDate ? `<div class="invoice-detail">Heure : ${fmtTime(ctx.order.created_at)}</div>` : ''}
        ${config.showCashier && ctx.order.cashier?.full_name ? `<div class="invoice-detail">Caissier : ${ctx.order.cashier.full_name}</div>` : ''}
        ${config.showQRCode ? `
        <div style="margin-top:4px;text-align:right">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(receiptNum(ctx.order))}&bgcolor=ffffff&color=000000&margin=2"
               style="width:56px;height:56px;image-rendering:pixelated;display:inline-block" alt="QR">
        </div>` : ''}
      </div>
    </div>`;
}

function renderReceiptInfo(ctx: RenderCtx, isThermal: boolean): string {
  const { order, config, extra } = ctx;
  if (isThermal) {
    return `
      <table data-section="receipt">
        ${config.showReceiptNum ? `<tr><td>Reçu</td><td class="right bold">${receiptNum(order)}</td></tr>` : ''}
        ${config.showDate       ? `<tr><td>Date</td><td class="right">${fmtDate(order.created_at)} ${fmtTime(order.created_at)}</td></tr>` : ''}
        ${config.showCashier && order.cashier?.full_name ? `<tr><td>Caissier</td><td class="right">${order.cashier.full_name}</td></tr>` : ''}
        ${config.showCustomer && order.customer_name     ? `<tr><td>Client</td><td class="right">${order.customer_name}</td></tr>` : ''}
        ${config.showCustomer && order.customer_phone    ? `<tr><td>Tél.</td><td class="right">${order.customer_phone}</td></tr>` : ''}
        ${extra?.resellerName       ? `<tr><td>Réf</td><td class="right bold">${extra.resellerName}</td></tr>` : ''}
        ${extra?.resellerClientName ? `<tr><td>→ Client</td><td class="right">${extra.resellerClientName}</td></tr>` : ''}
      </table>
      <hr class="divider">`;
  }
  // A4 — parties row
  if (!extra?.resellerName && !(config.showCustomer && (order.customer_name || order.customer_phone))) return '';
  return `
    <div class="parties-row" data-section="receipt">
      ${extra?.resellerName ? `
      <div class="party-box party-left">
        <div class="party-label">Réf</div>
        <div class="party-name">${extra.resellerName}</div>
      </div>` : '<div></div>'}
      ${extra?.resellerClientName || (config.showCustomer && order.customer_name) ? `
      <div class="party-box party-right">
        <div class="party-label">Client</div>
        <div class="party-name">${extra?.resellerClientName ?? order.customer_name ?? ''}</div>
        ${(extra?.resellerClientPhone ?? order.customer_phone) ? `<div class="party-phone">${extra?.resellerClientPhone ?? order.customer_phone}</div>` : ''}
      </div>` : '<div></div>'}
    </div>`;
}

function renderItems(ctx: RenderCtx, isThermal: boolean): string {
  const { config } = ctx;
  if (isThermal) {
    return `
      <table data-section="items">${ctx.itemsHtml}</table>
      <hr class="divider">`;
  }
  const discountColHeader  = config.showItemDiscount ? '<th class="th">Remise</th>' : '';
  const unitPriceColHeader = config.showUnitPrice    ? '<th class="th">Prix U.</th>' : '';
  return `
    <table class="items-table" data-section="items">
      <thead>
        <tr>
          <th class="th th-left">Désignation</th>
          <th class="th">Qté</th>
          ${unitPriceColHeader}
          ${discountColHeader}
          <th class="th">Total</th>
        </tr>
      </thead>
      <tbody>${ctx.itemsHtml}</tbody>
    </table>`;
}

function renderTotals(ctx: RenderCtx, isThermal: boolean): string {
  const { order, config, cur } = ctx;
  if (isThermal) {
    return `
      <table data-section="totals">
        ${config.showSubtotal ? `<tr><td>Sous-total</td><td class="right">${fmt(order.subtotal, cur)}</td></tr>` : ''}
        ${ctx.couponLine}
        ${config.showTax && order.tax_amount > 0 ? `<tr><td>TVA</td><td class="right">${fmt(order.tax_amount, cur)}</td></tr>` : ''}
        <tr class="total-row">
          <td>TOTAL</td>
          <td class="right" style="color:${config.accentColor}">${fmt(order.total, cur)}</td>
        </tr>
      </table>
      ${config.showAmountInWords ? `
      <div class="small" style="margin:4px 0;font-style:italic;line-height:1.4">
        Arrêté à la somme de :<br>
        <strong>${amountInWords(order.total, cur)}</strong>
      </div>` : ''}`;
  }
  // A4 (payment rows embedded — Option A from architecture plan)
  return `
    <div class="totals" data-section="totals">
      <table class="totals-table">
        ${config.showSubtotal && order.discount_amount > 0 ? `<tr><td>Sous-total brut</td><td>${fmt(order.subtotal, cur)}</td></tr>` : ''}
        ${ctx.couponLine}
        ${config.showTax && order.tax_amount > 0 ? `<tr><td>TVA</td><td>${fmt(order.tax_amount, cur)}</td></tr>` : ''}
        <tr class="total-final" style="background:${config.primaryColor}"><td>TOTAL TTC</td><td>${fmt(order.total, cur)}</td></tr>
        ${config.showAmountInWords ? `
        <tr><td colspan="2" style="font-size:8px;font-style:italic;color:#4a5568;padding:3px 6px 2px;line-height:1.4;border-bottom:1px solid #e2e8f0">
          Arrêté à la somme de : <strong>${amountInWords(order.total, cur)}</strong>
        </td></tr>` : ''}
        ${config.showPaymentDetails ? ((order.payments ?? []) as any[]).map((p: any) =>
          `<tr class="payment-line"><td>${PAYMENT_LABELS[p.method] ?? p.method}</td><td>${fmt(p.amount, cur)}</td></tr>`
        ).join('') : ''}
        ${config.showBalance && ctx.remaining > 0.01 ? `<tr style="color:#c0392b;font-weight:600"><td>Reste dû</td><td>${fmt(ctx.remaining, cur)}</td></tr>` : ''}
        ${config.showChange  && ctx.change  > 0      ? `<tr><td>Rendu monnaie</td><td>${fmt(ctx.change, cur)}</td></tr>` : ''}
      </table>
    </div>`;
}

function renderPayment(ctx: RenderCtx, isThermal: boolean): string {
  const { order, config, cur } = ctx;
  // A4: payment is embedded in totals renderer (Option A), nothing to render here
  if (!isThermal) return '';
  const notesHtml = [
    order.coupon_notes ? `<hr class="divider"><div class="small center" style="font-style:italic">${order.coupon_notes}</div>` : '',
    order.notes        ? `<hr class="divider"><div class="small" style="font-style:italic">Note : ${order.notes}</div>` : '',
  ].join('');
  if (!config.showPaymentDetails) return notesHtml;
  return `
    <table data-section="payment">
      ${((order.payments ?? []) as any[]).map((p: any) =>
        `<tr><td>${PAYMENT_LABELS[p.method] ?? p.method}</td><td style="text-align:right">${fmt(p.amount, cur)}</td></tr>`
      ).join('')}
      ${config.showChange  && ctx.change    > 0    ? `<tr><td>Rendu monnaie</td><td style="text-align:right">${fmt(ctx.change,    cur)}</td></tr>` : ''}
      ${config.showBalance && ctx.remaining > 0.01 ? `<tr style="color:#e53e3e"><td>Reste à payer</td><td style="text-align:right">${fmt(ctx.remaining, cur)}</td></tr>` : ''}
    </table>
    ${notesHtml}`;
}

function renderFooter(ctx: RenderCtx, isThermal: boolean): string {
  const { order, business: biz, config } = ctx;
  if (isThermal) {
    return `
      <hr class="divider">
      <div class="center small" style="margin-top:4px" data-section="footer">
        ${config.footerText || (biz.receipt_footer ?? 'Merci de votre visite !')}
      </div>
      <div class="center small" style="margin-top:6px;color:#aaa">
        ${fmtDate(order.created_at)} — ELM APP
      </div>
      ${config.showQRCode ? `
      <div class="center" style="margin-top:8px">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(receiptNum(order))}&bgcolor=ffffff&color=000000&margin=2"
             style="width:64px;height:64px;image-rendering:pixelated" alt="QR">
        <div class="small" style="margin-top:2px;color:#555">${receiptNum(order)}</div>
      </div>` : ''}`;
  }
  // A4
  const couponNoteHtml = order.coupon_notes ? `<div class="coupon-note">${order.coupon_notes}</div>` : '';
  const orderNoteHtml  = order.notes        ? `<div class="order-note">Note : ${order.notes}</div>` : '';
  return `
    ${couponNoteHtml}
    ${orderNoteHtml}
    ${config.showSignatures ? `
    <div class="signatures" data-section="footer">
      <div class="sig-box"><div class="sig-label">Signature caissier</div><div class="sig-line"></div></div>
      <div class="sig-box"><div class="sig-label">Signature client</div><div class="sig-line"></div></div>
    </div>` : ''}
    ${config.footerText || biz.receipt_footer ? `<div class="footer-text" data-section="footer">${config.footerText || biz.receipt_footer}</div>` : ''}`;
}

// --- Core body builder --------------------------------------------------------

function buildBody(
  order: any, business: any, config: TemplateConfig,
  extra?: { resellerName?: string; resellerClientName?: string; resellerClientPhone?: string }
): string {
  const cur       = (business.currency as string) ?? 'XOF';
  const paid      = paidAmount(order);
  const change    = Math.max(0, paid - order.total);
  const remaining = Math.max(0, order.total - paid);
  const isThermal = config.format === 'thermal';

  // Items rows (computed once)
  const itemsHtml = ((order.items ?? []) as any[]).map((item: any) => {
    if (isThermal) {
      return `
        <tr>
          <td colspan="2" style="padding-top:4px;font-weight:600">${item.name}</td>
        </tr>
        <tr>
          ${config.showUnitPrice ? `<td style="padding-left:8px;color:#555">${item.quantity} × ${fmt(item.price, cur)}</td>` : `<td style="padding-left:8px;color:#555">Qté : ${item.quantity}</td>`}
          <td style="text-align:right;font-weight:600">${fmt(item.total, cur)}</td>
        </tr>
        ${config.showItemDiscount && item.discount_amount > 0 ? `<tr><td colspan="2" style="padding-left:8px;color:#e53e3e;font-size:10px">Remise: -${fmt(item.discount_amount, cur)}</td></tr>` : ''}
        ${config.showItemNotes && item.notes ? `<tr><td colspan="2" style="padding-left:8px;font-size:10px;color:#888;font-style:italic">${item.notes}</td></tr>` : ''}`;
    }
    return `
      <tr>
        <td class="td-name">${item.name}${config.showItemNotes && item.notes ? `<br><span class="note">${item.notes}</span>` : ''}</td>
        <td class="td-num">${item.quantity}</td>
        ${config.showUnitPrice    ? `<td class="td-num">${fmt(item.price, cur)}</td>` : ''}
        ${config.showItemDiscount ? `<td class="td-num">${item.discount_amount > 0 ? '-' + fmt(item.discount_amount, cur) : '—'}</td>` : ''}
        <td class="td-num td-bold">${fmt(item.total, cur)}</td>
      </tr>`;
  }).join('');

  // Coupon line (computed once)
  const couponLine = config.showCoupon
    ? (order.coupon_code
      ? (isThermal
        ? `<tr><td>Coupon (${order.coupon_code})</td><td style="text-align:right;color:#e53e3e">-${fmt(order.discount_amount, cur)}</td></tr>`
        : `<tr><td>Coupon (${order.coupon_code})</td><td style="color:#c0392b">-${fmt(order.discount_amount, cur)}</td></tr>`)
      : order.discount_amount > 0
      ? (isThermal
        ? `<tr><td>Remise</td><td style="text-align:right;color:#e53e3e">-${fmt(order.discount_amount, cur)}</td></tr>`
        : `<tr><td>Remise</td><td style="color:#c0392b">-${fmt(order.discount_amount, cur)}</td></tr>`)
      : '')
    : '';

  const ctx: RenderCtx = { order, business, config, extra, cur, paid, change, remaining, itemsHtml, couponLine };
  const blocks = config.blocks ?? DEFAULT_BLOCKS;

  return blocks
    .filter(b => b.enabled)
    .map(b => {
      switch (b.type) {
        case 'header':       return renderHeader(ctx, isThermal);
        case 'receipt-info': return renderReceiptInfo(ctx, isThermal);
        case 'items':        return renderItems(ctx, isThermal);
        case 'totals':       return renderTotals(ctx, isThermal);
        case 'payment':      return renderPayment(ctx, isThermal);
        case 'footer':       return renderFooter(ctx, isThermal);
        case 'custom-text':  return renderCustomText(b, isThermal);
        case 'custom-image': return renderCustomImage(b, isThermal);
        default:             return '';
      }
    })
    .join('\n');
}

// --- CSS builders -------------------------------------------------------------

function thermalCss(config: TemplateConfig): string {
  return `
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: ${fontStack(config.fontFamily)}; font-size: 12px; color: #000; width: 72mm; }
    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: bold; }
    .big { font-size: 15px; }
    .small { font-size: 10px; }
    .divider { border: none; border-top: 1px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 1px 0; vertical-align: top; }
    .total-row td { font-weight: bold; font-size: 13px; padding-top: 4px; }
  `;
}

function a4Css(config: TemplateConfig, isTwoCols: boolean): string {
  const pageSize = config.format === 'a4-landscape' ? 'A4 landscape'
    : config.format === 'a4-portrait' ? 'A4 portrait'
    : 'A5 portrait';
  const bodyLayout = isTwoCols
    ? `display: flex; gap: 0; width: ${config.format === 'a4-landscape' ? '277mm' : '190mm'}; height: ${config.format === 'a4-landscape' ? '190mm' : '277mm'};`
    : `display: block;`;
  return `
    @page { size: ${pageSize}; margin: 8mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: ${fontStack(config.fontFamily)}; font-size: 11px; color: #1a202c; ${bodyLayout} }
    .copy { flex: 1; padding: 6mm 7mm; display: flex; flex-direction: column; gap: 5px; overflow: hidden; }
    .copy:first-child { border-right: 2px dashed #999; }
    .single-copy { padding: 6mm 7mm; display: flex; flex-direction: column; gap: 6px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; }
    .biz-info { display: flex; align-items: flex-start; gap: 8px; }
    .logo { max-width: 80px; max-height: 60px; object-fit: contain; }
    .biz-name { font-size: 14px; font-weight: 800; color: #1a202c; }
    .biz-detail { font-size: 9px; color: #718096; line-height: 1.4; }
    .invoice-meta { text-align: right; }
    .invoice-title { font-size: 16px; font-weight: 800; letter-spacing: .05em; }
    .invoice-num { font-size: 12px; font-weight: 700; color: #2d3748; }
    .invoice-detail { font-size: 9px; color: #718096; }
    .parties-row { display: flex; justify-content: space-between; gap: 12px; margin: 8px 0; }
    .party-box { flex: 1; border: 1px solid #e2e8f0; border-radius: 4px; padding: 6px 10px; font-size: 10px; }
    .party-left { border-left: 3px solid ${config.accentColor}; }
    .party-right { border-right: 3px solid ${config.primaryColor}; text-align: right; }
    .party-label { font-size: 8px; text-transform: uppercase; letter-spacing: .05em; color: #a0aec0; margin-bottom: 2px; }
    .party-name { font-weight: 700; color: #2d3748; font-size: 11px; }
    .party-phone { color: #718096; font-size: 9px; margin-top: 1px; }
    .items-table { width: 100%; border-collapse: collapse; font-size: 10px; }
    .items-table thead tr { background: ${config.primaryColor}; }
    .th { padding: 4px 6px; color: #94a3b8; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; text-align: right; }
    .th-left { text-align: left; }
    .items-table tbody tr { border-bottom: 1px solid #f1f5f9; }
    .items-table tbody tr:nth-child(even) { background: #f8fafc; }
    .td-name { padding: 4px 6px; max-width: 100px; }
    .td-num { padding: 4px 6px; text-align: right; white-space: nowrap; }
    .td-bold { font-weight: 700; }
    .note { font-size: 9px; color: #94a3b8; font-style: italic; }
    .totals { display: flex; justify-content: flex-end; }
    .totals-table { border-collapse: collapse; min-width: 140px; }
    .totals-table td { padding: 2px 6px; font-size: 10px; }
    .totals-table td:last-child { text-align: right; font-weight: 600; }
    .total-final { color: #fff; font-size: 12px !important; font-weight: 800 !important; }
    .total-final td { padding: 5px 8px !important; }
    .payment-line td { color: #2f855a; font-size: 9px; }
    .signatures { display: flex; gap: 16px; margin-top: auto; }
    .sig-box { flex: 1; }
    .sig-label { font-size: 9px; color: #718096; margin-bottom: 2px; }
    .sig-line { border-bottom: 1px solid #cbd5e0; height: 16px; }
    .copy-label { text-align: center; font-size: 9px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; border: 1.5px solid; border-radius: 3px; padding: 2px 6px; align-self: center; }
    .coupon-note { font-size: 9px; color: #744210; background: #fffbeb; border: 1px solid #f6e05e; border-radius: 3px; padding: 2px 6px; }
    .order-note { font-size: 9px; color: #718096; font-style: italic; }
    .footer-text { font-size: 9px; color: #a0aec0; text-align: center; }
  `;
}

// --- renderTemplate -----------------------------------------------------------

export function renderTemplate(
  order: any, business: any, config: TemplateConfig,
  extra?: { resellerName?: string; resellerClientName?: string; resellerClientPhone?: string }
): string {
  const isThermal = config.format === 'thermal';
  const isTwoCols = config.copies === 2 && (config.format === 'a4-landscape' || config.format === 'a5-portrait');
  const css   = isThermal ? thermalCss(config) : a4Css(config, isTwoCols);
  const title = `Facture ${String(order.id).replace(/-/g, '').toUpperCase().slice(0, 10)} – ${business.name}`;
  let bodyContent: string;
  if (isThermal) {
    bodyContent = buildBody(order, business, config, extra);
  } else if (isTwoCols) {
    const copy1 = buildBody(order, business, config, extra) + `
      <div class="copy-label" style="color:${config.copy1Color};border-color:${config.copy1Color}">${config.copy1Label}</div>`;
    const copy2 = buildBody(order, business, config, extra) + `
      <div class="copy-label" style="color:${config.copy2Color};border-color:${config.copy2Color}">${config.copy2Label}</div>`;
    bodyContent = `<div class="copy">${copy1}</div><div class="copy">${copy2}</div>`;
  } else {
    bodyContent = `<div class="single-copy">${buildBody(order, business, config, extra)}</div>`;
  }
  return `<!DOCTYPE html>
<html lang="fr"><head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>${css}</style>
</head><body>
${bodyContent}
</body></html>`;
}
