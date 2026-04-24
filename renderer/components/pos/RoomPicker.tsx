'use client';

import { useEffect, useState } from 'react';
import { BedDouble, Loader2, Search, User, X } from 'lucide-react';
import { getReservations } from '@services/supabase/hotel';
import type { HotelReservation } from '@pos-types';
import { formatCurrency } from '@/lib/utils';

interface RoomPickerProps {
  businessId: string;
  currency: string;
  onSelect: (reservation: HotelReservation) => void;
  onCancel: () => void;
}

export function RoomPicker({ businessId, currency, onSelect, onCancel }: RoomPickerProps) {
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<HotelReservation[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const all = await getReservations(businessId);
        // Only active check-ins can be charged
        setReservations(all.filter(r => r.status === 'checked_in'));
      } catch (err) {
        console.error('Failed to load reservations:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [businessId]);

  const filtered = reservations.filter(r => 
    r.room?.number.toLowerCase().includes(search.toLowerCase()) ||
    r.guest?.full_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-content-primary">Sélectionner une chambre</h3>
        <button onClick={onCancel} className="text-content-secondary hover:text-content-primary">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-primary" />
        <input
          type="text"
          placeholder="Rechercher une chambre ou un client..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-10 h-11"
          autoFocus
        />
      </div>

      <div className="max-h-[300px] overflow-y-auto pr-1 -mr-1 space-y-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-content-primary">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Chargement des chambres...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-content-primary border border-dashed border-slate-800 rounded-xl">
            <p className="text-sm">{search ? 'Aucun résultat trouvé' : 'Aucun client en chambre actuellement'}</p>
          </div>
        ) : (
          filtered.map((r) => (
            <button
              key={r.id}
              onClick={() => onSelect(r)}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-surface-border bg-surface-card hover:border-brand-500 hover:bg-badge-brand transition-all text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-badge-brand border border-brand-700 flex items-center justify-center shrink-0">
                  <BedDouble className="w-5 h-5 text-content-brand" />
                </div>
                <div className="min-w-0">
                  <p className="text-content-primary font-bold">Chambre {r.room?.number}</p>
                  <p className="text-xs text-content-secondary flex items-center gap-1">
                    <User className="w-3 h-3" /> {r.guest?.full_name}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-content-primary uppercase font-medium">Solde actuel</p>
                <p className="text-sm font-semibold text-content-primary">
                  {formatCurrency(Number(r.total) - Number(r.paid_amount), currency)}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}


