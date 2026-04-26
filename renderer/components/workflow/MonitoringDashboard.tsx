'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Activity, AlertTriangle, CheckCircle2, Clock, XCircle,
  RefreshCw, Loader2, TrendingUp, PauseCircle,
} from 'lucide-react';
import { getMonitoringStats } from '@services/supabase/workflows';
import type { WorkflowMonitoringStats, WorkflowLog, WorkflowNode } from '@pos-types';

interface MonitoringDashboardProps {
  businessId: string;
  refreshInterval?: number; // ms, défaut 30000
}

// -- Carte statistique ---------------------------------------------------------
function StatCard({
  label, value, icon, color, sublabel,
}: {
  label: string; value: number; icon: React.ReactNode;
  color: string; sublabel?: string;
}) {
  return (
    <div className={`card p-4 border-l-4 ${color}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-content-muted uppercase tracking-wide">{label}</p>
          <p className="text-3xl font-bold text-content-primary mt-1">{value}</p>
          {sublabel && <p className="text-xs text-content-muted mt-0.5">{sublabel}</p>}
        </div>
        <div className="text-content-secondary">{icon}</div>
      </div>
    </div>
  );
}

// -- Badge niveau log ----------------------------------------------------------
function LevelBadge({ level }: { level: WorkflowLog['level'] }) {
  const map: Record<WorkflowLog['level'], string> = {
    DEBUG: 'bg-surface-card text-content-secondary',
    INFO:  'bg-badge-info text-blue-300',
    WARN:  'bg-badge-warning text-status-warning',
    ERROR: 'bg-badge-error text-status-error',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${map[level]}`}>
      {level}
    </span>
  );
}

// -- Ligne instance bloquée ----------------------------------------------------
function BlockedRow({
  item,
}: {
  item: WorkflowMonitoringStats['blocked_instances'][number];
}) {
  const hours = Math.round(item.hours_waiting);
  const isOverdue = hours > ((item.node as Extract<WorkflowNode, { due_hours?: number }>).due_hours ?? 24);
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-surface-border last:border-0">
      <div className={`w-2 h-2 rounded-full shrink-0 ${isOverdue ? 'bg-red-400' : 'bg-amber-400'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-content-primary truncate font-medium">{item.node?.label ?? 'Étape inconnue'}</p>
        <p className="text-xs text-content-muted truncate">Dossier {item.instance.dossier_id.slice(0, 8)}…</p>
      </div>
      <span className={`text-xs font-semibold shrink-0 ${isOverdue ? 'text-status-error' : 'text-status-warning'}`}>
        {hours}h
      </span>
    </div>
  );
}

// -- Dashboard principal -------------------------------------------------------
export function MonitoringDashboard({ businessId, refreshInterval = 30000 }: MonitoringDashboardProps) {
  const [stats, setStats]   = useState<WorkflowMonitoringStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getMonitoringStats(businessId);
      setStats(s);
      setLastRefresh(new Date());
    } catch (e) {
      console.error('[MonitoringDashboard]', e);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, refreshInterval);
    return () => clearInterval(id);
  }, [refresh, refreshInterval]);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-16 text-content-muted">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Chargement du monitoring…
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6">

      {/* -- En-tête -- */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-content-brand" />
          <h2 className="font-semibold text-content-primary">Suivi des processus</h2>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-content-muted">
              Mis à jour {lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="btn-secondary p-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* -- Cartes KPI -- */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard
          label="Actifs" value={stats.total_active} color="border-blue-500"
          icon={<TrendingUp className="w-6 h-6" />}
        />
        <StatCard
          label="En attente" value={stats.waiting} color="border-amber-500"
          icon={<Clock className="w-6 h-6" />}
        />
        <StatCard
          label="En pause" value={stats.paused} color="border-purple-500"
          icon={<PauseCircle className="w-6 h-6" />}
        />
        <StatCard
          label="En retard" value={stats.overdue} color="border-red-500"
          icon={<AlertTriangle className="w-6 h-6" />}
          sublabel="WAITING > SLA"
        />
        <StatCard
          label="Échoués" value={stats.failed} color="border-status-error"
          icon={<XCircle className="w-6 h-6" />}
        />
        <StatCard
          label="Terminés" value={stats.completed_today} color="border-green-500"
          icon={<CheckCircle2 className="w-6 h-6" />}
          sublabel="Aujourd'hui"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* -- Instances bloquées -- */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-status-warning" />
            <h3 className="font-medium text-content-primary text-sm">Étapes bloquées</h3>
            {stats.blocked_instances.length > 0 && (
              <span className="ml-auto text-xs font-bold text-status-warning bg-badge-warning px-2 py-0.5 rounded-full">
                {stats.blocked_instances.length}
              </span>
            )}
          </div>
          {stats.blocked_instances.length === 0 ? (
            <p className="text-sm text-content-muted italic py-4 text-center">
              <CheckCircle2 className="w-5 h-5 text-status-success mx-auto mb-1" />
              Aucune étape bloquée
            </p>
          ) : (
            <div className="space-y-0">
              {stats.blocked_instances.slice(0, 8).map(item => (
                <BlockedRow key={item.instance.id} item={item} />
              ))}
              {stats.blocked_instances.length > 8 && (
                <p className="text-xs text-content-muted pt-2 text-center">
                  +{stats.blocked_instances.length - 8} autres…
                </p>
              )}
            </div>
          )}
        </div>

        {/* -- Erreurs récentes -- */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <XCircle className="w-4 h-4 text-status-error" />
            <h3 className="font-medium text-content-primary text-sm">Erreurs récentes</h3>
          </div>
          {stats.recent_errors.length === 0 ? (
            <p className="text-sm text-content-muted italic py-4 text-center">
              <CheckCircle2 className="w-5 h-5 text-status-success mx-auto mb-1" />
              Aucune erreur
            </p>
          ) : (
            <div className="space-y-2">
              {stats.recent_errors.slice(0, 6).map(err => (
                <div key={err.id} className="flex items-start gap-2 py-1.5 border-b border-surface-border last:border-0">
                  <LevelBadge level={err.level} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-content-primary truncate">{err.message}</p>
                    <p className="text-[10px] text-content-muted mt-0.5">
                      {new Date(err.created_at).toLocaleString('fr-FR')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
