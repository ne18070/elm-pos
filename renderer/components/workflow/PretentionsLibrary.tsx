'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BookOpen, Plus, Search, Edit2, Trash2, Tag,
  ChevronDown, ChevronUp, Loader2, Save, X, FileText, Sparkles, Check, Settings2,
  Type, Bold, Italic, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, HelpCircle, Copy, ArrowLeft
} from 'lucide-react';
import { getPretentions, upsertPretention, deletePretention } from '@services/supabase/workflows';
import { ConfirmModal } from '@/components/ui/Modal';
import { useNotificationStore } from '@/store/notifications';
import { toUserError } from '@/lib/user-error';
import type { Pretention, PretentionVariable } from '@pos-types';

interface PretentionsLibraryProps {
  businessId: string;
}

// ── Variables Système (Guide) ────────────────────────────────────────────────
const SYSTEM_VARIABLES = [
  { group: 'Dossier', vars: [
    { key: 'reference', label: 'Référence Dossier', hint: 'DOS-2024-001' },
    { key: 'type_affaire', label: 'Type d\'affaire', hint: 'Civil, Commercial...' },
    { key: 'date_ouverture', label: 'Date d\'ouverture', hint: 'JJ/MM/AAAA' },
    { key: 'date_audience', label: 'Prochaine audience', hint: 'Date prévue' },
    { key: 'tribunal', label: 'Tribunal / Juridiction', hint: 'Ex: TGI Dakar' },
    { key: 'juge', label: 'Juge en charge', hint: 'Nom du magistrat' },
  ]},
  { group: 'Client', vars: [
    { key: 'client_name', label: 'Nom du Client', hint: 'Jean Dupont' },
    { key: 'client_type', label: 'Type de client', hint: 'Physique/Morale' },
    { key: 'client_id_num', label: 'RCCM / CNI', hint: 'Identifiant légal' },
    { key: 'client_rep', label: 'Représentant', hint: 'Si entreprise' },
    { key: 'client_phone', label: 'Téléphone', hint: '+221...' },
    { key: 'client_email', label: 'Email', hint: 'contact@...' },
  ]},
  { group: 'Adversaire', vars: [
    { key: 'adversaire', label: 'Nom de l\'adversaire', hint: 'Partie adverse' },
  ]},
];

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

// ── Barre d'outils de formatage ─────────────────────────────────────────────
function FormattingToolbar() {
  const exec = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
  };

  const btnCls = "p-2 rounded-lg hover:bg-slate-200 text-slate-600 transition-all active:scale-95";

  return (
    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm shrink-0">
      <button onClick={() => exec('bold')} className={btnCls} title="Gras"><Bold className="w-4 h-4" /></button>
      <button onClick={() => exec('italic')} className={btnCls} title="Italique"><Italic className="w-4 h-4" /></button>
      <div className="w-px h-4 bg-slate-200 mx-1" />
      <button onClick={() => exec('insertUnorderedList')} className={btnCls} title="Liste à puces"><List className="w-4 h-4" /></button>
      <button onClick={() => exec('insertOrderedList')} className={btnCls} title="Liste numérotée"><ListOrdered className="w-4 h-4" /></button>
      <div className="w-px h-4 bg-slate-200 mx-1" />
      <button onClick={() => exec('justifyLeft')} className={btnCls} title="Aligner à gauche"><AlignLeft className="w-4 h-4" /></button>
      <button onClick={() => exec('justifyCenter')} className={btnCls} title="Centrer"><AlignCenter className="w-4 h-4" /></button>
      <button onClick={() => exec('justifyRight')} className={btnCls} title="Aligner à droite"><AlignRight className="w-4 h-4" /></button>
    </div>
  );
}

