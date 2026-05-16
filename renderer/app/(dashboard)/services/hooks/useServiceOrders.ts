import { useState, useEffect, useCallback, useRef } from 'react';
import { getServiceOrders, getServiceOrderCounts, ServiceOrder, ServiceOrderStatus } from '@services/supabase/service-orders';
import { useNotificationStore } from '@/store/notifications';
import { toUserError } from '@/lib/user-error';
import { playNewOrderChime } from '@/lib/admin-sound';

interface UseServiceOrdersOptions {
  businessId: string;
  statusFilter: ServiceOrderStatus | 'all';
  search: string;
  dateFilter: string;
  page: number;
  pageSize: number;
  refreshTrigger?: number;
}

export function useServiceOrders({
  businessId,
  statusFilter,
  search,
  dateFilter,
  page,
  pageSize,
  refreshTrigger = 0,
}: UseServiceOrdersOptions) {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [counts, setCounts] = useState<Record<ServiceOrderStatus | 'all', number>>({
    all: 0, attente: 0, en_cours: 0, pause: 0, termine: 0, paye: 0, annule: 0,
  });
  const [loading, setLoading] = useState(true);
  const { error: notifError } = useNotificationStore();

  const [soundEnabled, setSoundEnabled] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('admin_order_sound') !== 'false' : true,
  );
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev;
      localStorage.setItem('admin_order_sound', String(next));
      return next;
    });
  }, []);

  // To prevent race conditions
  const lastRequestRef = useRef<number>(0);

  const loadOrders = useCallback(async () => {
    if (!businessId) return;
    
    const requestId = ++lastRequestRef.current;
    setLoading(true);
    
    try {
      const [ordersResult, orderCounts] = await Promise.all([
        getServiceOrders(businessId, {
          date: dateFilter || undefined,
          status: statusFilter,
          search: search || undefined,
          page,
          pageSize,
        }),
        getServiceOrderCounts(businessId, { date: dateFilter || undefined, search: search || undefined }),
      ]);
      
      if (requestId !== lastRequestRef.current) return;

      setOrders(ordersResult.data);
      setTotalCount(ordersResult.count);
      setCounts(orderCounts);
    } catch (e: any) {
      if (requestId === lastRequestRef.current) {
        notifError(toUserError(e));
      }
    } finally {
      if (requestId === lastRequestRef.current) {
        setLoading(false);
      }
    }
  }, [businessId, statusFilter, search, dateFilter, page, pageSize, notifError]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders, refreshTrigger]);

  // Realtime: écoute le channel central (useRealtimeSync) via event système.
  const loadOrdersRef = useRef(loadOrders);
  useEffect(() => { loadOrdersRef.current = loadOrders; }, [loadOrders]);

  // Refresh counts only (1 RPC vs 7 queries)
  const refreshCountsRef = useRef({ businessId, dateFilter, search });
  useEffect(() => { refreshCountsRef.current = { businessId, dateFilter, search }; }, [businessId, dateFilter, search]);

  const refreshCounts = useCallback(async () => {
    const { businessId: bid, dateFilter: df, search: s } = refreshCountsRef.current;
    if (!bid) return;
    try {
      const c = await getServiceOrderCounts(bid, { date: df || undefined, search: s || undefined });
      setCounts(c);
    } catch { /* non-bloquant */ }
  }, []);

  useEffect(() => {
    let insertDebounce: ReturnType<typeof setTimeout> | null = null;

    function onChanged(e: Event) {
      const { eventType, record } = (e as CustomEvent<{ eventType: string; record?: ServiceOrder }>).detail ?? {};

      if (eventType === 'INSERT') {
        // Son immédiat, rechargement différé (items non inclus dans le payload)
        if (soundEnabledRef.current) playNewOrderChime();
        if (insertDebounce) clearTimeout(insertDebounce);
        insertDebounce = setTimeout(() => loadOrdersRef.current(), 300);
        return;
      }

      if (eventType === 'UPDATE' && record) {
        // Mise à jour chirurgicale : on merge les champs de l'ordre sans retoucher les items déjà chargés
        setOrders(prev => prev.map(o => o.id === record.id ? { ...o, ...record } : o));
        refreshCounts();
        return;
      }

      if (eventType === 'DELETE' && record) {
        setOrders(prev => prev.filter(o => o.id !== (record as any).id));
        refreshCounts();
        return;
      }

      // Fallback pour tout autre cas
      loadOrdersRef.current();
    }

    window.addEventListener('elm-pos:service_orders:changed', onChanged);
    return () => {
      window.removeEventListener('elm-pos:service_orders:changed', onChanged);
      if (insertDebounce) clearTimeout(insertDebounce);
    };
  }, [refreshCounts]);

  return {
    orders,
    totalCount,
    counts,
    loading,
    refresh: loadOrders,
    setOrders,
    soundEnabled,
    toggleSound,
  };
}
