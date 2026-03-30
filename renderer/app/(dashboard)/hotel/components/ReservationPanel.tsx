'use client';

import { X, Check, Calendar, AlertCircle } from 'lucide-react';
import type { HotelRoom, HotelGuest, HotelReservation } from '@services/supabase/hotel';
import { CalendarPicker } from './CalendarPicker';
import { ROOM_TYPES, PayMethod, fmtMoney, roomStatusLabel } from './hotel-helpers';

interface ResForm {
  room_id:         string;
  guest_id:        string;
  check_in:        string;
  check_out:       string;
  num_guests:      number;
  price_per_night: string;
  notes:           string;
  deposit:         string;
  depositMethod:   PayMethod;
}

interface ConflictWarning { msg: string; onProceed: () => void }

interface Props {
  form:             ResForm;
  rooms:            HotelRoom[];
  guests:           HotelGuest[];
  reservations:     HotelReservation[];
  guestSearch:      string;
  guestDropOpen:    boolean;
  resNights:        number;
  resTotal:         number;
  conflictWarning:  ConflictWarning | null;
  saving:           boolean;
  currency:         string;
  onChange:         (f: ResForm) => void;
  setGuestSearch:   (v: string) => void;
  setGuestDropOpen: (v: boolean) => void;
  onSave:           () => void;
  openGuestPanel:   (item: HotelGuest | null) => void;
  onClearConflict:  () => void;
  onClose:          () => void;
}

