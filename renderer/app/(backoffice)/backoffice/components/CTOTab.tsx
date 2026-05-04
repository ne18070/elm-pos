'use client';

import React, { useState, useEffect } from 'react';
import {
  Zap, AlertCircle, Database, Activity,
  RefreshCw, Bell, Clock, BarChart2,
} from 'lucide-react';
import { getCTOStats, type CTOStats } from '@services/supabase/monitoring';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const ALERT_LABELS: Record<string, { label: string; desc: string }> = {
  HIGH_ERROR_RATE:  { label: "Taux d'erreurs élevé",         desc: "Plus de X% des requêtes ont retourné une erreur sur la dernière heure." },
  SLOW_LATENCY:     { label: "Latence API critique",          desc: "Le temps de réponse médian dépasse le seuil acceptable." },
  DB_LOCK:          { label: "Verrou base de données",        desc: "Des transactions sont bloquées, risque de ralentissement global." },
  LOW_CACHE_HIT:    { label: "Cache DB dégradé",              desc: "Le taux de cache hit est anormalement bas, la DB est sur-sollicitée." },
  HIGH_CONNECTIONS: { label: "Connexions DB saturées",        desc: "Le pool de connexions approche ou dépasse sa limite." },
  FUNNEL_DROP:      { label: "Chute du funnel d'activation",  desc: "Le taux d'activation des trials a chuté en dessous du seuil." },
  SIGNUP_SPIKE:     { label: "Pic d'inscriptions",            desc: "Volume d'inscriptions anormalement élevé détecté." },
};

