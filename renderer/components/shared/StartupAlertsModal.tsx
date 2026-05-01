'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { AlertTriangle, Vault, Wrench, CreditCard, X } from 'lucide-react';
import { useCashSessionStore } from '@/store/cashSession';
import { useAuthStore } from '@/store/auth';
import { supabase } from '@/lib/supabase';

const TODAY = new Date().toDateString();

function isDismissedToday(key: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(key) === TODAY;
}
function dismissToday(key: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, TODAY);
}

const SESSION_DISMISS_KEY = 'startup-session-alert-dismissed';

interface StaleService {
  id: string;
  order_number: number;
  client_name: string | null;
  started_at: string;
}

interface UnpaidService {
  id: string;
  order_number: number;
  client_name: string | null;
  finished_at: string | null;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

export function StartupAlertsModal() {
  const { session, loaded } = useCashSessionStore();
  const { business } = useAuthStore();

  const [staleServices, setStaleServices]   = useState<StaleService[]>([]);
  const [unpaidServices, setUnpaidServices] = useState<UnpaidService[]>([]);
  const [stalesDismissed, setStalesDismissed]   = useState(false);
  const [unpaidDismissed, setUnpaidDismissed]   = useState(false);
  const [sessionDismissed, setSessionDismissed] = useState(false);
  const [ready, setReady] = useState(false);

  const businessIdRef = useRef(business?.id);
  businessIdRef.current = business?.id;

  const sessionIsOld =
    loaded &&
    !!session?.opened_at &&
    new Date(session.opened_at).toDateString() !== new Date().toDateString();

  const checkServices = useCallback(async () => {
    const id = businessIdRef.current;
    if (!id) return;

    const twoHoursAgo = new Date(Date.now() - 2 * ONE_HOUR_MS).toISOString();

    const [{ data: stale }, { data: unpaid }] = await Promise.all([
      (supabase as any)
        .from('service_orders')
        .select('id, order_number, client_name, started_at')
        .eq('business_id', id)
        .eq('status', 'en_cours')
        .lt('started_at', twoHoursAgo),
      (supabase as any)
        .from('service_orders')
        .select('id, order_number, client_name, finished_at')
        .eq('business_id', id)
        .eq('status', 'termine'),
    ]);

    setStaleServices((stale ?? []) as StaleService[]);
    setUnpaidServices((unpaid ?? []) as UnpaidService[]);
    setStalesDismissed(false);
    setUnpaidDismissed(false);
  }, []);

  useEffect(() => {
    if (!loaded || !business?.id) return;

    setSessionDismissed(isDismissedToday(SESSION_DISMISS_KEY));

    checkServices().finally(() => setReady(true));

    const interval = setInterval(checkServices, ONE_HOUR_MS);
    return () => clearInterval(interval);
  }, [loaded, business?.id, checkServices]);

  const showSession = ready && sessionIsOld && !sessionDismissed;
  const showStales  = staleServices.length > 0 && !stalesDismissed;
  const showUnpaid  = unpaidServices.length > 0 && !unpaidDismissed;
  const visible     = showSession || showStales || showUnpaid;

  function handleDismiss() {
    if (showSession) { dismissToday(SESSION_DISMISS_KEY); setSessionDismissed(true); }
    if (showStales)  { setStalesDismissed(true); }
    if (showUnpaid)  { setUnpaidDismissed(true); }
  }

  if (!visible || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface-card border border-surface-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-surface-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-badge-warning flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-status-warning" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-content-primary">Alertes</h2>
              <p className="text-xs text-content-muted mt-0.5">Points nécessitant votre attention</p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-content-secondary hover:text-content-primary p-1.5 rounded-lg hover:bg-surface-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Alerts */}
        <div className="p-4 space-y-3">

          {showSession && session && (
            <div className="flex items-start gap-3 p-3.5 rounded-xl border border-status-warning/40 bg-badge-warning">
              <div className="w-9 h-9 rounded-xl bg-status-warning/15 border border-status-warning/30 flex items-center justify-center shrink-0">
                <Vault className="w-4 h-4 text-status-warning" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-content-primary">Caisse non clôturée</p>
                <p className="text-xs text-content-secondary mt-0.5 leading-relaxed">
                  La session ouverte le{' '}
                  <span className="font-medium text-content-primary">
                    {new Date(session.opened_at).toLocaleDateString('fr-FR', {
                      weekday: 'long', day: 'numeric', month: 'long',
                    })}
                  </span>{' '}
                  n&apos;a pas été clôturée.
                </p>
                <Link href="/caisse" onClick={handleDismiss}
                  className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-status-warning hover:underline">
                  Aller clôturer la caisse →
                </Link>
              </div>
            </div>
          )}

          {showStales && (
            <div className="flex items-start gap-3 p-3.5 rounded-xl border border-status-error/40 bg-badge-error">
              <div className="w-9 h-9 rounded-xl bg-status-error/15 border border-status-error/30 flex items-center justify-center shrink-0">
                <Wrench className="w-4 h-4 text-status-error" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-content-primary">
                  {staleServices.length} prestation{staleServices.length > 1 ? 's' : ''} en cours depuis +2h
                </p>
                <p className="text-xs text-content-secondary mt-0.5 leading-relaxed">
                  {staleServices.slice(0, 3).map((s) =>
                    `#${s.order_number}${s.client_name ? ` — ${s.client_name}` : ''}`
                  ).join(', ')}
                  {staleServices.length > 3 ? ` et ${staleServices.length - 3} autre(s)` : ''}.
                  {' '}Vérifiez leur avancement.
                </p>
                <Link href="/services?status=en_cours" onClick={handleDismiss}
                  className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-status-error hover:underline">
                  Voir les prestations →
                </Link>
              </div>
            </div>
          )}

          {showUnpaid && (
            <div className="flex items-start gap-3 p-3.5 rounded-xl border border-status-info/40 bg-badge-info">
              <div className="w-9 h-9 rounded-xl bg-status-info/15 border border-status-info/30 flex items-center justify-center shrink-0">
                <CreditCard className="w-4 h-4 text-status-info" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-content-primary">
                  {unpaidServices.length} prestation{unpaidServices.length > 1 ? 's' : ''} terminée{unpaidServices.length > 1 ? 's' : ''} non encaissée{unpaidServices.length > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-content-secondary mt-0.5 leading-relaxed">
                  {unpaidServices.slice(0, 3).map((s) =>
                    `#${s.order_number}${s.client_name ? ` — ${s.client_name}` : ''}`
                  ).join(', ')}
                  {unpaidServices.length > 3 ? ` et ${unpaidServices.length - 3} autre(s)` : ''}.
                  {' '}En attente d&apos;encaissement.
                </p>
                <Link href="/services?status=termine" onClick={handleDismiss}
                  className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-status-info hover:underline">
                  Encaisser les prestations →
                </Link>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-4 pb-4">
          <button onClick={handleDismiss} className="w-full btn-secondary h-10 text-sm font-medium">
            Compris
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
