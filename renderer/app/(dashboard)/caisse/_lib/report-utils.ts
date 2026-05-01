import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { formatCurrency } from '@/lib/utils';
import type { CashSession, SessionLiveSummary } from '@services/supabase/cash-sessions';

export interface ReportData {
  type:          'X' | 'Z';
  businessName:  string;
  generatedAt:   string;
  openedAt:      string;
  closedAt?:     string | null;
  cashierName:   string;
  currency:      string;
  openingAmount: number;
  totalSales:    number;
  totalCash:     number;
  totalCard:     number;
  totalMobile:   number;
  totalOrders:   number;
  totalRefunds:  number;
  expectedCash:  number;
  actualCash?:   number | null;
  difference?:   number | null;
  notes?:        string | null;
}

export function buildReportData(
  type: 'X' | 'Z',
  session: CashSession,
  summary: SessionLiveSummary | null,
  businessName: string,
  cashierName: string,
  currency: string,
): ReportData {
  const isZ    = type === 'Z';
  const cash   = isZ ? (session.total_cash    ?? 0) : (summary?.total_cash    ?? 0);
  const card   = isZ ? (session.total_card    ?? 0) : (summary?.total_card    ?? 0);
  const mobile = isZ ? (session.total_mobile  ?? 0) : (summary?.total_mobile  ?? 0);
  const refunds = isZ ? (session.total_refunds ?? 0) : (summary?.total_refunds ?? 0);

  return {
    type, businessName, cashierName, currency,
    generatedAt:   new Date().toISOString(),
    openedAt:      session.opened_at,
    closedAt:      session.closed_at,
    openingAmount: session.opening_amount,
    totalSales:    isZ ? (session.total_sales   ?? 0) : (summary?.total_sales   ?? 0),
    totalCash:     cash,
    totalCard:     card,
    totalMobile:   mobile,
    totalOrders:   isZ ? (session.total_orders  ?? 0) : (summary?.total_orders  ?? 0),
    totalRefunds:  refunds,
    // Note: Subtracting refunds from expected cash as it's typically taken from drawer
    expectedCash:  isZ ? (session.expected_cash ?? session.opening_amount + cash - refunds)
                       : session.opening_amount + cash - refunds,
    actualCash:  isZ ? session.actual_cash  : undefined,
    difference:  isZ ? session.difference   : undefined,
    notes:       isZ ? session.notes        : undefined,
  };
}

function escapeHtml(unsafe: string) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function printReport(data: ReportData) {
  const fmt  = (n: number) => formatCurrency(n, data.currency);
  const isZ  = data.type === 'Z';
  const diff = data.difference ?? 0;

  const businessNameEscaped = escapeHtml(data.businessName);
  const cashierNameEscaped = escapeHtml(data.cashierName);
  const notesEscaped = data.notes ? escapeHtml(data.notes) : null;

  const row = (l: string, v: string, bold = false) =>
    `<div style="display:flex;justify-content:space-between;padding:1px 0${bold ? ';font-weight:bold' : ''}">
       <span>${l}</span><span>${v}</span></div>`;
  const hr = `<hr style="border:none;border-top:1px dashed #aaa;margin:3px 0">`;

  const body = [
    `<p style="text-align:center;font-weight:bold;font-size:13pt;margin:0 0 2px">${businessNameEscaped}</p>`,
    `<p style="text-align:center;margin:0">${isZ ? '=== RAPPORT Z ===' : '=== RAPPORT X ==='}</p>`,
    `<p style="text-align:center;font-size:9pt;margin:0 0 4px">${format(new Date(data.generatedAt), 'dd/MM/yyyy HH:mm:ss', { locale: fr })}</p>`,
    hr,
    row('Ouverture', format(new Date(data.openedAt), 'dd/MM/yyyy HH:mm', { locale: fr })),
    isZ && data.closedAt ? row('Clôture', format(new Date(data.closedAt), 'dd/MM/yyyy HH:mm', { locale: fr })) : '',
    row('Caissier', cashierNameEscaped),
    hr,
    row('Fond de caisse', fmt(data.openingAmount)),
    hr,
    row('Espèces',       fmt(data.totalCash)),
    row('Carte bancaire',fmt(data.totalCard)),
    row('Mobile Money',  fmt(data.totalMobile)),
    data.totalRefunds > 0 ? row('Remboursements', `-${fmt(data.totalRefunds)}`) : '',
    hr,
    row('TOTAL VENTES',  fmt(data.totalSales), true),
    row('Transactions',  String(data.totalOrders)),
    hr,
    row('Fond initial',       fmt(data.openingAmount)),
    row('+ Espèces reçues',  `+${fmt(data.totalCash)}`),
    data.totalRefunds > 0 ? row('- Remboursements', `-${fmt(data.totalRefunds)}`) : '',
    row('= ESPÈCES ATTENDUES', fmt(data.expectedCash), true),
    ...(isZ && data.actualCash != null ? [
      hr,
      row('Espèces comptées', fmt(data.actualCash)),
      row('ÉCART', `${diff >= 0 ? '+' : ''}${fmt(diff)}`, true),
      `<p style="text-align:center;font-weight:bold">${
        Math.abs(diff) < 1 ? '*** CAISSE ÉQUILIBRÉE ***'
          : diff > 0 ? '*** EXCÉDENT ***' : '*** DÉFICIT ***'
      }</p>`,
    ] : []),
    ...(notesEscaped ? [hr, `<p style="font-size:9pt;font-style:italic">Notes : ${notesEscaped}</p>`] : []),
    hr,
    `<p style="text-align:center;font-size:9pt">${isZ ? 'Clôture définitive' : 'Document non définitif'}</p>`,
    `<p style="text-align:center;font-size:9pt">elm-pos</p>`,
  ].join('');

  const win = window.open('', '_blank', 'width=380,height=750');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Rapport ${data.type}</title>
    <style>body{font-family:'Courier New',monospace;font-size:11pt;width:72mm;margin:0;padding:4mm}
    @media print{@page{margin:4mm}}</style>
  </head><body>${body}</body></html>`);
  win.document.close();
  setTimeout(() => { win.print(); win.close(); }, 300);
}
