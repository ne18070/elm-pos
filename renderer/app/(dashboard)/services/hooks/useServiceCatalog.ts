import { useState, useEffect, useCallback } from 'react';
import { getServiceCatalog, getAllServiceCatalog, getServiceCategories, ServiceCatalogItem, ServiceCategory } from '@services/supabase/service-orders';
import { useNotificationStore } from '@/store/notifications';
import { toUserError } from '@/lib/user-error';

export function useServiceCatalog(businessId: string) {
  const [catalog, setCatalog] = useState<ServiceCatalogItem[]>([]);
  const [allCatalog, setAllCatalog] = useState<ServiceCatalogItem[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const { error: notifError } = useNotificationStore();

  const loadCatalog = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const [c, ac, cats] = await Promise.all([
        getServiceCatalog(businessId),
        getAllServiceCatalog(businessId),
        getServiceCategories(businessId).catch(() => [] as ServiceCategory[]),
      ]);
      setCatalog(c);
      setAllCatalog(ac);
      setCategories(cats);
    } catch (e: any) {
      notifError(toUserError(e));
    } finally {
      setLoading(false);
    }
  }, [businessId, notifError]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  return {
    catalog,
    allCatalog,
    categories,
    loading,
    refresh: loadCatalog,
    setCategories,
    setAllCatalog,
  };
}
