'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, MapPinOff, Loader2 } from 'lucide-react';
import { useRealtimeStore } from '@/store/realtime';
import { useNotificationStore } from '@/store/notifications';
import { cn } from '@/lib/utils';

export function TeamTracker({ collapsed = false }: { collapsed?: boolean }) {
  const { isTracking, setTracking, setLocation } = useRealtimeStore();
  const { warning, error } = useNotificationStore();
  const watchId            = useRef<number | null>(null);
  const [isAcquiring, setIsAcquiring]           = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const STORAGE_KEY = 'elm-pos-tracking-active';

  const stopTracking = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setTracking(false);
    setLocation(null);
    setIsAcquiring(false);
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      error("La géolocalisation n'est pas supportée par votre navigateur");
      return;
    }
    if (watchId.current !== null) return;

    setPermissionDenied(false);
    sessionStorage.setItem(STORAGE_KEY, '1');
    setTracking(true);
    setIsAcquiring(true);

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setIsAcquiring(false);
        setLocation({
          lat:      pos.coords.latitude,
          lng:      pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        setIsAcquiring(false);
        if (err.code === 1 /* PERMISSION_DENIED */) {
          setPermissionDenied(true);
          stopTracking();
        } else {
          // TIMEOUT (3) or POSITION_UNAVAILABLE (2) — transient, keep watching
          warning("Signal GPS faible. Tentative de repositionnement en cours…");
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge:         10_000,
        timeout:            15_000, // cold-start GPS acquisition can take 10-15 s
      }
    );
  };

  // Watch permission changes — auto-clear denied state when user unblocks in browser settings
  useEffect(() => {
    if (!navigator.permissions) return;
    let permStatus: PermissionStatus | null = null;

    navigator.permissions.query({ name: 'geolocation' }).then((perm) => {
      permStatus = perm;
      perm.addEventListener('change', () => {
        if (perm.state === 'granted' || perm.state === 'prompt') {
          setPermissionDenied(false);
        }
      });
    });

    return () => {
      permStatus?.removeEventListener('change', () => {});
    };
  }, []);

  // Auto-restart tracking after a page refresh if it was active before
  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY) === '1') {
      startTracking();
    }
    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label = isAcquiring ? "Acquisition…"    : isTracking ? "Tracking Actif"   : "Tracking Terrain";
  const sub   = isAcquiring ? "Recherche GPS…"  : isTracking ? "Position partagée" : "Position privée";

  return (
    <div className="relative">
      <button
        onClick={() => isTracking ? stopTracking() : startTracking()}
        disabled={isAcquiring}
        className={cn(
          "w-full flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all duration-200 group",
          isTracking
            ? "bg-brand-600/10 text-content-brand border border-brand-600/20 shadow-[0_0_15px_rgba(2,132,199,0.1)]"
            : "text-slate-500 hover:text-slate-300 hover:bg-surface-hover border border-transparent",
          isAcquiring && "opacity-75 cursor-wait",
          collapsed ? "justify-center" : ""
        )}
        title={isTracking ? "Arrêter le tracking" : "Activer le tracking terrain"}
      >
        <div className="relative shrink-0">
          {isAcquiring ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isTracking ? (
            <>
              <MapPin className="w-4 h-4 animate-bounce" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-brand-500 rounded-full animate-ping" />
            </>
          ) : (
            <MapPinOff className="w-4 h-4" />
          )}
        </div>

        {!collapsed && (
          <div className="flex-1 text-left min-w-0">
            <p className={cn(
              "text-[11px] font-bold uppercase tracking-wider leading-none",
              isTracking ? "text-content-brand" : "text-slate-500"
            )}>
              {label}
            </p>
            <p className="text-[10px] text-slate-600 truncate mt-0.5">
              {sub}
            </p>
          </div>
        )}

        {isTracking && !isAcquiring && !collapsed && (
          <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
        )}
      </button>
    {permissionDenied && !collapsed && (
      <div className="mt-1.5 px-2.5 py-2 rounded-lg bg-red-950/40 border border-status-error/30 text-[10px] text-status-error leading-relaxed space-y-1.5">
        <p className="font-semibold">Localisation bloquée</p>
        <ol className="text-status-error/80 space-y-1 list-decimal list-inside">
          <li>
            <strong>Windows</strong> → Paramètres → Confidentialité → Localisation → Activer
          </li>
          <li>
            Icône ℹ️ dans Chrome → <strong>Localisation → Autoriser</strong>
          </li>
          <li>Rechargez la page</li>
        </ol>
        <div className="flex gap-3 pt-0.5">
          <button
            onClick={() => window.location.reload()}
            className="text-[10px] font-semibold text-status-error hover:text-red-100 underline underline-offset-2"
          >
            Recharger
          </button>
          <button
            onClick={() => startTracking()}
            className="text-[10px] font-semibold text-status-error/60 hover:text-red-200 underline underline-offset-2"
          >
            Réessayer sans recharger
          </button>
        </div>
      </div>
    )}
    </div>
  );
}
