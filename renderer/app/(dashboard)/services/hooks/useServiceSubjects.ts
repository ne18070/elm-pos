import { useState, useEffect, useCallback } from 'react';
import { getSubjects, getOrdersSummary, ServiceSubject, ServiceOrderSummary } from '@services/supabase/service-orders';
import { useNotificationStore } from '@/store/notifications';
import { toUserError } from '@/lib/user-error';

export function useServiceSubjects(businessId: string) {
  const [subjects, setSubjects] = useState<ServiceSubject[]>([]);
  const [summary, setSummary] = useState<ServiceOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const { error: notifError } = useNotificationStore();

  const loadData = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const [s, o] = await Promise.all([
        getSubjects(businessId).catch(() => [] as ServiceSubject[]),
        getOrdersSummary(businessId).catch(() => [] as ServiceOrderSummary[]),
      ]);
      setSubjects(s);
      setSummary(o);
    } catch (e: any) {
      notifError(toUserError(e));
    } finally {
      setLoading(false);
    }
  }, [businessId, notifError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    subjects,
    summary,
    loading,
    refresh: loadData,
  };
}
