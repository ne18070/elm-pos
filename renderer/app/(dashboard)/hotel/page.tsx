'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Plus, Search, BedDouble, Users, Pencil, Trash2, X, Check,
  Calendar, Phone, BadgeCheck, ChevronRight, ChevronLeft, LogIn, LogOut,
  ClipboardList, AlertCircle, CreditCard, Wallet, Smartphone, Printer,
} from 'lucide-react';
import { generateHotelInvoice, printHtml } from '@/lib/invoice-templates';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { logAction } from '@services/supabase/logger';
import { cn } from '@/lib/utils';
import {
  getRooms, createRoom, updateRoom, deleteRoom,
  getGuests, createGuest, updateGuest, deleteGuest,
  getReservations, createReservation, cancelReservation, checkIn, checkOut,
  getServices, addService, deleteService, addHotelPayment,
  getRoomConflicts, nightsBetween,
} from '@services/supabase/hotel';
import { getCurrentSession } from '@services/supabase/cash-sessions';
import type {
  HotelRoom, HotelGuest, HotelReservation, HotelService,
  RoomType, RoomStatus, ReservationStatus,
} from '@services/supabase/hotel';

// ─── Constantes ───────────────────────────────────────────────────────────────

const ROOM_TYPES: { value: RoomType; label: string }[] = [
  { value: 'simple',    label: 'Simple'    },
  { value: 'double',    label: 'Double'    },
  { value: 'twin',      label: 'Twin'      },
  { value: 'suite',     label: 'Suite'     },
  { value: 'familiale', label: 'Familiale' },
];

const AMENITIES = ['WiFi', 'TV', 'Climatisation', 'Minibar', 'Salle de bain', 'Coffre-fort', 'Balcon', 'Vue mer'];

const ID_TYPES = ['CIN', 'Passeport', 'Titre de séjour', 'Autre'];

// ─── Helpers affichage ────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
function fmt(date: string): string {
  return new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtMoney(amount: number, currency = 'XOF'): string {
  return new Intl.NumberFormat('fr-FR', { style: 'decimal', maximumFractionDigits: 0 })
    .format(amount) + ' ' + currency;
}

function roomStatusStyle(status: RoomStatus): string {
  switch (status) {
    case 'available':   return 'border-green-700 bg-green-900/20 text-green-300';
    case 'occupied':    return 'border-brand-700 bg-brand-900/20 text-brand-300';
    case 'cleaning':    return 'border-amber-700 bg-amber-900/20 text-amber-300';
    case 'maintenance': return 'border-slate-600 bg-slate-800/40 text-slate-400';
  }
}
function roomStatusLabel(status: RoomStatus): string {
  switch (status) {
    case 'available':   return 'Disponible';
    case 'occupied':    return 'Occupée';
    case 'cleaning':    return 'Nettoyage';
    case 'maintenance': return 'Maintenance';
  }
}
function resStatusStyle(status: ReservationStatus): string {
  switch (status) {
    case 'confirmed':   return 'bg-slate-700 text-white';
    case 'checked_in':  return 'bg-brand-700 text-white';
    case 'checked_out': return 'bg-green-900/40 text-green-300';
    case 'cancelled':   return 'bg-red-900/40 text-red-300';
    case 'no_show':     return 'bg-amber-900/40 text-amber-300';
  }
}
function resStatusLabel(status: ReservationStatus): string {
  switch (status) {
    case 'confirmed':   return 'Confirmée';
    case 'checked_in':  return 'En cours';
    case 'checked_out': return 'Parti';
    case 'cancelled':   return 'Annulée';
    case 'no_show':     return 'No-show';
  }
}

// ─── Sélecteur de plage de dates ─────────────────────────────────────────────

const WEEK_DAYS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];
const MONTH_NAMES = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];

interface BookedRange { from: string; to: string }

