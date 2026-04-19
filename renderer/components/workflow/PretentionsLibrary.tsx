'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Plus, Search, Edit2, Trash2, Tag,
  ChevronDown, ChevronUp, Loader2, Save, X,
} from 'lucide-react';
import { getPretentions, upsertPretention } from '@services/supabase/workflows';
import type { Pretention, PretentionVariable, FieldType } from '@pos-types';

interface PretentionsLibraryProps {
  businessId: string;
}

const FIELD_TYPES: FieldType[] = ['text', 'number', 'date', 'select', 'textarea', 'boolean', 'phone', 'email'];

// ── Éditeur de prétention ─────────────────────────────────────────────────────
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
  const [category, setCategory]     = useState(initial?.category ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [template, setTemplate]     = useState(initial?.template ?? '');
  const [tags, setTags]             = useState((initial?.tags ?? []).join(', '));
  const [variables, setVariables]   = useState<PretentionVariable[]>(initial?.variables ?? []);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const addVariable = () => {
    setVariables(v => [...v, { key: '', label: '', type: 'text', required: false }]);
  };

  const updateVariable = (i: number, patch: Partial<PretentionVariable>) => {
    setVariables(v => v.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  };

  const removeVariable = (i: number) => {
    setVariables(v => v.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    if (!name.trim() || !template.trim()) {
      setError('Nom et modèle obligatoires');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await upsertPretention({
        ...(initial?.id ? { id: initial.id } : {}),
        business_id: businessId,
        name:        name.trim(),
        category:    category.trim() || null,
        description: description.trim() || null,
        template:    template.trim(),
        variables,
        tags:        tags.split(',').map(t => t.trim()).filter(Boolean),
        is_active:   true,
      } as Parameters<typeof upsertPretention>[0]);
      onSave(saved);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const base = 'w-full bg-surface-input border border-surface-border rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white text-sm">
          {initial?.id ? 'Modifier la prétention' : 'Nouvelle prétention'}
        </h3>
        <button onClick={onCancel} className="text-slate-500 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Nom *</label>
          <input className={base} value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Mise en demeure" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Catégorie</label>
          <input className={base} value={category} onChange={e => setCategory(e.target.value)} placeholder="Ex: Recouvrement" />
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Description</label>
        <input className={base} value={description} onChange={e => setDescription(e.target.value)} placeholder="Brève description…" />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Modèle * <span className="text-slate-600">(utilisez {"{{variable}}"} pour les champs dynamiques)</span></label>
        <textarea
          className={`${base} resize-y min-h-[160px] font-mono text-xs leading-relaxed`}
          value={template}
          onChange={e => setTemplate(e.target.value)}
          placeholder={"Madame, Monsieur,\n\nNous vous mettons en demeure de payer la somme de {{montant}} €…"}
        />
      </div>

      {/* Variables */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-slate-400 font-medium">Variables déclarées</label>
          <button onClick={addVariable} className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors">
            <Plus className="w-3 h-3" />
            Ajouter
          </button>
        </div>
        {variables.length === 0 && (
          <p className="text-xs text-slate-600 italic">Aucune variable déclarée.</p>
        )}
        {variables.map((v, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
            <input
              className={`${base} text-xs py-1.5`}
              value={v.key} placeholder="clé (ex: montant)"
              onChange={e => updateVariable(i, { key: e.target.value })}
            />
            <input
              className={`${base} text-xs py-1.5`}
              value={v.label} placeholder="libellé"
              onChange={e => updateVariable(i, { label: e.target.value })}
            />
            <select
              className={`${base} text-xs py-1.5`}
              value={v.type}
              onChange={e => updateVariable(i, { type: e.target.value as FieldType })}
            >
              {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button onClick={() => removeVariable(i)} className="text-slate-600 hover:text-red-400 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">Tags <span className="text-slate-600">(séparés par virgule)</span></label>
        <input className={base} value={tags} onChange={e => setTags(e.target.value)} placeholder="Ex: dette, loyer, commercial" />
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 text-sm py-2 px-4 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer
        </button>
        <button onClick={onCancel} className="btn-secondary text-sm py-2 px-4">Annuler</button>
      </div>
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
    <div className="card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-white text-sm truncate">{pretention.name}</p>
          {pretention.category && (
            <p className="text-xs text-brand-400">{pretention.category}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className="p-1.5 text-slate-500 hover:text-white transition-colors rounded">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setExpanded(e => !e)} className="p-1.5 text-slate-500 hover:text-white transition-colors rounded">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {pretention.description && (
        <p className="text-xs text-slate-500">{pretention.description}</p>
      )}

      {pretention.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {pretention.tags.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
              <Tag className="w-2.5 h-2.5" />{tag}
            </span>
          ))}
        </div>
      )}

      {expanded && (
        <div className="pt-2 space-y-2 border-t border-surface-border">
          <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono bg-slate-900 rounded-lg p-3 max-h-48 overflow-y-auto leading-relaxed">
            {pretention.template}
          </pre>
          {pretention.variables.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-slate-500 font-medium">Variables ({pretention.variables.length})</p>
              <div className="flex flex-wrap gap-1">
                {pretention.variables.map(v => (
                  <span key={v.key} className="text-[10px] px-2 py-0.5 rounded bg-brand-900/30 border border-brand-800 text-brand-300">
                    {`{{${v.key}}}`} · {v.type}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
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

  // Group by category
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
    <div className="space-y-4">

      {/* ── En-tête ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-brand-400" />
          <h2 className="font-semibold text-white">Bibliothèque de prétentions</h2>
          {!loading && (
            <span className="text-xs text-slate-500">({pretentions.length})</span>
          )}
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2 text-sm py-2 px-3">
          <Plus className="w-4 h-4" />
          Nouvelle
        </button>
      </div>

      {/* ── Recherche ── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          className="w-full bg-surface-input border border-surface-border rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder="Rechercher une prétention…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* ── Contenu ── */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <BookOpen className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-slate-500 text-sm">
            {search ? 'Aucun résultat' : 'Bibliothèque vide — créez votre première prétention'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
            <div key={cat} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{cat}</span>
                <span className="text-xs text-slate-600">({items.length})</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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
