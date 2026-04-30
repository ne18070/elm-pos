'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { 
  getAnalyticsSummary, getDailySales, getCouponStats,
  getHotelAnalytics, getJuridiqueAnalytics, getVoituresAnalytics,
  getRevendeursAnalytics, getApprovisionnementAnalytics, getPrevPeriodCA,
  getServicesAnalytics,
  type CouponStat, type HotelAnalyticsSummary, type JuridiqueAnalyticsSummary,
  type VoituresAnalyticsSummary, type RevendeursAnalyticsSummary,
  type ApprovAnalyticsSummary, type PrevPeriodCA, type ServicesAnalyticsSummary
} from '@services/supabase/analytics';
import { supabase } from '@services/supabase/client';
import type { AnalyticsSummary } from '@pos-types';
import { useNotificationStore } from '@/store/notifications';
import { DayStack } from '../components/Charts';

export function useAnalyticsData(business: any, period: number) {
  const { error: notifError } = useNotificationStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [data, setData]             = useState<AnalyticsSummary | null>(null);
  const [today, setToday]           = useState<{ total: number; count: number } | null>(null);
  const [prevCA, setPrevCA]         = useState<PrevPeriodCA | null>(null);
  
  // Tab-specific data
  const [coupons, setCoupons]       = useState<CouponStat[]>([]);
  const [hotelData, setHotelData]   = useState<HotelAnalyticsSummary | null>(null);
  const [juridiqueData, setJuridiqueData] = useState<JuridiqueAnalyticsSummary | null>(null);
  const [voituresData, setVoituresData]   = useState<VoituresAnalyticsSummary | null>(null);
  const [revendeursData, setRevendeursData] = useState<RevendeursAnalyticsSummary | null>(null);
  const [approvData, setApprovData]         = useState<ApprovAnalyticsSummary | null>(null);
  const [servicesData, setServicesData]     = useState<ServicesAnalyticsSummary | null>(null);
  const [audiences, setAudiences]           = useState<any[]>([]);

  // Which tabs have been loaded for the current period/business
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set());

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const days = period === 0 ? 1 : period;

  const loadGeneral = useCallback(async (silent = false) => {
    if (!business) return;
    if (!silent) setLoading(true); else setRefreshing(true);
    
    try {
      const isHotel     = business?.type === 'hotel' || business?.features?.includes('hotel');
      const isJuridique = business?.type === 'juridique' ||
                          business?.features?.includes('dossiers') ||
                          business?.features?.includes('honoraires');

      const [summary, todayData, prevStats] = await Promise.all([
        getAnalyticsSummary(business.id, days),
        getDailySales(business.id, todayStr),
        period > 0 ? getPrevPeriodCA(business.id, days, !!isHotel, !!isJuridique) : Promise.resolve(null),
      ]);

      if (period === 0) {
        const todayStat = summary.daily_stats.find((d) => d.date === todayStr);
        setData({ 
            ...summary, 
            total_sales: todayStat?.total_sales ?? 0, 
            order_count: todayStat?.order_count ?? 0, 
            avg_order_value: todayStat?.avg_order_value ?? 0, 
            daily_stats: todayStat ? [todayStat] : [] 
        });
      } else {
        setData(summary);
      }
      setToday(todayData);
      setPrevCA(prevStats);
      setLoadedTabs(new Set(['general']));
    } catch (e) {
      notifError('Erreur lors du chargement des statistiques générales');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [business, days, period, todayStr, notifError]);

  const loadTab = useCallback(async (tab: string) => {
    if (!business || loadedTabs.has(tab)) return;
    
    try {
        switch (tab) {
            case 'services': {
                const res = await getServicesAnalytics(business.id, days);
                setServicesData(res);
                break;
            }
            case 'promos': {
                const res = await getCouponStats(business.id, days);
                setCoupons(res);
                break;
            }
            case 'hotel': {
                const res = await getHotelAnalytics(business.id, days);
                setHotelData(res);
                break;
            }
            case 'juridique': {
                const [res, audData] = await Promise.all([
                    getJuridiqueAnalytics(business.id, days),
                    (supabase as any)
                        .from('dossiers')
                        .select('id, reference, client_name, date_audience, tribunal')
                        .eq('business_id', business.id)
                        .gte('date_audience', todayStr)
                        .order('date_audience', { ascending: true })
                        .limit(5)
                ]);
                setJuridiqueData(res);
                setAudiences(audData.data ?? []);
                break;
            }
            case 'voitures': {
                const res = await getVoituresAnalytics(business.id, days);
                setVoituresData(res);
                break;
            }
            case 'revendeurs': {
                const res = await getRevendeursAnalytics(business.id, days);
                setRevendeursData(res);
                break;
            }
            case 'appro': {
                const res = await getApprovisionnementAnalytics(business.id, days);
                setApprovData(res);
                break;
            }
        }
        setLoadedTabs(prev => new Set([...prev, tab]));
    } catch (e) {
        notifError(`Erreur lors du chargement des données: ${tab}`);
    }
  }, [business, days, loadedTabs, todayStr, notifError]);

  useEffect(() => {
    loadGeneral();
  }, [loadGeneral]);

  const stackedDays = useMemo<DayStack[]>(() => {
    const map = new Map<string, DayStack>();
    const ensure = (d: string) => { if (!map.has(d)) map.set(d, { date: d, retail: 0, services: 0, hotel: 0, juridique: 0 }); return map.get(d)!; };
    
    (data?.daily_stats ?? []).forEach(d => { ensure(d.date).retail = d.total_sales; });
    (juridiqueData?.daily_fees ?? []).forEach(d => { ensure(d.date).juridique = d.amount; });
    (hotelData?.daily_revenue ?? []).forEach(d => { ensure(d.date).hotel = d.total; });
    (servicesData?.daily_revenue ?? []).forEach(d => {
      const e = ensure(d.date);
      e.services += d.total;
      e.retail = Math.max(0, e.retail - d.total);
    });
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data, juridiqueData, hotelData, servicesData]);

  const hasMultiSource = stackedDays.some(d => d.hotel > 0) || stackedDays.some(d => d.juridique > 0) || stackedDays.some(d => d.services > 0);

  return {
    loading,
    refreshing,
    data,
    today,
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
    refresh: () => loadGeneral(true),
  };
}
