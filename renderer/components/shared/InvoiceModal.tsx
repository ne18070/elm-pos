'use client';

import { useState, useEffect } from 'react';
import { X, Printer, Eye, Settings2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { printHtml } from '@/lib/invoice-templates';
import { getTemplates, renderTemplate, type TemplateConfig } from '@/lib/template-config';
import { TemplateManager } from '@/components/settings/TemplateManager';
import type { Order } from '@pos-types';

const FORMAT_BADGE: Record<TemplateConfig['format'], string> = {
  thermal: 'Thermique',
  'a4-landscape': 'A4 Paysage',
  'a4-portrait': 'A4 Portrait',
  'a5-portrait': 'A5',
};

export function InvoiceModal({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  const { business } = useAuthStore();

  const [templates, setTemplates] = useState<TemplateConfig[]>(() =>
    business ? getTemplates(business.id) : []
  );

  const [selectedId, setSelectedId] = useState<string>(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('invoice_template_id') : null;
    const list = business ? getTemplates(business.id) : [];
    return stored && list.find((t) => t.id === stored) ? stored : list[0]?.id ?? '';
  });

  const [previewing, setPreviewing] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');

  const selected = templates.find((t) => t.id === selectedId) ?? templates[0];

  // Persist selected template id
  useEffect(() => {
    if (selectedId) localStorage.setItem('invoice_template_id', selectedId);
  }, [selectedId]);

  // Generate mini preview for selected template
  useEffect(() => {
    if (!selected || !business) return;
    try {
      const MOCK_ORDER = {
        id: 'preview-0000-0000-0000-000000000000',
        created_at: new Date().toISOString(),
        status: 'paid',
        subtotal: 5800,
        discount_amount: 0,
        tax_amount: 0,
        total: 5800,
        coupon_code: null,
        coupon_notes: null,
        notes: null,
        cashier: { id: 'x', full_name: 'Caissier' },
        customer_name: 'Client',
        customer_phone: null,
        payments: [{ id: 'p1', method: 'cash', amount: 6000 }],
        items: [
          { id: 'i1', name: 'Article A', price: 2500, quantity: 2, total: 5000, discount_amount: 0 },
          { id: 'i2', name: 'Article B', price: 800, quantity: 1, total: 800, discount_amount: 0 },
        ],
        business_id: business.id,
      };
      setPreviewHtml(renderTemplate(MOCK_ORDER, business, selected));
    } catch {
      setPreviewHtml('');
    }
  }, [selected, business]);

  function reloadTemplates() {
    if (!business) return;
    const fresh = getTemplates(business.id);
    setTemplates(fresh);
    if (!fresh.find((t) => t.id === selectedId)) setSelectedId(fresh[0]?.id ?? '');
  }

  if (!business) return null;

  function getHtml(): string {
    if (!business || !selected) return '';
    return renderTemplate(order, business, selected);
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

  return (
    <>
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

          {/* Template list */}
          <div className="p-5 space-y-3">
            <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                    selectedId === t.id
                      ? 'border-brand-600 bg-brand-600/10'
                      : 'border-surface-border hover:border-slate-600 hover:bg-surface-hover'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${selectedId === t.id ? 'text-white' : 'text-slate-300'}`}>
                      {t.name}
                    </p>
                    <span className="text-xs text-slate-500">{FORMAT_BADGE[t.format]}{t.copies === 2 ? ' · Duplicata' : ''}</span>
                  </div>
                  {selectedId === t.id && (
                    <span className="text-xs text-brand-400 font-medium shrink-0">Sélectionné</span>
                  )}
                </button>
              ))}
            </div>

            {/* Mini preview */}
            {previewHtml && (
              <div className="rounded-xl border border-surface-border overflow-hidden bg-slate-800">
                <div className="px-3 py-2 border-b border-surface-border flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs text-slate-400">Aperçu — {selected?.name}</span>
                </div>
                <div className="p-2" style={{ height: 140, overflow: 'hidden', position: 'relative' }}>
                  <iframe
                    srcDoc={previewHtml}
                    title="Mini aperçu"
                    style={{
                      width: '300%',
                      height: '300%',
                      border: 'none',
                      transform: 'scale(0.333)',
                      transformOrigin: 'top left',
                      background: '#fff',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Manage templates */}
            <button
              onClick={() => setShowManager(true)}
              className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
            >
              <Settings2 className="w-4 h-4" />
              Gérer les modèles
            </button>
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

      {/* Template manager portal */}
      {showManager && (
        <TemplateManager
          businessId={business.id}
          onClose={() => {
            setShowManager(false);
            reloadTemplates();
          }}
        />
      )}
    </>
  );
}
