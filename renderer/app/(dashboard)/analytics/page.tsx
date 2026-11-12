'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useUrlTab } from '@/hooks/useUrlTab';
import {
  TrendingUp, RefreshCw, Store, Tag, BedDouble, Wrench, Download, Car,
  Package, Users, BarChart, Briefcase, UserCheck
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { formatCurrency } from '@/lib/utils';
import { GrossisteTab } from '@/components/analytics/GrossisteTab';
import { useCan } from '@/hooks/usePermission';
import { hasFeature } from '@/lib/permissions';

// Components
import { GeneralTab } from './components/GeneralTab';
import { ServicesTab } from './components/ServicesTab';
import { ProductsTab } from './components/ProductsTab';
import { RevendeursTab } from './components/RevendeursTab';
import { PromosTab } from './components/PromosTab';
import { ApprovisionnementTab } from './components/ApprovisionnementTab';
import { JuridiqueTab } from './components/JuridiqueTab';
import { HotelTab } from './components/HotelTab';
import { VoituresTab } from './components/VoituresTab';
import { VendeursTab } from './components/VendeursTab';

// Hooks
import { useAnalyticsData } from './hooks/useAnalyticsData';
import { buildTabExport, downloadCsv, toCsv } from './lib/export';
import { useNotificationStore } from '@/store/notifications';
import type { WholesaleOrderItem } from '@services/supabase/analytics';
import { PERIOD_OPTIONS, PeriodContext, resolvePeriod, type PeriodKey } from './lib/period';


type Tab = 'general' | 'produits' | 'grossiste' | 'promos' | 'hotel' | 'juridique' | 'voitures' | 'revendeurs' | 'appro' | 'services' | 'vendeurs';

interface TabConfig {
    id: Tab;
    label: string;
    icon: React.ElementType;
    feature?: string;
    show?: boolean;
}

export default function AnalyticsPage() {
  const { business } = useAuthStore();
  const can = useCan();
  const [periodKey, setPeriodKey] = useState<PeriodKey>('30d');
  const resolved = useMemo(() => resolvePeriod(periodKey), [periodKey]);
  /** Jours à remonter (0 = aujourd'hui) — la convention attendue par les onglets. */
  const period = resolved.back;
  const { error: notifError } = useNotificationStore();
  const [wholesaleItems, setWholesaleItems] = useState<WholesaleOrderItem[] | null>(null);
  const [tab, setTab]         = useUrlTab<Tab>('general', () => filteredTabs.map(t => t.id));

  const {
    loading,
    refreshing,
    data,
    prevCA,
    coupons,
    hotelData,
    juridiqueData,
    voituresData,
    revendeursData,
    approvData,
    servicesData,
    vendeursData,
    rhData,
    audiences,
    payments,
    receivables,
    loadTab,
    refresh,
  } = useAnalyticsData(business, resolved);

  const isService = hasFeature(business, 'service');

  useEffect(() => {
      if (tab !== 'general') {
          loadTab(tab);
      }
  }, [tab, loadTab]);

  const fmt = (n: number) => formatCurrency(n, business?.currency ?? 'XOF');

  if (!can('view_analytics')) {
    return (
      <div className="flex h-full items-center justify-center bg-surface p-6">
        <div className="max-w-sm text-center">
          <BarChart className="mx-auto mb-3 h-10 w-10 text-content-secondary opacity-40" />
          <h1 className="text-lg font-bold text-content-primary">Accès refusé</h1>
          <p className="mt-1 text-sm text-content-secondary">Vous n'avez pas la permission de consulter les statistiques.</p>
        </div>
      </div>
    );
  }

  function exportCSV() {
    const sections = buildTabExport(tab, {
      data, payments, coupons, hotelData, juridiqueData, voituresData,
      revendeursData, approvData, servicesData, vendeursData, wholesaleItems,
      showFinancials: can('view_financials'),
    }, resolved);
    if (!sections || sections.every((sec) => sec.rows.length === 0)) {
      notifError('Rien à exporter pour cet onglet sur la période');
      return;
    }
    downloadCsv(`stats-${tab}-${periodKey}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(sections));
  }

  const tabsConfig: TabConfig[] = [
    { id: 'general',    label: 'Général',      icon: TrendingUp                          },
    { id: 'services',   label: 'Prestations',  icon: Wrench,    show: isService          },
    { id: 'produits',   label: 'Produits',     icon: BarChart,  feature: 'retail'        },
    { id: 'vendeurs',   label: 'Vendeurs',     icon: UserCheck, feature: 'retail'        },
    { id: 'grossiste',  label: 'Détail ventes',icon: Store,     feature: 'retail'        },
    { id: 'revendeurs', label: 'Revendeurs',   icon: Users,     feature: 'retail'        },
    { id: 'promos',     label: 'Promos',       icon: Tag,       feature: 'retail'        },
    { id: 'appro',      label: 'Achats',       icon: Package,   feature: 'stock'         },
    { id: 'juridique',  label: 'Dossiers',     icon: Briefcase, feature: 'dossiers'      },
    { id: 'hotel',      label: 'Hôtel',        icon: BedDouble, feature: 'hotel'         },
    { id: 'voitures',   label: 'Voitures',     icon: Car,       feature: 'voitures'      },
  ];

  const filteredTabs = tabsConfig.filter(t =>
    (t.show === undefined ? true : t.show) &&
    // hasFeature() gère l'héritage (types[], resto/hôtel → retail…) — un simple
    // features.includes('retail') masquait les onglets Produits / Détail ventes /
    // Revendeurs / Promos alors que le module est bien actif.
    (!t.feature || hasFeature(business, t.feature))
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-border flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div>
          <h1 className="text-lg font-bold text-content-primary">Statistiques</h1>
          <p className="text-xs text-content-secondary mt-0.5">Chiffres clés de votre activité, comparés à la période précédente</p>
        </div>
        <div className="flex items-center gap-2 min-w-0 max-w-full">
          <button onClick={exportCSV} disabled={loading} className="btn-secondary h-10 px-3 flex items-center gap-1.5 text-sm"
            aria-label="Exporter cet onglet en CSV" title="Exporter cet onglet en CSV">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exporter</span>
          </button>
          <button onClick={refresh} disabled={refreshing} className="btn-secondary h-10 w-10 flex items-center justify-center" title="Actualiser" aria-label="Actualiser">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex gap-1 bg-surface-input rounded-xl p-1 max-w-full overflow-x-auto" role="group" aria-label="Période">
            {PERIOD_OPTIONS.map(({ label, key }) => (
              <button key={key} onClick={() => setPeriodKey(key)} aria-pressed={periodKey === key}
                className={`px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${periodKey === key ? 'bg-brand-600 text-white' : 'text-content-secondary hover:text-content-primary'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-border shrink-0 bg-surface overflow-x-auto">
        {filteredTabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-none flex items-center justify-center gap-1.5 px-3 py-3 text-xs sm:text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${tab === id ? 'border-brand-500 text-content-brand' : 'border-transparent text-content-secondary hover:text-content-primary'}`}>
            <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            {label}
          </button>
        ))}
      </div>

      <PeriodContext.Provider value={resolved}>
      <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-5">
        {tab === 'general' && (
          <GeneralTab 
            loading={loading}
            business={business}
            data={data}
            juridiqueData={juridiqueData}
            hotelData={hotelData}
            rhData={rhData}
            prevCA={prevCA}
            fmt={fmt}
            period={period}
            availableTabs={filteredTabs.map(t => t.id)}
            onNavigate={(t) => setTab(t as Tab)}
            payments={payments}
            receivables={receivables}
          />
        )}

        {tab === 'produits' && (
          <ProductsTab loading={loading} data={data} period={period} fmt={fmt} businessId={business?.id ?? ''} />
        )}

        {tab === 'vendeurs' && (
          <VendeursTab loading={loading} vendeursData={vendeursData} period={period} fmt={fmt} />
        )}

        {tab === 'services' && (
          <ServicesTab loading={loading} servicesData={servicesData} period={period} fmt={fmt} />
        )}

        {tab === 'grossiste' && business && (
          <GrossisteTab businessId={business.id} days={resolved.query} fmt={fmt} onItemsLoaded={setWholesaleItems} />
        )}

        {tab === 'revendeurs' && (
          <RevendeursTab loading={loading} revendeursData={revendeursData} period={period} fmt={fmt} />
        )}

        {tab === 'promos' && (
          <PromosTab loading={loading} coupons={coupons} period={period} fmt={fmt} />
        )}

        {tab === 'appro' && (
          <ApprovisionnementTab loading={loading} approvData={approvData} period={period} fmt={fmt} />
        )}

        {tab === 'juridique' && (
          <JuridiqueTab loading={loading} juridiqueData={juridiqueData} audiences={audiences} fmt={fmt} />
        )}

        {tab === 'hotel' && (
          <HotelTab loading={loading} hotelData={hotelData} period={period} fmt={fmt} />
        )}

        {tab === 'voitures' && (
          <VoituresTab loading={loading} voituresData={voituresData} period={period} fmt={fmt} />
        )}
      </div>
      </PeriodContext.Provider>
    </div>
  );
}
