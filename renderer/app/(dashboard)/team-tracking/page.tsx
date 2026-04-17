'use client';

import { useRealtimeStore } from '@/store/realtime';
import { MapPin, Navigation, Clock, User, Globe, WifiOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

function safeFormatDistance(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: fr });
  } catch {
    return '–';
  }
}

function accuracyColor(accuracy: number | undefined): string {
  if (accuracy === undefined) return 'text-slate-400';
  if (accuracy < 50)  return 'text-green-400';
  if (accuracy < 200) return 'text-yellow-400';
  return 'text-red-400';
}

export default function TeamTrackingPage() {
  const { terminals, status } = useRealtimeStore();

  const trackedMembers = terminals.filter(t => t.is_tracking && t.location);
  const otherMembers   = terminals.filter(t => !t.is_tracking || !t.location);

  return (
    <div className="flex-1 overflow-y-auto bg-surface p-6">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Disconnected banner */}
        {status !== 'connected' && (
          <div className="flex items-center gap-3 px-4 py-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-yellow-400 text-sm">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>
              {status === 'connecting' ? 'Connexion en cours…' : 'Déconnecté — les positions affichées peuvent être obsolètes.'}
            </span>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <div className="p-2 bg-brand-600/20 rounded-lg">
                <MapPin className="w-6 h-6 text-brand-400" />
              </div>
              Suivi Terrain en Temps Réel
            </h1>
            <p className="text-slate-500 mt-1">
              Visualisez la position partagée des membres de votre équipe en mission.
            </p>
          </div>

          <div className="flex items-center gap-3 px-4 py-2 bg-surface-card border border-surface-border rounded-xl">
            <div className={cn(
              "w-2 h-2 rounded-full",
              status === 'connected' ? "bg-green-500 animate-ping" : "bg-slate-500"
            )} />
            <span className="text-sm font-bold text-white">
              {trackedMembers.length} membre{trackedMembers.length > 1 ? 's' : ''} actif{trackedMembers.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Tracked Members Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {trackedMembers.length > 0 ? (
            trackedMembers.map((member) => (
              <div
                key={member.terminal_id}
                className="bg-surface-card border border-brand-600/30 rounded-2xl p-5 relative overflow-hidden group hover:border-brand-500 transition-all shadow-glow-sm"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-brand-600/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-brand-600/10 transition-colors" />

                <div className="flex items-start justify-between relative z-10">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-brand-600 flex items-center justify-center shadow-lg">
                      <User className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-lg leading-none">{member.user_name}</h3>
                      <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Actif {safeFormatDistance(member.joined_at)}
                      </p>
                    </div>
                  </div>

                  <a
                    href={`https://www.google.com/maps?q=${member.location!.lat},${member.location!.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl transition-all shadow-lg active:scale-95"
                    title="Voir sur Google Maps"
                  >
                    <Navigation className="w-5 h-5" />
                  </a>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3 relative z-10">
                  <div className="bg-surface-input/50 rounded-xl p-3 border border-surface-border">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Position</p>
                    <p className="text-sm text-slate-300 font-mono mt-1">
                      {member.location!.lat.toFixed(5)}, {member.location!.lng.toFixed(5)}
                    </p>
                  </div>
                  <div className="bg-surface-input/50 rounded-xl p-3 border border-surface-border">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Précision</p>
                    <p className={cn("text-sm font-mono mt-1", accuracyColor(member.location!.accuracy))}>
                      ±{Math.round(member.location!.accuracy ?? 0)}m
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 text-xs text-slate-400 bg-surface-input/30 p-2.5 rounded-lg border border-surface-border/50">
                  <Globe className="w-3.5 h-3.5 text-brand-400" />
                  <span className="truncate">Page actuelle : <span className="text-slate-200">{member.pathname}</span></span>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full py-20 bg-surface-card/30 rounded-3xl border border-dashed border-surface-border flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 bg-surface-input rounded-full flex items-center justify-center mb-6">
                <MapPin className="w-10 h-10 text-slate-700" />
              </div>
              <h3 className="text-slate-300 font-bold text-lg">Aucun membre en cours de tracking</h3>
              <p className="text-slate-500 text-sm mt-2 max-w-xs mx-auto">
                Les membres de l&apos;équipe doivent activer le "Tracking Terrain" dans leur barre latérale pour apparaître ici.
              </p>
            </div>
          )}
        </div>

        {/* Other Active Terminals */}
        {otherMembers.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest px-1">
              Autres membres connectés ({otherMembers.length})
            </h2>
            <div className="bg-surface-card border border-surface-border rounded-2xl overflow-hidden divide-y divide-surface-border">
              {otherMembers.map((member) => (
                <div key={member.terminal_id} className="p-4 flex items-center justify-between hover:bg-surface-hover/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-surface-input flex items-center justify-center text-xs font-bold text-slate-400 border border-surface-border">
                      {member.user_name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{member.user_name}</p>
                      <p className="text-[10px] text-slate-500 uppercase font-semibold">{member.pathname}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-500">Connecté</p>
                    <p className="text-xs text-slate-400 font-medium">
                      {safeFormatDistance(member.joined_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
