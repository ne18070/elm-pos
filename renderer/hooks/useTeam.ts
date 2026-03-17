'use client';

import { useState, useEffect, useCallback } from 'react';
import { getTeamMembers } from '@services/supabase/users';
import type { User } from '@pos-types';

export function useTeam(businessId: string) {
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const data = await getTeamMembers(businessId);
      setMembers(data);
    } catch {
      // silencieux hors ligne
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { members, loading, refetch: fetch };
}
