'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Plus, Trash2, ChevronDown, ChevronRight, RefreshCw, Save } from 'lucide-react';
import {
  type TemplateConfig,
  getTemplates,
  saveTemplates,
  createTemplate,
  renderTemplate,
} from '@/lib/template-config';
import { useNotificationStore } from '@/store/notifications';

// ─── Mock order for preview ───────────────────────────────────────────────────

const MOCK_ORDER = {
  id: 'abc12345-demo-0000-0000-000000000000',
  created_at: new Date().toISOString(),
  status: 'paid',
  subtotal: 15000,
  discount_amount: 1500,
  tax_amount: 0,
  total: 13500,
  coupon_code: 'PROMO10',
  coupon_notes: null,
  notes: null,
  cashier: { id: 'x', full_name: 'Amadou Diallo' },
  customer_name: 'Fatou Traoré',
  customer_phone: '+221 77 123 45 67',
  payments: [{ id: 'p1', method: 'cash', amount: 15000 }],
  items: [
    { id: 'i1', name: 'Coca-Cola 50cl', price: 500, quantity: 3, total: 1500, discount_amount: 0 },
    { id: 'i2', name: 'Pain de mie complet', price: 750, quantity: 2, total: 1500, discount_amount: 0 },
    { id: 'i3', name: 'Lait concentré sucré Nestlé', price: 1200, quantity: 1, total: 1200, discount_amount: 0 },
    { id: 'i4', name: 'Savon Omo 500g', price: 850, quantity: 3, total: 2550, discount_amount: 0 },
    { id: 'i5', name: 'Huile Dinor 1L', price: 1800, quantity: 1, total: 1800, discount_amount: 0 },
    { id: 'i6', name: 'Sucre 1kg', price: 600, quantity: 2, total: 1200, discount_amount: 0 },
    { id: 'i7', name: 'Riz parfumé 5kg', price: 3750, quantity: 1, total: 3750, discount_amount: 0 },
  ],
  business_id: 'biz',
};

const MOCK_BUSINESS = {
  id: 'biz',
  name: 'Mon Magasin',
  address: 'Av. de la Paix, Dakar',
  phone: '+221 77 000 00 00',
  email: 'contact@magasin.sn',
  logo_url: null,
  currency: 'XOF',
  receipt_footer: 'Merci de votre visite !',
};

// ─── Color presets ────────────────────────────────────────────────────────────

const PRIMARY_PRESETS = ['#1e293b', '#1a1a2e', '#0f172a', '#1c1917', '#052e16', '#1e1b4b'];
const ACCENT_PRESETS  = ['#22c55e', '#4f46e5', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

// ─── Format labels ────────────────────────────────────────────────────────────

const FORMAT_LABELS: Record<TemplateConfig['format'], string> = {
  thermal: 'Thermique 80mm',
  'a4-landscape': 'A4 Paysage',
  'a4-portrait': 'A4 Portrait',
  'a5-portrait': 'A5',
};

const FORMAT_BADGE_COLORS: Record<TemplateConfig['format'], string> = {
  thermal: 'bg-orange-900/40 text-orange-300',
  'a4-landscape': 'bg-indigo-900/40 text-indigo-300',
  'a4-portrait': 'bg-blue-900/40 text-blue-300',
  'a5-portrait': 'bg-purple-900/40 text-purple-300',
};

// ─── Accordion section ────────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-surface-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-card hover:bg-surface-hover transition-colors text-left"
      >
        <span className="text-sm font-semibold text-white">{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="px-4 py-4 bg-surface-input space-y-4">{children}</div>}
    </div>
  );
}

// ─── Toggle row ───────────────────────────────────────────────────────────────

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <span className="text-sm text-slate-300">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-brand-600' : 'bg-surface-border'}`}
      >
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
      </button>
    </label>
  );
}

// ─── Color picker with presets ────────────────────────────────────────────────

