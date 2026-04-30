'use client';

import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, RefreshCw, Store, Tag, BedDouble, Wrench, Download, Car,
  Package, Users, BarChart, Briefcase
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { formatCurrency } from '@/lib/utils';
import { GrossisteTab } from '@/components/analytics/GrossisteTab';

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

// Hooks
import { useAnalyticsData } from './hooks/useAnalyticsData';

const PERIODS = [
  { label: "Aujourd'hui", value: 0  },
  { label: '7 jours',     value: 7  },
  { label: '30 jours',    value: 30 },
  { label: '90 jours',    value: 90 },
];

type Tab = 'general' | 'produits' | 'grossiste' | 'promos' | 'hotel' | 'juridique' | 'voitures' | 'revendeurs' | 'appro' | 'services';

interface TabConfig {
    id: Tab;
    label: string;
    icon: React.ElementType;
    feature?: string;
    show?: boolean;
}

export default function AnalyticsPage() {
  const { business } = useAuthStore();
  const [period, setPeriod]   = useState(30);
  const [tab, setTab]         = useState<Tab>('general');

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
    audiences,
    stackedDays,
    hasMultiSource,
    loadTab,
    refresh,
  } = useAnalyticsData(business, period);

  const isService   = business?.type === 'service' || (business as any)?.types?.includes('service');

  useEffect(() => {
      if (tab !== 'general') {
          loadTab(tab);
      }
  }, [tab, loadTab]);

  const fmt = (n: number) => formatCurrency(n, business?.currency ?? 'XOF');

  function exportCSV() {
    if (!data) return;
    const rows = [
      ['Date', 'Ventes (CA)', 'Commandes', 'Panier moyen'],
      ...data.daily_stats.map((d) => [d.date, d.total_sales.toFixed(0), d.order_count, d.avg_order_value?.toFixed(0) ?? '0']),
    ];
    const csv  = rows.map((r) => r.join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `stats-${period}j-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const tabsConfig: TabConfig[] = [
    { id: 'general',    label: 'Général',      icon: TrendingUp                          },
    { id: 'services',   label: 'Prestations',  icon: Wrench,    show: isService          },
    { id: 'produits',   label: 'Produits',     icon: BarChart,  feature: 'retail'        },
    { id: 'grossiste',  label: 'Détail ventes',icon: Store,     feature: 'retail'        },
    { id: 'revendeurs', label: 'Revendeurs',   icon: Users,     feature: 'retail'        },
    { id: 'promos',     label: 'Promos',       icon: Tag,       feature: 'retail'        },
    { id: 'appro',      label: 'Achats',       icon: Package                             },
    { id: 'juridique',  label: 'Dossiers',     icon: Briefcase, feature: 'dossiers'      },
    { id: 'hotel',      label: 'Hôtel',        icon: BedDouble, feature: 'hotel'         },
    { id: 'voitures',   label: 'Voitures',     icon: Car,       feature: 'voitures'      },
  ];

  const filteredTabs = tabsConfig.filter(t => 
    (t.show === undefined ? true : t.show) && 
    (!t.feature || business?.features?.includes(t.feature))
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-border flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div>
          <h1 className="text-lg font-bold text-content-primary">Statistiques</h1>
          <p className="text-xs text-content-secondary mt-0.5">Chiffres clés de votre activité — ventes, achats, marges et tendances par période</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} disabled={!data} className="btn-secondary p-2" title="Exporter CSV">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={refresh} disabled={refreshing} className="btn-secondary p-2" title="Actualiser">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex gap-1 bg-surface-input rounded-xl p-1">
            {PERIODS.map(({ label, value }) => (
              <button key={value} onClick={() => setPeriod(value)}
                className={`px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${period === value ? 'bg-brand-600 text-white' : 'text-content-secondary hover:text-content-primary'}`}>
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

      <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-5">
        {tab === 'general' && (
          <GeneralTab 
            loading={loading}
            business={business}
            data={data}
            juridiqueData={juridiqueData}
            hotelData={hotelData}
            prevCA={prevCA}
            stackedDays={stackedDays}
            hasMultiSource={hasMultiSource}
            fmt={fmt}
          />
        )}

        {tab === 'produits' && (
          <ProductsTab loading={loading} data={data} period={period} fmt={fmt} />
        )}

        {tab === 'services' && (
          <ServicesTab loading={loading} servicesData={servicesData} period={period} fmt={fmt} />
        )}

        {tab === 'grossiste' && business && (
          <GrossisteTab businessId={business.id} days={period === 0 ? 1 : period} fmt={fmt} />
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
    </div>
  );
}
