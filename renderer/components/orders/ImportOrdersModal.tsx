'use client';

import { useState, useRef } from 'react';
import { X, Upload, FileText, AlertCircle, CheckCircle2, Loader2, Download } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImportRow {
  date:             string;
  client_nom?:      string;
  client_telephone?: string;
  article:          string;
  quantite:         string;
  prix_unitaire:    string;
  remise_article?:  string;   // remise sur la ligne (montant fixe)
  remise_commande?: string;   // remise globale sur la commande (montant fixe)
  code_promo?:      string;   // code coupon
  statut?:          string;
  methode_paiement?: string;
  notes?:           string;
  revendeur?:       string;
  client_revendeur?: string;
}

interface ParsedItem {
  name:            string;
  quantity:        number;
  price:           number;
  discount_amount: number;
  total:           number;
}

interface ParsedOrder {
  date:               string;
  customer_name?:     string;
  customer_phone?:    string;
  status:             'paid' | 'pending' | 'cancelled';
  method:             'cash' | 'card' | 'mobile_money';
  notes?:             string;
  discount_amount:    number;   // remise globale commande
  coupon_code?:       string;
  revendeur_name?:    string;   // nom brut — résolu en ID à l'import
  client_revendeur?:  string;
  items:              ParsedItem[];
  total:              number;
  errors:             string[];
}

interface ImportOrdersModalProps {
  businessId: string;
  userId:     string;
  onClose:    () => void;
  onDone:     () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, 'paid' | 'pending' | 'cancelled'> = {
  paid: 'paid', payée: 'paid', payé: 'paid', confirmée: 'paid',
  pending: 'pending', 'en attente': 'pending', attente: 'pending',
  cancelled: 'cancelled', annulée: 'cancelled', annulé: 'cancelled',
};

const METHOD_MAP: Record<string, 'cash' | 'card' | 'mobile_money'> = {
  cash: 'cash', espèces: 'cash', especes: 'cash',
  card: 'card', carte: 'card',
  mobile_money: 'mobile_money', wave: 'mobile_money', 'orange money': 'mobile_money',
  'mobile money': 'mobile_money',
};

const TEMPLATE_CSV =
  `date,client_nom,client_telephone,article,quantite,prix_unitaire,remise_article,remise_commande,code_promo,statut,methode_paiement,revendeur,client_revendeur,notes\n` +
  `2024-01-15,Jean Dupont,+221771234567,Pizza Margherita,2,5000,,,PROMO10,paid,cash,,,\n` +
  `2024-01-15,Jean Dupont,+221771234567,Coca-Cola,1,500,,500,,paid,cash,,,\n` +
  `2024-01-16,Marie Martin,,Burger,1,3500,200,,,pending,,Diallo Distribution,Moussa Traoré,\n`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeKey(k: string): string {
  return k.trim().toLowerCase()
    .replace(/[àâä]/g, 'a').replace(/[éèêë]/g, 'e')
    .replace(/[ùûü]/g, 'u').replace(/[îï]/g, 'i')
    .replace(/[ôö]/g, 'o').replace(/\s+/g, '_');
}

function parseDate(raw: string): string | null {
  if (!raw?.trim()) return null;
  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim();
  // DD/MM/YYYY or DD-MM-YYYY
  const m = raw.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return null;
}

function rawToRows(raw: Record<string, string>[]): ImportRow[] {
  if (!raw.length) return [];
  // Normalise keys
  return raw.map((r) => {
    const norm: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) norm[normalizeKey(k)] = v ?? '';
    return {
      date:              norm['date'] ?? '',
      client_nom:        norm['client_nom'] ?? norm['nom'] ?? norm['client'] ?? '',
      client_telephone:  norm['client_telephone'] ?? norm['telephone'] ?? norm['tel'] ?? norm['phone'] ?? '',
      article:           norm['article'] ?? norm['produit'] ?? norm['product'] ?? norm['item'] ?? '',
      quantite:          norm['quantite'] ?? norm['qte'] ?? norm['qty'] ?? norm['quantity'] ?? '1',
      prix_unitaire:     norm['prix_unitaire'] ?? norm['prix'] ?? norm['price'] ?? norm['unit_price'] ?? '0',
      statut:            norm['statut'] ?? norm['status'] ?? norm['etat'] ?? '',
      methode_paiement:  norm['methode_paiement'] ?? norm['paiement'] ?? norm['payment'] ?? norm['methode'] ?? '',
      remise_article:    norm['remise_article'] ?? norm['remise'] ?? norm['discount'] ?? norm['discount_article'] ?? '',
      remise_commande:   norm['remise_commande'] ?? norm['discount_commande'] ?? norm['order_discount'] ?? '',
      code_promo:        norm['code_promo'] ?? norm['coupon'] ?? norm['coupon_code'] ?? norm['code_coupon'] ?? '',
      notes:             norm['notes'] ?? norm['note'] ?? norm['remarques'] ?? '',
      revendeur:         norm['revendeur'] ?? norm['reseller'] ?? norm['distributeur'] ?? '',
      client_revendeur:  norm['client_revendeur'] ?? norm['client_reseller'] ?? norm['client_distributeur'] ?? '',
    } as ImportRow;
  });
}

