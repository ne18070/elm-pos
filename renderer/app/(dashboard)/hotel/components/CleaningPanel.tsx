'use client';
import { useState } from 'react';
import { X, CheckCircle, Wrench, Clock, User, ClipboardList, Loader2 } from 'lucide-react';
import type { HotelRoom, HotelCleaningLog } from '@services/supabase/hotel';
import { cn } from '@/lib/utils';

interface StaffItem { id: string; name: string }

interface Props {
  room: HotelRoom;
  logs: HotelCleaningLog[];
  logsLoading: boolean;
  staff: StaffItem[];
  saving: boolean;
  onMarkClean: (notes: string) => void;
  onSendMaintenance: (notes: string) => void;
  onMaintenanceDone: (notes: string) => void;
  onAssignCleaner: (staffId: string | null) => void;
  onClose: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  cleaned:           'Chambre propre',
  maintenance_start: 'Envoyée en maintenance',
  maintenance_end:   'Maintenance terminée',
  assigned:          'Responsable assigné',
};

const ACTION_COLORS: Record<string, string> = {
  cleaned:           'text-emerald-400',
  maintenance_start: 'text-slate-400',
  maintenance_end:   'text-emerald-400',
  assigned:          'text-content-brand',
};

export function CleaningPanel({
  room, logs, logsLoading, staff, saving,
  onMarkClean, onSendMaintenance, onMaintenanceDone, onAssignCleaner, onClose,
}: Props) {
  const [notes, setNotes] = useState('');

  const isCleaning    = room.status === 'cleaning';
  const isMaintenance = room.status === 'maintenance';

  function doAction(fn: (n: string) => void) {
    fn(notes);
    setNotes('');
  }

  return (
    <div className="absolute inset-y-0 right-0 w-full max-w-md bg-surface-card border-l border-surface-border flex flex-col z-40 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border shrink-0">
        <div>
          <h2 className="font-bold text-content-primary flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-content-brand" />
            Ménage — Chambre {room.number}
          </h2>
          <p className="text-xs text-content-secondary mt-0.5">
            {isCleaning ? 'En nettoyage après check-out' : 'En maintenance'}
          </p>
        </div>
        <button onClick={onClose} className="text-content-secondary hover:text-content-primary">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Assign cleaner */}
        {staff.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-content-primary uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3 h-3" /> Responsable ménage
            </label>
            <select
              value={room.assigned_cleaner_id ?? ''}
              onChange={(e) => onAssignCleaner(e.target.value || null)}
              className="input h-10 text-sm w-full"
              disabled={saving}
            >
              <option value="">— Non assigné —</option>
              {staff.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Notes */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-content-primary uppercase tracking-wider">
            Notes (optionnel)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: tache sur le tapis, ampoule à changer..."
            rows={3}
            className="input text-sm resize-none w-full"
          />
        </div>

        {/* Action buttons */}
        <div className="space-y-3">
          {isCleaning && (
            <>
              <button
                disabled={saving}
                onClick={() => doAction(onMarkClean)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 font-bold text-sm transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Marquer propre — Disponible
              </button>
              <button
                disabled={saving}
                onClick={() => doAction(onSendMaintenance)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-500/10 border border-slate-500/30 text-content-secondary hover:bg-slate-500/20 font-bold text-sm transition-all disabled:opacity-50"
              >
                <Wrench className="w-4 h-4" />
                Envoyer en maintenance
              </button>
            </>
          )}
          {isMaintenance && (
            <button
              disabled={saving}
              onClick={() => doAction(onMaintenanceDone)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 font-bold text-sm transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Maintenance terminée — Disponible
            </button>
          )}
        </div>

        {/* Cleaning history */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-content-primary uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" /> Historique ménage
          </h3>
          {logsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-content-secondary" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-xs text-content-secondary text-center py-6 border border-dashed border-surface-border rounded-xl">
              Aucun historique pour cette chambre
            </p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => {
                const colorClass = ACTION_COLORS[log.action] ?? 'text-content-secondary';
                const IconComp = log.action === 'maintenance_start' ? Wrench
                  : log.action === 'assigned' ? User
                  : CheckCircle;
                return (
                  <div key={log.id} className="flex gap-3 p-3 rounded-xl bg-surface-card border border-surface-border">
                    <div className={cn('mt-0.5 shrink-0', colorClass)}>
                      <IconComp className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-content-primary">
                        {ACTION_LABELS[log.action] ?? log.action}
                      </p>
                      {log.cleaner && (
                        <p className="text-[10px] text-content-secondary flex items-center gap-1">
                          <User className="w-2.5 h-2.5" /> {log.cleaner.name}
                        </p>
                      )}
                      {log.notes && (
                        <p className="text-[10px] text-content-secondary mt-0.5 italic">{log.notes}</p>
                      )}
                      <p className="text-[10px] text-content-muted mt-0.5">
                        {new Date(log.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
