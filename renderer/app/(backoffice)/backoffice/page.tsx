'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, Layers, Activity, Users, Sun, Moon, SunMoon } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { getAllSubscriptions, getInvoiceTotalsSince, type SubscriptionRow } from '@services/supabase/subscriptions';
import { getAllOrganizationsAdmin } from '@services/supabase/business';
import { getTechnicalVitals } from '@services/supabase/monitoring';
import { MonitoringTab } from './components/MonitoringTab';
import { VitalsTab } from './components/VitalsTab';
import { WhatsAppCenter } from './components/WhatsAppCenter';
import { CEOTab } from './components/CEOTab';
import { CTOTab } from './components/CTOTab';
import { SecurityTab } from './components/SecurityTab';
import { useThemeStore } from '@/store/theme';

type Tab = 'monitoring' | 'vitals' | 'whatsapp' | 'ceo' | 'cto' | 'security';

// Un abonnement « active » dont l'échéance est passée est expiré (même règle que /backoffice/abonnements)
function effectiveStatus(s: SubscriptionRow): string {
  const now = Date.now();
  if (s.status === 'active' && s.expires_at && new Date(s.expires_at).getTime() < now) return 'expired';
  if (s.status === 'trial' && s.trial_ends_at && new Date(s.trial_ends_at).getTime() < now) return 'expired';
  return s.status;
}

export default function BackofficeDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('monitoring');
  const [stats, setStats] = useState<{
    collected: number; payments: number; orgs: number; businesses: number;
    activeSubs: number; trialSubs: number; errorCount: number;
  } | null>(null);
  const [statsError, setStatsError] = useState(false);
  const { theme, cycle: cycleTheme } = useThemeStore();

  useEffect(() => {
    async function loadStats() {
      try {
        const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
        const [subs, orgs, vitals, invoices] = await Promise.all([
          getAllSubscriptions(),
          getAllOrganizationsAdmin(),
          getTechnicalVitals(),
          getInvoiceTotalsSince(since),
        ]);
        const xof = invoices.filter((i) => i.currency === 'XOF');
        setStats({
          collected:  xof.reduce((acc, i) => acc + Number(i.amount), 0),
          payments:   invoices.length,
          orgs:       orgs.length,
          businesses: orgs.reduce((acc, o) => acc + o.businesses.length, 0),
          activeSubs: subs.filter((s) => effectiveStatus(s) === 'active').length,
          trialSubs:  subs.filter((s) => effectiveStatus(s) === 'trial').length,
          errorCount: vitals.reduce((acc, v) => acc + v.error_count, 0),
        });
      } catch (e) {
        console.error(e);
        setStatsError(true);
      }
    }
    loadStats();
  }, []);

  const s = stats;
  const kpis = [
    { label: 'Encaissé (30 jours)', value: s ? formatCurrency(s.collected, 'XOF') : '…', icon: TrendingUp, color: 'text-status-success',
      hint: s ? `${s.payments} paiement${s.payments > 1 ? 's' : ''}` : '' },
    { label: 'Organisations', value: s ? s.orgs : '…', icon: Layers, color: 'text-content-brand',
      hint: s ? `${s.businesses} établissement${s.businesses > 1 ? 's' : ''}` : '' },
    { label: 'Santé Système', value: s ? (s.errorCount > 10 ? 'Alerte' : 'Optimale') : '…', icon: Activity,
      color: s && s.errorCount > 10 ? 'text-status-error' : 'text-status-success',
      hint: s ? (s.errorCount > 0 ? `${s.errorCount} err.` : 'Stable') : '' },
    { label: 'Abonnés actifs', value: s ? s.activeSubs : '…', icon: Users, color: 'text-status-info',
      hint: s ? `${s.trialSubs} en essai` : '' },
  ];

  const tabs: { key: Tab; label: string; badge?: React.ReactNode }[] = [
    { key: 'monitoring', label: 'Activités Business' },
    {
      key: 'vitals', label: 'Santé Technique',
      badge: stats && stats.errorCount > 0
        ? <span className="ml-2 inline-flex w-2 h-2 rounded-full bg-status-error animate-pulse" />
        : undefined,
    },
    { key: 'whatsapp',   label: 'WhatsApp Center' },
    { key: 'ceo',        label: 'Dashboard CEO' },
    { key: 'cto',        label: 'Dashboard CTO' },
    { key: 'security',   label: 'Sécurité' },
  ];

  return (
    <div className="p-8 space-y-8 pb-20 no-scrollbar">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-content-primary tracking-tight uppercase">Vue d'ensemble</h1>
          <p className="text-content-muted text-sm mt-1">État de santé global de la plateforme ELM.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={cycleTheme}
            className="p-2.5 rounded-xl bg-surface-card border border-surface-border text-content-secondary hover:text-content-primary transition-all group shadow-sm"
            title="Changer de thème"
          >
            {theme === 'light' ? <Sun size={18} className="group-hover:rotate-45 transition-transform" /> : 
             theme === 'dark'  ? <Moon size={18} className="group-hover:-rotate-12 transition-transform" /> : 
             <SunMoon size={18} />}
          </button>
        </div>
      </div>

      {statsError && (
        <p className="text-sm text-status-error bg-badge-error border border-status-error/30 rounded-xl px-4 py-3">
          Impossible de charger les indicateurs. Rechargez la page.
        </p>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi, i) => (
          <div key={i} className="card p-6 border-surface-border hover:border-brand-500/30 transition-all group">
            <div className="flex items-start justify-between mb-4">
              <div className={cn('p-3 rounded-2xl bg-surface-input border border-surface-border transition-colors group-hover:border-brand-500/30', kpi.color)}>
                <kpi.icon size={24} />
              </div>
              {kpi.hint && (
                <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-surface-input border border-surface-border text-content-muted">
                  {kpi.hint}
                </span>
              )}
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
                ? 'bg-surface-card text-content-primary shadow-sm ring-1 ring-surface-border/50'
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
        {activeTab === 'whatsapp'   && <WhatsAppCenter />}
        {activeTab === 'ceo'        && <CEOTab />}
        {activeTab === 'cto'        && <CTOTab />}
        {activeTab === 'security'   && <SecurityTab />}
      </div>
    </div>
  );
}
