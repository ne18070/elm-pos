'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';
import { useCashSessionStore } from '@/store/cashSession';

const WARN_AFTER_MS  = 2 * 60 * 60 * 1000;  // 2h
const LOGOUT_AFTER_MS = 4 * 60 * 60 * 1000; // 4h
const LAST_SEEN_INTERVAL_MS = 5 * 60 * 1000; // update last_seen every 5 min

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];

export function InactivityGuard() {
  const { clear } = useAuthStore();
  const { setSubscription, setLoaded } = useSubscriptionStore();

  const [showWarning, setShowWarning] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const warnTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSeenRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  const doLogout = useCallback(async () => {
    const { session: cashSession, setSession, setLoaded: setCashLoaded } = useCashSessionStore.getState();
    // Ne pas déconnecter si une session de caisse est en cours —juste garder l'avertissement visible
    if (cashSession) {
      setShowWarning(true);
      return;
    }
    await supabase.auth.signOut();
    setSubscription(null);
    setLoaded(false);
    setSession(null);
    setCashLoaded(false);
    clear();
  }, [clear, setSubscription, setLoaded]);

  const resetTimers = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowWarning(false);

    if (warnTimerRef.current)   clearTimeout(warnTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);

    warnTimerRef.current   = setTimeout(() => setShowWarning(true), WARN_AFTER_MS);
    logoutTimerRef.current = setTimeout(() => doLogout(), LOGOUT_AFTER_MS);
  }, [doLogout]);

  // Update last_seen_at in Supabase periodically
  const updateLastSeen = useCallback(async () => {
    try {
      await (supabase as any).rpc('update_last_seen');
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    resetTimers();
    updateLastSeen();

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, resetTimers, { passive: true }));
    lastSeenRef.current = setInterval(updateLastSeen, LAST_SEEN_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, resetTimers));
      if (warnTimerRef.current)   clearTimeout(warnTimerRef.current);
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
      if (lastSeenRef.current)    clearInterval(lastSeenRef.current);
    };
  }, [resetTimers, updateLastSeen]);

  if (!showWarning) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card max-w-sm w-full mx-4 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-status-warning" />
          </div>
          <div>
            <h2 className="font-semibold text-content-primary">Session inactive</h2>
            <p className="text-sm text-content-secondary mt-1">
              Vous serez déconnecté automatiquement dans <strong className="text-content-primary">2 heures</strong> en raison d&apos;inactivité.
              {useCashSessionStore.getState().session && (
                <span className="block mt-1 text-status-warning text-xs">Une session de caisse est ouverte —la déconnexion est bloquée.</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={resetTimers}
            className="btn-primary flex-1"
          >
            Rester connecté
          </button>
          <button
            onClick={doLogout}
            className="btn-secondary flex-1"
          >
            Déconnexion
          </button>
        </div>
      </div>
    </div>
  );
}

