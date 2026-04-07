'use client';
import { toUserError } from '@/lib/user-error';

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, BedDouble, Users, ClipboardList, Calendar, LogOut, LogIn } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { logAction } from '@services/supabase/logger';
import { cn } from '@/lib/utils';
import { canManageRooms } from '@/lib/permissions';
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
  RoomType, RoomStatus,
} from '@services/supabase/hotel';

import { Tab, PayMethod, ResFilter, todayStr, tomorrowStr, fmt, fmtMoney } from './components/hotel-helpers';
import { ChambresTab }     from './components/ChambresTab';
import { ReservationsTab } from './components/ReservationsTab';
import { ClientsTab }      from './components/ClientsTab';
import { CalendrierTab }   from './components/CalendrierTab';
import { RoomPanel }       from './components/RoomPanel';
import { GuestPanel }      from './components/GuestPanel';
import { ReservationPanel } from './components/ReservationPanel';
import { DetailPanel }     from './components/DetailPanel';

// ─── Form shapes ──────────────────────────────────────────────────────────────

type RoomForm = {
  number: string; type: RoomType; floor: string; capacity: number;
  price_per_night: string; status: RoomStatus; description: string;
  amenities: string[]; is_active: boolean;
};
type GuestForm = {
  full_name: string; phone: string; email: string; id_type: string;
  id_number: string; nationality: string; address: string; notes: string;
};
type ResForm = {
  room_id: string; guest_id: string; check_in: string; check_out: string;
  num_guests: number; price_per_night: string; notes: string;
  deposit: string; depositMethod: PayMethod;
};
type SvcForm = { label: string; amount: string; service_date: string };

type Panel =
  | null
  | { type: 'room';        item: HotelRoom | null }
  | { type: 'guest';       item: HotelGuest | null }
  | { type: 'reservation'; item: null; defaultRoomId?: string }
  | { type: 'detail';      reservation: HotelReservation };

