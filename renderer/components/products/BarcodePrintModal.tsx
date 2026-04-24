'use client';

import { useEffect, useRef, useState } from 'react';
import { Printer, X, RotateCcw, Check, Minus, Plus, Barcode } from 'lucide-react';
import type { Product } from '@pos-types';
import { formatCurrency } from '@/lib/utils';
import { updateProduct } from '@services/supabase/products';
import { useNotificationStore } from '@/store/notifications';

// ─── Génération EAN-13 (préfixe 200 = usage interne GS1) ─────────────────────

function ean13CheckDigit(digits12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

function generateEAN13(): string {
  const prefix = '200';
  const body   = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
  const base   = prefix + body;
  return base + ean13CheckDigit(base);
}

// ─── Rendu barcode dans un <svg> via JsBarcode ────────────────────────────────

function BarcodeImage({ value, height = 50 }: { value: string; height?: number }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    import('jsbarcode').then(({ default: JsBarcode }) => {
      try {
        JsBarcode(svgRef.current, value, {
          format:       'EAN13',
          width:        1.5,
          height,
          fontSize:     10,
          margin:       4,
          displayValue: true,
          textMargin:   2,
        });
      } catch {
        // Fallback Code128 si valeur non-EAN13
        JsBarcode(svgRef.current, value, {
          format:       'CODE128',
          width:        1.5,
          height,
          fontSize:     10,
          margin:       4,
          displayValue: true,
          textMargin:   2,
        });
      }
    });
  }, [value, height]);

  return <svg ref={svgRef} />;
}

// ─── Item de sélection ────────────────────────────────────────────────────────

