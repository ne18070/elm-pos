'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Plus, Trash2, ChevronDown, ChevronRight, Save, Maximize2,
  GripVertical, Download, Upload, ImageIcon, Type, Eye, EyeOff,
} from 'lucide-react';
import {
  type TemplateConfig, type TemplateBlock, type BlockType,
  DEFAULT_BLOCKS, BLOCK_LABELS,
  getTemplates, saveTemplates, createTemplate, renderTemplate,
} from '@/lib/template-config';
import { useNotificationStore } from '@/store/notifications';

// ─── Mock data ────────────────────────────────────────────────────────────────

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
    { id: 'i1', name: 'Coca-Cola 50cl',             price: 500,  quantity: 3, total: 1500, discount_amount: 0 },
    { id: 'i2', name: 'Pain de mie complet',         price: 750,  quantity: 2, total: 1500, discount_amount: 0 },
    { id: 'i3', name: 'Lait concentré sucré Nestlé', price: 1200, quantity: 1, total: 1200, discount_amount: 0 },
    { id: 'i4', name: 'Savon Omo 500g',              price: 850,  quantity: 3, total: 2550, discount_amount: 0 },
    { id: 'i5', name: 'Huile Dinor 1L',              price: 1800, quantity: 1, total: 1800, discount_amount: 0 },
    { id: 'i6', name: 'Sucre 1kg',                   price: 600,  quantity: 2, total: 1200, discount_amount: 0 },
    { id: 'i7', name: 'Riz parfumé 5kg',             price: 3750, quantity: 1, total: 3750, discount_amount: 0 },
  ],
  business_id: 'biz',
};
const MOCK_BUSINESS = {
  id: 'biz', name: 'Mon Magasin', address: 'Av. de la Paix, Dakar',
  phone: '+221 77 000 00 00', email: 'contact@magasin.sn',
  logo_url: null, currency: 'XOF', receipt_footer: 'Merci de votre visite !',
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIMARY_PRESETS = ['#1e293b', '#1a1a2e', '#0f172a', '#1c1917', '#052e16', '#1e1b4b'];
const ACCENT_PRESETS  = ['#22c55e', '#4f46e5', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

const FORMAT_LABELS: Record<TemplateConfig['format'], string> = {
  thermal: 'Thermique 80mm', 'a4-landscape': 'A4 Paysage', 'a4-portrait': 'A4 Portrait', 'a5-portrait': 'A5',
};
const FORMAT_BADGE: Record<TemplateConfig['format'], string> = {
  thermal: 'bg-badge-orange text-orange-300', 'a4-landscape': 'bg-badge-brand text-content-brand',
  'a4-portrait': 'bg-badge-info text-blue-300', 'a5-portrait': 'bg-badge-purple text-status-purple',
};

const SECTION_HIGHLIGHT: Record<string, string | null> = {
  header: 'header', receipt: 'receipt', items: 'items',
  totals: 'totals', payment: 'payment', footer: 'footer',
};
const HIGHLIGHT_CSS = (s: string) =>
  `[data-section="${s}"] { outline: 3px solid rgba(99,102,241,0.85) !important; outline-offset: 3px; border-radius: 3px; }`;

const BUILTIN_BLOCK_TYPES: BlockType[] = ['header', 'receipt-info', 'items', 'totals', 'payment', 'footer'];

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = false, sectionKey, onActivate }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
  sectionKey?: string; onActivate?: (k: string | null) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  function toggle() {
    const next = !open; setOpen(next);
    if (next && sectionKey && onActivate) onActivate(SECTION_HIGHLIGHT[sectionKey] ?? null);
  }
  return (
    <div className="border border-surface-border rounded-xl overflow-hidden">
      <button onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-card hover:bg-surface-hover transition-colors text-left">
        <span className="text-sm font-semibold text-content-primary">{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-content-secondary" /> : <ChevronRight className="w-4 h-4 text-content-secondary" />}
      </button>
      {open && <div className="px-4 py-4 bg-surface-input space-y-4">{children}</div>}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <span className="text-sm text-content-primary">{label}</span>
      <button type="button" onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-brand-600' : 'bg-surface-border'}`}>
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
      </button>
    </label>
  );
}

function ColorField({ label, value, onChange, presets }: {
  label: string; value: string; onChange: (v: string) => void; presets: string[];
}) {
  return (
    <div className="space-y-1.5">
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
          className="w-9 h-9 rounded cursor-pointer border-0 bg-transparent p-0" />
        <span className="text-xs text-content-secondary font-mono">{value}</span>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {presets.map((c) => (
          <button key={c} type="button" onClick={() => onChange(c)} style={{ backgroundColor: c }}
            className={`w-6 h-6 rounded-full border-2 transition-all ${value === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'}`} />
        ))}
      </div>
    </div>
  );
}

function SubGroup({ sectionKey, onActivate, label, children }: {
  sectionKey: string; onActivate: (k: string | null) => void; label: string; children: React.ReactNode;
}) {
  return (
    <div onMouseEnter={() => onActivate(SECTION_HIGHLIGHT[sectionKey] ?? null)}
      className="space-y-1 p-2 -mx-2 rounded-lg transition-colors hover:bg-surface-hover">
      <p className="text-xs text-content-muted mb-2">{label}</p>
      {children}
    </div>
  );
}

// ─── Block row in the Blocs panel ─────────────────────────────────────────────

function BlockRow({ block, index, total, isEditing, onDragStart, onDragOver, onDrop, onToggle, onEdit, onDelete }: {
  block:       TemplateBlock;
  index:       number;
  total:       number;
  isEditing:   boolean;
  onDragStart: (i: number) => void;
  onDragOver:  (e: React.DragEvent, i: number) => void;
  onDrop:      (i: number) => void;
  onToggle:    () => void;
  onEdit:      () => void;
  onDelete:    () => void;
}) {
  const isBuiltin = BUILTIN_BLOCK_TYPES.includes(block.type);
  const label     = block.label || BLOCK_LABELS[block.type];

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={() => onDrop(index)}
      className={`flex items-center gap-2 px-2 py-2 rounded-lg border transition-all cursor-grab active:cursor-grabbing
        ${isEditing ? 'border-brand-600 bg-badge-brand' : 'border-surface-border hover:border-brand-600 bg-surface-card'}`}
    >
      <GripVertical className="w-4 h-4 text-content-muted shrink-0 cursor-grab" />
      <span className={`flex-1 text-xs truncate ${block.enabled ? 'text-content-primary' : 'text-content-muted'}`}>
        {label}
      </span>
      {/* Enable/disable */}
      <button type="button" onClick={onToggle}
        className={`p-1 rounded transition-colors ${block.enabled ? 'text-content-brand hover:text-content-brand' : 'text-content-muted hover:text-content-secondary'}`}
        title={block.enabled ? 'Masquer' : 'Afficher'}>
        {block.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
      </button>
      {/* Edit (custom blocks only) */}
      {!isBuiltin && (
        <button type="button" onClick={onEdit}
          className={`p-1 rounded transition-colors text-content-muted hover:text-content-primary`}
          title="Modifier">
          <Type className="w-3.5 h-3.5" />
        </button>
      )}
      {/* Delete (custom blocks only) */}
      {!isBuiltin && (
        <button type="button" onClick={onDelete}
          className="p-1 rounded text-content-muted hover:text-status-error transition-colors"
          title="Supprimer">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── Custom block inline editor ───────────────────────────────────────────────

function CustomBlockEditor({ block, onChange }: { block: TemplateBlock; onChange: (patch: Partial<TemplateBlock>) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);

  if (block.type === 'custom-text') {
    return (
      <div className="mt-2 space-y-3 px-1">
        <div>
          <label className="label text-xs">Nom (éditeur)</label>
          <input value={block.label ?? ''} onChange={(e) => onChange({ label: e.target.value })}
            className="input text-sm" placeholder="Ex : Conditions de vente" />
        </div>
        <div>
          <label className="label text-xs">Contenu</label>
          <textarea value={block.content ?? ''} onChange={(e) => onChange({ content: e.target.value })}
            className="input resize-none text-sm" rows={3}
            placeholder="Texte libre, HTML simple accepté…" />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="label text-xs">Alignement</label>
            <div className="flex gap-1 mt-1">
              {(['left', 'center', 'right'] as const).map((a) => (
                <button key={a} type="button" onClick={() => onChange({ textAlign: a })}
                  className={`flex-1 py-1 rounded text-xs border transition-all ${block.textAlign === a ? 'border-brand-600 bg-brand-600/10 text-content-primary' : 'border-surface-border text-content-secondary hover:border-brand-600'}`}>
                  {a === 'left' ? '←' : a === 'center' ? '↔' : '→'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1">
            <label className="label text-xs">Taille</label>
            <div className="flex gap-1 mt-1">
              {(['xs', 'sm', 'md', 'lg'] as const).map((s) => (
                <button key={s} type="button" onClick={() => onChange({ textSize: s })}
                  className={`flex-1 py-1 rounded text-xs border transition-all ${block.textSize === s ? 'border-brand-600 bg-brand-600/10 text-content-primary' : 'border-surface-border text-content-secondary hover:border-brand-600'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
        <Toggle label="Gras" checked={block.textBold ?? false} onChange={(v) => onChange({ textBold: v })} />
      </div>
    );
  }

  if (block.type === 'custom-image') {
    return (
      <div className="mt-2 space-y-3 px-1">
        <div>
          <label className="label text-xs">Nom (éditeur)</label>
          <input value={block.label ?? ''} onChange={(e) => onChange({ label: e.target.value })}
            className="input text-sm" placeholder="Ex : Logo secondaire" />
        </div>
        <div>
          <label className="label text-xs">Image</label>
          {block.dataUrl ? (
            <div className="relative w-fit mt-1">
              <img src={block.dataUrl} alt={block.imageAlt ?? ''}
                className="h-20 w-auto rounded-lg border border-surface-border object-contain bg-white/5" />
              <button onClick={() => onChange({ dataUrl: undefined })}
                className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 rounded-full flex items-center justify-center text-white text-xs">
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()}
              className="mt-1 w-full h-16 border-2 border-dashed border-surface-border rounded-lg flex items-center justify-center gap-2 text-xs text-content-secondary hover:border-brand-600 transition-colors">
              <ImageIcon className="w-4 h-4" />
              Choisir une image (recommandé &lt; 200 Ko)
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]; if (!file) return;
              const reader = new FileReader();
              reader.onload = (ev) => onChange({ dataUrl: ev.target!.result as string });
              reader.readAsDataURL(file);
              e.target.value = '';
            }} />
        </div>
        <div>
          <label className="label text-xs">Largeur max</label>
          <input value={block.imageMaxWidth ?? ''} onChange={(e) => onChange({ imageMaxWidth: e.target.value })}
            className="input text-sm" placeholder="Ex: 80px ou 60%" />
        </div>
        <div>
          <label className="label text-xs">Alignement</label>
          <div className="flex gap-1 mt-1">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} type="button" onClick={() => onChange({ imageAlign: a })}
                className={`flex-1 py-1 rounded text-xs border transition-all ${block.imageAlign === a ? 'border-brand-600 bg-brand-600/10 text-content-primary' : 'border-surface-border text-content-secondary hover:border-brand-600'}`}>
                {a === 'left' ? '← Gauche' : a === 'center' ? '↔ Centre' : 'Droite →'}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TemplateManager({ businessId, onClose }: { businessId: string; onClose: () => void }) {
  const { success, error: notifError } = useNotificationStore();
  const [templates, setTemplates]   = useState<TemplateConfig[]>(() => getTemplates(businessId));
  const [selectedId, setSelectedId] = useState<string>(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('invoice_template_id') : null;
    const list   = getTemplates(businessId);
    return stored && list.find((t) => t.id === stored) ? stored : list[0]?.id ?? '';
  });
  const [baseHtml, setBaseHtml]         = useState('');
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);

  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef    = useRef<HTMLIFrameElement>(null);
  const dragIdx      = useRef<number | null>(null);
  const importRef    = useRef<HTMLInputElement>(null);

  const selected = templates.find((t) => t.id === selectedId) ?? templates[0];
  const blocks   = selected?.blocks ?? DEFAULT_BLOCKS;

  // ── Preview rebuild ───────────────────────────────────────────────────────
  const refreshBase = useCallback((config: TemplateConfig) => {
    setBaseHtml(renderTemplate(MOCK_ORDER, MOCK_BUSINESS, config));
  }, []);

  useEffect(() => {
    if (!selected) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => refreshBase(selected), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [selected, refreshBase]);

  // ── Highlight injection ────────────────────────────────────────────────────
  function applyHighlight(section: string | null) {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    let el = doc.getElementById('__hl') as HTMLStyleElement | null;
    if (!el) { el = doc.createElement('style'); el.id = '__hl'; doc.head?.appendChild(el); }
    el.textContent = section ? HIGHLIGHT_CSS(section) : '';
  }
  useEffect(() => { applyHighlight(activeSection); }, [activeSection]);
  function handleIframeLoad() { applyHighlight(activeSection); }

  // ── Template mutations ─────────────────────────────────────────────────────
  function updateSelected(patch: Partial<TemplateConfig>) {
    if (!selected) return;
    setTemplates((prev) => prev.map((t) => t.id === selected.id ? { ...t, ...patch } : t));
  }
  function updateBlock(blockId: string, patch: Partial<TemplateBlock>) {
    updateSelected({ blocks: blocks.map((b) => b.id === blockId ? { ...b, ...patch } : b) });
  }
  function addBlock(type: BlockType) {
    const id = `b-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const newBlock: TemplateBlock = {
      id, type, enabled: true,
      label:   type === 'custom-text'  ? 'Texte libre' : 'Image',
      content: type === 'custom-text'  ? '' : undefined,
      imageAlign: type === 'custom-image' ? 'center' : undefined,
    };
    updateSelected({ blocks: [...blocks, newBlock] });
    setEditingBlockId(id);
  }
  function removeBlock(blockId: string) {
    updateSelected({ blocks: blocks.filter((b) => b.id !== blockId) });
    if (editingBlockId === blockId) setEditingBlockId(null);
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────
  function handleDragOver(e: React.DragEvent, targetIdx: number) {
    e.preventDefault();
  }
  function handleDrop(targetIdx: number) {
    if (dragIdx.current === null || dragIdx.current === targetIdx) return;
    const next = [...blocks];
    const [moved] = next.splice(dragIdx.current, 1);
    next.splice(targetIdx, 0, moved);
    updateSelected({ blocks: next });
    dragIdx.current = null;
  }

  // ── Save / Add / Delete templates ─────────────────────────────────────────
  function handleSave() { saveTemplates(businessId, templates); success('Modèle enregistré'); }

  function handleAdd() {
    const tpl = createTemplate(businessId);
    setTemplates(getTemplates(businessId));
    setSelectedId(tpl.id);
  }
  function handleDelete(id: string) {
    if (deletingId === id) {
      const updated = templates.filter((t) => t.id !== id);
      setTemplates(updated); saveTemplates(businessId, updated);
      setDeletingId(null);
      if (selectedId === id) setSelectedId(updated[0]?.id ?? '');
    } else {
      setDeletingId(id);
    }
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  function handleExport() {
    if (!selected) return;
    const blob = new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${selected.name.replace(/\s+/g, '-')}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Import ─────────────────────────────────────────────────────────────────
  function handleImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = JSON.parse(e.target!.result as string) as TemplateConfig;
        if (!raw.name || !raw.format) throw new Error('invalid');
        const imported: TemplateConfig = {
          ...raw,
          id:     `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          blocks: raw.blocks?.length ? raw.blocks : DEFAULT_BLOCKS.map(b => ({ ...b })),
        };
        const updated = [...templates, imported];
        setTemplates(updated);
        saveTemplates(businessId, updated);
        setSelectedId(imported.id);
        success(`Modèle "${imported.name}" importé`);
      } catch {
        notifError('Fichier JSON invalide');
      }
    };
    reader.readAsText(file);
    if (importRef.current) importRef.current.value = '';
  }

  const supportsLandscapeCopies = selected && (selected.format === 'a4-landscape' || selected.format === 'a5-portrait');
  const isThermal = selected?.format === 'thermal';
  const scale     = isThermal ? 0.65 : 0.45;
  const iframeW   = isThermal ? '80mm' : '200%';
  const iframeH   = '900px';

  return (
    <div className="fixed inset-0 z-50 flex bg-black/70 backdrop-blur-sm">
      <div className="flex w-full h-full bg-surface-card overflow-hidden">

        {/* ── 1. Template list ── */}
        <div className="w-56 flex-shrink-0 border-r border-surface-border flex flex-col">
          <div className="flex items-center justify-between px-4 py-4 border-b border-surface-border">
            <h2 className="font-bold text-content-primary text-sm">Modèles</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-hover">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {templates.map((t) => (
              <div key={t.id}
                className={`group flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                  selectedId === t.id ? 'border-brand-600 bg-brand-600/10' : 'border-surface-border hover:border-brand-600 hover:bg-surface-hover'}`}
                onClick={() => setSelectedId(t.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold truncate ${selectedId === t.id ? 'text-content-primary' : 'text-content-primary'}`}>{t.name}</p>
                  <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded mt-0.5 ${FORMAT_BADGE[t.format]}`}>{FORMAT_LABELS[t.format]}</span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                  className={`p-1 rounded-lg transition-colors opacity-0 group-hover:opacity-100 shrink-0 ${
                    deletingId === t.id ? 'text-status-error bg-badge-error opacity-100' : 'text-content-muted hover:text-status-error hover:bg-badge-error'}`}
                  title={deletingId === t.id ? 'Confirmer suppression' : 'Supprimer'}>
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-surface-border space-y-1.5">
            <button onClick={handleAdd} className="btn-secondary w-full flex items-center justify-center gap-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" /> Nouveau
            </button>
            <label className="btn-secondary w-full flex items-center justify-center gap-1.5 text-xs cursor-pointer">
              <Upload className="w-3.5 h-3.5" /> Importer
              <input ref={importRef} type="file" accept=".json" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }} />
            </label>
          </div>
        </div>

        {/* ── 2. Editor + Preview ── */}
        {selected ? (
          <div className="flex-1 flex overflow-hidden min-w-0">

            {/* ── Editor panel ── */}
            <div className="flex-1 flex flex-col overflow-hidden border-r border-surface-border min-w-0">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-border shrink-0 gap-2">
                <h3 className="font-bold text-content-primary text-sm truncate">{selected.name}</h3>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={handleExport} className="btn-secondary flex items-center gap-1.5 text-xs py-1.5" title="Exporter JSON">
                    <Download className="w-3.5 h-3.5" /> Export
                  </button>
                  <button onClick={handleSave} className="btn-primary flex items-center gap-1.5 text-xs py-1.5">
                    <Save className="w-3.5 h-3.5" /> Enregistrer
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">

                {/* ── Blocs & ordre ── */}
                <Section title="Blocs & ordre" defaultOpen>
                  <div className="space-y-1.5">
                    {blocks.map((block, i) => (
                      <div key={block.id}>
                        <BlockRow
                          block={block} index={i} total={blocks.length}
                          isEditing={editingBlockId === block.id}
                          onDragStart={(idx) => { dragIdx.current = idx; }}
                          onDragOver={handleDragOver}
                          onDrop={handleDrop}
                          onToggle={() => updateBlock(block.id, { enabled: !block.enabled })}
                          onEdit={() => setEditingBlockId(editingBlockId === block.id ? null : block.id)}
                          onDelete={() => removeBlock(block.id)}
                        />
                        {editingBlockId === block.id && (
                          <CustomBlockEditor block={block} onChange={(patch) => updateBlock(block.id, patch)} />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add custom blocks */}
                  <div className="flex gap-2 pt-2 border-t border-surface-border">
                    <button onClick={() => addBlock('custom-text')}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-surface-border text-xs text-content-secondary hover:border-brand-600 hover:text-content-brand transition-colors">
                      <Type className="w-3.5 h-3.5" /> + Texte libre
                    </button>
                    <button onClick={() => addBlock('custom-image')}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-surface-border text-xs text-content-secondary hover:border-brand-600 hover:text-content-brand transition-colors">
                      <ImageIcon className="w-3.5 h-3.5" /> + Image
                    </button>
                  </div>
                </Section>

                {/* ── Général ── */}
                <Section title="Général" sectionKey="general" onActivate={setActiveSection}>
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
                          className={`px-3 py-2 rounded-lg border text-sm text-left transition-all ${selected.format === f ? 'border-brand-600 bg-brand-600/10 text-content-primary' : 'border-surface-border text-content-secondary hover:border-brand-600 hover:bg-surface-hover'}`}>
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
                            className={`flex-1 py-2 rounded-lg border text-sm transition-all ${selected.copies === n ? 'border-brand-600 bg-brand-600/10 text-content-primary' : 'border-surface-border text-content-secondary hover:border-brand-600'}`}>
                            {n === 1 ? '1 exemplaire' : '2 (duplicata)'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </Section>

                {/* ── Style ── */}
                <Section title="Style" sectionKey="style" onActivate={setActiveSection}>
                  <ColorField label="Couleur principale (en-tête tableau)" value={selected.primaryColor}
                    onChange={(v) => updateSelected({ primaryColor: v })} presets={PRIMARY_PRESETS} />
                  <ColorField label="Couleur accentuation (titre, total)" value={selected.accentColor}
                    onChange={(v) => updateSelected({ accentColor: v })} presets={ACCENT_PRESETS} />
                  <div>
                    <label className="label">Police</label>
                    <div className="flex gap-2 mt-1">
                      {([['mono', 'Mono'], ['sans', 'Sans'], ['serif', 'Serif']] as const).map(([k, lbl]) => (
                        <button key={k} type="button" onClick={() => updateSelected({ fontFamily: k })}
                          className={`flex-1 py-2 rounded-lg border text-sm transition-all ${selected.fontFamily === k ? 'border-brand-600 bg-brand-600/10 text-content-primary' : 'border-surface-border text-content-secondary hover:border-brand-600'}`}>
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                </Section>

                {/* ── Contenu ── */}
                <Section title="Contenu" sectionKey="header" onActivate={setActiveSection}>
                  <SubGroup sectionKey="header" onActivate={setActiveSection} label="En-tête établissement">
                    <Toggle label="Logo"      checked={selected.showLogo}    onChange={(v) => updateSelected({ showLogo: v })} />
                    <Toggle label="Adresse"   checked={selected.showAddress} onChange={(v) => updateSelected({ showAddress: v })} />
                    <Toggle label="Téléphone" checked={selected.showPhone}   onChange={(v) => updateSelected({ showPhone: v })} />
                    <Toggle label="Email"     checked={selected.showEmail}   onChange={(v) => updateSelected({ showEmail: v })} />
                    <div>
                      <label className="label text-xs">Texte libre</label>
                      <textarea value={selected.headerExtra} onChange={(e) => updateSelected({ headerExtra: e.target.value })}
                        className="input resize-none text-sm" rows={2} placeholder="Ex: NINEA : 123456789" />
                    </div>
                  </SubGroup>
                  <SubGroup sectionKey="receipt" onActivate={setActiveSection} label="Bloc reçu">
                    <Toggle label="N° reçu"  checked={selected.showReceiptNum} onChange={(v) => updateSelected({ showReceiptNum: v })} />
                    <Toggle label="Date"     checked={selected.showDate}       onChange={(v) => updateSelected({ showDate: v })} />
                    <Toggle label="Caissier" checked={selected.showCashier}    onChange={(v) => updateSelected({ showCashier: v })} />
                    <Toggle label="Client"   checked={selected.showCustomer}   onChange={(v) => updateSelected({ showCustomer: v })} />
                  </SubGroup>
                  <SubGroup sectionKey="items" onActivate={setActiveSection} label="Tableau articles">
                    <Toggle label="Prix unitaire"  checked={selected.showUnitPrice}    onChange={(v) => updateSelected({ showUnitPrice: v })} />
                    <Toggle label="Remise article" checked={selected.showItemDiscount} onChange={(v) => updateSelected({ showItemDiscount: v })} />
                    <Toggle label="Notes article"  checked={selected.showItemNotes}    onChange={(v) => updateSelected({ showItemNotes: v })} />
                  </SubGroup>
                  <SubGroup sectionKey="totals" onActivate={setActiveSection} label="Totaux">
                    <Toggle label="Sous-total"         checked={selected.showSubtotal}      onChange={(v) => updateSelected({ showSubtotal: v })} />
                    <Toggle label="Coupon / Remise"    checked={selected.showCoupon}        onChange={(v) => updateSelected({ showCoupon: v })} />
                    <Toggle label="TVA"                checked={selected.showTax}           onChange={(v) => updateSelected({ showTax: v })} />
                    <Toggle label="Montant en lettres" checked={selected.showAmountInWords} onChange={(v) => updateSelected({ showAmountInWords: v })} />
                  </SubGroup>
                  <SubGroup sectionKey="payment" onActivate={setActiveSection} label="Paiement">
                    <Toggle label="Détails paiement" checked={selected.showPaymentDetails} onChange={(v) => updateSelected({ showPaymentDetails: v })} />
                    <Toggle label="Rendu monnaie"    checked={selected.showChange}         onChange={(v) => updateSelected({ showChange: v })} />
                    <Toggle label="Solde restant"    checked={selected.showBalance}        onChange={(v) => updateSelected({ showBalance: v })} />
                  </SubGroup>
                </Section>

                {/* ── Pied de page ── */}
                <Section title="Pied de page" sectionKey="footer" onActivate={setActiveSection}>
                  <Toggle label="Signatures"                  checked={selected.showSignatures} onChange={(v) => updateSelected({ showSignatures: v })} />
                  <Toggle label="QR Code (requiert Internet)" checked={selected.showQRCode}     onChange={(v) => updateSelected({ showQRCode: v })} />
                  <div>
                    <label className="label">Texte pied de page</label>
                    <textarea value={selected.footerText} onChange={(e) => updateSelected({ footerText: e.target.value })}
                      className="input resize-none" rows={2} placeholder="Merci de votre visite !" />
                  </div>
                </Section>

                {/* ── Copies ── */}
                {selected.copies === 2 && (
                  <Section title="Copies" sectionKey="copies" onActivate={setActiveSection}>
                    <div className="grid grid-cols-2 gap-4">
                      {([1, 2] as const).map((n) => (
                        <div key={n} className="space-y-3">
                          <p className="text-xs text-content-muted font-semibold">Exemplaire {n}</p>
                          <div>
                            <label className="label">Libellé</label>
                            <input type="text"
                              value={n === 1 ? selected.copy1Label : selected.copy2Label}
                              onChange={(e) => updateSelected(n === 1 ? { copy1Label: e.target.value } : { copy2Label: e.target.value })}
                              className="input" />
                          </div>
                          <ColorField label="Couleur"
                            value={n === 1 ? selected.copy1Color : selected.copy2Color}
                            onChange={(v) => updateSelected(n === 1 ? { copy1Color: v } : { copy2Color: v })}
                            presets={ACCENT_PRESETS} />
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

              </div>
            </div>

            {/* ── Preview panel ── */}
            <div className="flex-1 flex flex-col overflow-hidden bg-surface min-w-0">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-surface-border shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-content-primary">Aperçu</span>
                  {activeSection && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-badge-brand border border-status-brand/40 text-content-brand">
                      {activeSection}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    const win = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
                    if (win) { win.document.open(); win.document.write(baseHtml); win.document.close(); }
                  }}
                  className="btn-secondary flex items-center gap-1.5 text-xs py-1"
                >
                  <Maximize2 className="w-3.5 h-3.5" /> Taille réelle
                </button>
              </div>

              <div className="flex-1 overflow-auto flex justify-center items-start p-4">
                <div style={{
                  position: 'relative',
                  width:  isThermal ? `calc(80mm * ${scale})` : '100%',
                  height: `calc(${iframeH} * ${scale})`,
                  flexShrink: 0,
                }}>
                  <iframe
                    ref={iframeRef}
                    srcDoc={baseHtml}
                    title="Aperçu du modèle"
                    onLoad={handleIframeLoad}
                    style={{
                      width: iframeW, height: iframeH, border: 'none',
                      transform: `scale(${scale})`, transformOrigin: 'top left',
                      background: '#fff', borderRadius: '4px',
                    }}
                  />
                </div>
              </div>
            </div>

          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-content-muted">
            Sélectionnez ou créez un modèle
          </div>
        )}
      </div>
    </div>
  );
}
