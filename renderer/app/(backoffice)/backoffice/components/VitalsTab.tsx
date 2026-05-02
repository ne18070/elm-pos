'use client';

import React, { useState, useEffect } from 'react';
import { 
  AlertCircle, Activity, Zap, Clock, 
  Terminal, ShieldAlert, TrendingUp, RefreshCw,
  Search, ExternalLink, Filter
} from 'lucide-react';
import { 
  getTechnicalVitals, getRecentLogs, getConversionStats,
  type TechnicalVital, type TechnicalLog 
} from '@services/supabase/monitoring';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export function VitalsTab() {
  const [vitals, setVitals] = useState<TechnicalVital[]>([]);
  const [logs, setRecentLogs] = useState<TechnicalLog[]>([]);
  const [funnel, setFunnel] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    setRefreshing(true);
    try {
      const [v, l, f] = await Promise.all([
        getTechnicalVitals(),
        getRecentLogs(30),
        getConversionStats()
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

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Upper Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Error Pulse */}
        <div className={cn(
          "card p-6 border-2 transition-all",
          totalErrors > 50 ? "border-status-error/30 bg-badge-error/5" : "border-surface-border"
        )}>
          <div className="flex items-center justify-between mb-4">
            <div className={cn(
              "p-3 rounded-2xl",
              totalErrors > 50 ? "bg-status-error/10 text-status-error" : "bg-status-success/10 text-status-success"
            )}>
              <ShieldAlert size={24} />
            </div>
            <button onClick={loadData} className="text-content-muted hover:text-content-primary transition-colors">
              <RefreshCw size={16} className={cn(refreshing && "animate-spin")} />
            </button>
          </div>
          <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Erreurs (24h)</p>
          <p className="text-3xl font-black text-content-primary mt-1">{totalErrors}</p>
          <div className="flex items-center gap-2 mt-2">
            <div className={cn("w-2 h-2 rounded-full animate-ping", totalErrors > 0 ? "bg-status-error" : "bg-status-success")} />
            <span className="text-[10px] font-bold uppercase tracking-tight text-content-secondary">
              {totalErrors > 50 ? "Alerte : Seuil critique" : "Système sous surveillance"}
            </span>
          </div>
        </div>

        {/* Latency Average */}
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
                <p className="text-3xl font-black text-content-primary mt-1">
                  {avg > 0 ? `${avg}ms` : '—'}
                </p>
                <p className={`text-[10px] font-bold uppercase tracking-tight mt-2 ${avg === 0 ? 'text-content-muted' : avg < 500 ? 'text-status-success' : avg < 1500 ? 'text-status-warning' : 'text-status-error'}`}>
                  {avg === 0 ? 'Aucune donnée' : avg < 500 ? 'Optimal' : avg < 1500 ? 'Ralentissement' : 'Critique'}
                </p>
              </>
            );
          })()}
        </div>

        {/* Conversion Funnel */}
        <div className="card p-6 border-surface-border">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl bg-status-info/10 text-status-info">
              <TrendingUp size={24} />
            </div>
          </div>
          <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Activation Trial</p>
          <p className="text-3xl font-black text-content-primary mt-1">
            {funnel ? Math.round((funnel.provisioning_success / (funnel.signup_started || 1)) * 100) : 0}%
          </p>
          <p className="text-[10px] font-bold uppercase tracking-tight text-content-secondary mt-2">
             Funnel Health (7j)
          </p>
        </div>
      </div>

      {/* Main Grid: Logs + Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Error Breakdown */}
        <div className="space-y-4">
          <h3 className="text-sm font-black text-content-primary uppercase tracking-widest flex items-center gap-2">
            <Activity size={16} className="text-content-brand" />
            Par Catégorie
          </h3>
          <div className="card divide-y divide-surface-border border-surface-border overflow-hidden">
            {vitals.map((v, i) => (
              <div key={i} className="p-4 flex items-center justify-between hover:bg-surface-hover transition-colors">
                <div>
                  <p className="text-xs font-black uppercase text-content-primary">{v.category}</p>
                  <p className="text-[10px] text-content-muted">Dernières 24h</p>
                </div>
                <div className="text-right">
                  <p className={cn("text-sm font-bold", v.error_count > 0 ? "text-status-error" : "text-status-success")}>
                    {v.error_count} err.
                  </p>
                  <p className="text-[10px] text-content-muted">{v.avg_latency || 0}ms avg</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Real-time Logs */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-content-primary uppercase tracking-widest flex items-center gap-2">
              <Terminal size={16} className="text-content-brand" />
              Flux d'événements
            </h3>
            <div className="flex items-center gap-2">
               <span className="text-[10px] font-bold text-content-muted bg-surface-input px-2 py-1 rounded-md">LIVE</span>
            </div>
          </div>

          <div className="card border-surface-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-input border-b border-surface-border text-[10px] font-black text-content-muted uppercase tracking-widest">
                    <th className="px-4 py-3">Moment</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Événement / Erreur</th>
                    <th className="px-4 py-3">Business</th>
                    <th className="px-4 py-3">URL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-surface-hover transition-colors group">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-[11px] font-medium text-content-primary">
                          {format(new Date(log.created_at), 'HH:mm:ss')}
                        </p>
                        <p className="text-[9px] text-content-muted">
                          {format(new Date(log.created_at), 'dd MMM')}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "text-[9px] font-black px-1.5 py-0.5 rounded uppercase",
                          log.level === 'error' ? "bg-badge-error text-status-error" : 
                          log.level === 'perf' ? "bg-badge-info text-status-info" : "bg-surface-input text-content-muted"
                        )}>
                          {log.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className={cn(
                          "text-[11px] font-bold truncate",
                          log.level === 'error' ? "text-status-error" : "text-content-primary"
                        )}>
                          {log.message}
                        </p>
                        {log.latency_ms && <p className="text-[9px] text-content-muted">{log.latency_ms}ms latency</p>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[11px] font-medium text-content-secondary truncate w-24">
                          {log.business_name || 'System'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                         <div className="flex items-center gap-1 text-[10px] text-content-muted group-hover:text-content-brand truncate w-24">
                           {log.url?.split('/').pop() || '/'}
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {logs.length === 0 && (
              <div className="p-12 text-center">
                <p className="text-sm text-content-muted">Aucun log récent</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