function CalendarPicker({
  checkIn, checkOut, onSelect, bookedRanges = [],
}: {
  checkIn:      string;
  checkOut:     string;
  onSelect:     (ci: string, co: string) => void;
  bookedRanges?: BookedRange[];
}) {
  const initDate = checkIn ? new Date(checkIn + 'T12:00:00') : new Date();
  const [year,  setYear]  = useState(initDate.getFullYear());
  const [month, setMonth] = useState(initDate.getMonth());
  const [hover, setHover] = useState<string | null>(null);

  const today = todayStr();

  function ds(y: number, m: number, d: number): string {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  function handleClick(d: string) {
    if (!checkIn || (checkIn && checkOut)) {
      onSelect(d, '');                              // démarrer nouvelle sélection
    } else if (d > checkIn) {
      onSelect(checkIn, d);                         // fin de plage
    } else if (d < checkIn) {
      onSelect(d, checkIn);                         // inverser : ancien début devient fin
    } else {
      onSelect('', '');                             // même jour = reset
    }
  }

  function inRange(d: string): boolean {
    const end = checkOut || hover;
    if (!checkIn || !end) return false;
    const [s, e] = checkIn < end ? [checkIn, end] : [end, checkIn];
    return d > s && d < e;
  }
  function isBooked(d: string): boolean {
    return bookedRanges.some((r) => d >= r.from && d < r.to);
  }
  function isStart(d: string)  { return d === checkIn; }
  function isEnd(d: string)    { return d === checkOut; }

  const daysInMonth   = new Date(year, month + 1, 0).getDate();
  const firstWeekDay  = new Date(year, month, 1).getDay(); // 0=Sun
  const startOffset   = (firstWeekDay + 6) % 7;           // shift to Mon-start
  const totalCells    = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  return (
    <div className="rounded-xl border border-surface-border bg-surface-input p-3 select-none">
      {/* Navigation mois */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400 hover:text-white">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-white">
          {MONTH_NAMES[month]} {year}
        </span>
        <button onClick={nextMonth} className="p-1 rounded-lg hover:bg-surface-hover text-slate-400 hover:text-white">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* En-têtes jours */}
      <div className="grid grid-cols-7 mb-1">
        {WEEK_DAYS.map((d) => (
          <div key={d} className="text-center text-xs text-slate-500 font-medium py-1">{d}</div>
        ))}
      </div>

      {/* Grille */}
      <div className="grid grid-cols-7">
        {Array.from({ length: totalCells }, (_, i) => {
          const dayNum = i - startOffset + 1;
          if (dayNum < 1 || dayNum > daysInMonth) {
            return <div key={i} />;
          }
          const d      = ds(year, month, dayNum);
          const start  = isStart(d);
          const end    = isEnd(d);
          const range  = inRange(d);
          const booked = isBooked(d);
          const isToday = d === today;
          const past   = d < today;

          return (
            <div
              key={i}
              onMouseEnter={() => checkIn && !checkOut && setHover(d)}
              onMouseLeave={() => setHover(null)}
              onClick={() => !past && handleClick(d)}
              className={cn(
                'relative h-8 flex items-center justify-center text-xs font-medium transition-colors',
                past ? 'text-slate-600 cursor-default' : 'cursor-pointer',
                // range highlight (including hover preview)
                range && !start && !end ? 'bg-brand-900/40 text-white' : '',
                // start day
                start ? 'rounded-l-full bg-brand-600 text-white' : '',
                // end day
                end ? 'rounded-r-full bg-brand-600 text-white' : '',
                // neither start/end but in range
                !start && !end && range ? '' : '',
                // booked indicator
                booked && !start && !end ? 'text-red-400' : '',
                // today circle
                isToday && !start && !end ? 'font-bold' : '',
                // hover
                !start && !end && !range && !past ? 'hover:bg-surface-hover rounded-full' : '',
              )}
            >
              {isToday && !start && !end && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-400" />
              )}
              {booked && !start && !end && (
                <span className="absolute top-1 right-1 w-1 h-1 rounded-full bg-red-500" />
              )}
              {dayNum}
            </div>
          );
        })}
      </div>

      {/* Résumé sélection */}
      {(checkIn || checkOut) && (
        <div className="mt-3 pt-3 border-t border-surface-border flex items-center justify-between text-xs text-slate-400">
          <span>{checkIn ? fmt(checkIn) : '—'} → {checkOut ? fmt(checkOut) : <span className="text-amber-400 italic">choisir départ</span>}</span>
          {(checkIn || checkOut) && (
            <button
              onClick={() => onSelect('', '')}
              className="text-slate-500 hover:text-red-400 ml-2"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
      {!checkIn && (
        <p className="mt-2 text-xs text-slate-500 text-center">Cliquez sur la date d&apos;arrivée</p>
      )}
      {checkIn && !checkOut && (
        <p className="mt-2 text-xs text-amber-400 text-center">Cliquez sur la date de départ</p>
      )}
    </div>
  );
}

// ─── Types locaux ─────────────────────────────────────────────────────────────

type Tab = 'chambres' | 'reservations' | 'clients' | 'calendrier';
type PayMethod = 'cash' | 'card' | 'mobile_money';
type ResFilter = 'active' | 'today' | 'all' | 'dates';
type Panel =
  | null
  | { type: 'room';        item: HotelRoom | null }
  | { type: 'guest';       item: HotelGuest | null }
  | { type: 'reservation'; item: HotelReservation | null; defaultRoomId?: string }
  | { type: 'detail';      reservation: HotelReservation };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HotelPage() {
  const { user, business } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const currency = business?.currency ?? 'XOF';

  // ── Données ──
  const [rooms,        setRooms]        = useState<HotelRoom[]>([]);
  const [guests,       setGuests]       = useState<HotelGuest[]>([]);
  const [reservations, setReservations] = useState<HotelReservation[]>([]);
  const [services,     setServices]     = useState<HotelService[]>([]);

  // ── UI ──
  const [tab,           setTab]           = useState<Tab>('chambres');
  const [resFilter,     setResFilter]     = useState<ResFilter>('active');
  const [dateFilterFrom, setDateFilterFrom] = useState('');
  const [dateFilterTo,   setDateFilterTo]   = useState('');
  const [showDateCal,   setShowDateCal]   = useState(false);
  const [search,        setSearch]        = useState('');
  const [panel,         setPanel]         = useState<Panel>(null);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);

  // ── Formulaires ──
  const emptyRoomForm = {
    number: '', type: 'double' as RoomType, floor: '',
    capacity: 2, price_per_night: '',
    status: 'available' as RoomStatus,
    description: '', amenities: [] as string[], is_active: true,
  };
  const emptyGuestForm = {
    full_name: '', phone: '', email: '',
    id_type: '', id_number: '', nationality: '', address: '', notes: '',
  };
  const emptyResForm = {
    room_id: '', guest_id: '',
    check_in: todayStr(), check_out: tomorrowStr(),
    num_guests: 1, price_per_night: '', notes: '',
    deposit: '', depositMethod: 'cash' as PayMethod,
  };
  const emptySvcForm = { label: '', amount: '', service_date: todayStr() };

  const [roomForm,  setRoomForm]  = useState(emptyRoomForm);
  const [guestForm, setGuestForm] = useState(emptyGuestForm);
  const [resForm,   setResForm]   = useState(emptyResForm);
  const [svcForm,   setSvcForm]   = useState(emptySvcForm);
  const [checkoutPaid, setCheckoutPaid] = useState('');
  const [checkoutMethod, setCheckoutMethod] = useState<PayMethod>('cash');
  const [payForm, setPayForm] = useState({ amount: '', method: 'cash' as PayMethod });
  const [savingPay, setSavingPay] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<{ msg: string; onProceed: () => void } | null>(null);
  const [guestSearch, setGuestSearch] = useState('');
  const [guestDropOpen, setGuestDropOpen] = useState(false);

  // Calendrier
  const today2 = new Date();
  const [calYear,  setCalYear]  = useState(today2.getFullYear());
  const [calMonth, setCalMonth] = useState(today2.getMonth()); // 0-based

  // ── Chargement initial ──
  useEffect(() => {
    if (!business) return;
    loadAll();
  }, [business]);

  async function loadAll() {
    if (!business) return;
    setLoading(true);
    try {
      const [r, g, res, sess] = await Promise.all([
        getRooms(business.id),
        getGuests(business.id),
        getReservations(business.id),
        getCurrentSession(business.id),
      ]);
      setRooms(r);
      setGuests(g);
      setReservations(res);
      setSessionId(sess?.id ?? null);
    } catch (e) { notifError(String(e)); }
    finally { setLoading(false); }
  }

  // ── Chargement services ──
  async function loadServices(reservationId: string) {
    try {
      setServices(await getServices(reservationId));
    } catch (e) { notifError(String(e)); }
  }

  // ─── CRUD Chambre ──────────────────────────────────────────────────────────

  function openRoomPanel(item: HotelRoom | null) {
    setRoomForm(item ? {
      number: item.number, type: item.type, floor: item.floor ?? '',
      capacity: item.capacity, price_per_night: String(item.price_per_night),
      status: item.status, description: item.description ?? '',
      amenities: item.amenities ?? [], is_active: item.is_active,
    } : emptyRoomForm);
    setPanel({ type: 'room', item });
  }

  async function saveRoom() {
    if (!business || !roomForm.number.trim() || !roomForm.price_per_night) return;
    setSaving(true);
    try {
      const payload = {
        number: roomForm.number.trim(),
        type: roomForm.type,
        floor: roomForm.floor.trim() || null,
        capacity: Number(roomForm.capacity),
        price_per_night: Number(roomForm.price_per_night),
        status: roomForm.status,
        description: roomForm.description.trim() || null,
        amenities: roomForm.amenities,
        is_active: roomForm.is_active,
      };
      if (panel?.type === 'room' && panel.item) {
        const updated = await updateRoom(panel.item.id, payload);
        setRooms((prev) => prev.map((r) => r.id === updated.id ? updated : r));
        success('Chambre mise à jour');
      } else {
        const created = await createRoom(business.id, payload);
        setRooms((prev) => [...prev, created]);
        success('Chambre créée');
      }
      setPanel(null);
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); }
  }

  async function removeRoom(id: string) {
    if (!confirm('Supprimer cette chambre ?')) return;
    try {
      await deleteRoom(id);
      setRooms((prev) => prev.filter((r) => r.id !== id));
      success('Chambre supprimée');
    } catch (e) { notifError(String(e)); }
  }

  function toggleAmenity(amenity: string) {
    setRoomForm((f) => ({
      ...f,
      amenities: f.amenities.includes(amenity)
        ? f.amenities.filter((a) => a !== amenity)
        : [...f.amenities, amenity],
    }));
  }

  // ─── CRUD Client ──────────────────────────────────────────────────────────

  function openGuestPanel(item: HotelGuest | null) {
    setGuestForm(item ? {
      full_name: item.full_name, phone: item.phone ?? '',
      email: item.email ?? '', id_type: item.id_type ?? '',
      id_number: item.id_number ?? '', nationality: item.nationality ?? '',
      address: item.address ?? '', notes: item.notes ?? '',
    } : emptyGuestForm);
    setPanel({ type: 'guest', item });
  }

  async function saveGuest() {
    if (!business || !guestForm.full_name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        full_name: guestForm.full_name.trim(),
        phone: guestForm.phone.trim() || null,
        email: guestForm.email.trim() || null,
        id_type: guestForm.id_type || null,
        id_number: guestForm.id_number.trim() || null,
        nationality: guestForm.nationality.trim() || null,
        address: guestForm.address.trim() || null,
        notes: guestForm.notes.trim() || null,
      };
      if (panel?.type === 'guest' && panel.item) {
        const updated = await updateGuest(panel.item.id, payload);
        setGuests((prev) => prev.map((g) => g.id === updated.id ? updated : g));
        success('Client mis à jour');
      } else {
        const created = await createGuest(business.id, payload);
        setGuests((prev) => [...prev, created]);
        success('Client ajouté');
      }
      setPanel(null);
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); }
  }

  async function removeGuest(id: string) {
    if (!confirm('Supprimer ce client ?')) return;
    try {
      await deleteGuest(id);
      setGuests((prev) => prev.filter((g) => g.id !== id));
      success('Client supprimé');
    } catch (e) { notifError(String(e)); }
  }

  // ─── CRUD Réservation ─────────────────────────────────────────────────────

  function openReservationPanel(defaultRoomId?: string) {
    const room = defaultRoomId ? rooms.find((r) => r.id === defaultRoomId) : null;
    setResForm({
      ...emptyResForm,
      room_id: defaultRoomId ?? '',
      price_per_night: room ? String(room.price_per_night) : '',
    });
    setGuestSearch('');
    setGuestDropOpen(false);
    setPanel({ type: 'reservation', item: null, defaultRoomId });
  }

  async function _doCreateReservation() {
    if (!business || !user) return;
    setSaving(true);
    try {
      const created = await createReservation(business.id, user.id, {
        room_id:         resForm.room_id,
        guest_id:        resForm.guest_id,
        check_in:        resForm.check_in,
        check_out:       resForm.check_out,
        num_guests:      Number(resForm.num_guests),
        price_per_night: Number(resForm.price_per_night),
        notes:           resForm.notes.trim() || undefined,
      });
      setReservations((prev) => [created, ...prev]);
      logAction({ business_id: business.id, action: 'hotel.reservation.created', entity_type: 'reservation', entity_id: created.id, metadata: { room_id: created.room_id, guest_id: created.guest_id, check_in: created.check_in, check_out: created.check_out, total: created.total } });
      // Enregistrer acompte si renseigné
      const depositAmt = Number(resForm.deposit);
      if (depositAmt > 0) {
        await addHotelPayment(business.id, created.id, depositAmt, resForm.depositMethod, sessionId);
        logAction({ business_id: business.id, action: 'hotel.payment', entity_type: 'reservation', entity_id: created.id, metadata: { room_id: created.room_id, guest_id: created.guest_id, amount: depositAmt, method: resForm.depositMethod, type: 'deposit' } });
        setReservations((prev) => prev.map((r) =>
          r.id === created.id ? { ...r, paid_amount: depositAmt } : r
        ));
      }
      success('Réservation créée');
      setPanel(null);
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); setConflictWarning(null); }
  }

  async function saveReservation() {
    if (!business || !user) return;
    if (!resForm.room_id || !resForm.guest_id || !resForm.check_in || !resForm.check_out || !resForm.price_per_night) return;
    if (resForm.check_out <= resForm.check_in) {
      notifError('La date de départ doit être après la date d\'arrivée');
      return;
    }
    setSaving(true);
    try {
      const conflicts = await getRoomConflicts(resForm.room_id, resForm.check_in, resForm.check_out);
      setSaving(false);
      if (conflicts.length > 0) {
        const c = conflicts[0];
        const guestLabel = c.guest_name ? ` (${c.guest_name})` : '';
        const msg = `Chambre déjà réservée du ${fmt(c.check_in)} au ${fmt(c.check_out)}${guestLabel}. Créer quand même ?`;
        setConflictWarning({ msg, onProceed: _doCreateReservation });
        return;
      }
    } catch (e) { notifError(String(e)); setSaving(false); return; }
    await _doCreateReservation();
  }

  async function handleCancelReservation(res: HotelReservation) {
    if (!confirm('Annuler cette réservation ?')) return;
    try {
      const updated = await cancelReservation(res.id);
      setReservations((prev) => prev.map((r) => r.id === updated.id ? updated : r));
      if (panel?.type === 'detail') setPanel({ type: 'detail', reservation: updated });
      if (business) logAction({ business_id: business.id, action: 'hotel.reservation.cancelled', entity_type: 'reservation', entity_id: res.id, metadata: { room_id: res.room_id, guest_id: res.guest_id } });
      success('Réservation annulée');
    } catch (e) { notifError(String(e)); }
  }

  async function handleCheckIn(res: HotelReservation) {
    try {
      const updated = await checkIn(res.id, res.room_id);
      setReservations((prev) => prev.map((r) => r.id === updated.id ? updated : r));
      setRooms((prev) => prev.map((r) => r.id === res.room_id ? { ...r, status: 'occupied' } : r));
      if (panel?.type === 'detail') setPanel({ type: 'detail', reservation: updated });
      if (business) logAction({ business_id: business.id, action: 'hotel.checkin', entity_type: 'reservation', entity_id: res.id, metadata: { room_id: res.room_id, guest_id: res.guest_id, check_in: res.check_in } });
      success('Check-in effectué');
    } catch (e) { notifError(String(e)); }
  }

  async function handleCheckOut(res: HotelReservation) {
    const additional = Number(checkoutPaid) || 0;
    try {
      const updated = await checkOut(res.id, res.room_id, additional, sessionId, checkoutMethod);
      setReservations((prev) => prev.map((r) => r.id === updated.id ? updated : r));
      setRooms((prev) => prev.map((r) => r.id === res.room_id ? { ...r, status: 'cleaning' } : r));
      setPanel(null);
      if (business) logAction({ business_id: business.id, action: 'hotel.checkout', entity_type: 'reservation', entity_id: res.id, metadata: { room_id: res.room_id, guest_id: res.guest_id, total: updated.total, additional_payment: additional } });
      success('Check-out effectué — chambre en nettoyage');
    } catch (e) { notifError(String(e)); }
  }

  async function handleAddPayment(res: HotelReservation) {
    if (!business) return;
    const amount = Number(payForm.amount);
    if (!amount || amount <= 0) return;
    setSavingPay(true);
    try {
      await addHotelPayment(business.id, res.id, amount, payForm.method, sessionId);
      logAction({ business_id: business.id, action: 'hotel.payment', entity_type: 'reservation', entity_id: res.id, metadata: { room_id: res.room_id, guest_id: res.guest_id, amount, method: payForm.method } });
      const newPaid = res.paid_amount + amount;
      const newRes = { ...res, paid_amount: newPaid };
      setReservations((prev) => prev.map((r) => r.id === res.id ? newRes : r));
      if (panel?.type === 'detail') setPanel({ type: 'detail', reservation: newRes });
      setPayForm({ amount: '', method: 'cash' });
      success(`Paiement de ${fmtMoney(amount, currency)} enregistré`);
    } catch (e) { notifError(String(e)); }
    finally { setSavingPay(false); }
  }

  // ─── Prestations ─────────────────────────────────────────────────────────

  async function handleAddService(reservationId: string) {
    if (!business || !svcForm.label.trim() || !svcForm.amount) return;
    setSaving(true);
    try {
      const created = await addService(business.id, reservationId, {
        label:        svcForm.label.trim(),
        amount:       Number(svcForm.amount),
        service_date: svcForm.service_date,
      });
      setServices((prev) => [...prev, created]);
      // Refresh reservation totals
      const updated = reservations.find((r) => r.id === reservationId);
      if (updated) {
        const newTotal = updated.total_room + updated.total_services + Number(svcForm.amount);
        const newRes: HotelReservation = {
          ...updated,
          total_services: updated.total_services + Number(svcForm.amount),
          total: newTotal,
        };
        setReservations((prev) => prev.map((r) => r.id === reservationId ? newRes : r));
        if (panel?.type === 'detail') setPanel({ type: 'detail', reservation: newRes });
      }
      setSvcForm(emptySvcForm);
      success('Prestation ajoutée');
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); }
  }

  async function handleDeleteService(svc: HotelService, reservationId: string) {
    try {
      await deleteService(svc.id, reservationId);
      setServices((prev) => prev.filter((s) => s.id !== svc.id));
      const updated = reservations.find((r) => r.id === reservationId);
      if (updated) {
        const newTotal = updated.total_room + updated.total_services - svc.amount;
        const newRes: HotelReservation = {
          ...updated,
          total_services: updated.total_services - svc.amount,
          total: newTotal,
        };
        setReservations((prev) => prev.map((r) => r.id === reservationId ? newRes : r));
        if (panel?.type === 'detail') setPanel({ type: 'detail', reservation: newRes });
      }
    } catch (e) { notifError(String(e)); }
  }

  function openDetail(res: HotelReservation) {
    setPanel({ type: 'detail', reservation: res });
    const remaining = res.total - res.paid_amount;
    setCheckoutPaid(remaining > 0 ? String(remaining) : '');
    setCheckoutMethod('cash');
    setPayForm({ amount: '', method: 'cash' });
    setSvcForm(emptySvcForm);
    loadServices(res.id);
  }

  // ─── Données filtrées ─────────────────────────────────────────────────────

  const today = todayStr();

  const filteredRooms = useMemo(() =>
    rooms.filter((r) =>
      r.number.toLowerCase().includes(search.toLowerCase()) ||
      (r.floor ?? '').toLowerCase().includes(search.toLowerCase())
    ),
  [rooms, search]);

  const filteredReservations = useMemo(() => {
    let list = reservations;
    if (resFilter === 'active') {
      list = list.filter((r) => r.status === 'confirmed' || r.status === 'checked_in');
    } else if (resFilter === 'today') {
      list = list.filter((r) =>
        (r.check_in === today && (r.status === 'confirmed' || r.status === 'checked_in')) ||
        (r.check_out === today && r.status === 'checked_in')
      );
    } else if (resFilter === 'dates' && dateFilterFrom) {
      const to = dateFilterTo || dateFilterFrom;
      list = list.filter((r) =>
        r.check_in <= to && r.check_out > dateFilterFrom &&
        r.status !== 'cancelled'
      );
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.guest?.full_name.toLowerCase().includes(q) ||
        r.room?.number.toLowerCase().includes(q)
      );
    }
    return list;
  }, [reservations, resFilter, search, today, dateFilterFrom, dateFilterTo]);

  const filteredGuests = useMemo(() => {
    const q = search.toLowerCase();
    return guests.filter((g) =>
      g.full_name.toLowerCase().includes(q) ||
      (g.phone ?? '').includes(search) ||
      (g.id_number ?? '').toLowerCase().includes(q)
    );
  }, [guests, search]);

  // Statistiques rapides
  const stats = useMemo(() => ({
    available:   rooms.filter((r) => r.status === 'available').length,
    occupied:    rooms.filter((r) => r.status === 'occupied').length,
    cleaning:    rooms.filter((r) => r.status === 'cleaning').length,
    maintenance: rooms.filter((r) => r.status === 'maintenance').length,
    total:       rooms.length,
  }), [rooms]);

  // Prix chambre sélectionnée dans le formulaire
  const selectedRoomPrice = resForm.room_id
    ? rooms.find((r) => r.id === resForm.room_id)?.price_per_night
    : undefined;
  const resNights = resForm.check_in && resForm.check_out && resForm.check_out > resForm.check_in
    ? nightsBetween(resForm.check_in, resForm.check_out)
    : 0;
  const resTotal = resNights * Number(resForm.price_per_night || 0);

  // Réservation active (checked_in) pour une chambre
  function activeResForRoom(roomId: string): HotelReservation | undefined {
    return reservations.find((r) => r.room_id === roomId && r.status === 'checked_in');
  }
  // Réservation confirmée (à venir) pour une chambre
  function confirmedResForRoom(roomId: string): HotelReservation | undefined {
    return reservations.find((r) => r.room_id === roomId && r.status === 'confirmed');
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col relative">

      {/* ── Header ── */}
      <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Hôtel</h1>
          <p className="text-xs text-slate-500">
            {stats.available} disponible{stats.available !== 1 ? 's' : ''} · {stats.occupied} occupée{stats.occupied !== 1 ? 's' : ''} · {stats.total} chambre{stats.total !== 1 ? 's' : ''} au total
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(['chambres', 'reservations', 'calendrier', 'clients'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setSearch(''); setPanel(null); }}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                tab === t ? 'bg-brand-600 text-white' : 'btn-secondary'
              )}
            >
              {t === 'chambres'     ? <><BedDouble className="w-4 h-4 inline mr-1.5" />Chambres</> :
               t === 'reservations' ? <><ClipboardList className="w-4 h-4 inline mr-1.5" />Réservations</> :
               t === 'calendrier'   ? <><Calendar className="w-4 h-4 inline mr-1.5" />Calendrier</> :
               <><Users className="w-4 h-4 inline mr-1.5" />Clients</>}
            </button>
          ))}
          <div className="h-8 w-px bg-surface-border" />
          {tab === 'chambres' && (
            <button onClick={() => openRoomPanel(null)} className="btn-primary h-9 text-sm flex items-center gap-1.5">
              <Plus className="w-4 h-4 shrink-0" /> Nouvelle chambre
            </button>
          )}
          {tab === 'reservations' && (
            <button onClick={() => openReservationPanel()} className="btn-primary h-9 text-sm flex items-center gap-1.5">
              <Plus className="w-4 h-4 shrink-0" /> Réservation
            </button>
          )}
          {tab === 'clients' && (
            <button onClick={() => openGuestPanel(null)} className="btn-primary h-9 text-sm flex items-center gap-1.5">
              <Plus className="w-4 h-4 shrink-0" /> Nouveau client
            </button>
          )}
        </div>
      </div>

      {/* ── Tab Chambres ── */}
      {tab === 'chambres' && (
        <div className="flex-1 overflow-y-auto p-6">

          {/* Barre de recherche + stats rapides */}
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                className="input pl-8 h-9 text-sm"
                placeholder="Chercher par numéro, étage…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2 hidden sm:flex">
              {[
                { label: 'Disponibles', count: stats.available,   dot: 'bg-emerald-400', num: 'text-emerald-400' },
                { label: 'Occupées',    count: stats.occupied,    dot: 'bg-brand-400',   num: 'text-brand-400'   },
                { label: 'Nettoyage',   count: stats.cleaning,    dot: 'bg-amber-400',   num: 'text-amber-400'   },
                { label: 'Maintenance', count: stats.maintenance, dot: 'bg-slate-400',   num: 'text-slate-400'   },
              ].map(({ label, count, dot, num }) => (
                <div key={label} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-card border border-surface-border">
                  <span className={cn('w-2 h-2 rounded-full shrink-0', dot)} />
                  <span className={cn('text-base font-bold', num)}>{count}</span>
                  <span className="text-xs text-slate-500">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {loading && <p className="text-center text-slate-500 py-16">Chargement…</p>}

          {!loading && filteredRooms.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
              <BedDouble className="w-12 h-12 opacity-20" />
              <p>Aucune chambre</p>
              <button onClick={() => openRoomPanel(null)} className="btn-primary h-9 text-sm">Ajouter une chambre</button>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredRooms.map((room) => {
              const activeRes    = activeResForRoom(room.id);
              const confirmedRes = confirmedResForRoom(room.id);

              const accent = {
                available:   'bg-gradient-to-r from-emerald-500 to-green-400',
                occupied:    'bg-gradient-to-r from-brand-500 to-violet-500',
                cleaning:    'bg-gradient-to-r from-amber-500 to-yellow-400',
                maintenance: 'bg-gradient-to-r from-slate-500 to-slate-400',
              }[room.status];

              const dot = {
                available:   'bg-emerald-400',
                occupied:    'bg-brand-400',
                cleaning:    'bg-amber-400',
                maintenance: 'bg-slate-400',
              }[room.status];

              return (
                <div
                  key={room.id}
                  className="group relative rounded-2xl bg-surface-card border border-surface-border overflow-hidden
                             cursor-pointer hover:border-white/20 hover:shadow-xl hover:-translate-y-0.5
                             transition-all duration-200 flex flex-col"
                  onClick={() => {
                    if (activeRes)         openDetail(activeRes);
                    else if (confirmedRes) openDetail(confirmedRes);
                    else if (room.status === 'available') openReservationPanel(room.id);
                    else                   openRoomPanel(room);
                  }}
                >
                  {/* Bande de statut */}
                  <div className={cn('h-1.5 w-full', accent)} />

                  <div className="p-4 flex flex-col gap-3 flex-1">
                    {/* Numéro + bouton édition */}
                    <div className="flex items-start justify-between gap-1">
                      <div>
                        <p className="text-3xl font-black text-white leading-none tracking-tight">{room.number}</p>
                        {room.floor && <p className="text-[11px] text-slate-500 mt-0.5">{room.floor}</p>}
                      </div>
                      <button
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-xl bg-surface-hover
                                   text-slate-400 hover:text-white transition-all shrink-0"
                        onClick={(e) => { e.stopPropagation(); openRoomPanel(room); }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Type + capacité */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-input text-slate-300 font-medium">
                        {ROOM_TYPES.find((t) => t.value === room.type)?.label}
                      </span>
                      <span className="text-[11px] text-slate-500 flex items-center gap-0.5">
                        <Users className="w-3 h-3" /> {room.capacity}
                      </span>
                    </div>

                    {/* Statut */}
                    <div className="flex items-center gap-1.5">
                      <span className={cn('w-2 h-2 rounded-full shrink-0', dot)} />
                      <span className="text-xs font-semibold text-slate-300">{roomStatusLabel(room.status)}</span>
                    </div>

                    {/* Info client (occupée) */}
                    {activeRes && (
                      <div className="rounded-xl bg-brand-900/40 border border-brand-800/60 p-2.5 space-y-0.5">
                        <p className="text-xs font-bold text-white truncate">{activeRes.guest?.full_name}</p>
                        <p className="text-[11px] text-brand-300 flex items-center gap-1">
                          <LogOut className="w-3 h-3 shrink-0" />
                          Départ {fmt(activeRes.check_out)}
                        </p>
                      </div>
                    )}

                    {/* Info réservation confirmée */}
                    {!activeRes && confirmedRes && (
                      <div className="rounded-xl bg-amber-900/20 border border-amber-700/40 p-2.5 space-y-0.5">
                        <p className="text-[11px] font-bold text-amber-300 uppercase tracking-wide">Réservée</p>
                        <p className="text-xs text-white font-medium truncate">{confirmedRes.guest?.full_name}</p>
                        <p className="text-[11px] text-amber-400/80">
                          {fmt(confirmedRes.check_in)} → {fmt(confirmedRes.check_out)}
                        </p>
                      </div>
                    )}

                    {/* Amenités */}
                    {(room.amenities?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1 mt-auto">
                        {room.amenities.slice(0, 3).map((a) => (
                          <span key={a} className="text-[10px] px-1.5 py-0.5 rounded-md bg-surface-input text-slate-400">{a}</span>
                        ))}
                        {room.amenities.length > 3 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-surface-input text-slate-500">+{room.amenities.length - 3}</span>
                        )}
                      </div>
                    )}

                    {/* Prix */}
                    <div className="border-t border-surface-border pt-3 flex items-baseline justify-between mt-auto">
                      <span className="text-sm font-bold text-white">{fmtMoney(room.price_per_night, currency)}</span>
                      <span className="text-[11px] text-slate-500">/nuit</span>
                    </div>

                    {/* CTA disponible */}
                    {room.status === 'available' && !confirmedRes && (
                      <div className="text-xs text-center py-1.5 rounded-xl bg-emerald-700/20 border border-emerald-700/40
                                      text-emerald-400 font-semibold tracking-wide">
                        + Réserver
                      </div>
                    )}

                    {/* CTA nettoyage / maintenance */}
                    {(room.status === 'cleaning' || room.status === 'maintenance') && (
                      <button
                        className="text-xs py-1.5 rounded-xl border border-surface-border hover:border-white/20
                                   text-slate-400 hover:text-white transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateRoom(room.id, { status: 'available' })
                            .then((r) => setRooms((p) => p.map((x) => x.id === r.id ? r : x)))
                            .catch((e) => notifError(String(e)));
                        }}
                      >
                        Marquer disponible
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tab Réservations ── */}
      {tab === 'reservations' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 py-3 border-b border-surface-border space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-1.5 flex-wrap">
                {([
                  { value: 'active', label: 'En cours' },
                  { value: 'today',  label: "Aujourd'hui" },
                  { value: 'all',    label: 'Toutes' },
                ] as { value: ResFilter; label: string }[]).map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => { setResFilter(value); setShowDateCal(false); }}
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-sm transition-colors',
                      resFilter === value ? 'bg-brand-600 text-white' : 'btn-secondary'
                    )}
                  >
                    {label}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setResFilter('dates');
                    setShowDateCal((v) => !v);
                  }}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-sm transition-colors flex items-center gap-1.5',
                    resFilter === 'dates' ? 'bg-brand-600 text-white' : 'btn-secondary'
                  )}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  {resFilter === 'dates' && dateFilterFrom
                    ? `${fmt(dateFilterFrom)}${dateFilterTo ? ` → ${fmt(dateFilterTo)}` : ''}`
                    : 'Par dates'}
                </button>
              </div>
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  className="input pl-8 h-9 text-sm"
                  placeholder="Chercher client, chambre…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Calendrier de filtre */}
            {resFilter === 'dates' && showDateCal && (
              <div className="pb-1">
                <CalendarPicker
                  checkIn={dateFilterFrom}
                  checkOut={dateFilterTo}
                  onSelect={(from, to) => {
                    setDateFilterFrom(from);
                    setDateFilterTo(to);
                    if (from && to) setShowDateCal(false);
                  }}
                />
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {loading && <p className="text-center text-slate-500 py-16">Chargement…</p>}

            {!loading && filteredReservations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
                <ClipboardList className="w-12 h-12 opacity-20" />
                <p>Aucune réservation</p>
              </div>
            )}

            <div className="space-y-2 max-w-3xl">
              {filteredReservations.map((res) => {
                const nights = nightsBetween(res.check_in, res.check_out);
                const arrivesToday = res.check_in === today;
                const departsToday = res.check_out === today;
                return (
                  <button
                    key={res.id}
                    onClick={() => openDetail(res)}
                    className="w-full card p-4 flex items-center gap-4 hover:bg-surface-hover text-left transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-surface-input flex items-center justify-center shrink-0 text-sm font-bold text-brand-400">
                      {res.guest?.full_name.charAt(0).toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-white truncate">{res.guest?.full_name}</p>
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', resStatusStyle(res.status))}>
                          {resStatusLabel(res.status)}
                        </span>
                        {arrivesToday && res.status === 'confirmed' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/40 text-green-300 border border-green-700">Arrivée</span>
                        )}
                        {departsToday && res.status === 'checked_in' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300 border border-amber-700">Départ</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Chambre {res.room?.number} · {nights} nuit{nights > 1 ? 's' : ''} · {fmt(res.check_in)} → {fmt(res.check_out)}
                      </p>
                    </div>
                    <div className="text-right shrink-0 hidden sm:block">
                      <p className="text-sm font-semibold text-white">{fmtMoney(res.total, currency)}</p>
                      {res.paid_amount < res.total && res.status !== 'cancelled' && (
                        <p className="text-xs text-amber-400">
                          Reste {fmtMoney(res.total - res.paid_amount, currency)}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab Clients ── */}
      {tab === 'clients' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="relative mb-5 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              className="input pl-8 h-9 text-sm"
              placeholder="Chercher par nom, téléphone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
                <div className="w-10 h-10 rounded-full bg-surface-input flex items-center justify-center shrink-0 text-sm font-bold text-brand-400">
                  {g.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{g.full_name}</p>
                  {g.phone && <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" />{g.phone}</p>}
                  {g.nationality && <p className="text-xs text-slate-500">{g.nationality}</p>}
                  {g.id_number && <p className="text-xs text-slate-500">{g.id_type} {g.id_number}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openGuestPanel(g)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => removeGuest(g.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-900/20">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab Calendrier ── */}
      {tab === 'calendrier' && (() => {
        const daysInMonth  = new Date(calYear, calMonth + 1, 0).getDate();
        const days         = Array.from({ length: daysInMonth }, (_, i) => i + 1);
        const monthLabel   = new Date(calYear, calMonth, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        const todayFull    = todayStr();

        function prevMonth() {
          if (calMonth === 0) { setCalMonth(11); setCalYear((y) => y - 1); }
          else setCalMonth((m) => m - 1);
        }
        function nextMonth() {
          if (calMonth === 11) { setCalMonth(0); setCalYear((y) => y + 1); }
          else setCalMonth((m) => m + 1);
        }
        function dayStr(d: number) {
          return `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
        function resOverlapsDay(res: HotelReservation, d: number): boolean {
          const ds = dayStr(d);
          return ds >= res.check_in && ds < res.check_out;
        }
        function resStartsOnDay(res: HotelReservation, d: number): boolean {
          return res.check_in === dayStr(d);
        }

        return (
          <div className="flex-1 overflow-auto p-6">
            {/* Navigation mois */}
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              <button onClick={prevMonth} className="p-1.5 rounded-lg btn-secondary shrink-0"><ChevronLeft className="w-4 h-4" /></button>
              <h2 className="font-semibold text-white capitalize flex-1 text-center min-w-32">{monthLabel}</h2>
              <button onClick={nextMonth} className="p-1.5 rounded-lg btn-secondary shrink-0"><ChevronRight className="w-4 h-4" /></button>

              {/* Saisie rapide de date */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-44">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                  <input
                    type="date"
                    className="input pl-8 h-9 text-sm w-full"
                    title="Aller à une date"
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      const d = new Date(v + 'T12:00:00');
                      setCalYear(d.getFullYear());
                      setCalMonth(d.getMonth());
                    }}
                  />
                </div>
                <button
                  onClick={() => { setCalYear(today2.getFullYear()); setCalMonth(today2.getMonth()); }}
                  className="btn-secondary h-9 px-3 text-sm shrink-0"
                  title="Aujourd'hui"
                >
                  Aujourd&apos;hui
                </button>
              </div>
            </div>

            {loading && <p className="text-center text-slate-500 py-16">Chargement…</p>}

            {!loading && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs" style={{ minWidth: `${daysInMonth * 36 + 80}px` }}>
                  <thead>
                    <tr>
                      <th className="text-left py-2 pr-3 text-slate-400 font-medium w-20 sticky left-0 bg-surface z-10">Chambre</th>
                      {days.map((d) => {
                        const ds = dayStr(d);
                        const isToday = ds === todayFull;
                        return (
                          <th key={d} className={cn('text-center w-9 py-2 font-medium', isToday ? 'text-brand-400' : 'text-slate-500')}>
                            {d}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map((room) => {
                      const roomRes = reservations.filter((r) =>
                        r.room_id === room.id &&
                        r.status !== 'cancelled' &&
                        r.check_in < `${calYear}-${String(calMonth + 1).padStart(2, '0')}-32` &&
                        r.check_out > `${calYear}-${String(calMonth + 1).padStart(2, '0')}-00`
                      );
                      return (
                        <tr key={room.id} className="border-t border-surface-border">
                          <td className="py-1 pr-3 text-slate-300 font-semibold sticky left-0 bg-surface z-10">
                            {room.number}
                          </td>
                          {days.map((d) => {
                            const activeR = roomRes.find((r) => resOverlapsDay(r, d));
                            const isStart = activeR ? resStartsOnDay(activeR, d) : false;
                            const isToday = dayStr(d) === todayFull;
                            return (
                              <td
                                key={d}
                                className={cn(
                                  'h-8 relative',
                                  isToday && !activeR ? 'bg-brand-900/10' : ''
                                )}
                                onClick={() => activeR && openDetail(activeR)}
                              >
                                {activeR && (
                                  <div className={cn(
                                    'absolute inset-y-1 inset-x-0 cursor-pointer',
                                    activeR.status === 'checked_in'  ? 'bg-brand-600/80' :
                                    activeR.status === 'confirmed'   ? 'bg-amber-600/60' :
                                    activeR.status === 'checked_out' ? 'bg-green-900/40' :
                                    'bg-slate-700/40',
                                    isStart ? 'rounded-l-md ml-1' : ''
                                  )}>
                                    {isStart && (
                                      <span className="absolute inset-0 flex items-center px-1 truncate text-white font-medium" style={{ fontSize: 10 }}>
                                        {activeR.guest?.full_name.split(' ')[0]}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Légende */}
                <div className="flex gap-4 mt-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-600/60 inline-block" />Confirmée</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-brand-600/80 inline-block" />En cours</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-900/40 border border-green-800 inline-block" />Terminée</span>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ════════════════════════════════════════════════════════════════════════
          Panneaux latéraux
      ════════════════════════════════════════════════════════════════════════ */}

      {/* ── Panneau : Chambre ── */}
      {panel?.type === 'room' && (
        <div className="absolute inset-y-0 right-0 w-96 bg-surface-card border-l border-surface-border shadow-2xl flex flex-col z-40">
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
            <h3 className="font-semibold text-white">{panel.item ? 'Modifier chambre' : 'Nouvelle chambre'}</h3>
            <button onClick={() => setPanel(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Numéro <span className="text-red-400">*</span></label>
                <input className="input" value={roomForm.number} onChange={(e) => setRoomForm((f) => ({ ...f, number: e.target.value }))} placeholder="101" autoFocus />
              </div>
              <div>
                <label className="label">Étage</label>
                <input className="input" value={roomForm.floor} onChange={(e) => setRoomForm((f) => ({ ...f, floor: e.target.value }))} placeholder="1er" />
              </div>
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input" value={roomForm.type} onChange={(e) => setRoomForm((f) => ({ ...f, type: e.target.value as RoomType }))}>
                {ROOM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Capacité (pers.)</label>
                <input className="input" type="number" min={1} value={roomForm.capacity} onChange={(e) => setRoomForm((f) => ({ ...f, capacity: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="label">Prix / nuit <span className="text-red-400">*</span></label>
                <input className="input" type="number" min={0} value={roomForm.price_per_night} onChange={(e) => setRoomForm((f) => ({ ...f, price_per_night: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div>
              <label className="label">Statut</label>
              <select className="input" value={roomForm.status} onChange={(e) => setRoomForm((f) => ({ ...f, status: e.target.value as RoomStatus }))}>
                <option value="available">Disponible</option>
                <option value="occupied">Occupée</option>
                <option value="cleaning">Nettoyage</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
            <div>
              <label className="label">Équipements</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {AMENITIES.map((a) => (
                  <button
                    key={a} type="button"
                    onClick={() => toggleAmenity(a)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs border transition-colors',
                      roomForm.amenities.includes(a)
                        ? 'border-brand-600 bg-brand-900/30 text-brand-300'
                        : 'border-surface-border text-slate-400 hover:border-slate-500'
                    )}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input min-h-[72px] resize-none text-sm" value={roomForm.description} onChange={(e) => setRoomForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setRoomForm((f) => ({ ...f, is_active: !f.is_active }))}
                className={cn('w-10 h-6 rounded-full transition-colors', roomForm.is_active ? 'bg-brand-600' : 'bg-slate-700')}
              >
                <span className={cn('block w-4 h-4 bg-white rounded-full shadow mt-1 transition-transform', roomForm.is_active ? 'translate-x-5' : 'translate-x-1')} />
              </div>
              <span className="text-sm text-slate-300">Active</span>
            </label>
          </div>
          <div className="flex gap-2 px-5 py-4 border-t border-surface-border">
            {panel.item && (
              <button onClick={() => removeRoom(panel.item!.id)} className="p-2.5 rounded-xl text-red-400 hover:bg-red-900/20">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={saveRoom}
              disabled={saving || !roomForm.number.trim() || !roomForm.price_per_night}
              className="btn-primary flex-1 h-10 flex items-center justify-center gap-2"
            >
              {saving ? 'Enregistrement…' : <><Check className="w-4 h-4" /> Enregistrer</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Panneau : Client ── */}
      {panel?.type === 'guest' && (
        <div className="absolute inset-y-0 right-0 w-96 bg-surface-card border-l border-surface-border shadow-2xl flex flex-col z-40">
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
            <h3 className="font-semibold text-white">{panel.item ? 'Modifier client' : 'Nouveau client'}</h3>
            <button onClick={() => setPanel(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <label className="label">Nom complet <span className="text-red-400">*</span></label>
              <input className="input" value={guestForm.full_name} onChange={(e) => setGuestForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="Prénom Nom" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Téléphone</label>
                <input className="input" value={guestForm.phone} onChange={(e) => setGuestForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label className="label">Nationalité</label>
                <input className="input" value={guestForm.nationality} onChange={(e) => setGuestForm((f) => ({ ...f, nationality: e.target.value }))} placeholder="Ex : Sénégal" />
              </div>
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={guestForm.email} onChange={(e) => setGuestForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Pièce d'identité</label>
                <select className="input" value={guestForm.id_type} onChange={(e) => setGuestForm((f) => ({ ...f, id_type: e.target.value }))}>
                  <option value="">— Choisir —</option>
                  {ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Numéro</label>
                <input className="input" value={guestForm.id_number} onChange={(e) => setGuestForm((f) => ({ ...f, id_number: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="label">Adresse</label>
              <input className="input" value={guestForm.address} onChange={(e) => setGuestForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea className="input min-h-[72px] resize-none text-sm" value={guestForm.notes} onChange={(e) => setGuestForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 px-5 py-4 border-t border-surface-border">
            {panel.item && (
              <button onClick={() => removeGuest(panel.item!.id)} className="p-2.5 rounded-xl text-red-400 hover:bg-red-900/20">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={saveGuest}
              disabled={saving || !guestForm.full_name.trim()}
              className="btn-primary flex-1 h-10 flex items-center justify-center gap-2"
            >
              {saving ? 'Enregistrement…' : <><Check className="w-4 h-4" /> Enregistrer</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Panneau : Réservation ── */}
      {panel?.type === 'reservation' && (
        <div className="absolute inset-y-0 right-0 w-[420px] bg-surface-card border-l border-surface-border shadow-2xl flex flex-col z-40">
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
            <h3 className="font-semibold text-white">Nouvelle réservation</h3>
            <button onClick={() => setPanel(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <label className="label">Chambre <span className="text-red-400">*</span></label>
              <select
                className="input"
                value={resForm.room_id}
                onChange={(e) => {
                  const room = rooms.find((r) => r.id === e.target.value);
                  setResForm((f) => ({
                    ...f,
                    room_id: e.target.value,
                    price_per_night: room ? String(room.price_per_night) : f.price_per_night,
                  }));
                }}
              >
                <option value="">— Choisir —</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.number} — {ROOM_TYPES.find((t) => t.value === r.type)?.label} ({fmtMoney(r.price_per_night, currency)}/nuit){r.status !== 'available' ? ` [${roomStatusLabel(r.status)}]` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label !mb-0">Client <span className="text-red-400">*</span></label>
                <button
                  type="button"
                  onClick={() => openGuestPanel(null)}
                  className="text-xs text-brand-400 hover:text-brand-300"
                >
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
                {resForm.guest_id && (
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    onClick={() => { setResForm((f) => ({ ...f, guest_id: '' })); setGuestSearch(''); }}>
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
                            setResForm((f) => ({ ...f, guest_id: g.id }));
                            setGuestSearch(g.full_name + (g.phone ? ` — ${g.phone}` : ''));
                            setGuestDropOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 hover:bg-surface-hover flex items-center gap-2 transition-colors
                            ${resForm.guest_id === g.id ? 'bg-brand-600/10 text-brand-300' : 'text-white'}`}
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
            <div>
              <label className="label">Dates du séjour <span className="text-red-400">*</span></label>
              <CalendarPicker
                checkIn={resForm.check_in}
                checkOut={resForm.check_out}
                onSelect={(ci, co) => setResForm((f) => ({ ...f, check_in: ci, check_out: co }))}
                bookedRanges={
                  resForm.room_id
                    ? reservations
                        .filter((r) => r.room_id === resForm.room_id && r.status !== 'cancelled')
                        .map((r) => ({ from: r.check_in, to: r.check_out }))
                    : []
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Nombre de personnes</label>
                <input className="input" type="number" min={1} value={resForm.num_guests} onChange={(e) => setResForm((f) => ({ ...f, num_guests: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="label">Prix / nuit</label>
                <input className="input" type="number" min={0} value={resForm.price_per_night} onChange={(e) => setResForm((f) => ({ ...f, price_per_night: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea className="input min-h-[72px] resize-none text-sm" value={resForm.notes} onChange={(e) => setResForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            {resNights > 0 && resForm.price_per_night && (
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
                  value={resForm.deposit}
                  onChange={(e) => setResForm((f) => ({ ...f, deposit: e.target.value }))}
                />
                <select
                  className="input w-36"
                  value={resForm.depositMethod}
                  onChange={(e) => setResForm((f) => ({ ...f, depositMethod: e.target.value as PayMethod }))}
                >
                  <option value="cash">Espèces</option>
                  <option value="card">Carte</option>
                  <option value="mobile_money">Mobile</option>
                </select>
              </div>
            </div>
          </div>

          {/* Avertissement conflit */}
          {conflictWarning && (
            <div className="mx-5 mb-3 p-3 rounded-xl bg-amber-900/20 border border-amber-700 text-sm text-amber-300 space-y-2">
              <p className="flex items-start gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{conflictWarning.msg}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConflictWarning(null)}
                  className="flex-1 py-1.5 rounded-lg border border-amber-700 hover:bg-amber-900/30 text-xs"
                >
                  Annuler
                </button>
                <button
                  onClick={conflictWarning.onProceed}
                  disabled={saving}
                  className="flex-1 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-600 text-xs font-medium"
                >
                  {saving ? 'En cours…' : 'Forcer la réservation'}
                </button>
              </div>
            </div>
          )}

          <div className="px-5 py-4 border-t border-surface-border">
            <button
              onClick={saveReservation}
              disabled={saving || !resForm.room_id || !resForm.guest_id || !resForm.check_in || !resForm.check_out || !resForm.price_per_night}
              className="btn-primary w-full h-10 flex items-center justify-center gap-2"
            >
              {saving ? 'Enregistrement…' : <><Check className="w-4 h-4" /> Créer la réservation</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Panneau : Détail réservation ── */}
      {panel?.type === 'detail' && (() => {
        const res = reservations.find((r) => r.id === panel.reservation.id) ?? panel.reservation;
        const nights = nightsBetween(res.check_in, res.check_out);
        const balance = res.total - res.paid_amount;
        return (
          <div className="absolute inset-y-0 right-0 w-[440px] bg-surface-card border-l border-surface-border shadow-2xl flex flex-col z-40">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
              <div className="flex items-center gap-2">
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', resStatusStyle(res.status))}>
                  {resStatusLabel(res.status)}
                </span>
                <h3 className="font-semibold text-white">Chambre {res.room?.number}</h3>
              </div>
              <div className="flex items-center gap-1">
                <button
                  title="Imprimer la facture"
                  onClick={() => {
                    if (!business) return;
                    const html = generateHotelInvoice(res, services, business);
                    printHtml(html);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button onClick={() => setPanel(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Client */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-surface-input flex items-center justify-center shrink-0 text-sm font-bold text-brand-400">
                  {res.guest?.full_name.charAt(0).toUpperCase() ?? '?'}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{res.guest?.full_name}</p>
                  {res.guest?.phone && <p className="text-xs text-slate-400 flex items-center gap-1"><Phone className="w-3 h-3" />{res.guest.phone}</p>}
                  {res.guest?.nationality && <p className="text-xs text-slate-500">{res.guest.nationality}</p>}
                  {res.guest?.id_number && (
                    <p className="text-xs text-slate-500 flex items-center gap-1"><BadgeCheck className="w-3 h-3" />{res.guest.id_type} {res.guest.id_number}</p>
                  )}
                </div>
              </div>

              {/* Séjour */}
              <div className="card p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Arrivée</span>
                  <span className="font-medium text-white">{fmt(res.check_in)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Départ</span>
                  <span className="font-medium text-white">{fmt(res.check_out)}</span>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-surface-border pt-2">
                  <span className="text-slate-400">{nights} nuit{nights > 1 ? 's' : ''} × {fmtMoney(res.price_per_night, currency)}</span>
                  <span className="font-semibold text-white">{fmtMoney(res.total_room, currency)}</span>
                </div>
              </div>

              {/* Prestations */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Prestations</p>
                {services.length === 0 && (
                  <p className="text-xs text-slate-500 py-2">Aucune prestation</p>
                )}
                {services.map((svc) => (
                  <div key={svc.id} className="flex items-center justify-between py-1.5 border-b border-surface-border last:border-0">
                    <div>
                      <p className="text-sm text-white">{svc.label}</p>
                      <p className="text-xs text-slate-500">{fmt(svc.service_date)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{fmtMoney(svc.amount, currency)}</span>
                      {(res.status === 'confirmed' || res.status === 'checked_in') && (
                        <button onClick={() => handleDeleteService(svc, res.id)} className="p-1 text-slate-500 hover:text-red-400">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {(res.status === 'confirmed' || res.status === 'checked_in') && (
                  <div className="flex gap-2 mt-2">
                    <input
                      className="input flex-1 h-8 text-sm"
                      placeholder="Prestation…"
                      value={svcForm.label}
                      onChange={(e) => setSvcForm((f) => ({ ...f, label: e.target.value }))}
                    />
                    <input
                      className="input w-24 h-8 text-sm"
                      type="number"
                      placeholder="Montant"
                      value={svcForm.amount}
                      onChange={(e) => setSvcForm((f) => ({ ...f, amount: e.target.value }))}
                    />
                    <button
                      onClick={() => handleAddService(res.id)}
                      disabled={saving || !svcForm.label.trim() || !svcForm.amount}
                      className="btn-primary h-8 px-3 text-sm flex items-center gap-1 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Totaux */}
              <div className="card p-4 space-y-1.5">
                <div className="flex justify-between text-sm text-slate-400">
                  <span>Chambre</span><span>{fmtMoney(res.total_room, currency)}</span>
                </div>
                {res.total_services > 0 && (
                  <div className="flex justify-between text-sm text-slate-400">
                    <span>Prestations</span><span>{fmtMoney(res.total_services, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-white border-t border-surface-border pt-2">
                  <span>Total</span><span>{fmtMoney(res.total, currency)}</span>
                </div>
                {res.paid_amount > 0 && (
                  <div className="flex justify-between text-sm text-green-400">
                    <span>Payé</span><span>{fmtMoney(res.paid_amount, currency)}</span>
                  </div>
                )}
                {balance > 0 && res.status !== 'cancelled' && (
                  <div className="flex justify-between text-sm text-amber-400">
                    <span>Reste à payer</span><span>{fmtMoney(balance, currency)}</span>
                  </div>
                )}
              </div>

              {/* Encaissement partiel (acompte avant check-out) */}
              {(res.status === 'confirmed' || res.status === 'checked_in') && balance > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Encaisser un acompte</p>
                  <div className="flex gap-2">
                    <input
                      className="input flex-1 h-9 text-sm"
                      type="number"
                      min={0}
                      placeholder={`Reste: ${fmtMoney(balance, currency)}`}
                      value={payForm.amount}
                      onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                    />
                    <select
                      className="input w-28 h-9 text-sm"
                      value={payForm.method}
                      onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value as PayMethod }))}
                    >
                      <option value="cash">Espèces</option>
                      <option value="card">Carte</option>
                      <option value="mobile_money">Mobile</option>
                    </select>
                    <button
                      onClick={() => handleAddPayment(res)}
                      disabled={savingPay || !payForm.amount}
                      className="btn-primary h-9 px-3 text-sm flex items-center gap-1 shrink-0"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Montant supplémentaire (check-out) */}
              {res.status === 'checked_in' && (
                <div>
                  <label className="label">Montant à encaisser au check-out</label>
                  <div className="flex gap-2">
                    <input
                      className="input flex-1"
                      type="number"
                      min={0}
                      placeholder={balance > 0 ? `Reste: ${fmtMoney(balance, currency)}` : '0'}
                      value={checkoutPaid}
                      onChange={(e) => setCheckoutPaid(e.target.value)}
                    />
                    <select
                      className="input w-32"
                      value={checkoutMethod}
                      onChange={(e) => setCheckoutMethod(e.target.value as PayMethod)}
                    >
                      <option value="cash">Espèces</option>
                      <option value="card">Carte</option>
                      <option value="mobile_money">Mobile</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-5 py-4 border-t border-surface-border space-y-2">
              {res.status === 'confirmed' && (
                <button
                  onClick={() => handleCheckIn(res)}
                  className="w-full h-10 rounded-xl bg-green-700 hover:bg-green-600 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <LogIn className="w-4 h-4" /> Check-in
                </button>
              )}
              {res.status === 'checked_in' && (
                <button
                  onClick={() => handleCheckOut(res)}
                  className="w-full h-10 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Check-out & encaisser
                </button>
              )}
              {(res.status === 'confirmed' || res.status === 'checked_in') && (
                <button
                  onClick={() => handleCancelReservation(res)}
                  className="w-full h-9 rounded-xl border border-red-800 text-red-400 hover:bg-red-900/20 text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <AlertCircle className="w-4 h-4" /> Annuler la réservation
                </button>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
