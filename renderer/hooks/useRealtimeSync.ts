'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useRealtimeStore } from '@/store/realtime';
import { useCashSessionStore } from '@/store/cashSession';
import { getCurrentSession } from '@services/supabase/cash-sessions';
import type { RealtimeChannel } from '@supabase/realtime-js';

// ─── Typed CustomEvent helpers ────────────────────────────────────────────────
//
// These events are dispatched on `window` so any hook can listen without
// being passed a callback.  Each event carries the minimal payload needed.

export type RealtimeTable =
  | 'orders'
  | 'products'
  | 'categories'
  | 'coupons'
  | 'cash_sessions'
  | 'contracts';

export function dispatchTableChanged(table: RealtimeTable, detail?: unknown) {
  window.dispatchEvent(
    new CustomEvent(`elm-pos:${table}:changed`, { detail })
  );
}

// ─── Master realtime hook ─────────────────────────────────────────────────────
//
// Mount this ONCE in the dashboard layout.  It creates a single multiplexed
// Supabase Realtime channel `pos:{businessId}` that handles:
//   • postgres_changes for every relevant table
//   • Presence (connected terminals + current page)

export function useRealtimeSync() {
  const { business, user } = useAuthStore();
  const { terminalId, setStatus, setTerminals, addEvent } = useRealtimeStore();
  const { setSession } = useCashSessionStore();
  const pathname = usePathname();

  const channelRef      = useRef<RealtimeChannel | null>(null);
  // Stable joined_at — set once when the channel connects, never updated
  const joinedAtRef     = useRef<string>(new Date().toISOString());
  // Throttle refs — local, don't trigger re-renders
  const lastLocTrackRef = useRef<number>(0);
  const lastLocationRef = useRef<string>('');

  // ── Channel lifecycle (recreate only when business/user changes) ────────────
  useEffect(() => {
    if (!business?.id || !user) return;

    const businessId = business.id;
    setStatus('connecting');

    const channel = supabase.channel(`pos:${businessId}`, {
      config: { presence: { key: terminalId } },
    });

    channelRef.current = channel;

    // ── orders ──────────────────────────────────────────────────────────────
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders',
        filter: `business_id=eq.${businessId}` },
      (payload) => {
        addEvent({ table: 'orders', eventType: payload.eventType, at: new Date() });
        dispatchTableChanged('orders', { eventType: payload.eventType, record: payload.new });
      }
    );

    // ── products ─────────────────────────────────────────────────────────────
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'products',
        filter: `business_id=eq.${businessId}` },
      (payload) => {
        addEvent({ table: 'products', eventType: payload.eventType, at: new Date() });
        dispatchTableChanged('products', { eventType: payload.eventType, record: payload.new });
      }
    );

    // ── categories ───────────────────────────────────────────────────────────
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'categories',
        filter: `business_id=eq.${businessId}` },
      (payload) => {
        addEvent({ table: 'categories', eventType: payload.eventType, at: new Date() });
        dispatchTableChanged('categories');
      }
    );

    // ── coupons ──────────────────────────────────────────────────────────────
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'coupons',
        filter: `business_id=eq.${businessId}` },
      (payload) => {
        addEvent({ table: 'coupons', eventType: payload.eventType, at: new Date() });
        dispatchTableChanged('coupons');
      }
    );

    // ── cash_sessions ────────────────────────────────────────────────────────
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'cash_sessions',
        filter: `business_id=eq.${businessId}` },
      async (payload) => {
        addEvent({ table: 'cash_sessions', eventType: payload.eventType, at: new Date() });
        // Update the cash session store directly so the sidebar dot is live
        try {
          const session = await getCurrentSession(businessId);
          setSession(session);
        } catch { /* ignore */ }
        dispatchTableChanged('cash_sessions');
      }
    );

    // ── contracts ────────────────────────────────────────────────────────────
    channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'contracts',
        filter: `business_id=eq.${businessId}` },
      (payload) => {
        addEvent({ table: 'contracts', eventType: payload.eventType, at: new Date() });
        dispatchTableChanged('contracts', { eventType: payload.eventType, record: payload.new });
        // Notification spéciale quand un locataire signe
        if ((payload.new as Record<string, unknown>).status === 'signed') {
          window.dispatchEvent(
            new CustomEvent('elm-pos:contracts:signed', {
              detail: { record: payload.new },
            })
          );
        }
      }
    );

    // ── businesses (features / config changée par l'admin) ───────────────────
    channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'businesses',
        filter: `id=eq.${businessId}` },
      (payload) => {
        const updated = payload.new as Record<string, unknown>;
        const { setBusiness, business: currentBiz } = useAuthStore.getState();
        if (!currentBiz) return;
        // Mettre à jour uniquement les champs de config (pas les données sensibles)
        setBusiness({
          ...currentBiz,
          features: (updated.features as string[])   ?? currentBiz.features,
          types:    (updated.types    as string[])   ?? currentBiz.types,
          type:     (updated.type     as typeof currentBiz.type) ?? currentBiz.type,
        });
      }
    );

    // ── Presence ─────────────────────────────────────────────────────────────
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<{
        user_name:   string;
        pathname:    string;
        joined_at:   string;
        is_tracking?: boolean;
        location?:    { lat: number; lng: number; accuracy?: number };
      }>();

      const terminals = Object.entries(state).map(([termId, presences]) => ({
        terminal_id: termId,
        user_name:   presences[0]?.user_name  ?? 'Inconnu',
        pathname:    presences[0]?.pathname   ?? '/',
        joined_at:   presences[0]?.joined_at  ?? new Date().toISOString(),
        is_tracking: presences[0]?.is_tracking,
        location:    presences[0]?.location,
      }));

      setTerminals(terminals);
    });

    // ── Subscribe ─────────────────────────────────────────────────────────────
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setStatus('connected');
        joinedAtRef.current = new Date().toISOString(); // set once, never updated
        try {
          const { isTracking, location } = useRealtimeStore.getState();
          await channel.track({
            user_name:   user.full_name,
            pathname,
            joined_at:   joinedAtRef.current,
            is_tracking: isTracking,
            location:    location ?? undefined,
          });
        } catch { /* ignore */ }
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        setStatus('disconnected');
      }
    });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setStatus('disconnected');
      setTerminals([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id, user?.id]);

  // ── Update presence on route change, tracking toggle or new location ───────
  const { isTracking, location, status } = useRealtimeStore();

  useEffect(() => {
    if (!channelRef.current || !user || status !== 'connected') return;

    // For location updates: throttle to at most once every 10 s to avoid
    // flooding Supabase Realtime. Other changes (pathname, isTracking) always
    // go through immediately — we only check the location-specific throttle
    // when the location value itself changed.
    const locKey = location ? `${location.lat.toFixed(4)},${location.lng.toFixed(4)}` : '';
    const locationChanged = locKey !== lastLocationRef.current;

    if (locationChanged && location !== null) {
      const now = Date.now();
      if (now - lastLocTrackRef.current < 10_000) return; // throttled
      lastLocTrackRef.current = now;
      lastLocationRef.current = locKey;
    } else if (locationChanged && location === null) {
      // tracking stopped — always send immediately
      lastLocationRef.current = '';
    }

    channelRef.current.track({
      user_name:   user.full_name,
      pathname,
      joined_at:   joinedAtRef.current, // stable, never changes
      is_tracking: isTracking,
      location:    location ?? undefined,
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, user?.id, isTracking, location, status]);
}
