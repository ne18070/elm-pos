'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { isBusinessBlocked } from '@services/supabase/business';

// Filet de sécurité si le canal Realtime est coupé. Reste bien sous la durée
// de vie d'un jeton (~1 h), au-delà de laquelle le compte banni est éjecté de toute façon.
const POLL_MS = 5 * 60 * 1000;

/**
 * Coupe une session ouverte dès que l'organisation de l'établissement actif est
 * bloquée depuis le backoffice : écoute organization_blocks en Realtime (la RLS ne
 * livre que les blocages de ses organisations) + vérification toutes les 5 min.
 * `onBlocked` recharge la session : l'AuthProvider bascule alors sur un autre
 * établissement accessible, ou déconnecte avec le message de suspension.
 */
export function useOrganizationBlockGuard(onBlocked: () => void) {
  const businessId   = useAuthStore((s) => s.business?.id ?? null);
  const isSuperAdmin = useAuthStore((s) => (s.user as { is_superadmin?: boolean } | null)?.is_superadmin ?? false);

  // Ref : le callback peut changer d'identité sans relancer l'abonnement
  const onBlockedRef = useRef(onBlocked);
  useEffect(() => { onBlockedRef.current = onBlocked; }, [onBlocked]);

  useEffect(() => {
    if (!businessId || isSuperAdmin) return;

    let cancelled = false;
    const check = async () => {
      const blocked = await isBusinessBlocked(businessId).catch(() => false);
      if (blocked && !cancelled) onBlockedRef.current();
    };

    const channel = supabase
      .channel(`org-block:${businessId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'organization_blocks' }, () => { void check(); })
      .subscribe();
    const timer = setInterval(() => { void check(); }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [businessId, isSuperAdmin]);
}
