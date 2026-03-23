'use client';

import { useState } from 'react';
import { X, Printer, Receipt, FileText, Eye } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import {
  generateThermalReceipt,
  generateA4DuplicateInvoice,
  printHtml,
} from '@/lib/invoice-templates';
import type { Order } from '@pos-types';

type Template = 'thermal' | 'a4';

const TEMPLATES: { id: Template; label: string; desc: string; icon: React.ElementType; preview: string }[] = [
  {
    id: 'thermal',
    label: 'Ticket thermique',
    desc: 'Imprimante thermique 80mm · Format ticket caisse',
    icon: Receipt,
    preview: `
      <div style="font-family:monospace;font-size:9px;padding:8px;background:#fff;border-radius:4px;min-height:120px;text-align:center">
        <div style="font-weight:800;font-size:11px">MON MAGASIN</div>
        <div style="font-size:8px;color:#666">Av. de la Paix · Tél: 77 000 000</div>
        <div style="border-top:1px dashed #999;margin:4px 0"></div>
        <div style="text-align:left">
          <div>Reçu <strong>#ABC12345</strong></div>
          <div>Date 23/03/2026 14:35</div>
        </div>
        <div style="border-top:1px dashed #999;margin:4px 0"></div>
        <table style="width:100%;font-size:8px">
          <tr><td>Coca-Cola 50cl</td><td style="text-align:right">500</td></tr>
          <tr><td>Pain de mie</td><td style="text-align:right">300</td></tr>
        </table>
        <div style="border-top:1px dashed #999;margin:4px 0"></div>
        <table style="width:100%;font-size:8px">
          <tr style="font-weight:800"><td>TOTAL</td><td style="text-align:right">800 XOF</td></tr>
          <tr><td>Espèces</td><td style="text-align:right">1 000 XOF</td></tr>
          <tr><td>Rendu</td><td style="text-align:right">200 XOF</td></tr>
        </table>
        <div style="border-top:1px dashed #999;margin:4px 0"></div>
        <div style="font-size:8px;color:#666">Merci de votre visite !</div>
      </div>`,
  },
  {
    id: 'a4',
    label: 'Facture A4 duplicata',
    desc: 'A4 paysage · Coupée en 2 : exemplaire client + boutique',
    icon: FileText,
    preview: `
      <div style="font-family:sans-serif;font-size:7px;padding:4px;background:#fff;border-radius:4px;display:flex;gap:4px;min-height:120px">
        <div style="flex:1;border-right:1.5px dashed #999;padding-right:4px">
          <div style="display:flex;justify-content:space-between;margin-bottom:3px">
            <div><div style="font-weight:800;font-size:9px">MON MAGASIN</div><div style="color:#888">Adresse · Tél.</div></div>
            <div style="text-align:right"><div style="font-weight:800;color:#4f46e5;font-size:9px">FACTURE</div><div>#ABC12345</div></div>
          </div>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:#1e293b"><th style="color:#94a3b8;padding:2px 3px;text-align:left;font-weight:normal">Désignation</th><th style="color:#94a3b8;padding:2px 3px;text-align:right">Qté</th><th style="color:#94a3b8;padding:2px 3px;text-align:right">Total</th></tr></thead>
            <tbody>
              <tr><td style="padding:1px 3px">Coca-Cola 50cl</td><td style="text-align:right;padding:1px 3px">2</td><td style="text-align:right;padding:1px 3px">1 000</td></tr>
              <tr style="background:#f8fafc"><td style="padding:1px 3px">Pain de mie</td><td style="text-align:right;padding:1px 3px">1</td><td style="text-align:right;padding:1px 3px">300</td></tr>
            </tbody>
          </table>
          <div style="text-align:right;margin-top:3px"><strong style="font-size:9px">TOTAL : 1 300 XOF</strong></div>
          <div style="margin-top:6px;display:flex;gap:8px">
            <div style="flex:1;border-bottom:1px solid #ccc;font-size:6px;color:#888">Signature caissier</div>
            <div style="flex:1;border-bottom:1px solid #ccc;font-size:6px;color:#888">Signature client</div>
          </div>
          <div style="text-align:center;margin-top:4px;font-size:7px;font-weight:800;color:#2f855a;border:1px solid #2f855a;border-radius:2px;padding:1px 3px">✦ EXEMPLAIRE CLIENT ✦</div>
        </div>
        <div style="flex:1;padding-left:4px">
          <div style="display:flex;justify-content:space-between;margin-bottom:3px">
            <div><div style="font-weight:800;font-size:9px">MON MAGASIN</div><div style="color:#888">Adresse · Tél.</div></div>
            <div style="text-align:right"><div style="font-weight:800;color:#4f46e5;font-size:9px">FACTURE</div><div>#ABC12345</div></div>
          </div>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:#1e293b"><th style="color:#94a3b8;padding:2px 3px;text-align:left;font-weight:normal">Désignation</th><th style="color:#94a3b8;padding:2px 3px;text-align:right">Qté</th><th style="color:#94a3b8;padding:2px 3px;text-align:right">Total</th></tr></thead>
            <tbody>
              <tr><td style="padding:1px 3px">Coca-Cola 50cl</td><td style="text-align:right;padding:1px 3px">2</td><td style="text-align:right;padding:1px 3px">1 000</td></tr>
              <tr style="background:#f8fafc"><td style="padding:1px 3px">Pain de mie</td><td style="text-align:right;padding:1px 3px">1</td><td style="text-align:right;padding:1px 3px">300</td></tr>
            </tbody>
          </table>
          <div style="text-align:right;margin-top:3px"><strong style="font-size:9px">TOTAL : 1 300 XOF</strong></div>
          <div style="margin-top:6px;display:flex;gap:8px">
            <div style="flex:1;border-bottom:1px solid #ccc;font-size:6px;color:#888">Signature caissier</div>
            <div style="flex:1;border-bottom:1px solid #ccc;font-size:6px;color:#888">Signature client</div>
          </div>
          <div style="text-align:center;margin-top:4px;font-size:7px;font-weight:800;color:#4f46e5;border:1px solid #4f46e5;border-radius:2px;padding:1px 3px">✦ EXEMPLAIRE BOUTIQUE ✦</div>
        </div>
      </div>`,
  },
];

