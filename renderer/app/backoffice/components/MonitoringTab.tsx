'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Loader2, AlertTriangle, TrendingUp, Users, Store, Clock, Package, ShoppingCart, Settings, X, ToggleLeft, ToggleRight } from 'lucide-react';
import { getBusinessMonitoring, updateBusinessConfig, type BusinessMonitorRow } from '@services/supabase/monitoring';
import { getAppModules, getAllBusinessTypes, type AppModule, type BusinessTypeRow } from '@services/supabase/business-config';

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
  allTypes:   BusinessTypeRow[];
  allModules: AppModule[];
  onClose:    () => void;
  onSaved:    (businessId: string, types: string[], features: string[]) => void;
}) {
  const [bizTypes, setBizTypes] = useState<string[]>(row.business_types);
  const [features, setFeatures] = useState<string[]>(row.features);
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState<string | null>(null);

  function toggleType(id: string) {
    setBizTypes((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
  }

  function toggleFeature(id: string) {
    setFeatures((prev) => prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]);
  }

  async function handleSave() {
    setSaving(true);
    setErr(null);
    try {
      await updateBusinessConfig(row.business_id, bizTypes, features);
      onSaved(row.business_id, bizTypes, features);
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
        {/* Header */}
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
          {/* Type multi-select */}
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
                    className={`p-3 rounded-xl border-2 text-left transition-all flex items-center gap-2 ${
                      active
                        ? 'border-brand-600 bg-brand-900/20'
                        : 'border-surface-border bg-surface-input/30 hover:border-slate-600'
                    }`}
                  >
                    {active
                      ? <ToggleRight className="w-4 h-4 text-brand-400 shrink-0" />
                      : <ToggleLeft  className="w-4 h-4 text-slate-600 shrink-0" />}
                    <p className={`text-sm font-medium ${active ? 'text-brand-300' : 'text-slate-300'}`}>
                      {t.label}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Module toggles */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Modules actifs</p>
            <div className="space-y-2">
              {allModules.map((m) => {
                const enabled = features.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleFeature(m.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                      enabled
                        ? 'border-brand-600 bg-brand-900/20'
                        : 'border-surface-border bg-surface-input/30 hover:border-slate-600'
                    }`}
                  >
                    {enabled
                      ? <ToggleRight className="w-6 h-6 text-brand-400 shrink-0" />
                      : <ToggleLeft  className="w-6 h-6 text-slate-600 shrink-0" />}
                    <div>
                      <p className={`text-sm font-medium ${enabled ? 'text-brand-300' : 'text-slate-400'}`}>
                        {m.label}
                      </p>
                      {m.description && (
                        <p className="text-xs text-slate-500">{m.description}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-4 border-t border-surface-border shrink-0">
          {err && <p className="text-xs text-red-400 flex-1">{err}</p>}
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className="btn-secondary text-sm">Annuler</button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MonitoringTab() {
  const [rows, setRows]           = useState<BusinessMonitorRow[]>([]);
  const [allModules, setModules]  = useState<AppModule[]>([]);
  const [allTypes, setTypes]      = useState<BusinessTypeRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filter, setFilter]       = useState<'all' | 'active' | 'trial' | 'expired' | 'expiring'>('all');
  const [configModal, setConfigModal] = useState<BusinessMonitorRow | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [data, mods, types] = await Promise.all([getBusinessMonitoring(), getAppModules(), getAllBusinessTypes()]);
      setRows(data);
      setModules(mods);
      setTypes(types);
    }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const active   = rows.filter((r) => effectiveStatus(r) === 'active').length;
  const trial    = rows.filter((r) => effectiveStatus(r) === 'trial').length;
  const expired  = rows.filter((r) => effectiveStatus(r) === 'expired').length;
  const expiring = rows.filter((r) => {
    const s = effectiveStatus(r);
    if (s === 'expired') return false;
    const expiry = r.status === 'trial' ? r.trial_ends_at : r.expires_at;
    const d = daysUntil(expiry);
    return d !== null && d >= 0 && d <= 7;
  }).length;
  const orders30d      = rows.reduce((s, r) => s + r.orders_30d, 0);
  const totalProducts  = rows.reduce((s, r) => s + r.products_count, 0);
  const totalOrders    = rows.reduce((s, r) => s + r.orders_total, 0);

  // ── Filtered rows ─────────────────────────────────────────────────────────

  const filtered = rows.filter((r) => {
    const st = effectiveStatus(r);
    if (filter === 'expiring') {
      const expiry = r.status === 'trial' ? r.trial_ends_at : r.expires_at;
      const d = daysUntil(expiry);
      if (d === null || d < 0 || d > 7) return false;
    } else if (filter !== 'all' && st !== filter) return false;

    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.business_name.toLowerCase().includes(q) ||
      (r.owner_email ?? '').toLowerCase().includes(q) ||
      (r.owner_name  ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">
          Monitoring — {rows.length} établissement{rows.length !== 1 ? 's' : ''}
        </h2>
        <button onClick={load} disabled={loading}
          className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Store}         label="Total"           value={rows.length}  color="text-brand-400" />
        <StatCard icon={Users}         label="Actifs"          value={active}       color="text-green-400" />
        <StatCard icon={Clock}         label="Essai"           value={trial}        color="text-amber-400" />
        <StatCard icon={AlertTriangle} label="Expirés"         value={expired}      color="text-red-400"
          sub={expiring > 0 ? `⚠ ${expiring} expirent bientôt` : undefined} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard icon={TrendingUp}   label="Commandes (30j)"  value={orders30d}     color="text-purple-400" />
        <StatCard icon={ShoppingCart} label="Commandes (total)" value={totalOrders}  color="text-cyan-400" />
        <StatCard icon={Package}      label="Produits actifs"   value={totalProducts} color="text-orange-400" />
      </div>

      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un établissement…"
          className="input flex-1 min-w-[200px] text-sm"
        />
        <div className="flex gap-1 bg-surface-input rounded-lg p-1">
          {(['all', 'active', 'trial', 'expired', 'expiring'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all
                ${filter === f ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              {f === 'all' ? 'Tous' : f === 'active' ? 'Actifs' : f === 'trial' ? 'Essai'
                : f === 'expired' ? 'Expirés' : '⚠ Expirent bientôt'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-slate-500 py-12">Aucun résultat</p>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-surface-border text-xs text-slate-400 uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">Établissement</th>
                  <th className="text-left px-4 py-3 font-medium">Propriétaire</th>
                  <th className="text-left px-4 py-3 font-medium">Statut</th>
                  <th className="text-left px-4 py-3 font-medium">Plan</th>
                  <th className="text-left px-4 py-3 font-medium">Expiration</th>
                  <th className="text-right px-4 py-3 font-medium">Produits</th>
                  <th className="text-right px-4 py-3 font-medium">Cmd total</th>
                  <th className="text-right px-4 py-3 font-medium">Cmd 30j</th>
                  <th className="text-left px-4 py-3 font-medium">Dernière cmd</th>
                  <th className="text-right px-4 py-3 font-medium">Membres</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.map((row) => {
                  const st = effectiveStatus(row);
                  const expiry = row.status === 'trial' ? row.trial_ends_at : row.expires_at;
                  const days   = daysUntil(expiry);
                  const expiringSoon = st !== 'expired' && days !== null && days >= 0 && days <= 7;

                  return (
                    <tr key={row.business_id}
                      className={`hover:bg-surface-input/50 transition-colors ${expiringSoon ? 'bg-amber-900/10' : ''}`}>
                      <td className="px-4 py-3 font-medium text-white">
                        {expiringSoon && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 inline mr-1.5 -mt-0.5" />}
                        {row.business_name}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        <div>{row.owner_name ?? '—'}</div>
                        <div className="text-xs text-slate-500">{row.owner_email ?? ''}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${STATUS_STYLE[st]}`}>
                          {STATUS_LABEL[st]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{row.plan_label ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={expiringSoon ? 'text-amber-400 font-medium' : 'text-slate-400'}>
                          {fmtDate(expiry)}
                          {expiringSoon && days !== null && (
                            <span className="ml-1 text-xs">({days}j)</span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400">
                        {row.products_count > 0
                          ? <span className="text-orange-400">{row.products_count}</span>
                          : <span className="text-slate-600">0</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400">
                        {row.orders_total > 0
                          ? <span className="text-cyan-400">{row.orders_total}</span>
                          : <span className="text-slate-600">0</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300 font-medium">
                        {row.orders_30d > 0
                          ? <span className="text-green-400">{row.orders_30d}</span>
                          : <span className="text-slate-600">0</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{fmtDate(row.last_order_at)}</td>
                      <td className="px-4 py-3 text-right text-slate-400">{row.members_count}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setConfigModal(row)}
                          title="Gérer type & modules"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-brand-400 hover:bg-brand-900/20 transition-colors"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-business config modal */}
      {configModal && (
        <BusinessConfigModal
          row={configModal}
          allTypes={allTypes}
          allModules={allModules}
          onClose={() => setConfigModal(null)}
          onSaved={(businessId, types, features) => {
            setRows((prev) => prev.map((r) =>
              r.business_id === businessId ? { ...r, business_types: types, features } : r
            ));
          }}
        />
      )}
    </div>
  );
}
