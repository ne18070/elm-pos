'use client';

import React, { useState, useEffect } from 'react';
import { 
  BarChart2, Users, CreditCard, Layers, 
  TrendingUp, Activity, CheckCircle, AlertCircle,
  Clock, ArrowUpRight, ArrowDownRight, Zap
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { getAllSubscriptions, type SubscriptionRow } from '@services/supabase/subscriptions';
import { getAllOrganizationsAdmin } from '@services/supabase/business';
import { MonitoringTab } from './components/MonitoringTab';

export default function BackofficeDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeOrgs: 0,
    mrr: 0,
    pendingDemands: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const [subs, orgs] = await Promise.all([
          getAllSubscriptions(),
          getAllOrganizationsAdmin()
        ]) as [SubscriptionRow[], any[]];

        const activeSubs = subs.filter(s => s.status === 'active');
        const mrr = activeSubs.reduce((acc, s) => acc + (Number(s.plan_price) || 0), 0);

        setStats({
          totalUsers: subs.length,
          activeOrgs: orgs.length,
          mrr: mrr,
          pendingDemands: 0
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  const kpis = [
    { label: 'Revenu Mensuel (MRR)', value: formatCurrency(stats.mrr, 'XOF'), icon: TrendingUp, color: 'text-status-success', trend: '+12.5%' },
    { label: 'Organisations', value: stats.activeOrgs, icon: Layers, color: 'text-content-brand', trend: '+3' },
    { label: 'Utilisateurs Totaux', value: stats.totalUsers, icon: Users, color: 'text-blue-400', trend: '+18%' },
    { label: 'Activité Système', value: 'Optimale', icon: Activity, color: 'text-status-purple', trend: '100%' },
  ];

  return (
    <div className="p-8 space-y-8 pb-20 no-scrollbar">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight uppercase">Vue d'ensemble</h1>
          <p className="text-slate-500 text-sm mt-1">État de santé global de la plateforme ELM.</p>
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
              <div className={cn("p-3 rounded-2xl bg-surface-input border border-surface-border transition-colors group-hover:border-brand-500/30", kpi.color)}>
                <kpi.icon size={24} />
              </div>
              <span className={cn("text-[10px] font-black px-2 py-1 rounded-lg bg-surface-input border border-surface-border", kpi.color)}>
                {kpi.trend}
              </span>
            </div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{kpi.label}</p>
            <p className="text-2xl font-black text-white mt-1 tracking-tight">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Main Monitoring Content */}
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-black text-white uppercase tracking-widest">Activité Temps Réel</h2>
          <div className="h-px flex-1 bg-surface-border" />
        </div>
        <MonitoringTab />
      </div>
    </div>
  );
}
