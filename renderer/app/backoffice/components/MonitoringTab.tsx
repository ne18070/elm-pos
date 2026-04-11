'use client';

import { useEffect, useState } from 'react';
import {
  RefreshCw, Loader2, AlertTriangle, TrendingUp, Users, Store, Clock,
  Package, ShoppingCart, Settings, X, ToggleLeft, ToggleRight, ChevronDown,
} from 'lucide-react';
import { getBusinessMonitoring, updateBusinessConfig, type BusinessMonitorRow } from '@services/supabase/monitoring';
import { getAppModules, getBusinessTypesWithModules, type AppModule, type BusinessTypeWithModules } from '@services/supabase/business-config';
import { cn } from '@/lib/utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

function effectiveStatus(row: BusinessMonitorRow): 'active' | 'trial' | 'expired' {
  const now = new Date();
  if (row.status === 'active' && row.expires_at && new Date(row.expires_at) < now) return 'expired';
  if (row.status === 'trial' && row.trial_ends_at && new Date(row.trial_ends_at) < now) return 'expired';
  return row.status as 'active' | 'trial' | 'expired';
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function fmtDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' });
}

const STATUS_STYLE: Record<string, string> = {
  active:  'text-green-400 bg-green-900/20 border-green-800',
  trial:   'text-amber-400 bg-amber-900/20 border-amber-800',
  expired: 'text-red-400 bg-red-900/20 border-red-800',
};
const STATUS_LABEL: Record<string, string> = { active: 'Actif', trial: 'Essai', expired: 'Expiré' };

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color = 'text-brand-400' }:
  { icon: React.ElementType; label: string; value: number; sub?: string; color?: string }) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className={`p-3 rounded-xl bg-surface-input ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-xs text-slate-400">{label}</p>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

// ── Business config modal ─────────────────────────────────────────────────────

function BusinessConfigModal({
  row,
  allTypes,
  allModules,
  onClose,
  onSaved,
}: {
  row:        BusinessMonitorRow;
  allTypes:   BusinessTypeWithModules[];
  allModules: AppModule[];
  onClose:    () => void;
  onSaved:    (businessId: string, types: string[], features: string[]) => void;
}) {
  const [bizTypes, setBizTypes]         = useState<string[]>(row.business_types);
  const [allowedModules, setAllowed]    = useState<string[]>(
    row.allowed_modules.length > 0 ? row.allowed_modules : row.features
  );
  const [saving, setSaving]             = useState(false);
  const [err, setErr]                   = useState<string | null>(null);

  function toggleType(id: string) {
    const wasSelected = bizTypes.includes(id);
    setBizTypes((prev) => wasSelected ? prev.filter((t) => t !== id) : [...prev, id]);
    if (!wasSelected) {
      const typeInfo = allTypes.find((t) => t.id === id);
      if (typeInfo) {
        const defaults = typeInfo.modules.filter((m) => m.is_default).map((m) => m.module_id);
        setAllowed((prev) => Array.from(new Set([...prev, ...defaults])));
      }
    }
  }

  function toggleModule(id: string) {
    setAllowed((prev) => prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]);
  }

  async function handleSave() {
    setSaving(true);
    setErr(null);
    try {
      await updateBusinessConfig(row.business_id, bizTypes, allowedModules);
      onSaved(row.business_id, bizTypes, allowedModules);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface-card rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-surface-border shrink-0">
          <div>
            <p className="text-white font-semibold">{row.business_name}</p>
            <p className="text-xs text-slate-400 mt-0.5">Type & modules</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* Types */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Types d&apos;établissement <span className="text-slate-600 font-normal normal-case">(plusieurs possibles)</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {allTypes.map((t) => {
                const active = bizTypes.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleType(t.id)}
                    className={cn(
                      'p-3 rounded-xl border-2 text-left transition-all flex items-center gap-2',
                      active ? 'border-brand-600 bg-brand-900/20' : 'border-surface-border bg-surface-input/30 hover:border-slate-600'
                    )}
                  >
                    {active
                      ? <ToggleRight className="w-4 h-4 text-brand-400 shrink-0" />
                      : <ToggleLeft  className="w-4 h-4 text-slate-600 shrink-0" />}
                    <p className={cn('text-sm font-medium', active ? 'text-brand-300' : 'text-slate-300')}>
                      {t.label}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Modules */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Modules disponibles pour ce store
              <span className="text-slate-600 font-normal normal-case ml-1">(le client verra uniquement ceux-ci)</span>
            </p>
            <div className="space-y-2">
              {allModules.map((m) => {
                const enabled = allowedModules.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleModule(m.id)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all',
                      enabled ? 'border-brand-600 bg-brand-900/20' : 'border-surface-border bg-surface-input/30 hover:border-slate-600'
                    )}
                  >
                    {enabled
                      ? <ToggleRight className="w-6 h-6 text-brand-400 shrink-0" />
                      : <ToggleLeft  className="w-6 h-6 text-slate-600 shrink-0" />}
                    <div>
                      <p className={cn('text-sm font-medium', enabled ? 'text-brand-300' : 'text-slate-400')}>{m.label}</p>
                      {m.description && <p className="text-xs text-slate-500">{m.description}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 p-4 border-t border-surface-border shrink-0">
          {err && <p className="text-xs text-red-400 flex-1">{err}</p>}
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className="btn-secondary text-sm">Annuler</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm disabled:opacity-50">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Owner group ───────────────────────────────────────────────────────────────

interface OwnerGroup {
  owner_id:    string | null;
  owner_name:  string | null;
  owner_email: string | null;
  plan_label:  string | null;
  status:      string;
  trial_ends_at: string | null;
  expires_at:  string | null;
  businesses:  BusinessMonitorRow[];
}

function groupByOwner(rows: BusinessMonitorRow[]): OwnerGroup[] {
  const map = new Map<string, OwnerGroup>();
  for (const row of rows) {
    const key = row.owner_id ?? row.business_id;
    if (!map.has(key)) {
      map.set(key, {
        owner_id:    row.owner_id,
        owner_name:  row.owner_name,
        owner_email: row.owner_email,
        plan_label:  row.plan_label,
        status:      row.status,
        trial_ends_at: row.trial_ends_at,
        expires_at:  row.expires_at,
        businesses:  [],
      });
    }
    map.get(key)!.businesses.push(row);
  }
  return Array.from(map.values());
}

function OwnerRow({
  group,
  allTypes,
  allModules,
  onConfigClick,
}: {
  group:         OwnerGroup;
  allTypes:      BusinessTypeWithModules[];
  allModules:    AppModule[];
  onConfigClick: (row: BusinessMonitorRow) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Status from first business (shared subscription per owner)
  const st = effectiveStatus(group.businesses[0]);
  const expiry = group.status === 'trial' ? group.trial_ends_at : group.expires_at;
  const days   = daysUntil(expiry);
  const expiringSoon = st !== 'expired' && days !== null && days >= 0 && days <= 7;

  const totalOrders30d = group.businesses.reduce((s, b) => s + b.orders_30d, 0);
  const totalProducts  = group.businesses.reduce((s, b) => s + b.products_count, 0);

  return (
    <div className={cn('rounded-xl border overflow-hidden transition-colors', expiringSoon ? 'border-amber-800 bg-amber-900/5' : 'border-surface-border bg-surface-card')}>
      {/* Owner header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-4 px-4 py-3 hover:bg-surface-hover transition-colors text-left"
      >
        {/* Expand icon */}
        <ChevronDown className={cn('w-4 h-4 text-slate-400 shrink-0 transition-transform', expanded && 'rotate-180')} />

        {/* Owner info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {expiringSoon && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 inline mr-1.5 -mt-0.5" />}
            {group.owner_name ?? '—'}
          </p>
          <p className="text-xs text-slate-500 truncate">{group.owner_email ?? ''}</p>
        </div>

        {/* Plan + status */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-400">{group.plan_label ?? '—'}</span>
          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs border', STATUS_STYLE[st])}>
            {STATUS_LABEL[st]}
          </span>
        </div>

        {/* Expiry */}
        <div className="hidden md:block text-xs shrink-0">
          <span className={expiringSoon ? 'text-amber-400 font-medium' : 'text-slate-500'}>
            {fmtDate(expiry)}
            {expiringSoon && days !== null && <span className="ml-1">({days}j)</span>}
          </span>
        </div>

        {/* Quick stats */}
        <div className="hidden lg:flex items-center gap-4 text-xs text-slate-500 shrink-0">
          <span><span className="text-orange-400 font-medium">{totalProducts}</span> produits</span>
          <span><span className="text-green-400 font-medium">{totalOrders30d}</span> cmd/30j</span>
          <span className="text-slate-600">{group.businesses.length} établ.</span>
        </div>
      </button>

      {/* Businesses list */}
      {expanded && (
        <div className="border-t border-surface-border divide-y divide-surface-border/50">
          {group.businesses.map((biz) => {
            const typeLabels = biz.business_types.length > 0
              ? biz.business_types.join(', ')
              : '—';
            return (
              <div key={biz.business_id} className="flex items-center gap-3 px-4 py-3 bg-surface-input/20 hover:bg-surface-input/40 transition-colors">
                {/* Indent */}
                <div className="w-4 shrink-0" />

                {/* Business name + type */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{biz.business_name}</p>
                  <p className="text-xs text-slate-500 truncate">{typeLabels}</p>
                </div>

                {/* Features tags */}
                <div className="hidden md:flex flex-wrap gap-1 max-w-[200px]">
                  {biz.features.length > 0
                    ? biz.features.slice(0, 3).map((f) => (
                        <span key={f} className="text-xs px-1.5 py-0.5 rounded bg-brand-900/30 text-brand-400 border border-brand-800">
                          {f}
                        </span>
                      ))
                    : <span className="text-xs text-slate-600 italic">aucune feature</span>}
                  {biz.features.length > 3 && (
                    <span className="text-xs text-slate-500">+{biz.features.length - 3}</span>
                  )}
                </div>

                {/* Stats */}
                <div className="hidden lg:flex items-center gap-4 text-xs text-slate-500 shrink-0">
                  <span><span className="text-orange-400">{biz.products_count}</span> prod.</span>
                  <span><span className="text-green-400">{biz.orders_30d}</span> cmd</span>
                  <span><span className="text-cyan-400">{biz.members_count}</span> mbr</span>
                </div>

                {/* Gear */}
                <button
                  onClick={() => onConfigClick(biz)}
                  title="Gérer type & modules"
                  className="p-1.5 rounded-lg text-slate-500 hover:text-brand-400 hover:bg-brand-900/20 transition-colors shrink-0"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MonitoringTab() {
  const [rows, setRows]           = useState<BusinessMonitorRow[]>([]);
  const [allModules, setModules]  = useState<AppModule[]>([]);
  const [allTypes, setTypes]      = useState<BusinessTypeWithModules[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filter, setFilter]       = useState<'all' | 'active' | 'trial' | 'expired' | 'expiring'>('all');
  const [configModal, setConfigModal] = useState<BusinessMonitorRow | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [data, mods, types] = await Promise.all([
        getBusinessMonitoring(),
        getAppModules(),
        getBusinessTypesWithModules(),
      ]);
      setRows(data);
      setModules(mods);
      setTypes(types);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const groups     = groupByOwner(rows);
  const active     = rows.filter((r) => effectiveStatus(r) === 'active').length;
  const trial      = rows.filter((r) => effectiveStatus(r) === 'trial').length;
  const expired    = rows.filter((r) => effectiveStatus(r) === 'expired').length;
  const expiring   = groups.filter((g) => {
    const st = effectiveStatus(g.businesses[0]);
    if (st === 'expired') return false;
    const expiry = g.status === 'trial' ? g.trial_ends_at : g.expires_at;
    const d = daysUntil(expiry);
    return d !== null && d >= 0 && d <= 7;
  }).length;
  const orders30d     = rows.reduce((s, r) => s + r.orders_30d, 0);
  const totalProducts = rows.reduce((s, r) => s + r.products_count, 0);
  const totalOrders   = rows.reduce((s, r) => s + r.orders_total, 0);

  // ── Filter groups ──────────────────────────────────────────────────────────
  const filteredGroups = groups.filter((g) => {
    const st = effectiveStatus(g.businesses[0]);
    if (filter === 'expiring') {
      const expiry = g.status === 'trial' ? g.trial_ends_at : g.expires_at;
      const d = daysUntil(expiry);
      if (d === null || d < 0 || d > 7) return false;
    } else if (filter !== 'all' && st !== filter) return false;

    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (g.owner_name  ?? '').toLowerCase().includes(q) ||
      (g.owner_email ?? '').toLowerCase().includes(q) ||
      g.businesses.some((b) => b.business_name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">
          Monitoring — {groups.length} compte{groups.length !== 1 ? 's' : ''} · {rows.length} établissement{rows.length !== 1 ? 's' : ''}
        </h2>
        <button onClick={load} disabled={loading}
          className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          Actualiser
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Store}         label="Établissements"  value={rows.length}  color="text-brand-400" />
        <StatCard icon={Users}         label="Actifs"          value={active}       color="text-green-400" />
        <StatCard icon={Clock}         label="Essai"           value={trial}        color="text-amber-400" />
        <StatCard icon={AlertTriangle} label="Expirés"         value={expired}      color="text-red-400"
          sub={expiring > 0 ? `⚠ ${expiring} expirent bientôt` : undefined} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard icon={TrendingUp}   label="Commandes (30j)"   value={orders30d}     color="text-purple-400" />
        <StatCard icon={ShoppingCart} label="Commandes (total)"  value={totalOrders}   color="text-cyan-400" />
        <StatCard icon={Package}      label="Produits actifs"    value={totalProducts} color="text-orange-400" />
      </div>

      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un propriétaire ou établissement…"
          className="input flex-1 min-w-[200px] text-sm"
        />
        <div className="flex gap-1 bg-surface-input rounded-lg p-1">
          {(['all', 'active', 'trial', 'expired', 'expiring'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                filter === f ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white')}>
              {f === 'all' ? 'Tous' : f === 'active' ? 'Actifs' : f === 'trial' ? 'Essai'
                : f === 'expired' ? 'Expirés' : '⚠ Expirent bientôt'}
            </button>
          ))}
        </div>
      </div>

      {/* Owner groups */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
        </div>
      ) : filteredGroups.length === 0 ? (
        <p className="text-center text-slate-500 py-12">Aucun résultat</p>
      ) : (
        <div className="space-y-2">
          {filteredGroups.map((group) => (
            <OwnerRow
              key={group.owner_id ?? group.businesses[0].business_id}
              group={group}
              allTypes={allTypes}
              allModules={allModules}
              onConfigClick={setConfigModal}
            />
          ))}
        </div>
      )}

      {/* Config modal */}
      {configModal && (
        <BusinessConfigModal
          row={configModal}
          allTypes={allTypes}
          allModules={allModules}
          onClose={() => setConfigModal(null)}
          onSaved={(businessId, types, allowedModules) => {
            setRows((prev) => prev.map((r) =>
              r.business_id === businessId ? { ...r, business_types: types, allowed_modules: allowedModules } : r
            ));
          }}
        />
      )}
    </div>
  );
}
