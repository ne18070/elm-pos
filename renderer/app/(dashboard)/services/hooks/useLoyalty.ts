import { useState, useEffect, useCallback } from 'react';
import {
  getLoyaltyConfig, getAllClientsLoyalty,
  type LoyaltyConfig, type ClientLoyalty,
} from '@services/supabase/loyalty';

export function useLoyalty(businessId: string) {
  const [config,   setConfig]   = useState<LoyaltyConfig | null>(null);
  const [balances, setBalances] = useState<Map<string, ClientLoyalty>>(new Map());
  const [loading,  setLoading]  = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const [cfg, all] = await Promise.all([
        getLoyaltyConfig(businessId),
        getAllClientsLoyalty(businessId),
      ]);
      setConfig(cfg);
      setBalances(new Map(all.map(c => [c.client_name.toLowerCase().trim(), c])));
    } catch {
      // non-fatal — loyalty is optional
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  return { config, balances, loading, refresh: load };
}
