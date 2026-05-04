'use client';

import React, { useState, useEffect } from 'react';
import {
  Activity, Zap, Terminal, ShieldAlert, TrendingUp,
  RefreshCw, Search, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  getTechnicalVitals, getRecentLogs, getConversionStats,
  type TechnicalVital, type TechnicalLog
} from '@services/supabase/monitoring';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

type LevelFilter = 'all' | 'error' | 'perf' | 'info';

const PAGE_SIZE = 20;

export function VitalsTab() {
  const [vitals, setVitals]       = useState<TechnicalVital[]>([]);
  const [logs, setRecentLogs]     = useState<TechnicalLog[]>([]);
  const [funnel, setFunnel]       = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]       = useState<LevelFilter>('all');
  const [search, setSearch]       = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage]           = useState(1);

  async function loadData() {
    setRefreshing(true);
    try {
      const [v, l, f] = await Promise.all([
        getTechnicalVitals(),
        getRecentLogs(100),
        getConversionStats(),
      ]);
      setVitals(v);
      setRecentLogs(l);
      setFunnel(f);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  if (loading) return (
    <div className="h-64 flex flex-col items-center justify-center gap-4">
      <RefreshCw className="w-8 h-8 animate-spin text-content-brand" />
      <p className="text-content-secondary text-sm font-medium">Diagnostic des systèmes en cours...</p>
    </div>
  );

  const totalErrors = vitals.reduce((acc, v) => acc + v.error_count, 0);

  const filteredLogs = logs
    .filter(log => filter === 'all' || log.level === filter)
    .filter(log =>
      !search ||
      (log.message  ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (log.category ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (log.url      ?? '').toLowerCase().includes(search.toLowerCase())
    );

  const totalPages  = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const safePage    = Math.min(page, totalPages);
  const pagedLogs   = filteredLogs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function applyFilter(f: LevelFilter) { setFilter(f); setPage(1); setExpandedId(null); }
  function applySearch(s: string)      { setSearch(s);  setPage(1); setExpandedId(null); }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        <div className={cn(
          'card p-6 border-2 transition-all',
          totalErrors > 50 ? 'border-status-error/30 bg-badge-error' : 'border-surface-border',
        )}>
          <div className="flex items-center justify-between mb-4">
            <div className={cn(
              'p-3 rounded-2xl',
              totalErrors > 50 ? 'bg-badge-error text-status-error' : 'bg-badge-success text-status-success',
            )}>
              <ShieldAlert size={24} />
            </div>
            <button onClick={loadData} className="text-content-muted hover:text-content-primary transition-colors">
              <RefreshCw size={16} className={cn(refreshing && 'animate-spin')} />
            </button>
          </div>
          <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Erreurs (24h)</p>
          <p className="text-3xl font-black text-content-primary mt-1">{totalErrors}</p>
          <div className="flex items-center gap-2 mt-2">
            <div className={cn('w-2 h-2 rounded-full animate-ping', totalErrors > 0 ? 'bg-status-error' : 'bg-status-success')} />
            <span className="text-[10px] font-bold uppercase tracking-tight text-content-secondary">
              {totalErrors > 50 ? 'Alerte : Seuil critique' : 'Système sous surveillance'}
            </span>
          </div>
        </div>

        <div className="card p-6 border-surface-border">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl bg-badge-info text-status-info">
              <Zap size={24} />
            </div>
          </div>
          <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Latence Moyenne API</p>
          {(() => {
            const apiVital = vitals.find(v => v.category === 'api');
            const avg = apiVital?.avg_latency ?? 0;
            return (
              <>
                <p className="text-3xl font-black text-content-primary mt-1">{avg > 0 ? `${avg}ms` : '—'}</p>
                <p className={cn(
                  'text-[10px] font-bold uppercase tracking-tight mt-2',
                  avg === 0 ? 'text-content-muted' : avg < 500 ? 'text-status-success' : avg < 1500 ? 'text-status-warning' : 'text-status-error',
                )}>
                  {avg === 0 ? 'Aucune donnée' : avg < 500 ? 'Optimal' : avg < 1500 ? 'Ralentissement' : 'Critique'}
                </p>
              </>
            );
          })()}
        </div>

        <div className="card p-6 border-surface-border">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl bg-badge-info text-status-info">
              <TrendingUp size={24} />
            </div>
          </div>
          <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Activation Trial</p>
          <p className="text-3xl font-black text-content-primary mt-1">
            {funnel ? Math.round((funnel.provisioning_success / (funnel.signup_started || 1)) * 100) : 0}%
          </p>
          <p className="text-[10px] font-bold uppercase tracking-tight text-content-secondary mt-2">Funnel Health (7j)</p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Breakdown par catégorie */}
        <div className="space-y-4">
          <h3 className="text-sm font-black text-content-primary uppercase tracking-widest flex items-center gap-2">
            <Activity size={16} className="text-content-brand" />
            Par Catégorie
          </h3>
          <div className="card divide-y divide-surface-border border-surface-border overflow-hidden">
            {vitals.length === 0 && (
              <div className="p-6 text-center text-sm text-content-muted">Aucune donnée</div>
            )}
            {vitals.map((v, i) => (
              <div
                key={i}
                className="p-4 flex items-center justify-between hover:bg-surface-hover transition-colors cursor-pointer"
                onClick={() => { applyFilter('all'); applySearch(v.category); }}
              >
                <div>
                  <p className="text-xs font-black uppercase text-content-primary">{v.category}</p>
                  <p className="text-[10px] text-content-muted">Dernières 24h</p>
                </div>
                <div className="text-right">
                  <p className={cn('text-sm font-bold', v.error_count > 0 ? 'text-status-error' : 'text-status-success')}>
                    {v.error_count} err.
                  </p>
                  <p className="text-[10px] text-content-muted">{v.avg_latency || 0}ms avg</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Flux de logs */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-sm font-black text-content-primary uppercase tracking-widest flex items-center gap-2">
              <Terminal size={16} className="text-content-brand" />
              Flux d'événements
            </h3>
            <span className="text-[10px] font-bold text-content-muted bg-surface-input px-2 py-1 rounded-md">
              LIVE · {filteredLogs.length} / {logs.length}
            </span>

          </div>

          {/* Barre de filtres */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-40">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
              <input
                value={search}
                onChange={e => applySearch(e.target.value)}
                placeholder="Filtrer par message, catégorie, URL..."
                className="w-full pl-8 pr-4 py-2 text-xs bg-surface-input border border-surface-border rounded-xl text-content-primary placeholder:text-content-muted focus:outline-none focus:border-brand-500/50"
              />
            </div>
            <div className="flex items-center gap-1 p-1 bg-surface-input border border-surface-border rounded-xl">
              {([
                { key: 'all',   label: 'Tous' },
                { key: 'error', label: 'Erreurs' },
                { key: 'perf',  label: 'Perf' },
                { key: 'info',  label: 'Info' },
              ] as { key: LevelFilter; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => applyFilter(key)}
                  className={cn(
                    'px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
                    filter === key
                      ? key === 'error' ? 'bg-badge-error text-status-error border border-status-error/30'
                        : key === 'perf' ? 'bg-badge-info text-status-info border border-status-info/30'
                        : 'bg-surface-card text-content-primary shadow-sm border border-surface-border'
                      : 'text-content-muted hover:text-content-secondary',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="card border-surface-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-input border-b border-surface-border text-[10px] font-black text-content-muted uppercase tracking-widest">
                    <th className="px-4 py-3 whitespace-nowrap">Heure</th>
                    <th className="px-4 py-3">Niveau</th>
                    <th className="px-4 py-3">Catégorie</th>
                    <th className="px-4 py-3">Message</th>
                    <th className="px-4 py-3">Business</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {pagedLogs.map((log) => (
                    <React.Fragment key={log.id}>
                      <tr
                        className={cn(
                          'hover:bg-surface-hover transition-colors cursor-pointer select-none',
                          expandedId === log.id && 'bg-surface-hover',
                        )}
                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="text-[11px] font-medium text-content-primary">
                            {format(new Date(log.created_at), 'HH:mm:ss')}
                          </p>
                          <p className="text-[9px] text-content-muted">
                            {format(new Date(log.created_at), 'dd MMM', { locale: fr })}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'text-[9px] font-black px-1.5 py-0.5 rounded uppercase',
                            log.level === 'error' ? 'bg-badge-error text-status-error' :
                            log.level === 'perf'  ? 'bg-badge-info text-status-info' :
                            log.level === 'warn'  ? 'bg-badge-warning text-status-warning' :
                            'bg-surface-input text-content-muted',
                          )}>
                            {log.level}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] font-bold text-content-secondary uppercase">
                            {log.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <p className={cn(
                            'text-[11px] font-bold truncate',
                            log.level === 'error' ? 'text-status-error' : 'text-content-primary',
                          )}>
                            {log.message}
                          </p>
                          {log.latency_ms != null && (
                            <p className="text-[9px] text-content-muted">{log.latency_ms}ms</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-medium text-content-secondary truncate w-20">
                              {log.business_name || 'System'}
                            </p>
                            {expandedId === log.id
                              ? <ChevronUp size={12} className="text-content-muted shrink-0" />
                              : <ChevronDown size={12} className="text-content-muted shrink-0" />
                            }
                          </div>
                        </td>
                      </tr>

                      {expandedId === log.id && (
                        <tr>
                          <td colSpan={5} className="px-5 py-4 bg-surface-input border-b border-surface-border">
                            <div className="space-y-3">

                              {/* Message complet */}
                              <div>
                                <p className="text-[9px] font-black text-content-muted uppercase tracking-widest mb-1">Message complet</p>
                                <p className={cn(
                                  'text-xs font-medium break-words whitespace-pre-wrap',
                                  log.level === 'error' ? 'text-status-error' : 'text-content-primary',
                                )}>
                                  {log.message || '—'}
                                </p>
                              </div>

                              {/* URL complète */}
                              {log.url && (
                                <div>
                                  <p className="text-[9px] font-black text-content-muted uppercase tracking-widest mb-1">URL</p>
                                  <p className="text-[11px] font-mono text-content-secondary break-all">{log.url}</p>
                                </div>
                              )}

                              {/* Contexte JSON */}
                              {log.context && Object.keys(log.context).length > 0 && (
                                <div>
                                  <p className="text-[9px] font-black text-content-muted uppercase tracking-widest mb-1">Contexte</p>
                                  <pre className="text-[10px] font-mono text-content-secondary bg-surface-card rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all border border-surface-border">
                                    {JSON.stringify(log.context, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {/* Méta */}
                              <div className="flex items-center gap-6 text-[10px] text-content-muted pt-1">
                                {log.business_name && (
                                  <span>Business : <strong className="text-content-secondary">{log.business_name}</strong></span>
                                )}
                                <span>{format(new Date(log.created_at), 'dd MMM yyyy à HH:mm:ss', { locale: fr })}</span>
                                {log.latency_ms != null && (
                                  <span>Latence : <strong className="text-content-secondary">{log.latency_ms}ms</strong></span>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredLogs.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm text-content-muted">
                  {search || filter !== 'all' ? 'Aucun résultat pour ce filtre' : 'Aucun log récent'}
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border bg-surface-input">
                <p className="text-[10px] font-bold text-content-muted">
                  {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredLogs.length)} sur {filteredLogs.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setPage(p => Math.max(1, p - 1)); setExpandedId(null); }}
                    disabled={safePage <= 1}
                    className="px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg border border-surface-border bg-surface-card text-content-secondary hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    ← Préc.
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                    .reduce<(number | '...')[]>((acc, p, i, arr) => {
                      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('...');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === '...'
                        ? <span key={`ellipsis-${i}`} className="px-2 text-[10px] text-content-muted">…</span>
                        : <button
                            key={p}
                            onClick={() => { setPage(p as number); setExpandedId(null); }}
                            className={cn(
                              'w-7 h-7 text-[10px] font-black rounded-lg border transition-all',
                              safePage === p
                                ? 'bg-surface-card border-surface-border text-content-primary shadow-sm'
                                : 'border-transparent text-content-muted hover:text-content-primary',
                            )}
                          >
                            {p}
                          </button>
                    )
                  }
                  <button
                    onClick={() => { setPage(p => Math.min(totalPages, p + 1)); setExpandedId(null); }}
                    disabled={safePage >= totalPages}
                    className="px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg border border-surface-border bg-surface-card text-content-secondary hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    Suiv. →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
