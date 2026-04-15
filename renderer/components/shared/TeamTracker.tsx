'use client';

import { useEffect, useRef } from 'react';
import { MapPin, MapPinOff, Loader2 } from 'lucide-react';
import { useRealtimeStore } from '@/store/realtime';
import { useNotificationStore } from '@/store/notifications';
import { cn } from '@/lib/utils';

export function TeamTracker({ collapsed = false }: { collapsed?: boolean }) {
  const { isTracking, setTracking, setLocation } = useRealtimeStore();
  const { warning, error } = useNotificationStore();
  const watchId = useRef<number | null>(null);

  const STORAGE_KEY = 'elm-pos-tracking-active';

  const startTracking = () => {
    if (!navigator.geolocation) {
      error("La géolocalisation n'est pas supportée par votre navigateur");
      return;
    }

    sessionStorage.setItem(STORAGE_KEY, '1');
    setTracking(true);
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        console.error('Geolocation error:', err);
        warning("Erreur de géolocalisation. Vérifiez vos permissions.");
        stopTracking();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 5000,
      }
    );
  };

  const stopTracking = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setTracking(false);
    setLocation(null);
  };

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

  return (
    <div className="relative">
      <button
        onClick={() => isTracking ? stopTracking() : startTracking()}
        className={cn(
          "w-full flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all duration-200 group",
          isTracking 
            ? "bg-brand-600/10 text-brand-400 border border-brand-600/20 shadow-[0_0_15px_rgba(2,132,199,0.1)]" 
            : "text-slate-500 hover:text-slate-300 hover:bg-surface-hover border border-transparent",
          collapsed ? "justify-center" : ""
        )}
        title={isTracking ? "Arrêter le tracking" : "Activer le tracking terrain"}
      >
        <div className="relative shrink-0">
          {isTracking ? (
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
              isTracking ? "text-brand-400" : "text-slate-500"
            )}>
              {isTracking ? "Tracking Actif" : "Tracking Terrain"}
            </p>
            <p className="text-[10px] text-slate-600 truncate mt-0.5">
              {isTracking ? "Position partagée" : "Position privée"}
            </p>
          </div>
        )}

        {isTracking && !collapsed && (
          <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
        )}
      </button>
    </div>
  );
}