function groupIntoOrders(rows: ImportRow[]): ParsedOrder[] {
  const orders: ParsedOrder[] = [];
  let current: ParsedOrder | null = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const errors: string[] = [];

    const date = parseDate(row.date);
    if (!date) errors.push(`Ligne ${i + 2} : date invalide ("${row.date}")`);

    const qty = parseFloat(row.quantite.replace(',', '.'));
    if (isNaN(qty) || qty <= 0) errors.push(`Ligne ${i + 2} : quantité invalide`);

    const price = parseFloat(row.prix_unitaire.replace(',', '.'));
    if (isNaN(price) || price < 0) errors.push(`Ligne ${i + 2} : prix invalide`);

    const itemDiscount = row.remise_article?.trim()
      ? parseFloat(row.remise_article.replace(',', '.'))
      : 0;
    const safeItemDiscount = isNaN(itemDiscount) || itemDiscount < 0 ? 0 : itemDiscount;

    const orderDiscount = row.remise_commande?.trim()
      ? parseFloat(row.remise_commande.replace(',', '.'))
      : 0;
    const safeOrderDiscount = isNaN(orderDiscount) || orderDiscount < 0 ? 0 : orderDiscount;

    const status  = STATUS_MAP[(row.statut ?? '').toLowerCase().trim()] ?? 'paid';
    const method  = METHOD_MAP[(row.methode_paiement ?? '').toLowerCase().trim()] ?? 'cash';

    const safeQty   = isNaN(qty) ? 1 : qty;
    const safePrice = isNaN(price) ? 0 : price;

    const item: ParsedItem = {
      name:            row.article.trim(),
      quantity:        safeQty,
      price:           safePrice,
      discount_amount: safeItemDiscount,
      total:           Math.max(0, safeQty * safePrice - safeItemDiscount),
    };

    const sameOrder = current &&
      current.date === (date ?? '') &&
      current.customer_name   === (row.client_nom?.trim()        || undefined) &&
      current.customer_phone  === (row.client_telephone?.trim()  || undefined) &&
      current.revendeur_name  === (row.revendeur?.trim()         || undefined) &&
      current.status === status;

    if (sameOrder && current) {
      current.items.push(item);
      current.total += item.total;
      // Keep the largest order-level discount found across rows of the same order
      if (safeOrderDiscount > current.discount_amount) {
        current.discount_amount = safeOrderDiscount;
      }
      if (!current.coupon_code && row.code_promo?.trim()) {
        current.coupon_code = row.code_promo.trim();
      }
      current.errors.push(...errors);
    } else {
      current = {
        date:              date ?? row.date,
        customer_name:     row.client_nom?.trim()       || undefined,
        customer_phone:    row.client_telephone?.trim() || undefined,
        status,
        method,
        discount_amount:   safeOrderDiscount,
        coupon_code:       row.code_promo?.trim()       || undefined,
        notes:             row.notes?.trim()            || undefined,
        revendeur_name:    row.revendeur?.trim()        || undefined,
        client_revendeur:  row.client_revendeur?.trim() || undefined,
        items:             [item],
        total:             item.total,
        errors,
      };
      orders.push(current);
    }
  }

  return orders;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ImportOrdersModal({ businessId, userId, onClose, onDone }: ImportOrdersModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [orders, setOrders]       = useState<ParsedOrder[] | null>(null);
  const [fileName, setFileName]   = useState('');
  const [importing, setImporting] = useState(false);
  const [done, setDone]           = useState(false);
  const [result, setResult]       = useState<{ ok: number; skipped: number }>({ ok: 0, skipped: 0 });

  const hasErrors = (orders ?? []).some((o) => o.errors.length > 0);

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'modele_import_commandes.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFile(file: File) {
    setFileName(file.name);
    setOrders(null);
    setDone(false);

    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb   = XLSX.read(data, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
        setOrders(groupIntoOrders(rawToRows(rows)));
      };
      reader.readAsArrayBuffer(file);
    } else {
      // CSV
      Papa.parse<Record<string, string>>(file, {
        header:         true,
        skipEmptyLines: true,
        complete: (res) => {
          setOrders(groupIntoOrders(rawToRows(res.data)));
        },
      });
    }
  }

  async function handleImport() {
    if (!orders) return;
    setImporting(true);
    let ok = 0, skipped = 0;

    // Charger tous les revendeurs une seule fois pour la résolution par nom
    const { data: resellerRows } = await (supabase as any)
      .from('resellers')
      .select('id, name')
      .eq('business_id', businessId);
    const resellerMap: Record<string, string> = {};
    for (const r of (resellerRows ?? [])) {
      resellerMap[r.name.toLowerCase().trim()] = r.id;
    }

    for (const order of orders) {
      if (order.errors.length > 0) { skipped++; continue; }

      try {
        const subtotal = order.items.reduce((s, i) => s + i.total, 0);
        const totalAfterDiscount = Math.max(0, subtotal - order.discount_amount);

        // Résoudre reseller_id par nom (insensible à la casse)
        let resellerId: string | null = null;
        if (order.revendeur_name) {
          resellerId = resellerMap[order.revendeur_name.toLowerCase()] ?? null;
        }

        const { data: inserted, error } = await (supabase as any)
          .from('orders')
          .insert({
            business_id:     businessId,
            cashier_id:      userId,
            status:          order.status,
            subtotal,
            tax_amount:      0,
            discount_amount: order.discount_amount,
            total:           totalAfterDiscount,
            coupon_code:     order.coupon_code ?? null,
            notes:           order.notes ?? `Import CSV — ${order.date}`,
            customer_name:   order.customer_name ?? null,
            customer_phone:  order.customer_phone ?? null,
            reseller_id:     resellerId,
            reseller_name:   order.revendeur_name   ?? null,
            reseller_client_name: order.client_revendeur ?? null,
            created_at:      `${order.date}T12:00:00.000Z`,
          })
          .select('id')
          .single();

        if (error || !inserted) { skipped++; continue; }

        const orderId = (inserted as { id: string }).id;

        if (order.items.length > 0) {
          await (supabase as any).from('order_items').insert(
            order.items.map((item) => ({
              order_id:        orderId,
              product_id:      null,
              name:            item.name,
              price:           item.price,
              quantity:        item.quantity,
              discount_amount: item.discount_amount,
              total:           item.total,
            }))
          );
        }

        // Paiement si statut paid
        if (order.status === 'paid') {
          await (supabase as any).from('payments').insert({
            order_id: orderId,
            method:   order.method,
            amount:   totalAfterDiscount,
            paid_at:  `${order.date}T12:00:00.000Z`,
          });
        }

        ok++;
      } catch {
        skipped++;
      }
    }

    setResult({ ok, skipped });
    setDone(true);
    setImporting(false);
    if (ok > 0) onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-border shrink-0">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Upload className="w-4 h-4 text-brand-400" />
            Importer des commandes
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* Résultat final */}
          {done && (
            <div className="p-4 rounded-xl bg-green-900/20 border border-green-800 text-sm text-green-400 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{result.ok} commande(s) importée(s) avec succès.</p>
                {result.skipped > 0 && (
                  <p className="text-slate-400 mt-0.5">{result.skipped} ligne(s) ignorée(s) à cause d&apos;erreurs.</p>
                )}
              </div>
            </div>
          )}

          {/* Zone de dépôt */}
          {!done && (
            <>
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-brand-600 rounded-xl p-8
                           flex flex-col items-center gap-3 cursor-pointer transition-colors text-center"
              >
                <FileText className="w-8 h-8 text-slate-500" />
                <div>
                  <p className="text-white font-medium">
                    {fileName || 'Cliquez pour sélectionner un fichier'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">CSV ou Excel (.csv, .xlsx, .xls)</p>
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
              />

              {/* Template */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-input border border-surface-border">
                <div>
                  <p className="text-sm text-white">Modèle CSV</p>
                  <p className="text-xs text-slate-500">Téléchargez le modèle à remplir</p>
                </div>
                <button onClick={downloadTemplate} className="btn-secondary flex items-center gap-2 text-sm">
                  <Download className="w-4 h-4" />
                  Télécharger
                </button>
              </div>

              {/* Format hint */}
              <div className="text-xs text-slate-500 space-y-1 px-1">
                <p className="font-medium text-slate-400">Colonnes attendues :</p>
                <p><span className="font-mono text-slate-300">date</span> (YYYY-MM-DD ou JJ/MM/AAAA) · <span className="font-mono text-slate-300">article</span> · <span className="font-mono text-slate-300">quantite</span> · <span className="font-mono text-slate-300">prix_unitaire</span></p>
                <p>Optionnel : <span className="font-mono text-slate-300">client_nom</span> · <span className="font-mono text-slate-300">client_telephone</span> · <span className="font-mono text-slate-300">statut</span> (paid/pending/cancelled) · <span className="font-mono text-slate-300">methode_paiement</span> (cash/card/mobile_money) · <span className="font-mono text-slate-300">remise_article</span> · <span className="font-mono text-slate-300">remise_commande</span> · <span className="font-mono text-slate-300">code_promo</span> · <span className="font-mono text-slate-300">revendeur</span> · <span className="font-mono text-slate-300">notes</span></p>
                <p className="text-slate-600">Plusieurs lignes avec même date + client = une seule commande avec plusieurs articles.</p>
              </div>
            </>
          )}

          {/* Aperçu */}
          {orders && !done && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-white">
                  Aperçu — {orders.length} commande(s) détectée(s)
                </p>
                {hasErrors && (
                  <span className="text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {orders.filter(o => o.errors.length > 0).length} avec erreurs (seront ignorées)
                  </span>
                )}
              </div>

              <div className="border border-surface-border rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-surface-input text-slate-400 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-left px-3 py-2">Client</th>
                      <th className="text-right px-3 py-2">Articles</th>
                      <th className="text-right px-3 py-2">Total</th>
                      <th className="text-left px-3 py-2">Statut</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o, i) => (
                      <tr key={i} className={`border-t border-surface-border ${o.errors.length > 0 ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-2 text-slate-300">{o.date}</td>
                        <td className="px-3 py-2 text-slate-300">{o.customer_name ?? '—'}</td>
                        <td className="px-3 py-2 text-right text-slate-300">{o.items.length}</td>
                        <td className="px-3 py-2 text-right text-white font-mono">
                          {o.total.toLocaleString()}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            o.status === 'paid'      ? 'bg-green-500/20 text-green-400' :
                            o.status === 'pending'   ? 'bg-yellow-500/20 text-yellow-400' :
                                                       'bg-red-500/20 text-red-400'
                          }`}>{o.status}</span>
                        </td>
                        <td className="px-3 py-2">
                          {o.errors.length > 0 && (
                            <span title={o.errors.join('\n')}>
                              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-surface-border flex justify-end gap-3 shrink-0">
          {done ? (
            <button onClick={onClose} className="btn-primary">Fermer</button>
          ) : (
            <>
              <button onClick={onClose} className="btn-secondary">Annuler</button>
              <button
                onClick={handleImport}
                disabled={!orders || importing || orders.filter(o => o.errors.length === 0).length === 0}
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {importing
                  ? 'Import en cours…'
                  : `Importer ${orders ? orders.filter(o => o.errors.length === 0).length : 0} commande(s)`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