export function ReservationPanel({
  form, rooms, guests, reservations, guestSearch, guestDropOpen,
  resNights, resTotal, conflictWarning, saving, currency,
  onChange, setGuestSearch, setGuestDropOpen, onSave, openGuestPanel, onClearConflict, onClose,
}: Props) {
  return (
    <div className="absolute inset-y-0 right-0 w-[420px] bg-surface-card border-l border-surface-border shadow-2xl flex flex-col z-40">
      <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
        <h3 className="font-semibold text-white">Nouvelle réservation</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Chambre */}
        <div>
          <label className="label">Chambre <span className="text-red-400">*</span></label>
          <select
            className="input"
            value={form.room_id}
            onChange={(e) => {
              const room = rooms.find((r) => r.id === e.target.value);
              onChange({ ...form, room_id: e.target.value, price_per_night: room ? String(room.price_per_night) : form.price_per_night });
            }}
          >
            <option value="">— Choisir —</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.number} — {ROOM_TYPES.find((t) => t.value === r.type)?.label} ({fmtMoney(r.price_per_night, currency)}/nuit)
                {r.status !== 'available' ? ` [${roomStatusLabel(r.status)}]` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Client */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label !mb-0">Client <span className="text-red-400">*</span></label>
            <button type="button" onClick={() => openGuestPanel(null)} className="text-xs text-brand-400 hover:text-brand-300">
              + Nouveau client
            </button>
          </div>
          <div className="relative">
            <input
              className="input pr-8"
              placeholder="Rechercher un client..."
              value={guestSearch}
              onChange={(e) => { setGuestSearch(e.target.value); setGuestDropOpen(true); }}
              onFocus={() => setGuestDropOpen(true)}
              onBlur={() => setTimeout(() => setGuestDropOpen(false), 150)}
            />
            {form.guest_id && (
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                onClick={() => { onChange({ ...form, guest_id: '' }); setGuestSearch(''); }}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {guestDropOpen && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-surface-card border border-surface-border rounded-xl shadow-xl max-h-52 overflow-y-auto">
                {guests
                  .filter((g) => {
                    const q = guestSearch.toLowerCase();
                    return !q || g.full_name.toLowerCase().includes(q) || (g.phone ?? '').includes(q) || (g.id_number ?? '').includes(q);
                  })
                  .map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onMouseDown={() => {
                        onChange({ ...form, guest_id: g.id });
                        setGuestSearch(g.full_name + (g.phone ? ` — ${g.phone}` : ''));
                        setGuestDropOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 hover:bg-surface-hover flex items-center gap-2 transition-colors ${form.guest_id === g.id ? 'bg-brand-600/10 text-brand-300' : 'text-white'}`}
                    >
                      <div className="w-7 h-7 rounded-full bg-brand-600/20 text-brand-300 flex items-center justify-center text-xs font-bold shrink-0">
                        {g.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{g.full_name}</p>
                        {g.phone && <p className="text-xs text-slate-400">{g.phone}</p>}
                      </div>
                    </button>
                  ))}
                {guests.filter((g) => {
                  const q = guestSearch.toLowerCase();
                  return !q || g.full_name.toLowerCase().includes(q) || (g.phone ?? '').includes(q) || (g.id_number ?? '').includes(q);
                }).length === 0 && (
                  <p className="px-3 py-3 text-sm text-slate-500 text-center">Aucun client trouvé</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Dates */}
        <div>
          <label className="label">Dates du séjour <span className="text-red-400">*</span></label>
          <CalendarPicker
            checkIn={form.check_in}
            checkOut={form.check_out}
            onSelect={(ci, co) => onChange({ ...form, check_in: ci, check_out: co })}
            bookedRanges={
              form.room_id
                ? reservations
                    .filter((r) => r.room_id === form.room_id && r.status !== 'cancelled')
                    .map((r) => ({ from: r.check_in, to: r.check_out }))
                : []
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Nb. personnes</label>
            <input className="input" type="number" min={1} value={form.num_guests} onChange={(e) => onChange({ ...form, num_guests: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Prix / nuit</label>
            <input className="input" type="number" min={0} value={form.price_per_night} onChange={(e) => onChange({ ...form, price_per_night: e.target.value })} />
          </div>
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea className="input min-h-[72px] resize-none text-sm" value={form.notes} onChange={(e) => onChange({ ...form, notes: e.target.value })} />
        </div>

        {resNights > 0 && form.price_per_night && (
          <div className="p-3 rounded-xl bg-brand-900/20 border border-brand-800 text-sm text-brand-300">
            <Calendar className="w-4 h-4 inline mr-1.5" />
            <strong>{resNights} nuit{resNights > 1 ? 's' : ''}</strong> → {fmtMoney(resTotal, currency)}
          </div>
        )}

        {/* Acompte */}
        <div>
          <label className="label">Acompte (optionnel)</label>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              type="number"
              min={0}
              placeholder="0"
              value={form.deposit}
              onChange={(e) => onChange({ ...form, deposit: e.target.value })}
            />
            <select className="input w-36" value={form.depositMethod} onChange={(e) => onChange({ ...form, depositMethod: e.target.value as PayMethod })}>
              <option value="cash">Espèces</option>
              <option value="card">Carte</option>
              <option value="mobile_money">Mobile</option>
            </select>
          </div>
        </div>
      </div>

      {conflictWarning && (
        <div className="mx-5 mb-3 p-3 rounded-xl bg-amber-900/20 border border-amber-700 text-sm text-amber-300 space-y-2">
          <p className="flex items-start gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{conflictWarning.msg}</p>
          <div className="flex gap-2">
            <button onClick={onClearConflict} className="flex-1 py-1.5 rounded-lg border border-amber-700 hover:bg-amber-900/30 text-xs">Annuler</button>
            <button onClick={conflictWarning.onProceed} disabled={saving} className="flex-1 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600 text-xs font-medium">
              {saving ? 'En cours…' : 'Forcer la réservation'}
            </button>
          </div>
        </div>
      )}

      <div className="px-5 py-4 border-t border-surface-border">
        <button
          onClick={onSave}
          disabled={saving || !form.room_id || !form.guest_id || !form.check_in || !form.check_out || !form.price_per_night}
          className="btn-primary w-full h-10 flex items-center justify-center gap-2"
        >
          {saving ? 'Enregistrement…' : <><Check className="w-4 h-4" /> Créer la réservation</>}
        </button>
      </div>
    </div>
  );
}