export function CTOTab() {
  const [stats, setStats]       = useState<CTOStats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    setRefreshing(true);
    try {
      setStats(await getCTOStats());
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
      <p className="text-content-secondary text-sm font-medium">Diagnostic technique en cours...</p>
    </div>
  );

  if (!stats) return (
    <div className="h-64 flex items-center justify-center">
      <p className="text-content-muted text-sm">Données indisponibles</p>
    </div>
  );

  const p50Color = stats.latency.p50 < 500 ? 'text-status-success' : stats.latency.p50 < 1500 ? 'text-status-warning' : 'text-status-error';
  const p95Color = stats.latency.p95 < 1000 ? 'text-status-success' : stats.latency.p95 < 2500 ? 'text-status-warning' : 'text-status-error';
  const errColor = stats.error_rate_1h < 2 ? 'text-status-success' : stats.error_rate_1h < 10 ? 'text-status-warning' : 'text-status-error';

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        <div className="card p-6 border-surface-border">
          <div className="flex items-center justify-between mb-4">
            <div className={cn('p-3 rounded-2xl', stats.latency.p50 < 500 ? 'bg-badge-success text-status-success' : 'bg-badge-warning text-status-warning')}>
              <Zap size={22} />
            </div>
            <button onClick={loadData} className="text-content-muted hover:text-content-primary">
              <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} />
            </button>
          </div>
          <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Latence P50 (API)</p>
          <p className={cn('text-2xl font-black mt-1', p50Color)}>
            {stats.latency.p50 > 0 ? `${stats.latency.p50}ms` : '—'}
          </p>
          <p className={cn('text-[10px] font-black uppercase tracking-tight mt-1', p95Color)}>
            P95 : {stats.latency.p95 > 0 ? `${stats.latency.p95}ms` : '—'}
          </p>
        </div>

        <div className="card p-6 border-surface-border">
          <div className="flex items-center justify-between mb-4">
            <div className={cn('p-3 rounded-2xl', stats.error_rate_1h < 2 ? 'bg-badge-success text-status-success' : 'bg-badge-error text-status-error')}>
              <AlertCircle size={22} />
            </div>
          </div>
          <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Taux Erreur (1h)</p>
          <p className={cn('text-2xl font-black mt-1', errColor)}>{stats.error_rate_1h}%</p>
          <p className="text-[10px] text-content-muted font-bold uppercase tracking-tight mt-1">
            {stats.total_errors_24h} err. / 24h
          </p>
        </div>

        <div className="card p-6 border-surface-border">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl bg-badge-info text-status-info">
              <Activity size={22} />
            </div>
          </div>
          <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Événements (24h)</p>
          <p className="text-2xl font-black text-content-primary mt-1">{stats.total_events_24h.toLocaleString()}</p>
          <p className="text-[10px] text-content-muted font-bold uppercase tracking-tight mt-1">Logs collectés</p>
        </div>

        <div className="card p-6 border-surface-border">
          <div className="flex items-center justify-between mb-4">
            <div className={cn(
              'p-3 rounded-2xl',
              stats.db_health?.cache_hit_ratio && stats.db_health.cache_hit_ratio >= 90
                ? 'bg-badge-success text-status-success'
                : 'bg-badge-warning text-status-warning',
            )}>
              <Database size={22} />
            </div>
          </div>
          <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Cache Hit DB</p>
          <p className="text-2xl font-black text-content-primary mt-1">
            {stats.db_health ? `${stats.db_health.cache_hit_ratio}%` : '—'}
          </p>
          <p className="text-[10px] text-content-muted font-bold uppercase tracking-tight mt-1">
            {stats.db_health ? `${stats.db_health.active_connections} conn. actives` : 'Non disponible'}
          </p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Erreurs par catégorie + Santé DB */}
        <div className="space-y-6">

          <div>
            <h3 className="text-sm font-black text-content-primary uppercase tracking-widest mb-4 flex items-center gap-2">
              <BarChart2 size={16} className="text-content-brand" />
              Erreurs par catégorie (24h)
            </h3>
            <div className="card divide-y divide-surface-border border-surface-border overflow-hidden">
              {Object.entries(stats.errors_by_category).length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-status-success font-bold">Aucune erreur ✓</p>
                </div>
              ) : (
                Object.entries(stats.errors_by_category)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cat, count]) => (
                    <div key={cat} className="p-4 flex items-center justify-between hover:bg-surface-hover">
                      <p className="text-xs font-black uppercase text-content-primary">{cat}</p>
                      <span className="text-sm font-bold text-status-error">{count}</span>
                    </div>
                  ))
              )}
            </div>
          </div>

          {stats.db_health && (
            <div>
              <h3 className="text-sm font-black text-content-primary uppercase tracking-widest mb-4 flex items-center gap-2">
                <Database size={16} className="text-content-brand" />
                Santé Base de Données
              </h3>
              <div className="card divide-y divide-surface-border border-surface-border overflow-hidden">
                {[
                  { label: 'Connexions actives', value: stats.db_health.active_connections, warn: false },
                  { label: 'Locks bloquants',    value: stats.db_health.blocked_locks,      warn: stats.db_health.blocked_locks > 0 },
                  { label: 'Cache hit ratio',    value: `${stats.db_health.cache_hit_ratio}%`, warn: false },
                  { label: 'Taille DB',          value: `${(stats.db_health.db_size_bytes / 1024 / 1024).toFixed(1)} MB`, warn: false },
                ].map(({ label, value, warn }) => (
                  <div key={label} className="p-4 flex items-center justify-between">
                    <p className="text-[11px] font-bold text-content-secondary">{label}</p>
                    <span className={cn('text-sm font-bold', warn ? 'text-status-warning' : 'text-content-primary')}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Top errors + Slow queries + Alert log */}
        <div className="lg:col-span-2 space-y-6">

          {stats.top_errors.length > 0 && (
            <div>
              <h3 className="text-sm font-black text-content-primary uppercase tracking-widest mb-4 flex items-center gap-2">
                <AlertCircle size={16} className="text-content-brand" />
                Erreurs les plus fréquentes (24h)
              </h3>
              <div className="card border-surface-border overflow-hidden">
                <div className="divide-y divide-surface-border">
                  {stats.top_errors.map(({ message, count }, i) => (
                    <div key={i} className="p-4 flex items-start gap-4 hover:bg-surface-hover">
                      <span className="text-[10px] font-black text-content-muted w-4 shrink-0 mt-0.5">{i + 1}</span>
                      <p className="text-[11px] font-medium text-status-error flex-1 break-words whitespace-pre-wrap">{message}</p>
                      <span className="text-xs font-black text-content-primary shrink-0 ml-2">{count}×</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {stats.slow_queries.length > 0 && (
            <div>
              <h3 className="text-sm font-black text-content-primary uppercase tracking-widest mb-4 flex items-center gap-2">
                <Clock size={16} className="text-content-brand" />
                Requêtes SQL lentes
              </h3>
              <div className="card border-surface-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-surface-input border-b border-surface-border text-[10px] font-black text-content-muted uppercase tracking-widest">
                        <th className="px-4 py-3">Requête</th>
                        <th className="px-4 py-3">Appels</th>
                        <th className="px-4 py-3">Moy. ms</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {stats.slow_queries.map((q, i) => (
                        <tr key={i} className="hover:bg-surface-hover">
                          <td className="px-4 py-3 max-w-xs">
                            <p className="text-[10px] font-mono text-content-secondary break-words whitespace-pre-wrap">{q.query_text}</p>
                          </td>
                          <td className="px-4 py-3 text-[11px] font-bold text-content-primary">{q.calls}</td>
                          <td className={cn('px-4 py-3 text-[11px] font-bold', q.mean_ms > 1000 ? 'text-status-error' : 'text-status-warning')}>
                            {q.mean_ms}ms
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-black text-content-primary uppercase tracking-widest mb-4 flex items-center gap-2">
              <Bell size={16} className="text-content-brand" />
              Journal des alertes
            </h3>
            <div className="card border-surface-border overflow-hidden">
              {stats.alert_log.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-status-success font-bold">Aucune alerte récente ✓</p>
                </div>
              ) : (
                <div className="divide-y divide-surface-border">
                  {stats.alert_log.map((a, i) => {
                    const meta = ALERT_LABELS[a.rule_code];
                    return (
                      <div key={i} className="p-4 hover:bg-surface-hover">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <AlertCircle size={12} className="text-status-warning shrink-0 mt-0.5" />
                              <p className="text-xs font-black text-content-primary">
                                {meta?.label ?? a.rule_code}
                              </p>
                            </div>
                            {meta?.desc && (
                              <p className="text-[10px] text-content-muted mt-0.5 ml-4">{meta.desc}</p>
                            )}
                            {a.value != null && (
                              <p className="text-[10px] text-status-warning font-bold mt-0.5 ml-4">
                                Valeur mesurée : {a.value}
                              </p>
                            )}
                            {!meta && (
                              <p className="text-[9px] font-mono text-content-muted mt-0.5 ml-4">{a.rule_code}</p>
                            )}
                          </div>
                          <p className="text-[10px] text-content-muted whitespace-nowrap shrink-0">
                            {format(new Date(a.fired_at), 'dd MMM HH:mm', { locale: fr })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
