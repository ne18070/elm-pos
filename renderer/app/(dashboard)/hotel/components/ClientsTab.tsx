'use client';

import { Search, Phone, Users, Pencil, Trash2 } from 'lucide-react';
import type { HotelGuest } from '@services/supabase/hotel';

interface Props {
  filteredGuests:   HotelGuest[];
  search:           string;
  loading:          boolean;
  onSearchChange:   (v: string) => void;
  openGuestPanel:   (item: HotelGuest | null) => void;
  removeGuest:      (id: string) => void;
}

export function ClientsTab({ filteredGuests, search, loading, onSearchChange, openGuestPanel, removeGuest }: Props) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="relative mb-5 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
        <input
          className="input pl-8 h-9 text-sm"
          placeholder="Chercher par nom, téléphone…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {loading && <p className="text-center text-slate-500 py-16">Chargement…</p>}

      {!loading && filteredGuests.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
          <Users className="w-12 h-12 opacity-20" />
          <p>Aucun client enregistré</p>
          <button onClick={() => openGuestPanel(null)} className="btn-primary h-9 text-sm">Ajouter un client</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl">
        {filteredGuests.map((g) => (
          <div key={g.id} className="card p-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-surface-input flex items-center justify-center shrink-0 text-sm font-bold text-content-brand">
              {g.full_name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{g.full_name}</p>
              {g.phone && <p className="text-xs text-content-secondary flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" />{g.phone}</p>}
              {g.nationality && <p className="text-xs text-slate-500">{g.nationality}</p>}
              {g.id_number && <p className="text-xs text-slate-500">{g.id_type} {g.id_number}</p>}
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => openGuestPanel(g)} className="p-1.5 rounded-lg text-content-secondary hover:text-white hover:bg-surface-hover">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => removeGuest(g.id)} className="p-1.5 rounded-lg text-content-secondary hover:text-status-error hover:bg-badge-error">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