function ColorField({
  label, value, onChange, presets,
}: { label: string; value: string; onChange: (v: string) => void; presets: string[] }) {
  return (
    <div className="space-y-1.5">
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
          className="w-9 h-9 rounded cursor-pointer border-0 bg-transparent p-0" />
        <span className="text-xs text-slate-400 font-mono">{value}</span>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {presets.map((c) => (
          <button key={c} type="button" onClick={() => onChange(c)}
            style={{ backgroundColor: c }}
            className={`w-6 h-6 rounded-full border-2 transition-all ${value === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'}`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TemplateManager({ businessId, onClose }: { businessId: string; onClose: () => void }) {
  const { success } = useNotificationStore();
  const [templates, setTemplates] = useState<TemplateConfig[]>(() => getTemplates(businessId));
  const [selectedId, setSelectedId] = useState<string>(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('invoice_template_id') : null;
    const list = getTemplates(businessId);
    return stored && list.find((t) => t.id === stored) ? stored : list[0]?.id ?? '';
  });
  const [previewHtml, setPreviewHtml] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = templates.find((t) => t.id === selectedId) ?? templates[0];

  // Auto-refresh preview on config change
  const refreshPreview = useCallback((config: TemplateConfig) => {
    setPreviewHtml(renderTemplate(MOCK_ORDER, MOCK_BUSINESS, config));
  }, []);

  useEffect(() => {
    if (!selected) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => refreshPreview(selected), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [selected, refreshPreview]);

  function updateSelected(patch: Partial<TemplateConfig>) {
    if (!selected) return;
    const updated = templates.map((t) => t.id === selected.id ? { ...t, ...patch } : t);
    setTemplates(updated);
  }

  function handleSave() {
    saveTemplates(businessId, templates);
    success('Modèle enregistré');
  }

  function handleAdd() {
    const tpl = createTemplate(businessId);
    setTemplates(getTemplates(businessId));
    setSelectedId(tpl.id);
  }

  function handleDelete(id: string) {
    if (deletingId === id) {
      const updated = templates.filter((t) => t.id !== id);
      setTemplates(updated);
      saveTemplates(businessId, updated);
      setDeletingId(null);
      if (selectedId === id) setSelectedId(updated[0]?.id ?? '');
    } else {
      setDeletingId(id);
    }
  }

  const supportsLandscapeCopies = selected && (selected.format === 'a4-landscape' || selected.format === 'a5-portrait');

  return (
    <div className="fixed inset-0 z-50 flex bg-black/70 backdrop-blur-sm">
      <div className="flex w-full h-full bg-surface-card overflow-hidden">

        {/* ── Left panel: template list ── */}
        <div className="w-72 flex-shrink-0 border-r border-surface-border flex flex-col">
          <div className="flex items-center justify-between px-4 py-4 border-b border-surface-border">
            <h2 className="font-bold text-white">Modèles</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {templates.map((t) => (
              <div key={t.id}
                className={`group flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${
                  selectedId === t.id
                    ? 'border-brand-600 bg-brand-600/10'
                    : 'border-surface-border hover:border-slate-600 hover:bg-surface-hover'
                }`}
                onClick={() => setSelectedId(t.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${selectedId === t.id ? 'text-white' : 'text-slate-300'}`}>
                    {t.name}
                  </p>
                  <span className={`inline-block text-xs px-1.5 py-0.5 rounded mt-0.5 ${FORMAT_BADGE_COLORS[t.format]}`}>
                    {FORMAT_LABELS[t.format]}
                  </span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                  className={`p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100 ${
                    deletingId === t.id ? 'text-red-400 bg-red-900/30 opacity-100' : 'text-slate-500 hover:text-red-400 hover:bg-red-900/20'
                  }`}
                  title={deletingId === t.id ? 'Confirmer la suppression' : 'Supprimer'}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-surface-border">
            <button onClick={handleAdd} className="btn-secondary w-full flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" />
              Nouveau modèle
            </button>
          </div>
        </div>

        {/* ── Right panel: editor + preview ── */}
        {selected ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
              <h3 className="font-bold text-white">Éditer : {selected.name}</h3>
              <button onClick={handleSave} className="btn-primary flex items-center gap-2">
                <Save className="w-4 h-4" />
                Enregistrer
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3">

              {/* 1 — Général */}
              <Section title="Général" defaultOpen>
                <div>
                  <label className="label">Nom du modèle</label>
                  <input type="text" value={selected.name} onChange={(e) => updateSelected({ name: e.target.value })}
                    className="input" placeholder="Ex: Facture client" />
                </div>

                <div>
                  <label className="label">Format</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {(Object.keys(FORMAT_LABELS) as TemplateConfig['format'][]).map((f) => (
                      <button key={f} type="button" onClick={() => updateSelected({ format: f })}
                        className={`px-3 py-2 rounded-lg border text-sm text-left transition-all ${
                          selected.format === f
                            ? 'border-brand-600 bg-brand-600/10 text-white'
                            : 'border-surface-border text-slate-400 hover:border-slate-600 hover:bg-surface-hover'
                        }`}
                      >
                        {FORMAT_LABELS[f]}
                      </button>
                    ))}
                  </div>
                </div>

                {supportsLandscapeCopies && (
                  <div>
                    <label className="label">Exemplaires</label>
                    <div className="flex gap-2 mt-1">
                      {([1, 2] as const).map((n) => (
                        <button key={n} type="button" onClick={() => updateSelected({ copies: n })}
                          className={`flex-1 py-2 rounded-lg border text-sm transition-all ${
                            selected.copies === n
                              ? 'border-brand-600 bg-brand-600/10 text-white'
                              : 'border-surface-border text-slate-400 hover:border-slate-600'
                          }`}
                        >
                          {n === 1 ? '1 exemplaire' : '2 exemplaires (duplicata)'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Section>

              {/* 2 — Style */}
              <Section title="Style">
                <ColorField label="Couleur principale (en-tête tableau)" value={selected.primaryColor}
                  onChange={(v) => updateSelected({ primaryColor: v })} presets={PRIMARY_PRESETS} />
                <ColorField label="Couleur accentuation (titre, total)" value={selected.accentColor}
                  onChange={(v) => updateSelected({ accentColor: v })} presets={ACCENT_PRESETS} />

                <div>
                  <label className="label">Police</label>
                  <div className="flex gap-2 mt-1">
                    {([['mono', 'Monospace'], ['sans', 'Sans-serif'], ['serif', 'Serif']] as const).map(([k, lbl]) => (
                      <button key={k} type="button" onClick={() => updateSelected({ fontFamily: k })}
                        className={`flex-1 py-2 rounded-lg border text-sm transition-all ${
                          selected.fontFamily === k
                            ? 'border-brand-600 bg-brand-600/10 text-white'
                            : 'border-surface-border text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              </Section>

              {/* 3 — Contenu */}
              <Section title="Contenu">
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 mb-2">En-tête établissement</p>
                  <Toggle label="Logo" checked={selected.showLogo} onChange={(v) => updateSelected({ showLogo: v })} />
                  <Toggle label="Adresse" checked={selected.showAddress} onChange={(v) => updateSelected({ showAddress: v })} />
                  <Toggle label="Téléphone" checked={selected.showPhone} onChange={(v) => updateSelected({ showPhone: v })} />
                  <Toggle label="Email" checked={selected.showEmail} onChange={(v) => updateSelected({ showEmail: v })} />
                </div>

                <div>
                  <label className="label">Texte en-tête libre</label>
                  <textarea value={selected.headerExtra} onChange={(e) => updateSelected({ headerExtra: e.target.value })}
                    className="input resize-none" rows={2} placeholder="Ex: NINEA : 123456789" />
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-slate-500 mb-2">Bloc reçu</p>
                  <Toggle label="N° reçu" checked={selected.showReceiptNum} onChange={(v) => updateSelected({ showReceiptNum: v })} />
                  <Toggle label="Date" checked={selected.showDate} onChange={(v) => updateSelected({ showDate: v })} />
                  <Toggle label="Caissier" checked={selected.showCashier} onChange={(v) => updateSelected({ showCashier: v })} />
                  <Toggle label="Client" checked={selected.showCustomer} onChange={(v) => updateSelected({ showCustomer: v })} />
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-slate-500 mb-2">Tableau articles</p>
                  <Toggle label="Prix unitaire" checked={selected.showUnitPrice} onChange={(v) => updateSelected({ showUnitPrice: v })} />
                  <Toggle label="Remise article" checked={selected.showItemDiscount} onChange={(v) => updateSelected({ showItemDiscount: v })} />
                  <Toggle label="Notes article" checked={selected.showItemNotes} onChange={(v) => updateSelected({ showItemNotes: v })} />
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-slate-500 mb-2">Totaux</p>
                  <Toggle label="Sous-total" checked={selected.showSubtotal} onChange={(v) => updateSelected({ showSubtotal: v })} />
                  <Toggle label="Coupon / Remise" checked={selected.showCoupon} onChange={(v) => updateSelected({ showCoupon: v })} />
                  <Toggle label="TVA" checked={selected.showTax} onChange={(v) => updateSelected({ showTax: v })} />
                  <Toggle label="Montant en lettres" checked={selected.showAmountInWords} onChange={(v) => updateSelected({ showAmountInWords: v })} />
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-slate-500 mb-2">Paiement</p>
                  <Toggle label="Détails paiement" checked={selected.showPaymentDetails} onChange={(v) => updateSelected({ showPaymentDetails: v })} />
                  <Toggle label="Rendu monnaie" checked={selected.showChange} onChange={(v) => updateSelected({ showChange: v })} />
                  <Toggle label="Solde restant" checked={selected.showBalance} onChange={(v) => updateSelected({ showBalance: v })} />
                </div>
              </Section>

              {/* 4 — Pied de page */}
              <Section title="Pied de page">
                <Toggle label="Signatures" checked={selected.showSignatures} onChange={(v) => updateSelected({ showSignatures: v })} />
                <div>
                  <label className="label">Texte pied de page</label>
                  <textarea value={selected.footerText} onChange={(e) => updateSelected({ footerText: e.target.value })}
                    className="input resize-none" rows={2} placeholder="Merci de votre visite !" />
                </div>
              </Section>

              {/* 5 — Copies (only when copies=2) */}
              {selected.copies === 2 && (
                <Section title="Copies">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <p className="text-xs text-slate-500 font-semibold">Exemplaire 1</p>
                      <div>
                        <label className="label">Libellé</label>
                        <input type="text" value={selected.copy1Label} onChange={(e) => updateSelected({ copy1Label: e.target.value })}
                          className="input" />
                      </div>
                      <ColorField label="Couleur" value={selected.copy1Color}
                        onChange={(v) => updateSelected({ copy1Color: v })} presets={ACCENT_PRESETS} />
                    </div>
                    <div className="space-y-3">
                      <p className="text-xs text-slate-500 font-semibold">Exemplaire 2</p>
                      <div>
                        <label className="label">Libellé</label>
                        <input type="text" value={selected.copy2Label} onChange={(e) => updateSelected({ copy2Label: e.target.value })}
                          className="input" />
                      </div>
                      <ColorField label="Couleur" value={selected.copy2Color}
                        onChange={(v) => updateSelected({ copy2Color: v })} presets={ACCENT_PRESETS} />
                    </div>
                  </div>
                </Section>
              )}

              {/* Preview */}
              <div className="border border-surface-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border bg-surface-card">
                  <span className="text-sm font-semibold text-white">Aperçu</span>
                  <button onClick={() => selected && refreshPreview(selected)}
                    className="btn-secondary flex items-center gap-1.5 text-xs py-1">
                    <RefreshCw className="w-3.5 h-3.5" />
                    Rafraîchir l&apos;aperçu
                  </button>
                </div>
                <div className="bg-slate-800 p-3">
                  <div style={{ height: 400, overflow: 'hidden', position: 'relative' }}>
                    <iframe
                      srcDoc={previewHtml}
                      title="Aperçu du modèle"
                      style={{
                        width: '200%',
                        height: '200%',
                        border: 'none',
                        transform: 'scale(0.5)',
                        transformOrigin: 'top left',
                        background: '#fff',
                      }}
                    />
                  </div>
                </div>
              </div>

            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            Sélectionnez ou créez un modèle
          </div>
        )}
      </div>
    </div>
  );
}
