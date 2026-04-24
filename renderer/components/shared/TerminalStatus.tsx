'use client';

import { useRef, useState, useEffect } from 'react';
import { Monitor, Wifi, WifiOff, Loader2, ArrowUpDown } from 'lucide-react';
import { useRealtimeStore, type TerminalInfo, type RealtimeEvent } from '@/store/realtime';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

const TABLE_LABELS: Record<string, string> = {
  orders:        'Commandes',
  products:      'Produits',
  categories:    'Catégories',
  coupons:       'Coupons',
  cash_sessions: 'Caisse',
};

const EVENT_COLORS: Record<string, string> = {
  INSERT: 'text-status-success',
  UPDATE: 'text-blue-400',
  DELETE: 'text-status-error',
};

function PageLabel({ pathname }: { pathname: string }) {
  const map: Record<string, string> = {
    '/pos':       'Caisse',
    '/orders':    'Commandes',
    '/products':  'Produits',
    '/settings':  'Paramètres',
    '/analytics': 'Analytique',
    '/caisse':    'Clôture caisse',
    '/stock':     'Stock',
    '/users':     'Utilisateurs',
    '/billing':   'Abonnement',
  };
  for (const [prefix, label] of Object.entries(map)) {
    if (pathname.startsWith(prefix)) return <>{label}</>;
  }
  return <>{pathname}</>;
}

export function TerminalStatus() {
  const { status, terminals, lastEvents } = useRealtimeStore();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const statusDot = status === 'connected'
    ? 'bg-green-400'
    : status === 'connecting'
    ? 'bg-amber-400 animate-pulse'
    : 'bg-red-500';

  const statusLabel = status === 'connected'
    ? terminals.length > 1 ? `${terminals.length} terminaux` : `${terminals.length} terminal`
    : status === 'connecting'
    ? 'Connexion…'
    : 'Hors ligne';

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-content-secondary
                   hover:bg-surface-hover transition-colors"
        title="Synchronisation temps réel"
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
        {status === 'connecting' ? (
          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
        ) : status === 'connected' ? (
          <Wifi className="w-3 h-3 shrink-0" />
        ) : (
          <WifiOff className="w-3 h-3 shrink-0" />
        )}
        <span className="truncate">{statusLabel}</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-72 bg-surface border border-surface-border
                        rounded-2xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-border">
            <ArrowUpDown className="w-4 h-4 text-content-brand" />
            <span className="font-medium text-sm text-white">Synchronisation temps réel</span>
            <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${
              status === 'connected'
                ? 'bg-green-500/10 text-status-success'
                : status === 'connecting'
                ? 'bg-amber-500/10 text-status-warning'
                : 'bg-red-500/10 text-status-error'
            }`}>
              {status === 'connected' ? 'Connecté' : status === 'connecting' ? 'Connexion…' : 'Déconnecté'}
            </span>
          </div>

          {/* Active terminals */}
          {terminals.length > 0 && (
            <div className="px-4 py-3 border-b border-surface-border space-y-2">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                Terminaux actifs ({terminals.length})
              </p>
              {terminals.map((t) => (
                <TerminalRow key={t.terminal_id} terminal={t} />
              ))}
            </div>
          )}

          {/* Recent sync events */}
          <div className="px-4 py-3 space-y-1.5 max-h-48 overflow-y-auto">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-2">
              Événements récents
            </p>
            {lastEvents.length === 0 ? (
              <p className="text-xs text-slate-600 italic">Aucun événement</p>
            ) : (
              lastEvents.slice(0, 10).map((e, i) => (
                <EventRow key={i} event={e} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TerminalRow({ terminal }: { terminal: TerminalInfo }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-lg bg-brand-600/20 flex items-center justify-center shrink-0">
        <Monitor className="w-3 h-3 text-content-brand" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-white truncate">{terminal.user_name}</p>
        <p className="text-xs text-slate-500 truncate">
          <PageLabel pathname={terminal.pathname} />
        </p>
      </div>
      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
    </div>
  );
}

function EventRow({ event }: { event: RealtimeEvent }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`font-medium w-12 shrink-0 ${EVENT_COLORS[event.eventType] ?? 'text-content-secondary'}`}>
        {event.eventType === 'INSERT' ? '+ajout'
          : event.eventType === 'UPDATE' ? '~màj'
          : '-suppr'}
      </span>
      <span className="text-slate-300">{TABLE_LABELS[event.table] ?? event.table}</span>
      <span className="ml-auto text-slate-600 shrink-0">
        {formatDistanceToNow(event.at, { addSuffix: true, locale: fr })}
      </span>
    </div>
  );
}
