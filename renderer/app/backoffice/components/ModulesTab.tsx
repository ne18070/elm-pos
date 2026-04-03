'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Check, ToggleLeft, ToggleRight, Grid3X3, Package, Layers } from 'lucide-react';
import {
  getAllBusinessTypes, getAllAppModules, getTypeModules,
  upsertBusinessType, upsertAppModule, setTypeModules,
  deleteBusinessType, deleteAppModule,
  type BusinessTypeRow, type AppModule, type TypeModule,
} from '@services/supabase/business-config';

type SubTab = 'types' | 'modules' | 'matrix';

const ACCENT_OPTIONS = [
  { value: 'brand',  label: 'Bleu (défaut)', cls: 'bg-brand-600' },
  { value: 'orange', label: 'Orange',         cls: 'bg-orange-500' },
  { value: 'purple', label: 'Violet',         cls: 'bg-purple-500' },
  { value: 'teal',   label: 'Sarcelle',       cls: 'bg-teal-500' },
  { value: 'red',    label: 'Rouge',          cls: 'bg-red-500' },
  { value: 'green',  label: 'Vert',           cls: 'bg-green-500' },
];

export function ModulesTab() {
  const [subTab, setSubTab] = useState<SubTab>('types');
  const [types,   setTypes]   = useState<BusinessTypeRow[]>([]);
  const [modules, setModules] = useState<AppModule[]>([]);
  const [links,   setLinks]   = useState<TypeModule[]>([]);
  const [loading, setLoading] = useState(true);

  // Type form state
  const [editingType, setEditingType] = useState<Partial<BusinessTypeRow> | null>(null);
  const [savingType, setSavingType]   = useState(false);

  // Module form state
  const [editingModule, setEditingModule] = useState<Partial<AppModule> | null>(null);
  const [savingModule, setSavingModule]   = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [t, m, l] = await Promise.all([getAllBusinessTypes(), getAllAppModules(), getTypeModules()]);
      setTypes(t); setModules(m); setLinks(l);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Matrix helpers
  function isLinked(typeId: string, moduleId: string) {
    return links.some((l) => l.business_type_id === typeId && l.module_id === moduleId);
  }
  function isDefault(typeId: string, moduleId: string) {
    return links.some((l) => l.business_type_id === typeId && l.module_id === moduleId && l.is_default);
  }

  async function toggleLink(typeId: string, moduleId: string) {
    const linked = isLinked(typeId, moduleId);
    let newLinks: TypeModule[];
    if (linked) {
      newLinks = links.filter((l) => !(l.business_type_id === typeId && l.module_id === moduleId));
    } else {
      newLinks = [...links, { business_type_id: typeId, module_id: moduleId, is_default: true }];
    }
    setLinks(newLinks);
    await setTypeModules(typeId, newLinks.filter((l) => l.business_type_id === typeId).map((l) => ({
      module_id: l.module_id, is_default: l.is_default,
    })));
  }

  async function toggleDefault(typeId: string, moduleId: string) {
    const newLinks = links.map((l) =>
      l.business_type_id === typeId && l.module_id === moduleId
        ? { ...l, is_default: !l.is_default }
        : l
    );
    setLinks(newLinks);
    await setTypeModules(typeId, newLinks.filter((l) => l.business_type_id === typeId).map((l) => ({
      module_id: l.module_id, is_default: l.is_default,
    })));
  }

  // ── Quick toggle active ──
  async function toggleTypeActive(t: BusinessTypeRow) {
    await upsertBusinessType({ ...t, is_active: !t.is_active });
    setTypes((prev) => prev.map((x) => x.id === t.id ? { ...x, is_active: !x.is_active } : x));
  }

  async function toggleModuleActive(m: AppModule) {
    await upsertAppModule({ ...m, is_active: !m.is_active });
    setModules((prev) => prev.map((x) => x.id === m.id ? { ...x, is_active: !x.is_active } : x));
  }

  // ── Save type ──
  async function saveType() {
    if (!editingType?.id || !editingType.label) return;
    setSavingType(true);
    try {
      await upsertBusinessType({
        id:           editingType.id,
        label:        editingType.label!,
        description:  editingType.description ?? null,
        icon:         editingType.icon ?? 'ShoppingBag',
        accent_color: editingType.accent_color ?? 'brand',
        is_active:    editingType.is_active ?? true,
        sort_order:   editingType.sort_order ?? 0,
      });
      setEditingType(null);
      await load();
    } finally {
      setSavingType(false);
    }
  }

  // ── Save module ──
  async function saveModule() {
    if (!editingModule?.id || !editingModule.label) return;
    setSavingModule(true);
    try {
      await upsertAppModule({
        id:          editingModule.id,
        label:       editingModule.label!,
        description: editingModule.description ?? null,
        icon:        editingModule.icon ?? 'Package',
        is_core:     editingModule.is_core ?? false,
        is_active:   editingModule.is_active ?? true,
        sort_order:  editingModule.sort_order ?? 0,
      });
      setEditingModule(null);
      await load();
    } finally {
      setSavingModule(false);
    }
  }

  if (loading) return <div className="text-slate-400 py-8 text-center">Chargement…</div>;

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-surface-input rounded-xl p-1 w-fit">
        {([['types', "Types d'établissement", Layers], ['modules', 'Modules', Package], ['matrix', 'Matrice', Grid3X3]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setSubTab(id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${subTab === id ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ── Types tab ── */}
      {subTab === 'types' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-white font-semibold">Types d&apos;établissement ({types.length})</h3>
            <button onClick={() => setEditingType({ is_active: true, sort_order: types.length, accent_color: 'brand', icon: 'ShoppingBag' })}
              className="btn-primary flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" />Nouveau type
            </button>
          </div>

          {/* Inline form */}
          {editingType && (
            <div className="bg-surface-input rounded-xl p-4 border border-brand-600 space-y-3">
              <h4 className="text-sm font-semibold text-white">{editingType.id && types.find(t => t.id === editingType.id) ? 'Modifier' : 'Nouveau'} type</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">ID (slug)</label>
                  <input className="input" value={editingType.id ?? ''} readOnly={!!types.find(t => t.id === editingType.id)}
                    onChange={(e) => setEditingType((p) => ({ ...p, id: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                    placeholder="ex: retail, restaurant" />
                </div>
                <div>
                  <label className="label">Libellé</label>
                  <input className="input" value={editingType.label ?? ''} onChange={(e) => setEditingType((p) => ({ ...p, label: e.target.value }))} placeholder="Ex: Commerce / Boutique" />
                </div>
                <div className="col-span-2">
                  <label className="label">Description</label>
                  <input className="input" value={editingType.description ?? ''} onChange={(e) => setEditingType((p) => ({ ...p, description: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Icône (Lucide)</label>
                  <input className="input" value={editingType.icon ?? ''} onChange={(e) => setEditingType((p) => ({ ...p, icon: e.target.value }))} placeholder="ShoppingBag" />
                </div>
                <div>
                  <label className="label">Couleur accent</label>
                  <select className="input" value={editingType.accent_color ?? 'brand'} onChange={(e) => setEditingType((p) => ({ ...p, accent_color: e.target.value }))}>
                    {ACCENT_OPTIONS.map((o) => <option key={o.value} value={o.value} className="bg-gray-900 text-white">{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Ordre</label>
                  <input type="number" className="input" value={editingType.sort_order ?? 0} onChange={(e) => setEditingType((p) => ({ ...p, sort_order: parseInt(e.target.value) }))} />
                </div>
                <div className="flex items-end pb-1">
                  <button onClick={() => setEditingType((p) => ({ ...p, is_active: !p?.is_active }))} className="flex items-center gap-2 text-sm text-slate-300">
                    {editingType.is_active ? <ToggleRight className="w-5 h-5 text-brand-400" /> : <ToggleLeft className="w-5 h-5 text-slate-500" />}
                    Actif
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditingType(null)} className="btn-secondary text-sm">Annuler</button>
                <button onClick={saveType} disabled={savingType || !editingType.id || !editingType.label} className="btn-primary text-sm flex items-center gap-2">
                  <Check className="w-4 h-4" />{savingType ? 'Sauvegarde…' : 'Sauvegarder'}
                </button>
              </div>
            </div>
          )}

          <div className="bg-surface-card rounded-xl border border-surface-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-surface-border">
                <tr className="text-slate-400 text-left">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Libellé</th>
                  <th className="px-4 py-3">Icône</th>
                  <th className="px-4 py-3">Couleur</th>
                  <th className="px-4 py-3">Ordre</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {types.map((t) => (
                  <tr key={t.id} className="hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{t.id}</td>
                    <td className="px-4 py-3 text-white font-medium">{t.label}</td>
                    <td className="px-4 py-3 text-slate-400">{t.icon}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${ACCENT_OPTIONS.find(o => o.value === t.accent_color)?.cls ?? 'bg-gray-500'}`} />
                        <span className="text-xs text-slate-400">{t.accent_color}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{t.sort_order}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleTypeActive(t)} className="flex items-center gap-1.5 transition-colors">
                        {t.is_active
                          ? <ToggleRight className="w-5 h-5 text-green-400" />
                          : <ToggleLeft  className="w-5 h-5 text-slate-600" />}
                        <span className={`text-xs ${t.is_active ? 'text-green-400' : 'text-slate-500'}`}>
                          {t.is_active ? 'Actif' : 'Inactif'}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => setEditingType(t)} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-surface-input transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={async () => { if (confirm(`Supprimer "${t.label}" ?`)) { await deleteBusinessType(t.id); load(); } }}
                          className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-red-900/20 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modules tab ── */}
      {subTab === 'modules' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-white font-semibold">Modules disponibles ({modules.length})</h3>
            <button onClick={() => setEditingModule({ is_active: true, is_core: false, sort_order: modules.length, icon: 'Package' })}
              className="btn-primary flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" />Nouveau module
            </button>
          </div>

          {editingModule && (
            <div className="bg-surface-input rounded-xl p-4 border border-brand-600 space-y-3">
              <h4 className="text-sm font-semibold text-white">{editingModule.id && modules.find(m => m.id === editingModule.id) ? 'Modifier' : 'Nouveau'} module</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">ID (slug)</label>
                  <input className="input" value={editingModule.id ?? ''} readOnly={!!modules.find(m => m.id === editingModule.id)}
                    onChange={(e) => setEditingModule((p) => ({ ...p, id: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                    placeholder="ex: stock, livraison" />
                </div>
                <div>
                  <label className="label">Libellé</label>
                  <input className="input" value={editingModule.label ?? ''} onChange={(e) => setEditingModule((p) => ({ ...p, label: e.target.value }))} placeholder="Ex: Gestion de stock" />
                </div>
                <div className="col-span-2">
                  <label className="label">Description</label>
                  <input className="input" value={editingModule.description ?? ''} onChange={(e) => setEditingModule((p) => ({ ...p, description: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Icône (Lucide)</label>
                  <input className="input" value={editingModule.icon ?? ''} onChange={(e) => setEditingModule((p) => ({ ...p, icon: e.target.value }))} placeholder="Package" />
                </div>
                <div>
                  <label className="label">Ordre</label>
                  <input type="number" className="input" value={editingModule.sort_order ?? 0} onChange={(e) => setEditingModule((p) => ({ ...p, sort_order: parseInt(e.target.value) }))} />
                </div>
                <div className="flex items-end gap-4 pb-1">
                  <button onClick={() => setEditingModule((p) => ({ ...p, is_core: !p?.is_core }))} className="flex items-center gap-2 text-sm text-slate-300">
                    {editingModule.is_core ? <ToggleRight className="w-5 h-5 text-brand-400" /> : <ToggleLeft className="w-5 h-5 text-slate-500" />}
                    Cœur (non désactivable)
                  </button>
                  <button onClick={() => setEditingModule((p) => ({ ...p, is_active: !p?.is_active }))} className="flex items-center gap-2 text-sm text-slate-300">
                    {editingModule.is_active ? <ToggleRight className="w-5 h-5 text-brand-400" /> : <ToggleLeft className="w-5 h-5 text-slate-500" />}
                    Actif
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditingModule(null)} className="btn-secondary text-sm">Annuler</button>
                <button onClick={saveModule} disabled={savingModule || !editingModule.id || !editingModule.label} className="btn-primary text-sm flex items-center gap-2">
                  <Check className="w-4 h-4" />{savingModule ? 'Sauvegarde…' : 'Sauvegarder'}
                </button>
              </div>
            </div>
          )}

          <div className="bg-surface-card rounded-xl border border-surface-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-surface-border">
                <tr className="text-slate-400 text-left">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Libellé</th>
                  <th className="px-4 py-3">Icône</th>
                  <th className="px-4 py-3">Cœur</th>
                  <th className="px-4 py-3">Ordre</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {modules.map((m) => (
                  <tr key={m.id} className="hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{m.id}</td>
                    <td className="px-4 py-3 text-white font-medium">{m.label}</td>
                    <td className="px-4 py-3 text-slate-400">{m.icon}</td>
                    <td className="px-4 py-3">
                      {m.is_core && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900/30 text-purple-400">Core</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{m.sort_order}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleModuleActive(m)} className="flex items-center gap-1.5 transition-colors">
                        {m.is_active
                          ? <ToggleRight className="w-5 h-5 text-green-400" />
                          : <ToggleLeft  className="w-5 h-5 text-slate-600" />}
                        <span className={`text-xs ${m.is_active ? 'text-green-400' : 'text-slate-500'}`}>
                          {m.is_active ? 'Actif' : 'Inactif'}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => setEditingModule(m)} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-surface-input transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {!m.is_core && (
                          <button onClick={async () => { if (confirm(`Supprimer "${m.label}" ?`)) { await deleteAppModule(m.id); load(); } }}
                            className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-red-900/20 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Matrix tab ── */}
      {subTab === 'matrix' && (
        <div className="space-y-3">
          <div>
            <h3 className="text-white font-semibold mb-1">Matrice modules × types</h3>
            <p className="text-xs text-slate-500">✓ = inclus · ★ = activé par défaut pour les nouvelles boutiques</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium bg-surface-input rounded-tl-xl">Module</th>
                  {types.map((t) => (
                    <th key={t.id} className={`px-3 py-3 text-center font-medium bg-surface-input whitespace-nowrap ${t.is_active ? 'text-slate-300' : 'text-slate-600 line-through'}`}>
                      {t.label}
                      {!t.is_active && <span className="block text-[10px] text-red-500 no-underline normal-case font-normal">inactif</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {modules.map((m) => (
                  <tr key={m.id} className="hover:bg-surface-hover/30 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-white text-sm">{m.label}</p>
                        <p className="font-mono text-xs text-slate-500">{m.id}</p>
                      </div>
                    </td>
                    {types.map((t) => {
                      const linked = isLinked(t.id, m.id);
                      const def    = isDefault(t.id, m.id);
                      return (
                        <td key={t.id} className="px-3 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <button
                              onClick={() => toggleLink(t.id, m.id)}
                              title={linked ? 'Retirer ce module' : 'Ajouter ce module'}
                              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                                linked ? 'bg-brand-600 text-white' : 'bg-surface-input text-slate-600 hover:text-slate-400'
                              }`}>
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            {linked && (
                              <button
                                onClick={() => toggleDefault(t.id, m.id)}
                                title={def ? 'Désactiver par défaut' : 'Activer par défaut'}
                                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                                  def ? 'bg-amber-900/40 text-amber-400 border border-amber-700' : 'bg-surface-input text-slate-600 hover:text-slate-400'
                                }`}>
                                {def ? '★ défaut' : '☆ optionnel'}
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
