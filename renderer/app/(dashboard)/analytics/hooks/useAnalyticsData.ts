'use client';

import { useState, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import {
  getAnalyticsSummary, getCouponStats,
  getHotelAnalytics, getJuridiqueAnalytics, getVoituresAnalytics,
  getRevendeursAnalytics, getApprovisionnementAnalytics, getPrevPeriodCA,
  getServicesAnalytics, getVendeursAnalytics, getRHAnalytics,
  type CouponStat, type HotelAnalyticsSummary, type JuridiqueAnalyticsSummary,
  type VoituresAnalyticsSummary, type RevendeursAnalyticsSummary,
  type ApprovAnalyticsSummary, type PrevPeriodCA, type ServicesAnalyticsSummary,
  type VendeursAnalyticsSummary, type RHAnalyticsSummary, type PaymentMethodStat
} from '@services/supabase/analytics';
import { supabase } from '@services/supabase/client';
import type { AnalyticsSummary } from '@pos-types';
import { getOrderFilterTotals, type OrderFilterTotals } from '@services/supabase/orders';
import { useNotificationStore } from '@/store/notifications';
import { getBusinessProfile } from '../lib/profile';
import type { ResolvedPeriod } from '../lib/period';

export function useAnalyticsData(business: any, period: ResolvedPeriod) {
  const { error: notifError } = useNotificationStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [data, setData]             = useState<AnalyticsSummary | null>(null);
  const [prevCA, setPrevCA]         = useState<PrevPeriodCA | null>(null);
  
  // Tab-specific data
  const [coupons, setCoupons]       = useState<CouponStat[]>([]);
  const [hotelData, setHotelData]   = useState<HotelAnalyticsSummary | null>(null);
  const [juridiqueData, setJuridiqueData] = useState<JuridiqueAnalyticsSummary | null>(null);
  const [voituresData, setVoituresData]   = useState<VoituresAnalyticsSummary | null>(null);
  const [revendeursData, setRevendeursData] = useState<RevendeursAnalyticsSummary | null>(null);
  const [approvData, setApprovData]         = useState<ApprovAnalyticsSummary | null>(null);
  const [servicesData, setServicesData]     = useState<ServicesAnalyticsSummary | null>(null);
  const [vendeursData, setVendeursData]     = useState<VendeursAnalyticsSummary | null>(null);
  const [rhData, setRHData]                 = useState<RHAnalyticsSummary | null>(null);
  const [audiences, setAudiences]           = useState<any[]>([]);
  const [payments, setPayments]             = useState<PaymentMethodStat[]>([]);
  /** Ventes avec solde dû, toutes dates confondues (à relancer). */
  const [receivables, setReceivables]       = useState<OrderFilterTotals | null>(null);

  // Which tabs have been loaded for the current period/business
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set());

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  // `period` est recalculé par la page via useMemo(key) : la référence est stable
  // tant que la période ne change pas, d'où son usage direct en dépendance.
  const days = period.query;
  const prevStart = period.prev.start;
  const prevEnd   = period.prev.end;

  const loadGeneral = useCallback(async (silent = false) => {
    if (!business) return;
    if (!silent) setLoading(true); else setRefreshing(true);
    
    try {
      // hasFeature() gère l'héritage (types[], juridique → dossiers…), comme les onglets.
      const { isHotel, isJuridique, isRH, isStandard } = getBusinessProfile(business);

      // Les blocs secondaires (comparaison, hôtel, honoraires, RH, soldes dus) ne
      // doivent pas faire tomber les chiffres clés : chacun échoue seul, l'erreur
      // est loggée avec son nom. Seul le résumé des ventes est bloquant.
      const failed: string[] = [];
      const soft = <T,>(name: string, p: Promise<T>, fallback: T): Promise<T> =>
        p.catch((err) => { console.error(`[analytics] ${name}`, err); failed.push(name); return fallback; });

      // Hôtel / honoraires entrent dans le CA global de Général : on les charge
      // ici, sinon les cartes restent à 0 tant que leur onglet n'a pas été ouvert.
      const [summary, prevStats, rh, hotel, juridique, recv] = await Promise.all([
        getAnalyticsSummary(business.id, days),
        soft('comparaison', getPrevPeriodCA(business.id, { start: prevStart, end: prevEnd }, isHotel, isJuridique), null),
        isRH ? soft('rh', getRHAnalytics(business.id, days), null) : Promise.resolve(null),
        isHotel ? soft('hôtel', getHotelAnalytics(business.id, days), null) : Promise.resolve(null),
        isJuridique ? soft('honoraires', getJuridiqueAnalytics(business.id, days), null) : Promise.resolve(null),
        isStandard ? soft('soldes dus', getOrderFilterTotals(business.id, { acompteOnly: true }), null) : Promise.resolve(null),
      ]);

      setData(summary);
      setPrevCA(prevStats);
      setRHData(rh);
      if (hotel) setHotelData(hotel);
      if (juridique) setJuridiqueData(juridique);
      setPayments(isStandard ? summary.payment_methods : []);
      setReceivables(recv);
      const loaded = new Set(['general']);
      if (hotel) loaded.add('hotel');
      setLoadedTabs(loaded);
      if (failed.length > 0) {
        notifError(`Certaines statistiques n'ont pas pu être chargées (${failed.join(', ')}) — réessayez avec Actualiser`);
      }
    } catch (e) {
      console.error('[analytics] résumé des ventes', e);
      notifError('Impossible de charger les ventes de la période — réessayez avec Actualiser');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [business, days, prevStart, prevEnd, notifError]);

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
                    supabase
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
            case 'vendeurs': {
                const res = await getVendeursAnalytics(business.id, days);
                setVendeursData(res);
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


  return {
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
    refresh: () => loadGeneral(true),
  };
}
