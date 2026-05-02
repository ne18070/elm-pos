'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, Layers, Activity, Users, Zap } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { getAllSubscriptions } from '@services/supabase/subscriptions';
import { getAllOrganizationsAdmin } from '@services/supabase/business';
import { getTechnicalVitals } from '@services/supabase/monitoring';
import { MonitoringTab } from './components/MonitoringTab';
import { VitalsTab } from './components/VitalsTab';
import { CEOTab } from './components/CEOTab';
import { CTOTab } from './components/CTOTab';

type Tab = 'monitoring' | 'vitals' | 'ceo' | 'cto';

export default function BackofficeDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('monitoring');
  const [stats, setStats] = useState({ totalUsers: 0, activeOrgs: 0, mrr: 0, errorCount: 0 });

  useEffect(() => {
    async function loadStats() {
      try {
        const [subs, orgs, vitals] = await Promise.all([
          getAllSubscriptions(),
          getAllOrganizationsAdmin(),
          getTechnicalVitals(),
        ]);
        const activeSubs = subs.filter(s => s.status === 'active');
        const mrr        = activeSubs.reduce((acc, s) => acc + (Number(s.plan_price) || 0), 0);
        const errors     = vitals.reduce((acc, v) => acc + v.error_count, 0);
        setStats({ totalUsers: subs.length, activeOrgs: orgs.length, mrr, errorCount: errors });
      } catch (e) {
        console.error(e);
      }
    }
    loadStats();
  }, []);

  const kpis = [
    { label: 'Revenu Mensuel (MRR)', value: formatCurrency(stats.mrr, 'XOF'),   icon: TrendingUp, color: 'text-status-success', trend: '+12.5%' },
    { label: 'Organisations',        value: stats.activeOrgs,                    icon: Layers,     color: 'text-content-brand',  trend: '+3' },
    { label: 'Santé Système',        value: stats.errorCount > 10 ? 'Alerte' : 'Optimale', icon: Activity, color: stats.errorCount > 10 ? 'text-status-error' : 'text-status-success', trend: stats.errorCount > 0 ? `${stats.errorCount} err.` : 'Stable' },
    { label: 'Utilisateurs Totaux',  value: stats.totalUsers,                    icon: Users,      color: 'text-status-info',    trend: '+18%' },
  ];

  const tabs: { key: Tab; label: string; badge?: React.ReactNode }[] = [
    { key: 'monitoring', label: 'Activités Business' },
    {
      key: 'vitals', label: 'Santé Technique',
      badge: stats.errorCount > 0
        ? <span className="ml-2 inline-flex w-2 h-2 rounded-full bg-status-error animate-pulse" />
        : undefined,
    },
    { key: 'ceo', label: 'Dashboard CEO' },
    { key: 'cto', label: 'Dashboard CTO' },
  ];

  return (
    <div className="p-8 space-y-8 pb-20 no-scrollbar">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-content-primary tracking-tight uppercase">Vue d'ensemble</h1>
          <p className="text-content-muted text-sm mt-1">État de santé global de la plateforme ELM.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 text-status-success text-xs font-black uppercase tracking-widest animate-pulse">
          <Zap size={14} /> Système Live
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi, i) => (
          <div key={i} className="card p-6 border-surface-border hover:border-brand-500/30 transition-all group">
            <div className="flex items-start justify-between mb-4">
              <div className={cn('p-3 rounded-2xl bg-surface-input border border-surface-border transition-colors group-hover:border-brand-500/30', kpi.color)}>
                <kpi.icon size={24} />
              </div>
              <span className={cn('text-[10px] font-black px-2 py-1 rounded-lg bg-surface-input border border-surface-border', kpi.color)}>
                {kpi.trend}
              </span>
            </div>
            <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">{kpi.label}</p>
            <p className="text-2xl font-black text-content-primary mt-1 tracking-tight">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1 p-1 bg-surface-input rounded-2xl border border-surface-border w-fit flex-wrap">
        {tabs.map(({ key, label, badge }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center',
              activeTab === key
                ? 'bg-white text-content-primary shadow-sm'
                : 'text-content-muted hover:text-content-secondary',
            )}
          >
            {label}{badge}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'monitoring' && <MonitoringTab />}
        {activeTab === 'vitals'     && <VitalsTab />}
        {activeTab === 'ceo'        && <CEOTab />}
        {activeTab === 'cto'        && <CTOTab />}
      </div>
    </div>
  );
}