export function InvoiceModal({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  const { business } = useAuthStore();
  const [selected, setSelected] = useState<Template>(
    () => (typeof window !== 'undefined' ? (localStorage.getItem('invoice_template') as Template | null) ?? 'thermal' : 'thermal')
  );
  const [previewing, setPreviewing] = useState(false);

  if (!business) return null;

  function getHtml(): string {
    if (!business) return '';
    return selected === 'thermal'
      ? generateThermalReceipt(order, business)
      : generateA4DuplicateInvoice(order, business);
  }

  function handlePrint() {
    printHtml(getHtml());
  }

  function handlePreview() {
    setPreviewing(true);
    const w = window.open('', '_blank', 'width=1000,height=750');
    if (!w) { alert('Autorisez les pop-ups pour prévisualiser.'); setPreviewing(false); return; }
    w.document.write(getHtml());
    w.document.close();
    w.focus();
    setTimeout(() => setPreviewing(false), 600);
  }

  const tmpl = TEMPLATES.find((t) => t.id === selected)!;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-brand-600/20 text-brand-400">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Imprimer la facture</h2>
              <p className="text-xs text-slate-500">Choisissez un modèle</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sélection du modèle */}
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {TEMPLATES.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  className={`flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-all ${
                    selected === t.id
                      ? 'border-brand-600 bg-brand-600/10'
                      : 'border-surface-border hover:border-surface-hover hover:bg-surface-hover'
                  }`}
                >
                  <Icon className={`w-6 h-6 ${selected === t.id ? 'text-brand-400' : 'text-slate-400'}`} />
                  <div>
                    <p className={`text-sm font-semibold ${selected === t.id ? 'text-white' : 'text-slate-300'}`}>
                      {t.label}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-snug">{t.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Prévisualisation miniature */}
          <div className="rounded-xl border border-surface-border overflow-hidden bg-slate-800">
            <div className="px-3 py-2 border-b border-surface-border flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs text-slate-400">Aperçu — {tmpl.label}</span>
            </div>
            <div
              className="p-3"
              dangerouslySetInnerHTML={{ __html: tmpl.preview }}
            />
          </div>

          {/* Info format */}
          <div className="flex items-start gap-2 p-3 bg-surface-input rounded-xl">
            <tmpl.icon className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-400 leading-relaxed">
              {selected === 'thermal'
                ? 'Optimisé pour papier thermique 80mm. L\'impression s\'adapte automatiquement à la longueur du ticket.'
                : 'Format A4 paysage. Découpez selon le pointillé central pour obtenir 2 exemplaires identiques : un pour le client (vert), un pour la boutique (bleu).'}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t border-surface-border">
          <button onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          <button
            onClick={handlePreview}
            disabled={previewing}
            className="btn-secondary flex items-center justify-center gap-2 flex-1"
          >
            <Eye className="w-4 h-4" />
            Prévisualiser
          </button>
          <button
            onClick={handlePrint}
            className="btn-primary flex items-center justify-center gap-2 flex-1"
          >
            <Printer className="w-4 h-4" />
            Imprimer
          </button>
        </div>
      </div>
    </div>
  );
}
