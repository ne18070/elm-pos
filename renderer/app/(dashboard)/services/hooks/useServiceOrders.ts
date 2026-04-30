import { useState, useEffect, useCallback, useRef } from 'react';
import { getServiceOrders, getServiceOrderCounts, ServiceOrder, ServiceOrderStatus } from '@services/supabase/service-orders';
import { useNotificationStore } from '@/store/notifications';
import { toUserError } from '@/lib/user-error';

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
    all: 0, attente: 0, en_cours: 0, termine: 0, paye: 0, annule: 0,
  });
  const [loading, setLoading] = useState(true);
  const { error: notifError } = useNotificationStore();
  
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
  }, [loadOrders, refreshTrigger]); // Added refreshTrigger here

  return {
    orders,
    totalCount,
    counts,
    loading,
    refresh: loadOrders,
    setOrders, // Useful for optimistic updates
  };
}