// ── Sidebar de Guide des Variables ──────────────────────────────────────────
function VariableSidebar({ onInsert }: { onInsert: (key: string, label: string) => void }) {
  return (
    <div className="w-72 bg-slate-100 border-r border-slate-300 flex flex-col h-full overflow-hidden">
      <div className="p-6 border-b border-slate-300 bg-white">
        <h3 className="text-sm font-black text-blue-900 uppercase tracking-widest flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-700" /> Guide Variables
        </h3>
        <p className="text-[11px] font-bold text-slate-700 mt-2 leading-relaxed">
          Cliquez sur une variable pour l&apos;insérer dans votre document.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
        {SYSTEM_VARIABLES.map(group => (
          <div key={group.group} className="space-y-3">
            <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.2em] px-1">{group.group}</p>
            <div className="space-y-1.5">
              {group.vars.map(v => (
                <button
                  key={v.key}
                  onClick={() => onInsert(v.key, v.label)}
                  className="w-full text-left p-3.5 rounded-xl border-2 border-slate-200 hover:border-blue-600 hover:bg-white hover:shadow-md transition-all group bg-white/60"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold text-slate-900 group-hover:text-blue-900">{v.label}</span>
                    <Plus className="w-3.5 h-3.5 text-blue-700 opacity-0 group-hover:opacity-100 transition-all" />
                  </div>
                  <p className="text-[10px] font-black text-blue-800 mt-0.5 font-mono">{`{{${v.key}}}`}</p>
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="pt-4 border-t border-slate-200">
          <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] px-1 mb-2">Variables personnalisées</p>
          <button 
            onClick={() => onInsert('', '')}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:text-brand-600 hover:border-brand-500 transition-all text-[10px] font-black uppercase tracking-widest"
          >
            <Plus className="w-3.5 h-3.5" /> Créer un champ
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Éditeur "Smart Paper" V3 ──────────────────────────────────────────────────
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
  const [category, setCategory]     = useState(initial?.category ?? 'Général');
  const editorRef                   = useRef<HTMLDivElement>(null);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const [configModal, setConfigModal] = useState<{ mode: 'create' | 'edit', initial: string, target?: HTMLElement } | null>(null);
  const [savedRange, setSavedRange]   = useState<Range | null>(null);

  useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = templateToHtml(initial?.template ?? '');
    }
  }, [initial]);

  const insertVariable = (key: string, label: string) => {
    if (!key) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        setSavedRange(selection.getRangeAt(0).cloneRange());
      }
      setConfigModal({ mode: 'create', initial: '' });
      return;
    }

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
      editorRef.current.focus();
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      selection?.addRange(range);
      range.insertNode(badge);
    }
  };

  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('var-badge')) {
      setConfigModal({ 
        mode: 'edit', 
        initial: target.innerText, 
        target 
      });
    }
  };

  const confirmField = (displayName: string) => {
    if (!displayName.trim()) return;
    const key = displayName.trim().toLowerCase().replace(/\s+/g, '_');
    const label = displayName.trim();

    if (configModal?.mode === 'create') {
      insertVariable(key, label);
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
        category:    category.trim() || null,
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
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col animate-in fade-in duration-300">
      
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 p-4 flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center gap-4 flex-1 mr-8">
          <button onClick={onCancel} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-500" />
          </button>
          <div className="flex-1 max-w-md">
            <input 
              className="bg-white border border-slate-300 rounded-lg text-lg font-black !text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-full px-3 py-1.5 transition-all placeholder-slate-400"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nom du modèle (ex: Mise en demeure)"
            />
            <div className="flex items-center gap-2 mt-1.5 px-1">
              <Tag className="w-3 h-3 text-slate-500" />
              <input 
                className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest !text-slate-600 focus:ring-0 p-0 w-full placeholder-slate-400"
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="Catégorie (ex: Civil)"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-slate-500 hover:text-slate-800 font-bold text-sm transition-colors uppercase tracking-widest text-[10px]">Annuler</button>
          <button onClick={handleSave} disabled={saving} className="bg-brand-600 hover:bg-brand-700 text-white font-black py-2.5 px-8 rounded-xl flex items-center gap-2 shadow-lg shadow-brand-200 transition-all active:scale-95 disabled:opacity-50 text-[10px] uppercase tracking-widest">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Enregistrer le modèle
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* ── Sidebar Gauche (Variables) ── */}
        <VariableSidebar onInsert={insertVariable} />

        {/* ── Zone Centrale (Papier) ── */}
        <div className="flex-1 bg-slate-200/50 overflow-y-auto p-12 flex flex-col items-center gap-8 scrollbar-thin">
          
          <FormattingToolbar />

          <div className="relative group max-w-[800px] w-full">
            <div className="absolute -left-8 top-0 bottom-0 w-px bg-slate-300 border-dashed" />
            <div className="absolute -right-8 top-0 bottom-0 w-px bg-slate-300 border-dashed" />
            
            <div 
              ref={editorRef}
              contentEditable
              onInput={() => {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) setSavedRange(sel.getRangeAt(0).cloneRange());
              }}
              onClick={handleEditorClick}
              className="bg-white rounded-sm shadow-[0_0_50px_rgba(0,0,0,0.1)] p-20 min-h-[1100px] font-serif text-lg leading-relaxed text-slate-800 border border-white outline-none focus:ring-0 transition-all prose prose-slate max-w-none"
              style={{ whiteSpace: 'pre-wrap', minWidth: '800px' }}
            />

            <div className="mt-8 text-center opacity-30 pb-20">
              <p className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-500">Fin du document</p>
            </div>
          </div>
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

      {error && (
        <div className="fixed bottom-8 right-8 z-[100] animate-in slide-in-from-right-4 duration-300">
          <p className="text-sm text-white bg-red-600 shadow-2xl rounded-2xl px-6 py-4 flex items-center gap-3 font-bold border border-red-500">
            <X className="w-5 h-5 shrink-0" /> {error}
          </p>
        </div>
      )}

      <style jsx global>{`
        .var-badge {
          display: inline-flex;
          align-items: center;
          background: #1e3a8a;
          color: white;
          border: 1px solid #172554;
          border-radius: 4px;
          padding: 0 8px;
          margin: 0 1px;
          font-family: system-ui, sans-serif;
          font-size: 0.85em;
          font-weight: 900;
          cursor: pointer;
          user-select: none;
          vertical-align: baseline;
          transition: all 0.2s;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          text-transform: none;
        }
        .var-badge:hover {
          background: #1e40af;
          transform: translateY(-1.5px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        }
        .var-badge::before { content: '{{'; opacity: 1; margin-right: 2px; color: #93c5fd; }
        .var-badge::after { content: '}}'; opacity: 1; margin-left: 2px; color: #93c5fd; }
        
        [contenteditable] {
          caret-color: #3b82f6;
        }
        [contenteditable]:focus {
          outline: none;
        }
        .prose ul, .prose ol {
          padding-left: 1.5em;
          margin-bottom: 1em;
        }
        .prose li {
          margin-bottom: 0.25em;
        }
      `}</style>
    </div>
  );
}

