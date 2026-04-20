'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BookOpen, Plus, Search, Edit2, Trash2, Tag,
  ChevronDown, ChevronUp, Loader2, Save, X, FileText, Sparkles, Check, Settings2
} from 'lucide-react';
import { getPretentions, upsertPretention } from '@services/supabase/workflows';
import type { Pretention, PretentionVariable } from '@pos-types';

interface PretentionsLibraryProps {
  businessId: string;
}

// ── Helpers de conversion ───────────────────────────────────────────────────

function templateToHtml(text: string): string {
  if (!text) return '';
  return text.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
    const label = key.replace(/_/g, ' ');
    return `<span data-variable="${key}" class="var-badge" contenteditable="false">${label}</span>`;
  });
}

function htmlToTemplate(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  const badges = div.querySelectorAll('.var-badge');
  badges.forEach(b => {
    const key = b.getAttribute('data-variable');
    b.outerHTML = `{{${key}}}`;
  });
  // Nettoyage pour récupérer le texte brut formaté
  return div.innerText.replace(/\n\n/g, '\n').trim();
}

// ── Petit Modal de configuration de champ ───────────────────────────────────
function FieldConfigModal({ 
  initialValue, 
  onConfirm, 
  onDelete, 
  onCancel 
}: { 
  initialValue: string; 
  onConfirm: (name: string) => void; 
  onDelete?: () => void;
  onCancel: () => void; 
}) {
  const [val, setVal] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 w-full max-w-sm space-y-4 animate-in zoom-in-95 duration-200">
        <div className="flex items-center gap-2 text-blue-600">
          <Settings2 className="w-5 h-5" />
          <h3 className="font-bold text-slate-900">Configurer le champ</h3>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Donnez un nom clair. Ce nom sera affiché comme question lors de la génération du document.
        </p>
        <input 
          ref={inputRef}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if(e.key === 'Enter') onConfirm(val); if(e.key === 'Escape') onCancel(); }}
          placeholder="Ex: Date de l'audience"
        />
        <div className="flex items-center justify-between gap-3 pt-2">
          {onDelete && (
            <button onClick={onDelete} className="p-2.5 rounded-xl text-red-500 hover:bg-red-50 transition-colors" title="Supprimer le champ">
              <Trash2 className="w-5 h-5" />
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button onClick={onCancel} className="px-4 py-2 text-slate-400 font-bold text-sm hover:text-slate-600 transition-colors">Annuler</button>
            <button 
              onClick={() => onConfirm(val)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-xl flex items-center gap-2 shadow-lg shadow-blue-200 transition-all"
            >
              <Check className="w-4 h-4" /> Valider
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Éditeur "Smart Paper" V2 ──────────────────────────────────────────────────
function PretentionEditor({
  initial,
  businessId,
  onSave,
  onCancel,
}: {
  initial?: Partial<Pretention>;
  businessId: string;
  onSave: (p: Pretention) => void;
  onCancel: () => void;
}) {
  const [name, setName]             = useState(initial?.name ?? '');
  const editorRef                   = useRef<HTMLDivElement>(null);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // État pour le modal de config
  const [configModal, setConfigModal] = useState<{ mode: 'create' | 'edit', initial: string, target?: HTMLElement } | null>(null);
  const [savedRange, setSavedRange]   = useState<Range | null>(null);

  useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = templateToHtml(initial?.template ?? '');
    }
  }, [initial]);

  // Capturer la position du curseur avant d'ouvrir le modal
  const openInsertModal = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      setSavedRange(selection.getRangeAt(0).cloneRange());
    }
    setConfigModal({ mode: 'create', initial: '' });
  };

  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('var-badge')) {
      setConfigModal({ 
        mode: 'edit', 
        initial: target.innerText.replace(/[\[\]]/g, ''), 
        target 
      });
    }
  };

  const confirmField = (displayName: string) => {
    if (!displayName.trim()) return;
    const key = displayName.trim().toLowerCase().replace(/\s+/g, '_');
    const label = displayName.trim();

    if (configModal?.mode === 'create') {
      const badge = document.createElement('span');
      badge.className = 'var-badge';
      badge.setAttribute('data-variable', key);
      badge.setAttribute('contenteditable', 'false');
      badge.innerText = label;

      const selection = window.getSelection();
      selection?.removeAllRanges();
      if (savedRange) {
        selection?.addRange(savedRange);
        savedRange.deleteContents();
        savedRange.insertNode(badge);
        savedRange.collapse(false);
      } else if (editorRef.current) {
        editorRef.current.appendChild(badge);
      }
    } else if (configModal?.mode === 'edit' && configModal.target) {
      configModal.target.setAttribute('data-variable', key);
      configModal.target.innerText = label;
    }
    setConfigModal(null);
    setSavedRange(null);
  };

  const handleSave = async () => {
    const html = editorRef.current?.innerHTML ?? '';
    const template = htmlToTemplate(html);

    if (!name.trim() || !template.trim()) {
      setError('Veuillez donner un titre et rédiger le document.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const matches = template.matchAll(/\{\{([\w.]+)\}\}/g);
      const keys = Array.from(new Set([...matches].map(m => m[1])));
      const autoVariables: PretentionVariable[] = keys.map(k => ({
        key: k, label: k.replace(/_/g, ' '), type: 'text', required: true
      }));

      const saved = await upsertPretention({
        ...(initial?.id ? { id: initial.id } : {}),
        business_id: businessId,
        name:        name.trim(),
        category:    initial?.category || null,
        description: null,
        template:    template,
        variables:   autoVariables,
        tags:        [],
        is_active:   true,
      });
      onSave(saved);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      
      {/* ── Barre d'actions ── */}
      <div className="flex items-center justify-between sticky top-4 z-50 bg-slate-900/90 backdrop-blur-md p-4 rounded-2xl border border-slate-700 shadow-2xl">
        <input 
          className="bg-transparent border-none text-lg font-bold text-white focus:ring-0 w-full placeholder-slate-600"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Titre du document (ex: Mise en demeure)"
        />
        <div className="flex items-center gap-3">
          <button 
            onClick={openInsertModal}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 text-white hover:bg-blue-600 transition-all font-bold text-sm shadow-lg shadow-blue-500/20"
          >
            <Plus className="w-4 h-4" /> Ajouter un champ
          </button>
          <div className="w-px h-6 bg-slate-700 mx-1" />
          <button onClick={onCancel} className="px-3 py-2 text-slate-400 hover:text-white font-bold text-sm transition-colors">Annuler</button>
          <button onClick={handleSave} disabled={saving} className="bg-brand-500 hover:bg-brand-600 text-white font-bold py-2.5 px-6 rounded-xl flex items-center gap-2 shadow-lg shadow-brand-500/20 disabled:opacity-50 transition-all active:scale-95">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Enregistrer
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 text-slate-500 px-2 bg-slate-900/30 py-2 rounded-xl border border-slate-800/50">
          <Sparkles className="w-4 h-4 text-brand-400" />
          <p className="text-xs font-medium italic">Astuce : Double-cliquez pour insérer, cliquez sur un champ bleu pour le modifier.</p>
        </div>

        <div className="relative group">
          <div 
            ref={editorRef}
            contentEditable
            onClick={handleEditorClick}
            onDoubleClick={(e) => { if (e.target === editorRef.current) openInsertModal(); }}
            className="bg-white rounded-3xl p-16 shadow-2xl min-h-[800px] font-serif text-xl leading-relaxed text-slate-800 border border-slate-200 outline-none focus:ring-8 focus:ring-blue-500/5 transition-all prose prose-slate max-w-none shadow-black/20"
            style={{ whiteSpace: 'pre-wrap' }}
          />
        </div>
      </div>

      {configModal && (
        <FieldConfigModal 
          initialValue={configModal.initial}
          onConfirm={confirmField}
          onDelete={configModal.mode === 'edit' ? () => { configModal.target?.remove(); setConfigModal(null); } : undefined}
          onCancel={() => { setConfigModal(null); setSavedRange(null); }}
        />
      )}

      {error && <p className="text-sm text-red-400 bg-red-900/20 border border-red-900/30 rounded-2xl px-5 py-4 flex items-center gap-3 animate-shake"><X className="w-5 h-5 shrink-0" /> {error}</p>}

      <style jsx global>{`
        .var-badge {
          display: inline-flex;
          align-items: center;
          background: #eff6ff;
          color: #2563eb;
          border: 1px solid #bfdbfe;
          border-radius: 6px;
          padding: 0 8px;
          margin: 0 2px;
          font-family: system-ui, sans-serif;
          font-size: 14px;
          font-weight: 800;
          cursor: pointer;
          user-select: none;
          vertical-align: baseline;
          transition: all 0.2s;
          box-shadow: 0 1px 2px rgba(37, 99, 235, 0.1);
        }
        .var-badge:hover {
          background: #2563eb;
          color: white;
          border-color: #2563eb;
          transform: translateY(-1px);
          box-shadow: 0 4px 6px rgba(37, 99, 235, 0.2);
        }
        .var-badge::before { content: '['; opacity: 0.5; margin-right: 2px; }
        .var-badge::after { content: ']'; opacity: 0.5; margin-left: 2px; }
      `}</style>
    </div>
  );
}

// ── Carte prétention ──────────────────────────────────────────────────────────
function PretentionCard({
  pretention,
  onEdit,
}: {
  pretention: Pretention;
  onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card group overflow-hidden transition-all duration-300 hover:shadow-2xl hover:bg-slate-900 border-slate-800/50">
      <div className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <h3 className="font-bold text-white text-lg truncate group-hover:text-brand-400 transition-colors">
              {pretention.name}
            </h3>
            <div className="flex items-center gap-2">
              {pretention.category && (
                <span className="text-[9px] px-2.5 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 font-black uppercase tracking-widest">
                  {pretention.category}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onEdit} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-500 hover:text-white hover:border-brand-500/50 transition-all active:scale-90 shadow-sm">
              <Edit2 className="w-4 h-4" />
            </button>
            <button onClick={() => setExpanded(e => !e)} className={`p-2.5 rounded-xl border transition-all active:scale-90 shadow-sm ${expanded ? 'bg-brand-500 border-brand-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
        {expanded && (
          <div className="pt-6 space-y-4 border-t border-slate-800 animate-in slide-in-from-top-2 duration-300">
             <div 
              className="bg-white rounded-2xl p-10 font-serif text-base leading-relaxed text-slate-800 border border-slate-200 shadow-inner overflow-hidden max-h-[500px] overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: templateToHtml(pretention.template) }}
            />
          </div>
        )}
      </div>
      <style jsx global>{`
        .var-badge {
          display: inline-flex;
          background: #eff6ff;
          color: #2563eb;
          border: 1px solid #bfdbfe;
          border-radius: 4px;
          padding: 0 4px;
          margin: 0 2px;
          font-family: sans-serif;
          font-size: 0.85em;
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
export function PretentionsLibrary({ businessId }: PretentionsLibraryProps) {
  const [pretentions, setPretentions]   = useState<Pretention[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [editing, setEditing]           = useState<Partial<Pretention> | null>(null);
  const [showNew, setShowNew]           = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPretentions(businessId);
      setPretentions(data);
    } catch (e) {
      console.error('[PretentionsLibrary]', e);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = (saved: Pretention) => {
    setPretentions(prev => {
      const idx = prev.findIndex(p => p.id === saved.id);
      return idx >= 0 ? prev.map((p, i) => i === idx ? saved : p) : [saved, ...prev];
    });
    setEditing(null);
    setShowNew(false);
  };

  const filtered = pretentions.filter(p =>
    !search || [p.name, p.category ?? '', p.description ?? '', ...p.tags]
      .some(s => s.toLowerCase().includes(search.toLowerCase()))
  );

  const grouped = filtered.reduce<Record<string, Pretention[]>>((acc, p) => {
    const cat = p.category ?? 'Sans catégorie';
    (acc[cat] ??= []).push(p);
    return acc;
  }, {});

  if (showNew || editing) {
    return (
      <PretentionEditor
        initial={editing ?? undefined}
        businessId={businessId}
        onSave={handleSave}
        onCancel={() => { setEditing(null); setShowNew(false); }}
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">Bibliothèque de Modèles</h2>
          <p className="text-slate-500 text-sm mt-1 font-medium">Gérez vos lettres types et documents juridiques automatisés.</p>
        </div>
        <button onClick={() => setShowNew(true)} className="bg-brand-500 hover:bg-brand-600 text-white font-bold py-3 px-6 rounded-2xl flex items-center gap-2 shadow-xl shadow-brand-500/20 transition-all active:scale-95">
          <Plus className="w-5 h-5" /> Nouveau modèle
        </button>
      </div>

      <div className="relative group">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-brand-400 transition-colors" />
        <input className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-14 pr-6 py-4 text-base text-white placeholder-slate-600 focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500/50 transition-all shadow-inner" placeholder="Rechercher un document..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-brand-500" />
          <p className="text-slate-500 font-bold animate-pulse tracking-widest uppercase text-[10px]">Chargement...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card border-dashed border-slate-800 bg-transparent py-24 text-center space-y-6">
          <BookOpen className="w-12 h-12 text-slate-800 mx-auto" />
          <div className="space-y-2">
            <p className="text-slate-400 font-bold text-lg">Aucun modèle</p>
            <p className="text-slate-600 text-sm max-w-xs mx-auto font-medium">Commencez par créer votre premier modèle de lettre automatisée.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-12 pb-20">
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
            <div key={cat} className="space-y-6">
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] whitespace-nowrap">{cat}</span>
                <div className="h-px w-full bg-slate-800" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {items.map(p => (
                  <PretentionCard key={p.id} pretention={p} onEdit={() => setEditing(p)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
