'use client';

import { X, Check, Calendar, AlertCircle, Plus, Trash2 } from 'lucide-react';
import type { HotelRoom, HotelGuest, HotelReservation } from '@services/supabase/hotel';
import { computeRoomTotal } from '@services/supabase/hotel';
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

// Chambre additionnelle pour réservation multi-chambres
interface ExtraRoom { room_id: string; price_per_night: string }

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
  editItem?:        HotelReservation | null;   // non-null = mode édition
  extraRooms:       ExtraRoom[];
  onChange:         (f: ResForm) => void;
  setGuestSearch:   (v: string) => void;
  setGuestDropOpen: (v: boolean) => void;
  onSave:           () => void;
  openGuestPanel:   (item: HotelGuest | null) => void;
  onClearConflict:  () => void;
  onClose:          () => void;
  onAddExtraRoom:   () => void;
  onRemoveExtraRoom:(idx: number) => void;
  onChangeExtraRoom:(idx: number, er: ExtraRoom) => void;
}

export function ReservationPanel({
  form, rooms, guests, reservations, guestSearch, guestDropOpen,
  resNights, resTotal, conflictWarning, saving, currency, editItem, extraRooms,
  onChange, setGuestSearch, setGuestDropOpen, onSave, openGuestPanel, onClearConflict, onClose,
  onAddExtraRoom, onRemoveExtraRoom, onChangeExtraRoom,
}: Props) {
  const isEdit = !!editItem;

  function roomWeekendPrice(roomId: string): number | null {
    return rooms.find(r => r.id === roomId)?.weekend_price_per_night ?? null;
  }

  function extraRoomTotal(er: ExtraRoom): number {
    if (!er.room_id || !er.price_per_night || !form.check_in || !form.check_out || form.check_out <= form.check_in) return 0;
    const { total } = computeRoomTotal(form.check_in, form.check_out, Number(er.price_per_night), roomWeekendPrice(er.room_id));
    return total;
  }

  // Weekend info for the main room
  const mainWeekendPrice = roomWeekendPrice(form.room_id);
  const mainComputed = form.check_in && form.check_out && form.check_out > form.check_in && form.price_per_night
    ? computeRoomTotal(form.check_in, form.check_out, Number(form.price_per_night), mainWeekendPrice)
    : null;

  const grandTotal = (mainComputed?.total ?? 0) + extraRooms.reduce((s, er) => s + extraRoomTotal(er), 0);

  return (
    <div className="absolute inset-y-0 right-0 w-[420px] bg-surface-card border-l border-surface-border shadow-2xl flex flex-col z-40">
      <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
        <h3 className="font-semibold text-content-primary">
          {isEdit ? 'Modifier la réservation' : 'Nouvelle réservation'}
        </h3>
        <button onClick={onClose} className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-hover">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">

        {/* Chambre principale */}
        <div>
          <label className="label">Chambre <span className="text-status-error">*</span></label>
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

        {/* Client (masqué en mode édition) */}
        {!isEdit && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label !mb-0">Client <span className="text-status-error">*</span></label>
              <button type="button" onClick={() => openGuestPanel(null)} className="text-xs text-content-brand hover:text-content-brand">
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
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-content-secondary hover:text-content-primary"
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
                        className={`w-full text-left px-3 py-2 hover:bg-surface-hover flex items-center gap-2 transition-colors ${form.guest_id === g.id ? 'bg-brand-600/10 text-content-brand' : 'text-content-primary'}`}
                      >
                        <div className="w-7 h-7 rounded-full bg-brand-600/20 text-content-brand flex items-center justify-center text-xs font-bold shrink-0">
                          {g.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{g.full_name}</p>
                          {g.phone && <p className="text-xs text-content-secondary">{g.phone}</p>}
                        </div>
                      </button>
                    ))}
                  {guests.filter((g) => {
                    const q = guestSearch.toLowerCase();
                    return !q || g.full_name.toLowerCase().includes(q) || (g.phone ?? '').includes(q) || (g.id_number ?? '').includes(q);
                  }).length === 0 && (
                    <p className="px-3 py-3 text-sm text-content-primary text-center">Aucun client trouvé</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dates */}
        <div>
          <label className="label">Dates du séjour <span className="text-status-error">*</span></label>
          <CalendarPicker
            checkIn={form.check_in}
            checkOut={form.check_out}
            onSelect={(ci, co) => onChange({ ...form, check_in: ci, check_out: co })}
            bookedRanges={
              form.room_id
                ? reservations
                    .filter((r) => r.room_id === form.room_id && r.status !== 'cancelled' && r.id !== editItem?.id)
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

        {/* Info tarif weekend */}
        {mainComputed && mainComputed.hasWeekendRates && (
          <div className="p-2.5 rounded-lg bg-badge-warning border border-status-warning/30 text-xs text-status-warning">
            Tarif weekend appliqué (ven./sam.) — total chambre : {fmtMoney(mainComputed.total, currency)}
          </div>
        )}

        <div>
          <label className="label">Notes</label>
          <textarea className="input min-h-[72px] resize-none text-sm" value={form.notes} onChange={(e) => onChange({ ...form, notes: e.target.value })} />
        </div>

        {resNights > 0 && form.price_per_night && (
          <div className="p-3 rounded-xl bg-badge-brand border border-brand-800 text-sm text-content-brand">
            <Calendar className="w-4 h-4 inline mr-1.5" />
            <strong>{resNights} nuit{resNights > 1 ? 's' : ''}</strong> — {fmtMoney(mainComputed?.total ?? resTotal, currency)}
          </div>
        )}

        {/* Acompte (création uniquement) */}
        {!isEdit && (
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
        )}

        {/* Chambres additionnelles (création uniquement) */}
        {!isEdit && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-content-secondary uppercase tracking-wide">Chambres supplémentaires</p>
              <button
                type="button"
                onClick={onAddExtraRoom}
                className="flex items-center gap-1 text-xs text-content-brand hover:text-brand-400"
              >
                <Plus className="w-3.5 h-3.5" /> Ajouter
              </button>
            </div>
            {extraRooms.map((er, idx) => {
              const erRoom = rooms.find(r => r.id === er.room_id);
              return (
                <div key={idx} className="flex gap-2 mb-2 items-start">
                  <select
                    className="input flex-1 text-sm"
                    value={er.room_id}
                    onChange={(e) => {
                      const room = rooms.find(r => r.id === e.target.value);
                      onChangeExtraRoom(idx, { room_id: e.target.value, price_per_night: room ? String(room.price_per_night) : er.price_per_night });
                    }}
                  >
                    <option value="">— Chambre —</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.number} ({fmtMoney(r.price_per_night, currency)}/nuit)
                        {r.status !== 'available' ? ` [${roomStatusLabel(r.status)}]` : ''}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input w-24 text-sm"
                    type="number"
                    min={0}
                    placeholder="Prix/nuit"
                    value={er.price_per_night}
                    onChange={(e) => onChangeExtraRoom(idx, { ...er, price_per_night: e.target.value })}
                  />
                  <button type="button" onClick={() => onRemoveExtraRoom(idx)} className="p-2 text-status-error hover:bg-badge-error rounded-lg mt-0.5">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
            {extraRooms.length > 0 && resNights > 0 && (
              <div className="p-3 rounded-xl bg-badge-brand border border-brand-800 text-sm text-content-brand mt-1">
                <strong>Total toutes chambres : {fmtMoney(grandTotal, currency)}</strong>
                {' '}({1 + extraRooms.filter(er => er.room_id).length} chambre{extraRooms.filter(er => er.room_id).length > 0 ? 's' : ''})
              </div>
            )}
          </div>
        )}
      </div>

      {conflictWarning && (
        <div className="mx-5 mb-3 p-3 rounded-xl bg-badge-warning border border-status-warning text-sm text-status-warning space-y-2">
          <p className="flex items-start gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{conflictWarning.msg}</p>
          <div className="flex gap-2">
            <button onClick={onClearConflict} className="flex-1 py-1.5 rounded-lg border border-status-warning hover:bg-badge-warning text-xs">Annuler</button>
            <button onClick={conflictWarning.onProceed} disabled={saving} className="flex-1 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600 text-xs font-medium">
              {saving ? 'En cours…' : 'Forcer la réservation'}
            </button>
          </div>
        </div>
      )}

      <div className="px-5 py-4 border-t border-surface-border">
        <button
          onClick={onSave}
          disabled={saving || !form.room_id || (!isEdit && !form.guest_id) || !form.check_in || !form.check_out || !form.price_per_night}
          className="btn-primary w-full h-10 flex items-center justify-center gap-2"
        >
          {saving ? 'Enregistrement…' : <><Check className="w-4 h-4" /> {isEdit ? 'Enregistrer les modifications' : 'Créer la réservation'}</>}
        </button>
      </div>
    </div>
  );
}