const emptyRoomForm = (): RoomForm => ({
  number: '', type: 'double', floor: '', capacity: 2, price_per_night: '',
  status: 'available', description: '', amenities: [], is_active: true,
});
const emptyGuestForm = (): GuestForm => ({
  full_name: '', phone: '', email: '', id_type: '', id_number: '', nationality: '', address: '', notes: '',
});
const emptyResForm = (): ResForm => ({
  room_id: '', guest_id: '', check_in: todayStr(), check_out: tomorrowStr(),
  num_guests: 1, price_per_night: '', notes: '', deposit: '', depositMethod: 'cash',
});
const emptySvcForm = (): SvcForm => ({ label: '', amount: '', service_date: todayStr() });

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HotelPage() {
  const { user, business } = useAuthStore();
  const isManagerOrAbove = canManageRooms(user?.role);
  const { success, error: notifError } = useNotificationStore();
  const currency = business?.currency ?? 'XOF';

  const [rooms,        setRooms]        = useState<HotelRoom[]>([]);
  const [guests,       setGuests]       = useState<HotelGuest[]>([]);
  const [reservations, setReservations] = useState<HotelReservation[]>([]);
  const [services,     setServices]     = useState<HotelService[]>([]);

  const [tab,            setTab]            = useState<Tab>('chambres');
  const [resFilter,      setResFilter]      = useState<ResFilter>('active');
  const [dateFilterFrom, setDateFilterFrom] = useState('');
  const [dateFilterTo,   setDateFilterTo]   = useState('');
  const [showDateCal,    setShowDateCal]    = useState(false);
  const [search,         setSearch]         = useState('');
  const [panel,          setPanel]          = useState<Panel>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [savingPay, setSavingPay] = useState(false);

  const [roomForm,  setRoomForm]  = useState<RoomForm>(emptyRoomForm());
  const [guestForm, setGuestForm] = useState<GuestForm>(emptyGuestForm());
  const [resForm,   setResForm]   = useState<ResForm>(emptyResForm());
  const [svcForm,   setSvcForm]   = useState<SvcForm>(emptySvcForm());

  const [checkoutPaid,   setCheckoutPaid]   = useState('');
  const [checkoutMethod, setCheckoutMethod] = useState<PayMethod>('cash');
  const [payForm,  setPayForm]  = useState<{ amount: string; method: PayMethod }>({ amount: '', method: 'cash' });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<{ msg: string; onProceed: () => void } | null>(null);
  const [guestSearch,   setGuestSearch]   = useState('');
  const [guestDropOpen, setGuestDropOpen] = useState(false);

  const today2 = new Date();
  const [calYear,  setCalYear]  = useState(today2.getFullYear());
  const [calMonth, setCalMonth] = useState(today2.getMonth());

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
    } catch (e) { notifError(toUserError(e)); }
    finally { setLoading(false); }
  }

  async function loadServices(reservationId: string) {
    try { setServices(await getServices(reservationId)); }
    catch (e) { notifError(toUserError(e)); }
  }

  // ─── CRUD Chambre ──────────────────────────────────────────────────────────

  function openRoomPanel(item: HotelRoom | null) {
    setRoomForm(item ? {
      number: item.number, type: item.type, floor: item.floor ?? '',
      capacity: item.capacity, price_per_night: String(item.price_per_night),
      status: item.status, description: item.description ?? '',
      amenities: item.amenities ?? [], is_active: item.is_active,
    } : emptyRoomForm());
    setPanel({ type: 'room', item });
  }

  async function saveRoom() {
    if (!business || !roomForm.number.trim() || !roomForm.price_per_night) return;
    setSaving(true);
    try {
      const payload = {
        number: roomForm.number.trim(), type: roomForm.type,
        floor: roomForm.floor.trim() || null, capacity: Number(roomForm.capacity),
        price_per_night: Number(roomForm.price_per_night), status: roomForm.status,
        description: roomForm.description.trim() || null, amenities: roomForm.amenities,
        is_active: roomForm.is_active,
      };
      if (panel?.type === 'room' && panel.item) {
        const updated = await updateRoom(panel.item.id, payload);
        setRooms((p) => p.map((r) => r.id === updated.id ? updated : r));
        success('Chambre mise à jour');
      } else {
        const created = await createRoom(business.id, payload);
        setRooms((p) => [...p, created]);
        success('Chambre créée');
      }
      setPanel(null);
    } catch (e) { notifError(toUserError(e)); }
    finally { setSaving(false); }
  }

  async function removeRoom(id: string) {
    if (!confirm('Supprimer cette chambre ?')) return;
    try {
      await deleteRoom(id);
      setRooms((p) => p.filter((r) => r.id !== id));
      success('Chambre supprimée');
    } catch (e) { notifError(toUserError(e)); }
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
      full_name: item.full_name, phone: item.phone ?? '', email: item.email ?? '',
      id_type: item.id_type ?? '', id_number: item.id_number ?? '',
      nationality: item.nationality ?? '', address: item.address ?? '', notes: item.notes ?? '',
    } : emptyGuestForm());
    setPanel({ type: 'guest', item });
  }

  async function saveGuest() {
    if (!business || !guestForm.full_name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        full_name: guestForm.full_name.trim(), phone: guestForm.phone.trim() || null,
        email: guestForm.email.trim() || null, id_type: guestForm.id_type || null,
        id_number: guestForm.id_number.trim() || null, nationality: guestForm.nationality.trim() || null,
        address: guestForm.address.trim() || null, notes: guestForm.notes.trim() || null,
      };
      if (panel?.type === 'guest' && panel.item) {
        const updated = await updateGuest(panel.item.id, payload);
        setGuests((p) => p.map((g) => g.id === updated.id ? updated : g));
        success('Client mis à jour');
      } else {
        const created = await createGuest(business.id, payload);
        setGuests((p) => [...p, created]);
        success('Client ajouté');
      }
      setPanel(null);
    } catch (e) { notifError(toUserError(e)); }
    finally { setSaving(false); }
  }

  async function removeGuest(id: string) {
    if (!confirm('Supprimer ce client ?')) return;
    try {
      await deleteGuest(id);
      setGuests((p) => p.filter((g) => g.id !== id));
      success('Client supprimé');
    } catch (e) { notifError(toUserError(e)); }
  }

  // ─── CRUD Réservation ─────────────────────────────────────────────────────

  function openReservationPanel(defaultRoomId?: string) {
    const room = defaultRoomId ? rooms.find((r) => r.id === defaultRoomId) : null;
    setResForm({ ...emptyResForm(), room_id: defaultRoomId ?? '', price_per_night: room ? String(room.price_per_night) : '' });
    setGuestSearch('');
    setGuestDropOpen(false);
    setPanel({ type: 'reservation', item: null, defaultRoomId });
  }

  async function _doCreateReservation() {
    if (!business || !user) return;
    setSaving(true);
    try {
      const created = await createReservation(business.id, user.id, {
        room_id: resForm.room_id, guest_id: resForm.guest_id,
        check_in: resForm.check_in, check_out: resForm.check_out,
        num_guests: Number(resForm.num_guests), price_per_night: Number(resForm.price_per_night),
        notes: resForm.notes.trim() || undefined,
      });
      setReservations((p) => [created, ...p]);
      logAction({ business_id: business.id, action: 'hotel.reservation.created', entity_type: 'reservation', entity_id: created.id, metadata: { room_id: created.room_id, guest_id: created.guest_id, check_in: created.check_in, check_out: created.check_out, total: created.total } });
      const depositAmt = Number(resForm.deposit);
      if (depositAmt > 0) {
        await addHotelPayment(business.id, created.id, depositAmt, resForm.depositMethod, sessionId);
        logAction({ business_id: business.id, action: 'hotel.payment', entity_type: 'reservation', entity_id: created.id, metadata: { room_id: created.room_id, guest_id: created.guest_id, amount: depositAmt, method: resForm.depositMethod, type: 'deposit' } });
        setReservations((p) => p.map((r) => r.id === created.id ? { ...r, paid_amount: depositAmt } : r));
      }
      success('Réservation créée');
      setPanel(null);
    } catch (e) { notifError(toUserError(e)); }
    finally { setSaving(false); setConflictWarning(null); }
  }

  async function saveReservation() {
    if (!business || !user) return;
    if (!resForm.room_id || !resForm.guest_id || !resForm.check_in || !resForm.check_out || !resForm.price_per_night) return;
    if (resForm.check_out <= resForm.check_in) { notifError("La date de départ doit être après la date d'arrivée"); return; }
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
    } catch (e) { notifError(toUserError(e)); setSaving(false); return; }
    await _doCreateReservation();
  }

  async function handleCancelReservation(res: HotelReservation) {
    if (!confirm('Annuler cette réservation ?')) return;
    try {
      const updated = await cancelReservation(res.id);
      setReservations((p) => p.map((r) => r.id === updated.id ? updated : r));
      if (panel?.type === 'detail') setPanel({ type: 'detail', reservation: updated });
      if (business) logAction({ business_id: business.id, action: 'hotel.reservation.cancelled', entity_type: 'reservation', entity_id: res.id, metadata: { room_id: res.room_id, guest_id: res.guest_id } });
      success('Réservation annulée');
    } catch (e) { notifError(toUserError(e)); }
  }

  async function handleCheckIn(res: HotelReservation) {
    try {
      const updated = await checkIn(res.id, res.room_id);
      setReservations((p) => p.map((r) => r.id === updated.id ? updated : r));
      setRooms((p) => p.map((r) => r.id === res.room_id ? { ...r, status: 'occupied' } : r));
      if (panel?.type === 'detail') setPanel({ type: 'detail', reservation: updated });
      if (business) logAction({ business_id: business.id, action: 'hotel.checkin', entity_type: 'reservation', entity_id: res.id, metadata: { room_id: res.room_id, guest_id: res.guest_id, check_in: res.check_in } });
      success('Check-in effectué');
    } catch (e) { notifError(toUserError(e)); }
  }

  async function handleCheckOut(res: HotelReservation) {
    const additional = Number(checkoutPaid) || 0;
    try {
      const updated = await checkOut(res.id, res.room_id, additional, sessionId, checkoutMethod);
      setReservations((p) => p.map((r) => r.id === updated.id ? updated : r));
      setRooms((p) => p.map((r) => r.id === res.room_id ? { ...r, status: 'cleaning' } : r));
      setPanel(null);
      if (business) logAction({ business_id: business.id, action: 'hotel.checkout', entity_type: 'reservation', entity_id: res.id, metadata: { room_id: res.room_id, guest_id: res.guest_id, total: updated.total, additional_payment: additional } });
      success('Check-out effectué — chambre en nettoyage');
    } catch (e) { notifError(toUserError(e)); }
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
      setReservations((p) => p.map((r) => r.id === res.id ? newRes : r));
      if (panel?.type === 'detail') setPanel({ type: 'detail', reservation: newRes });
      setPayForm({ amount: '', method: 'cash' });
      success(`Paiement de ${fmtMoney(amount, currency)} enregistré`);
    } catch (e) { notifError(toUserError(e)); }
    finally { setSavingPay(false); }
  }

  async function handleAddService(reservationId: string) {
    if (!business || !svcForm.label.trim() || !svcForm.amount) return;
    setSaving(true);
    try {
      const created = await addService(business.id, reservationId, {
        label: svcForm.label.trim(), amount: Number(svcForm.amount), service_date: svcForm.service_date,
      });
      setServices((p) => [...p, created]);
      const updated = reservations.find((r) => r.id === reservationId);
      if (updated) {
        const newRes: HotelReservation = {
          ...updated,
          total_services: updated.total_services + Number(svcForm.amount),
          total: updated.total_room + updated.total_services + Number(svcForm.amount),
        };
        setReservations((p) => p.map((r) => r.id === reservationId ? newRes : r));
        if (panel?.type === 'detail') setPanel({ type: 'detail', reservation: newRes });
      }
      setSvcForm(emptySvcForm());
      success('Prestation ajoutée');
    } catch (e) { notifError(toUserError(e)); }
    finally { setSaving(false); }
  }

  async function handleDeleteService(svc: HotelService, reservationId: string) {
    try {
      await deleteService(svc.id, reservationId);
      setServices((p) => p.filter((s) => s.id !== svc.id));
      const updated = reservations.find((r) => r.id === reservationId);
      if (updated) {
        const newRes: HotelReservation = {
          ...updated,
          total_services: updated.total_services - svc.amount,
          total: updated.total_room + updated.total_services - svc.amount,
        };
        setReservations((p) => p.map((r) => r.id === reservationId ? newRes : r));
        if (panel?.type === 'detail') setPanel({ type: 'detail', reservation: newRes });
      }
    } catch (e) { notifError(toUserError(e)); }
  }

  function openDetail(res: HotelReservation) {
    setPanel({ type: 'detail', reservation: res });
    const remaining = res.total - res.paid_amount;
    setCheckoutPaid(remaining > 0 ? String(remaining) : '');
    setCheckoutMethod('cash');
    setPayForm({ amount: '', method: 'cash' });
    setSvcForm(emptySvcForm());
    loadServices(res.id);
  }

  // ─── Données dérivées ──────────────────────────────────────────────────────

  const today = todayStr();

  const filteredRooms = useMemo(() =>
    rooms.filter((r) =>
      r.number.toLowerCase().includes(search.toLowerCase()) ||
      (r.floor ?? '').toLowerCase().includes(search.toLowerCase())
    ), [rooms, search]);

  const filteredReservations = useMemo(() => {
    let list = reservations;
    if (resFilter === 'active')  list = list.filter((r) => r.status === 'confirmed' || r.status === 'checked_in');
    else if (resFilter === 'today') list = list.filter((r) =>
      (r.check_in === today && (r.status === 'confirmed' || r.status === 'checked_in')) ||
      (r.check_out === today && r.status === 'checked_in')
    );
    else if (resFilter === 'dates' && dateFilterFrom) {
      const to = dateFilterTo || dateFilterFrom;
      list = list.filter((r) => r.check_in <= to && r.check_out > dateFilterFrom && r.status !== 'cancelled');
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.guest?.full_name.toLowerCase().includes(q) || r.room?.number.toLowerCase().includes(q));
    }
    return list;
  }, [reservations, resFilter, search, today, dateFilterFrom, dateFilterTo]);

  const filteredGuests = useMemo(() => {
    const q = search.toLowerCase();
    return guests.filter((g) =>
      g.full_name.toLowerCase().includes(q) || (g.phone ?? '').includes(search) || (g.id_number ?? '').toLowerCase().includes(q)
    );
  }, [guests, search]);

  const stats = useMemo(() => ({
    available:   rooms.filter((r) => r.status === 'available').length,
    occupied:    rooms.filter((r) => r.status === 'occupied').length,
    cleaning:    rooms.filter((r) => r.status === 'cleaning').length,
    maintenance: rooms.filter((r) => r.status === 'maintenance').length,
    total:       rooms.length,
  }), [rooms]);

  const resNights = resForm.check_in && resForm.check_out && resForm.check_out > resForm.check_in
    ? nightsBetween(resForm.check_in, resForm.check_out) : 0;
  const resTotal = resNights * Number(resForm.price_per_night || 0);

  function activeResForRoom(roomId: string) { return reservations.find((r) => r.room_id === roomId && r.status === 'checked_in'); }
  function confirmedResForRoom(roomId: string) { return reservations.find((r) => r.room_id === roomId && r.status === 'confirmed'); }

  const checkoutsToday = useMemo(() =>
    reservations.filter((r) => r.check_out === today && r.status === 'checked_in'),
  [reservations, today]);

  const checkinsToday = useMemo(() =>
    reservations.filter((r) => r.check_in === today && r.status === 'confirmed'),
  [reservations, today]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col relative">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-surface-border flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-white">Hôtel</h1>
          <p className="text-xs text-slate-500 truncate">
            {stats.available} dispo · {stats.occupied} occupée{stats.occupied !== 1 ? 's' : ''} · {stats.total} chambre{stats.total !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Onglets — scroll horizontal sur mobile */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {([
              { id: 'chambres',     label: 'Chambres',      icon: BedDouble     },
              { id: 'reservations', label: 'Réservations',  icon: ClipboardList },
              { id: 'calendrier',   label: 'Calendrier',    icon: Calendar      },
              { id: 'clients',      label: 'Clients',       icon: Users         },
            ] as { id: Tab; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => { setTab(id); setSearch(''); setPanel(null); }}
                className={cn(
                  'flex items-center gap-1 px-2.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0',
                  tab === id ? 'bg-brand-600 text-white' : 'btn-secondary',
                )}
              >
                <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className="hidden xs:inline">{label}</span>
              </button>
            ))}
          </div>
          {tab === 'chambres' && isManagerOrAbove && (
            <button onClick={() => openRoomPanel(null)} className="btn-primary h-9 text-xs sm:text-sm flex items-center gap-1 shrink-0">
              <Plus className="w-4 h-4 shrink-0" /><span className="hidden sm:inline">Chambre</span>
            </button>
          )}
          {tab === 'reservations' && (
            <button onClick={() => openReservationPanel()} className="btn-primary h-9 text-xs sm:text-sm flex items-center gap-1 shrink-0">
              <Plus className="w-4 h-4 shrink-0" /><span className="hidden sm:inline">Réservation</span>
            </button>
          )}
          {tab === 'clients' && (
            <button onClick={() => openGuestPanel(null)} className="btn-primary h-9 text-xs sm:text-sm flex items-center gap-1 shrink-0">
              <Plus className="w-4 h-4 shrink-0" /><span className="hidden sm:inline">Client</span>
            </button>
          )}
        </div>
      </div>

      {/* Banner départs / arrivées du jour */}
      {(checkoutsToday.length > 0 || checkinsToday.length > 0) && (
        <div className="mx-4 mt-3 flex flex-col sm:flex-row gap-2">
          {checkoutsToday.length > 0 && (
            <button
              onClick={() => { setTab('reservations'); setResFilter('today'); }}
              className="flex-1 flex items-center gap-3 p-3 rounded-xl bg-amber-900/20 border border-amber-800/50 text-left hover:bg-amber-900/30 transition-colors"
            >
              <LogOut className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-sm text-amber-300 font-medium">
                {checkoutsToday.length} départ{checkoutsToday.length > 1 ? 's' : ''} aujourd&apos;hui
              </span>
            </button>
          )}
          {checkinsToday.length > 0 && (
            <button
              onClick={() => { setTab('reservations'); setResFilter('today'); }}
              className="flex-1 flex items-center gap-3 p-3 rounded-xl bg-green-900/20 border border-green-800/50 text-left hover:bg-green-900/30 transition-colors"
            >
              <LogIn className="w-4 h-4 text-green-400 shrink-0" />
              <span className="text-sm text-green-300 font-medium">
                {checkinsToday.length} arrivée{checkinsToday.length > 1 ? 's' : ''} prévue{checkinsToday.length > 1 ? 's' : ''} aujourd&apos;hui
              </span>
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      {tab === 'chambres' && (
        <ChambresTab
          filteredRooms={filteredRooms}
          stats={stats}
          search={search}
          loading={loading}
          isManagerOrAbove={isManagerOrAbove}
          currency={currency}
          onSearchChange={setSearch}
          openRoomPanel={openRoomPanel}
          openReservationPanel={openReservationPanel}
          openDetail={openDetail}
          activeResForRoom={activeResForRoom}
          confirmedResForRoom={confirmedResForRoom}
          onMarkAvailable={(roomId) => updateRoom(roomId, { status: 'available' })
            .then((r) => setRooms((p) => p.map((x) => x.id === r.id ? r : x)))
            .catch((e) => notifError(toUserError(e)))}
        />
      )}

      {tab === 'reservations' && (
        <ReservationsTab
          filteredReservations={filteredReservations}
          resFilter={resFilter}
          search={search}
          today={today}
          dateFilterFrom={dateFilterFrom}
          dateFilterTo={dateFilterTo}
          showDateCal={showDateCal}
          loading={loading}
          currency={currency}
          onFilterChange={(f) => { setResFilter(f); setShowDateCal(false); }}
          onToggleDateCal={() => { setResFilter('dates'); setShowDateCal((v) => !v); }}
          onDateSelect={(from, to) => { setDateFilterFrom(from); setDateFilterTo(to); if (from && to) setShowDateCal(false); }}
          onSearchChange={setSearch}
          openDetail={openDetail}
        />
      )}

      {tab === 'clients' && (
        <ClientsTab
          filteredGuests={filteredGuests}
          search={search}
          loading={loading}
          onSearchChange={setSearch}
          openGuestPanel={openGuestPanel}
          removeGuest={removeGuest}
        />
      )}

      {tab === 'calendrier' && (
        <CalendrierTab
          rooms={rooms}
          reservations={reservations}
          calYear={calYear}
          calMonth={calMonth}
          loading={loading}
          today2={today2}
          setCalYear={setCalYear}
          setCalMonth={setCalMonth}
          openDetail={openDetail}
        />
      )}

      {/* Side panels */}
      {panel?.type === 'room' && (
        <RoomPanel
          item={panel.item}
          form={roomForm}
          saving={saving}
          onChange={setRoomForm}
          onToggleAmenity={toggleAmenity}
          onSave={saveRoom}
          onDelete={removeRoom}
          onClose={() => setPanel(null)}
        />
      )}

      {panel?.type === 'guest' && (
        <GuestPanel
          item={panel.item}
          form={guestForm}
          saving={saving}
          onChange={setGuestForm}
          onSave={saveGuest}
          onDelete={removeGuest}
          onClose={() => setPanel(null)}
        />
      )}

      {panel?.type === 'reservation' && (
        <ReservationPanel
          form={resForm}
          rooms={rooms}
          guests={guests}
          reservations={reservations}
          guestSearch={guestSearch}
          guestDropOpen={guestDropOpen}
          resNights={resNights}
          resTotal={resTotal}
          conflictWarning={conflictWarning}
          saving={saving}
          currency={currency}
          onChange={setResForm}
          setGuestSearch={setGuestSearch}
          setGuestDropOpen={setGuestDropOpen}
          onSave={saveReservation}
          openGuestPanel={openGuestPanel}
          onClearConflict={() => setConflictWarning(null)}
          onClose={() => setPanel(null)}
        />
      )}

      {panel?.type === 'detail' && (() => {
        const res = reservations.find((r) => r.id === panel.reservation.id) ?? panel.reservation;
        return (
          <DetailPanel
            reservation={res}
            services={services}
            checkoutPaid={checkoutPaid}
            checkoutMethod={checkoutMethod}
            payForm={payForm}
            svcForm={svcForm}
            savingPay={savingPay}
            saving={saving}
            isManagerOrAbove={isManagerOrAbove}
            currency={currency}
            business={business}
            onClose={() => setPanel(null)}
            setCheckoutPaid={setCheckoutPaid}
            setCheckoutMethod={setCheckoutMethod}
            setPayForm={setPayForm}
            setSvcForm={setSvcForm}
            onCheckIn={handleCheckIn}
            onCheckOut={handleCheckOut}
            onCancel={handleCancelReservation}
            onAddPayment={handleAddPayment}
            onAddService={handleAddService}
            onDeleteService={handleDeleteService}
          />
        );
      })()}
    </div>
  );
}
