import { format } from 'date-fns';
import type { ReceiptData } from '../../types';

export interface ReceiptLines {
  businessName: string;
  address?: string;
  phone?: string;
  date: string;
  orderId: string;
  cashierName: string;
  items: Array<{ name: string; qty: number; total: string }>;
  subtotal: string;
  couponCode?: string;
  couponNotes?: string;  // label pour free_item, absent pour les autres
  discount?: string;
  tax?: string;
  total: string;
  paymentMethod: string;
  footer?: string;
}

export function formatReceiptLines(data: ReceiptData): ReceiptLines {
  const { order, business, cashier_name } = data;
  const currency = business.currency || 'USD';

  const fmt = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

  const items = order.items.map((item) => ({
    name: item.name,
    qty: item.quantity,
    total: fmt(item.total),
  }));

  return {
    businessName: business.name,
    address: business.address,
    phone: business.phone,
    date: format(new Date(order.created_at), 'dd/MM/yyyy HH:mm'),
    orderId: order.id.slice(0, 8).toUpperCase(),
    cashierName: cashier_name,
    items,
    subtotal: fmt(order.subtotal),
    couponCode:  order.coupon_code ?? undefined,
    couponNotes: order.coupon_notes ?? undefined,
    discount: order.discount_amount > 0 ? fmt(order.discount_amount) : undefined,
    tax: order.tax_amount > 0 ? fmt(order.tax_amount) : undefined,
    total: fmt(order.total),
    paymentMethod: order.payments.map((p) => p.method).join(', '),
    footer: business.receipt_footer,
  };
}

/**
 * Generate plain-text receipt (for display / fallback / PDF)
 */
export function generateTextReceipt(data: ReceiptData): string {
  const lines = formatReceiptLines(data);
  const width = 42; // standard 80mm thermal

  const center = (text: string) =>
    text.padStart(Math.floor((width + text.length) / 2)).padEnd(width);

  const row = (left: string, right: string) =>
    left.padEnd(width - right.length) + right;

  const divider = '-'.repeat(width);

  const output: string[] = [
    center(lines.businessName),
    lines.address ? center(lines.address) : '',
    lines.phone ? center(lines.phone) : '',
    divider,
    `Date: ${lines.date}`,
    `Order: #${lines.orderId}`,
    `Cashier: ${lines.cashierName}`,
    divider,
    ...lines.items.map((i) => row(`${i.name} x${i.qty}`, i.total)),
    divider,
    row('Subtotal', lines.subtotal),
    ...(lines.discount && lines.couponCode
      ? [row(`Remise (${lines.couponCode})`, `-${lines.discount}`)]
      : lines.discount
      ? [row('Remise', `-${lines.discount}`)]
      : []),
    ...(lines.couponCode && !lines.discount && lines.couponNotes
      ? [row(`Offre (${lines.couponCode})`, lines.couponNotes)]
      : []),
    ...(lines.tax ? [row('Tax', lines.tax)] : []),
    row('TOTAL', lines.total),
    divider,
    `Payment: ${lines.paymentMethod}`,
    divider,
    ...(lines.footer ? [center(lines.footer)] : []),
    center('Thank you!'),
  ].filter((l) => l !== '');

  return output.join('\n');
}
