'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert, LogIn, LogOut, AlertTriangle,
  RefreshCw, Eye, Lock, Wifi, ChevronDown, ChevronUp,
} from 'lucide-react';
import { getSecurityStats, type SecurityStats } from '@services/supabase/monitoring';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const EVENT_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  user_login:    { label: 'Connexions',          icon: LogIn,      color: 'text-status-success' },
  user_logout:   { label: 'Déconnexions',        icon: LogOut,     color: 'text-content-muted' },
  login_failed:  { label: 'Échecs de connexion', icon: AlertTriangle, color: 'text-status-error' },
};

export function SecurityTab() {
  const [stats, setStats]       = useState<SecurityStats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function loadData() {
    setRefreshing(true);
    try {
      setStats(await getSecurityStats());
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
      <p className="text-content-secondary text-sm font-medium">Analyse de sécurité en cours...</p>
    </div>
  );

  if (!stats) return (
    <div className="h-64 flex items-center justify-center">
      <p className="text-content-muted text-sm">Données indisponibles</p>
    </div>
  );

  const loginCount  = stats.login_events_24h.find(e => e.event_name === 'user_login')?.count  ?? 0;
  const failedCount = stats.login_events_24h.find(e => e.event_name === 'login_failed')?.count ?? 0;
  const logoutCount = stats.login_events_24h.find(e => e.event_name === 'user_logout')?.count  ?? 0;

  const threatLevel = stats.auth_failures_24h > 10 || stats.permission_denials_24h > 20
    ? 'high'
    : stats.auth_failures_24h > 3 || stats.permission_denials_24h > 5
    ? 'medium'
    : 'low';

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Niveau de menace global */}
        <div className={cn(
          'card p-6 border-2',
          threatLevel === 'high'   ? 'border-status-error/40 bg-badge-error/5' :
          threatLevel === 'medium' ? 'border-status-warning/40 bg-badge-warning/5' :
          'border-surface-border',
        )}>
          <div className="flex items-center justify-between mb-4">
            <div className={cn(
              'p-3 rounded-2xl',
              threatLevel === 'high'   ? 'bg-badge-error text-status-error' :
              threatLevel === 'medium' ? 'bg-badge-warning text-status-warning' :
              'bg-badge-success text-status-success',
            )}>
              <ShieldAlert size={22} />
            </div>
            <button onClick={loadData} className="text-content-muted hover:text-content-primary">
              <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} />
            </button>
          </div>
          <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Niveau de menace</p>
          <p className={cn(
            'text-2xl font-black mt-1',
            threatLevel === 'high'   ? 'text-status-error' :
            threatLevel === 'medium' ? 'text-status-warning' :
            'text-status-success',
          )}>
            {threatLevel === 'high' ? 'Élevé' : threatLevel === 'medium' ? 'Modéré' : 'Normal'}
          </p>
          <p className="text-[10px] text-content-muted font-bold uppercase tracking-tight mt-1">Dernières 24h</p>
        </div>

        {/* Auth failures */}
        <div className="card p-6 border-surface-border">
          <div className="flex items-center justify-between mb-4">
            <div className={cn('p-3 rounded-2xl', stats.auth_failures_24h > 5 ? 'bg-badge-error text-status-error' : 'bg-badge-success text-status-success')}>
              <Lock size={22} />
            </div>
          </div>
          <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Échecs auth (24h)</p>
          <p className={cn('text-2xl font-black mt-1', stats.auth_failures_24h > 5 ? 'text-status-error' : 'text-content-primary')}>
            {stats.auth_failures_24h}
          </p>
          <p className="text-[10px] text-content-muted font-bold uppercase tracking-tight mt-1">
            {failedCount > 0 ? `${failedCount} tentatives loggées` : 'Aucun échec'}
          </p>
        </div>

        {/* Permission denials */}
        <div className="card p-6 border-surface-border">
          <div className="flex items-center justify-between mb-4">
            <div className={cn('p-3 rounded-2xl', stats.permission_denials_24h > 10 ? 'bg-badge-warning text-status-warning' : 'bg-badge-info text-status-info')}>
              <Eye size={22} />
            </div>
          </div>
          <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Violations permission (24h)</p>
          <p className={cn('text-2xl font-black mt-1', stats.permission_denials_24h > 10 ? 'text-status-warning' : 'text-content-primary')}>
            {stats.permission_denials_24h}
          </p>
          <p className="text-[10px] text-content-muted font-bold uppercase tracking-tight mt-1">
            Requêtes HTTP 403
          </p>
        </div>

        {/* Sessions actives */}
        <div className="card p-6 border-surface-border">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl bg-badge-info text-status-info">
              <Wifi size={22} />
            </div>
          </div>
          <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Connexions (24h)</p>
          <p className="text-2xl font-black text-content-primary mt-1">{loginCount}</p>
          <p className="text-[10px] text-content-muted font-bold uppercase tracking-tight mt-1">
            {logoutCount} déconnexions
          </p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Colonne gauche : résumé + URLs sondées */}
        <div className="space-y-6">

          {/* Activité auth 24h */}
          <div>
            <h3 className="text-sm font-black text-content-primary uppercase tracking-widest mb-4 flex items-center gap-2">
              <LogIn size={16} className="text-content-brand" />
              Activité d'authentification (24h)
            </h3>
            <div className="card divide-y divide-surface-border border-surface-border overflow-hidden">
              {stats.login_events_24h.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-content-muted">Aucun événement</p>
                </div>
              ) : (
                stats.login_events_24h.map(({ event_name, count }) => {
                  const meta = EVENT_META[event_name];
                  const Icon = meta?.icon ?? AlertTriangle;
                  return (
                    <div key={event_name} className="p-4 flex items-center justify-between hover:bg-surface-hover">
                      <div className="flex items-center gap-3">
                        <Icon size={16} className={meta?.color ?? 'text-content-muted'} />
                        <p className="text-xs font-bold text-content-primary">{meta?.label ?? event_name}</p>
                      </div>
                      <span className={cn('text-sm font-black', meta?.color ?? 'text-content-primary')}>{count}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* URLs les plus sondées (403) */}
          {stats.top_probed_urls.length > 0 && (
            <div>
              <h3 className="text-sm font-black text-content-primary uppercase tracking-widest mb-4 flex items-center gap-2">
                <Eye size={16} className="text-content-brand" />
                URLs sondées (403)
              </h3>
              <div className="card divide-y divide-surface-border border-surface-border overflow-hidden">
                {stats.top_probed_urls.map(({ url, count }, i) => (
                  <div key={i} className="p-4 flex items-start gap-3 hover:bg-surface-hover">
                    <span className="text-[10px] font-black text-content-muted w-4 shrink-0 mt-0.5">{i + 1}</span>
                    <p className="text-[10px] font-mono text-content-secondary flex-1 break-all">{url}</p>
                    <span className={cn('text-xs font-black shrink-0', count > 5 ? 'text-status-warning' : 'text-content-primary')}>{count}×</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Businesses suspects */}
          {stats.suspicious_businesses.length > 0 && (
            <div>
              <h3 className="text-sm font-black text-content-primary uppercase tracking-widest mb-4 flex items-center gap-2">
                <AlertTriangle size={16} className="text-status-warning" />
                Activité anormale par business
              </h3>
              <div className="card divide-y divide-surface-border border-surface-border overflow-hidden">
                {stats.suspicious_businesses.map(({ name, error_count }, i) => (
                  <div key={i} className="p-4 flex items-center justify-between hover:bg-surface-hover">
                    <p className="text-xs font-bold text-content-primary">{name}</p>
                    <span className="text-sm font-black text-status-warning">{error_count} err.</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Colonne droite : détail des échecs auth */}
        <div className="lg:col-span-2 space-y-6">
          <h3 className="text-sm font-black text-content-primary uppercase tracking-widest flex items-center gap-2">
            <Lock size={16} className="text-content-brand" />
            Échecs d'authentification — détail
          </h3>

          <div className="card border-surface-border overflow-hidden">
            {stats.recent_auth_failures.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm text-status-success font-bold">Aucun échec d'authentification ✓</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-input border-b border-surface-border text-[10px] font-black text-content-muted uppercase tracking-widest">
                    <th className="px-4 py-3">Heure</th>
                    <th className="px-4 py-3">Raison</th>
                    <th className="px-4 py-3">Contexte</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {stats.recent_auth_failures.map((evt) => (
                    <React.Fragment key={evt.id}>
                      <tr
                        className={cn(
                          'hover:bg-surface-hover transition-colors cursor-pointer select-none',
                          expandedId === evt.id && 'bg-surface-hover',
                        )}
                        onClick={() => setExpandedId(expandedId === evt.id ? null : evt.id)}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="text-[11px] font-medium text-content-primary">
                            {format(new Date(evt.created_at), 'HH:mm:ss')}
                          </p>
                          <p className="text-[9px] text-content-muted">
                            {format(new Date(evt.created_at), 'dd MMM', { locale: fr })}
                          </p>
                        </td>
                        <td className="px-4 py-3 max-w-xs">
                          <p className="text-[11px] font-bold text-status-error truncate">{evt.message}</p>
                          {evt.business_name && (
                            <p className="text-[9px] text-content-muted">{evt.business_name}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-wrap gap-1">
                              {evt.context?.reason && (
                                <span className="text-[9px] bg-badge-error text-status-error px-1.5 py-0.5 rounded font-bold">
                                  {String(evt.context.reason).slice(0, 40)}
                                </span>
                              )}
                              {evt.context?.email_domain && (
                                <span className="text-[9px] bg-surface-input text-content-muted px-1.5 py-0.5 rounded font-mono">
                                  @{evt.context.email_domain}
                                </span>
                              )}
                            </div>
                            {expandedId === evt.id
                              ? <ChevronUp size={12} className="text-content-muted shrink-0" />
                              : <ChevronDown size={12} className="text-content-muted shrink-0" />
                            }
                          </div>
                        </td>
                      </tr>

                      {expandedId === evt.id && (
                        <tr>
                          <td colSpan={3} className="px-5 py-4 bg-surface-input border-b border-surface-border">
                            <div className="space-y-2">
                              <p className="text-[9px] font-black text-content-muted uppercase tracking-widest mb-1">Message</p>
                              <p className="text-xs font-medium text-status-error break-words">{evt.message}</p>
                              {evt.context && Object.keys(evt.context).length > 0 && (
                                <>
                                  <p className="text-[9px] font-black text-content-muted uppercase tracking-widest mt-2 mb-1">Contexte</p>
                                  <pre className="text-[10px] font-mono text-content-secondary bg-surface-card rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all border border-surface-border">
                                    {JSON.stringify(evt.context, null, 2)}
                                  </pre>
                                </>
                              )}
                              <p className="text-[10px] text-content-muted pt-1">
                                {format(new Date(evt.created_at), "dd MMM yyyy 'à' HH:mm:ss", { locale: fr })}
                              </p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