// ── Carte prétention ──────────────────────────────────────────────────────────
function PretentionCard({
  pretention,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  pretention: Pretention;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
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
            <button 
              onClick={onDuplicate} 
              className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-500 hover:text-emerald-400 hover:border-emerald-500/50 transition-all active:scale-90 shadow-sm"
              title="Dupliquer ce modèle"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button 
              onClick={onEdit} 
              className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-500 hover:text-white hover:border-brand-500/50 transition-all active:scale-90 shadow-sm"
              title="Modifier"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button 
              onClick={onDelete} 
              className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-500 hover:text-red-400 hover:border-red-500/50 transition-all active:scale-90 shadow-sm"
              title="Supprimer"
            >
              <Trash2 className="w-4 h-4" />
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
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
export function PretentionsLibrary({ businessId }: PretentionsLibraryProps) {
  const [pretentions, setPretentions]   = useState<Pretention[]>([]);
  const [loading, setLoading]           = useState(true);

  const load = useCallback(async () => {
    if (!businessId) return;
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

  useEffect(() => {
    load();
  }, [load]);

  const [search, setSearch]             = useState('');
  const [editing, setEditing]           = useState<Partial<Pretention> | null>(null);
  const [showNew, setShowNew]           = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Pretention | null>(null);

  const { success, error: notifError } = useNotificationStore();

  const handleSave = (saved: Pretention) => {
    setPretentions(prev => {
      const idx = prev.findIndex(p => p.id === saved.id);
      return idx >= 0 ? prev.map((p, i) => i === idx ? saved : p) : [saved, ...prev];
    });
    setEditing(null);
    setShowNew(false);
  };

  const handleDuplicate = (p: Pretention) => {
    const copy = { ...p, id: undefined, name: `${p.name} (Copie)` };
    setEditing(copy);
  };

  const onDeleteConfirm = async () => {
    if (!confirmDelete) return;
    try {
      await deletePretention(confirmDelete.id);
      setPretentions(prev => prev.filter(p => p.id !== confirmDelete.id));
      success('Modèle supprimé');
    } catch (e) {
      notifError(String(e));
    } finally {
      setConfirmDelete(null);
    }
  };

  const filtered = pretentions.filter(p =>
    !search || [p.name, p.category ?? '', p.description ?? '', ...(p.tags ?? [])]
      .some(s => s && String(s).toLowerCase().includes(search.toLowerCase()))
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
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
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
        <div className="space-y-12">
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
            <div key={cat} className="space-y-6">
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] whitespace-nowrap">{cat}</span>
                <div className="h-px w-full bg-slate-800" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                {items.map(p => (
                  <PretentionCard 
                    key={p.id} 
                    pretention={p} 
                    onEdit={() => setEditing(p)} 
                    onDuplicate={() => handleDuplicate(p)}
                    onDelete={() => setConfirmDelete(p)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal 
          title="Supprimer ce modèle ?"
          message={`Voulez-vous vraiment supprimer "${confirmDelete.name}" ? Cette action est irréversible.`}
          confirmLabel="Supprimer"
          type="danger"
          onConfirm={onDeleteConfirm}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