interface SelectionItem {
  product:  Product;
  selected: boolean;
  qty:      number;
  barcode:  string; // existant ou généré
  isNew:    boolean; // barcode généré localement (pas encore sauvegardé)
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  products: Product[];
  currency: string;
  onClose:  () => void;
  onRefetch?: () => void;
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function BarcodePrintModal({ products, currency, onClose, onRefetch }: Props) {
  const { success, error: notifError } = useNotificationStore();
  const [saving, setSaving] = useState(false);

  const [items, setItems] = useState<SelectionItem[]>(() =>
    products.map((p) => ({
      product:  p,
      selected: false,
      qty:      1,
      barcode:  p.barcode ?? generateEAN13(),
      isNew:    !p.barcode,
    }))
  );

  const selected = items.filter((i) => i.selected);
  const hasNew   = selected.some((i) => i.isNew);

  function toggleAll() {
    const allSelected = items.every((i) => i.selected);
    setItems((prev) => prev.map((i) => ({ ...i, selected: !allSelected })));
  }

  function toggle(id: string) {
    setItems((prev) => prev.map((i) =>
      i.product.id === id ? { ...i, selected: !i.selected } : i
    ));
  }

  function setQty(id: string, delta: number) {
    setItems((prev) => prev.map((i) =>
      i.product.id === id ? { ...i, qty: Math.max(1, Math.min(99, i.qty + delta)) } : i
    ));
  }

  function regenerate(id: string) {
    setItems((prev) => prev.map((i) =>
      i.product.id === id ? { ...i, barcode: generateEAN13(), isNew: true } : i
    ));
  }

  // ── Sauvegarder les nouveaux codes en base ────────────────────────────────

  async function saveNewBarcodes() {
    const toSave = selected.filter((i) => i.isNew);
    if (toSave.length === 0) return;
    setSaving(true);
    try {
      await Promise.all(toSave.map((i) => updateProduct(i.product.id, { barcode: i.barcode })));
      setItems((prev) => prev.map((i) =>
        i.isNew && i.selected ? { ...i, isNew: false } : i
      ));
      success(`${toSave.length} code${toSave.length > 1 ? 's' : ''}-barres sauvegardé${toSave.length > 1 ? 's' : ''}`);
      onRefetch?.();
    } catch {
      notifError('Impossible de sauvegarder les codes-barres');
    } finally {
      setSaving(false);
    }
  }

  // ── Impression ─────────────────────────────────────────────────────────────

  const [printing, setPrinting] = useState(false);

  async function handlePrint() {
    if (selected.length === 0) return;
    setPrinting(true);
    try {
      const { default: JsBarcode } = await import('jsbarcode');

      // Générer chaque SVG en mémoire (synchrone après l'import)
      function makeSvg(value: string): string {
        const ns  = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg') as SVGSVGElement;
        try {
          JsBarcode(svg, value, { format: 'EAN13',  width: 1.5, height: 45, fontSize: 10, margin: 4, displayValue: true, textMargin: 2 });
        } catch {
          JsBarcode(svg, value, { format: 'CODE128', width: 1.5, height: 45, fontSize: 10, margin: 4, displayValue: true, textMargin: 2 });
        }
        return new XMLSerializer().serializeToString(svg);
      }

      const labelsHtml = selected.flatMap((item) =>
        Array.from({ length: item.qty }, () => `
          <div class="label">
            <div class="barcode-wrap">${makeSvg(item.barcode)}</div>
            <div class="name">${item.product.name}</div>
            <div class="price">${formatCurrency(item.product.price, currency)}</div>
          </div>
        `)
      ).join('');

      const win = window.open('', '_blank', 'width=820,height=600');
      if (!win) return;

      win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Codes-barres</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: white; }
    .page { padding: 10mm; }
    .grid { display: flex; flex-wrap: wrap; gap: 4mm; }
    .label {
      width: 62mm; border: 0.3mm solid #ccc; border-radius: 1mm;
      padding: 2mm 3mm; display: flex; flex-direction: column; align-items: center;
      page-break-inside: avoid;
    }
    .barcode-wrap svg { width: 100%; height: auto; }
    .name { font-size: 8pt; font-weight: bold; text-align: center; margin-top: 1mm;
            max-width: 58mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .price { font-size: 9pt; color: #333; margin-top: 0.5mm; }
    @media print { body { margin: 0; } .page { padding: 8mm; } }
  </style>
</head>
<body>
  <div class="page"><div class="grid">${labelsHtml}</div></div>
  <script>window.onload = () => { window.print(); }; window.onafterprint = () => window.close();<\/script>
</body>
</html>`);
      win.document.close();
    } finally {
      setPrinting(false);
    }
  }

  // ─── UI ────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface-card rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-border">
          <div className="flex items-center gap-2">
            <Barcode className="w-5 h-5 text-content-brand" />
            <h2 className="text-content-primary font-semibold">Imprimer codes-barres</h2>
          </div>
          <button onClick={onClose} className="text-content-secondary hover:text-content-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps —liste produits */}
        <div className="flex-1 overflow-y-auto">
          {/* Sélectionner tout */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-surface-border bg-surface-input/30">
            <input
              type="checkbox"
              checked={items.length > 0 && items.every((i) => i.selected)}
              onChange={toggleAll}
              className="w-4 h-4 accent-brand-500"
            />
            <span className="text-sm text-content-secondary">
              Tout sélectionner · {selected.length} sélectionné{selected.length > 1 ? 's' : ''}
            </span>
          </div>

          <div className="divide-y divide-surface-border">
            {items.map((item) => (
              <div
                key={item.product.id}
                className={`flex items-center gap-3 px-5 py-3 transition-colors ${item.selected ? 'bg-brand-600/10' : 'hover:bg-surface-input/20'}`}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={item.selected}
                  onChange={() => toggle(item.product.id)}
                  className="w-4 h-4 accent-brand-500 shrink-0"
                />

                {/* Nom + barcode */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-content-primary truncate">{item.product.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs font-mono text-content-secondary">{item.barcode}</span>
                    {item.isNew && (
                      <span className="text-[10px] bg-badge-warning text-status-warning border border-status-warning px-1 rounded">auto</span>
                    )}
                    <button
                      onClick={() => regenerate(item.product.id)}
                      title="Générer un nouveau code"
                      className="text-content-primary hover:text-content-primary transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Quantité d'étiquettes */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setQty(item.product.id, -1)}
                    disabled={!item.selected}
                    className="w-6 h-6 rounded bg-surface-input flex items-center justify-center text-content-secondary hover:text-content-primary disabled:opacity-30 transition-colors"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-8 text-center text-sm text-content-primary">{item.qty}</span>
                  <button
                    onClick={() => setQty(item.product.id, +1)}
                    disabled={!item.selected}
                    className="w-6 h-6 rounded bg-surface-input flex items-center justify-center text-content-secondary hover:text-content-primary disabled:opacity-30 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  <span className="text-xs text-content-primary ml-1">étiq.</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-4 border-t border-surface-border bg-surface-input/20">
          <div className="text-xs text-content-primary">
            {selected.length === 0
              ? 'Sélectionnez des produits'
              : `${selected.reduce((s, i) => s + i.qty, 0)} étiquette${selected.reduce((s, i) => s + i.qty, 0) > 1 ? 's' : ''} à imprimer`}
          </div>
          <div className="flex gap-2">
            {hasNew && (
              <button
                onClick={saveNewBarcodes}
                disabled={saving}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                <Check className="w-4 h-4" />
                {saving ? 'Sauvegarde…' : 'Sauvegarder les codes'}
              </button>
            )}
            <button
              onClick={handlePrint}
              disabled={selected.length === 0 || printing}
              className="btn-primary flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              {printing ? 'Préparation…' : 'Imprimer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


