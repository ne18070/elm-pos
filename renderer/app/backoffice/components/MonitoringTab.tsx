'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Loader2, AlertTriangle, TrendingUp, Users, Store, Clock } from 'lucide-react';
import { getBusinessMonitoring, type BusinessMonitorRow } from '@services/supabase/monitoring';

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

// ── Main component ────────────────────────────────────────────────────────────

export function MonitoringTab() {
  const [rows, setRows]     = useState<BusinessMonitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'trial' | 'expired' | 'expiring'>('all');

  async function load() {
    setLoading(true);
    try { setRows(await getBusinessMonitoring()); }
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
  const orders30d = rows.reduce((s, r) => s + r.orders_30d, 0);

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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={Store}         label="Total"              value={rows.length}  color="text-brand-400" />
        <StatCard icon={Users}         label="Actifs"             value={active}       color="text-green-400" />
        <StatCard icon={Clock}         label="Essai"              value={trial}        color="text-amber-400" />
        <StatCard icon={AlertTriangle} label="Expirés"            value={expired}      color="text-red-400" />
        <StatCard icon={TrendingUp}    label="Commandes (30j)"    value={orders30d}    color="text-purple-400"
          sub={`↗ ${expiring} expirent bientôt`} />
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
                  <th className="text-right px-4 py-3 font-medium">Cmd 30j</th>
                  <th className="text-left px-4 py-3 font-medium">Dernière cmd</th>
                  <th className="text-right px-4 py-3 font-medium">Membres</th>
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
                      <td className="px-4 py-3 text-right text-slate-300 font-medium">
                        {row.orders_30d > 0
                          ? <span className="text-green-400">{row.orders_30d}</span>
                          : <span className="text-slate-600">0</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{fmtDate(row.last_order_at)}</td>
                      <td className="px-4 py-3 text-right text-slate-400">{row.members_count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
