'use client';
import { toUserError } from '@/lib/user-error';

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, BedDouble, Users, ClipboardList, Calendar, LogOut, LogIn, Share2, Copy, Check, ExternalLink, BarChart3 } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { logAction } from '@services/supabase/logger';
import { cn } from '@/lib/utils';
import { useCan } from '@/hooks/usePermission';
import { triggerWhatsAppShare } from '@/lib/whatsapp-direct';
import {
  getRooms, createRoom, updateRoom, deleteRoom,
  getGuests, createGuest, updateGuest, deleteGuest,
  getReservations, createReservation, updateReservation, cancelReservation,
  checkIn, checkOut, markNoShow,
  getServices, addService, deleteService, addHotelPayment,
  getRoomConflicts, nightsBetween, getRevenueToday, computeRoomTotal,
  getCleaningLogs, markRoomClean, sendRoomToMaintenance, markMaintenanceDone, assignRoomCleaner,
  updateHotelBookingConfig,
} from '@services/supabase/hotel';
import { getStaff } from '@services/supabase/staff';
import { getCurrentSession } from '@services/supabase/cash-sessions';
import type {
  HotelRoom, HotelGuest, HotelReservation, HotelService, HotelCleaningLog,
  RoomType, RoomStatus,
} from '@services/supabase/hotel';
import type { Staff } from '@services/supabase/staff';

import { OnboardingChecklist } from '@/components/shared/OnboardingChecklist';

import { Tab, PayMethod, ResFilter, todayStr, tomorrowStr, fmt, fmtMoney } from './components/hotel-helpers';
import { ChambresTab }      from './components/ChambresTab';
import { ReservationsTab }  from './components/ReservationsTab';
import { ClientsTab }       from './components/ClientsTab';
import { CalendrierTab }    from './components/CalendrierTab';
import { RoomPanel }        from './components/RoomPanel';
import { GuestPanel }       from './components/GuestPanel';
import { ReservationPanel } from './components/ReservationPanel';
import { DetailPanel }      from './components/DetailPanel';
import { DailyReportModal } from './components/DailyReportModal';
import { CleaningPanel }   from './components/CleaningPanel';

// --- Form shapes --------------------------------------------------------------

type RoomForm = {
  number: string; type: RoomType; floor: string; capacity: number;
  price_per_night: string; weekend_price_per_night: string;
  status: RoomStatus; description: string;
  amenities: string[]; is_active: boolean;
};
type GuestForm = {
  full_name: string; phone: string; email: string; id_type: string;
  id_number: string; nationality: string; address: string; notes: string;
  preferences: string; date_of_birth: string;
};
type ResForm = {
  room_id: string; guest_id: string; check_in: string; check_out: string;
  num_guests: number; price_per_night: string; notes: string;
  deposit: string; depositMethod: PayMethod;
};
type SvcForm = { label: string; amount: string; service_date: string };
type ExtraRoom = { room_id: string; price_per_night: string };

type Panel =
  | null
  | { type: 'room';        item: HotelRoom | null }
  | { type: 'guest';       item: HotelGuest | null }
  | { type: 'reservation'; item: null; defaultRoomId?: string }
  | { type: 'editReservation'; reservation: HotelReservation }
  | { type: 'detail';      reservation: HotelReservation }
  | { type: 'cleaning';    room: HotelRoom };

const emptyRoomForm = (): RoomForm => ({
  number: '', type: 'double', floor: '', capacity: 2, price_per_night: '',
  weekend_price_per_night: '', status: 'available', description: '', amenities: [], is_active: true,
});
const emptyGuestForm = (): GuestForm => ({
  full_name: '', phone: '', email: '', id_type: '', id_number: '',
  nationality: '', address: '', notes: '', preferences: '', date_of_birth: '',
});
const emptyResForm = (): ResForm => ({
  room_id: '', guest_id: '', check_in: todayStr(), check_out: tomorrowStr(),
  num_guests: 1, price_per_night: '', notes: '', deposit: '', depositMethod: 'cash',
});
const emptySvcForm = (): SvcForm => ({ label: '', amount: '', service_date: todayStr() });

const PAGE_SIZE = 100;

// --- Page ---------------------------------------------------------------------

export default function HotelPage() {
  const { user, business } = useAuthStore();
  const can = useCan();
  const isManagerOrAbove    = can('manage_rooms');
  const canManageReservations = can('manage_reservations');
  const canManageGuests       = can('manage_guests');

  const { success, error: notifError } = useNotificationStore();
  const currency = business?.currency ?? 'XOF';

  if (!can('view_hotel')) {
    return (
      <div className="flex h-full items-center justify-center bg-surface p-6">
        <div className="max-w-sm text-center">
          <BedDouble className="mx-auto mb-3 h-10 w-10 text-content-secondary opacity-40" />
          <h1 className="text-lg font-bold text-content-primary">Accès refusé</h1>
          <p className="mt-1 text-sm text-content-secondary">Vous n&apos;avez pas la permission d&apos;accéder au module Hôtel.</p>
        </div>
      </div>
    );
  }

  const [rooms,        setRooms]        = useState<HotelRoom[]>([]);
  const [guests,       setGuests]       = useState<HotelGuest[]>([]);
  const [reservations, setReservations] = useState<HotelReservation[]>([]);
  const [services,     setServices]     = useState<HotelService[]>([]);
  const [revenueToday, setRevenueToday] = useState(0);

  const [tab,            setTab]            = useState<Tab>('chambres');
  const [resFilter,      setResFilter]      = useState<ResFilter>('active');
  const [dateFilterFrom, setDateFilterFrom] = useState('');
  const [dateFilterTo,   setDateFilterTo]   = useState('');
  const [showDateCal,    setShowDateCal]    = useState(false);
  const [search,         setSearch]         = useState('');
  const [panel,          setPanel]          = useState<Panel>(null);
  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [savingPay,      setSavingPay]      = useState(false);
  const [servicesLoading, setServicesLoading] = useState(false);

  // Pagination
  const [hasMore,      setHasMore]      = useState(false);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [resOffset,    setResOffset]    = useState(0);

  const [roomForm,  setRoomForm]  = useState<RoomForm>(emptyRoomForm());
  const [guestForm, setGuestForm] = useState<GuestForm>(emptyGuestForm());
  const [resForm,   setResForm]   = useState<ResForm>(emptyResForm());
  const [svcForm,   setSvcForm]   = useState<SvcForm>(emptySvcForm());
  const [extraRooms, setExtraRooms] = useState<ExtraRoom[]>([]);

  const [checkoutPaid,   setCheckoutPaid]   = useState('');
  const [checkoutMethod, setCheckoutMethod] = useState<PayMethod>('cash');
  const [payForm,  setPayForm]  = useState<{ amount: string; method: PayMethod }>({ amount: '', method: 'cash' });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<{ msg: string; onProceed: () => void } | null>(null);
  const [guestSearch,   setGuestSearch]   = useState('');
  const [guestDropOpen, setGuestDropOpen] = useState(false);
  const [showShare,          setShowShare]          = useState(false);
  const [showReport,         setShowReport]         = useState(false);
  const [copied,             setCopied]             = useState(false);
  const [policyText,         setPolicyText]         = useState('');
  const [depositText,        setDepositText]        = useState('');
  const [savingPolicy,       setSavingPolicy]       = useState(false);

  // Cleaning / housekeeping
  const [cleaningLogs,        setCleaningLogs]        = useState<HotelCleaningLog[]>([]);
  const [cleaningLogsLoading, setCleaningLogsLoading] = useState(false);
  const [cleaningSaving,      setCleaningSaving]      = useState(false);
  const [staffList,           setStaffList]           = useState<Staff[]>([]);

  const hotelUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/reservation/${business?.id ?? ''}`
    : '';

  async function copyHotelLink() {
    try {
      await navigator.clipboard.writeText(hotelUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  const today2 = new Date();
  const [calYear,  setCalYear]  = useState(today2.getFullYear());
  const [calMonth, setCalMonth] = useState(today2.getMonth());

  useEffect(() => {
    if (!business) return;
    loadAll();
  }, [business]);

  async function saveHotelPolicy() {
    if (!business) return;
    setSavingPolicy(true);
    try {
      await updateHotelBookingConfig(business.id, {
        hotel_cancellation_policy: policyText.trim() || null,
        hotel_deposit_info: depositText.trim() || null,
      });
      success('Paramètres de réservation mis à jour');
    } catch (e) { notifError(toUserError(e)); }
    finally { setSavingPolicy(false); }
  }

  async function loadAll() {
    if (!business) return;
    setLoading(true);
    try {
      const [r, g, resResult, sess, rev] = await Promise.all([
        getRooms(business.id),
        getGuests(business.id),
        getReservations(business.id, { limit: PAGE_SIZE }),
        getCurrentSession(business.id),
        getRevenueToday(business.id),
      ]);
      setRooms(r);
      setGuests(g);
      setReservations(resResult.data);
      setHasMore(resResult.hasMore);
      setResOffset(PAGE_SIZE);
      setSessionId(sess?.id ?? null);
      setRevenueToday(rev);
    } catch (e) { notifError(toUserError(e)); }
    finally { setLoading(false); }
  }

  async function loadMoreReservations() {
    if (!business || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await getReservations(business.id, { limit: PAGE_SIZE, offset: resOffset });
      setReservations(prev => [...prev, ...result.data]);
      setHasMore(result.hasMore);
      setResOffset(prev => prev + PAGE_SIZE);
    } catch (e) { notifError(toUserError(e)); }
    finally { setLoadingMore(false); }
  }

  async function loadServices(reservationId: string) {
    setServicesLoading(true);
    try { setServices(await getServices(reservationId)); }
    catch (e) { notifError(toUserError(e)); }
    finally { setServicesLoading(false); }
  }

  // --- CRUD Chambre ----------------------------------------------------------

  function openRoomPanel(item: HotelRoom | null) {
    setRoomForm(item ? {
      number: item.number, type: item.type, floor: item.floor ?? '',
      capacity: item.capacity, price_per_night: String(item.price_per_night),
      weekend_price_per_night: item.weekend_price_per_night ? String(item.weekend_price_per_night) : '',
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
        price_per_night: Number(roomForm.price_per_night),
        weekend_price_per_night: roomForm.weekend_price_per_night ? Number(roomForm.weekend_price_per_night) : null,
        status: roomForm.status,
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
    if (!confirm('Archiver cette chambre ? Elle n\'apparaîtra plus dans la liste mais l\'historique est conservé.')) return;
    try {
      await deleteRoom(id);
      setRooms((p) => p.filter((r) => r.id !== id));
      success('Chambre archivée');
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

  // --- CRUD Client ----------------------------------------------------------

  function openGuestPanel(item: HotelGuest | null) {
    setGuestForm(item ? {
      full_name: item.full_name, phone: item.phone ?? '', email: item.email ?? '',
      id_type: item.id_type ?? '', id_number: item.id_number ?? '',
      nationality: item.nationality ?? '', address: item.address ?? '',
      notes: item.notes ?? '', preferences: item.preferences ?? '',
      date_of_birth: item.date_of_birth ?? '',
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
        preferences: guestForm.preferences.trim() || null,
        date_of_birth: guestForm.date_of_birth || null,
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

  // --- CRUD Réservation -----------------------------------------------------

  function openReservationPanel(defaultRoomId?: string) {
    const room = defaultRoomId ? rooms.find((r) => r.id === defaultRoomId) : null;
    setResForm({ ...emptyResForm(), room_id: defaultRoomId ?? '', price_per_night: room ? String(room.price_per_night) : '' });
    setExtraRooms([]);
    setGuestSearch('');
    setGuestDropOpen(false);
    setPanel({ type: 'reservation', item: null, defaultRoomId });
  }

  function openEditReservationPanel(res: HotelReservation) {
    setResForm({
      room_id: res.room_id,
      guest_id: res.guest_id,
      check_in: res.check_in,
      check_out: res.check_out,
      num_guests: res.num_guests,
      price_per_night: String(res.price_per_night),
      notes: res.notes ?? '',
      deposit: '',
      depositMethod: 'cash',
    });
    setExtraRooms([]);
    setPanel({ type: 'editReservation', reservation: res });
  }

  async function _doCreateReservation(groupId?: string) {
    if (!business || !user) return;
    setSaving(true);
    try {
      const mainRoom = rooms.find(r => r.id === resForm.room_id);
      const created = await createReservation(business.id, user.id, {
        room_id: resForm.room_id,
        guest_id: resForm.guest_id,
        check_in: resForm.check_in,
        check_out: resForm.check_out,
        num_guests: Number(resForm.num_guests),
        price_per_night: Number(resForm.price_per_night),
        notes: resForm.notes.trim() || undefined,
        group_id: groupId ?? null,
        weekendPrice: mainRoom?.weekend_price_per_night ?? null,
      });
      setReservations((p) => [created, ...p]);
      logAction({ business_id: business.id, action: 'hotel.reservation.created', entity_type: 'reservation', entity_id: created.id, metadata: { room_id: created.room_id, guest_id: created.guest_id, check_in: created.check_in, check_out: created.check_out, total: created.total } });
      const depositAmt = Number(resForm.deposit);
      if (depositAmt > 0) {
        await addHotelPayment(business.id, created.id, depositAmt, resForm.depositMethod, sessionId);
        logAction({ business_id: business.id, action: 'hotel.payment', entity_type: 'reservation', entity_id: created.id, metadata: { amount: depositAmt, method: resForm.depositMethod, type: 'deposit' } });
        setReservations((p) => p.map((r) => r.id === created.id ? { ...r, paid_amount: depositAmt } : r));
      }

      // Chambres additionnelles
      const validExtras = extraRooms.filter(er => er.room_id && er.price_per_night);
      for (const er of validExtras) {
        const erRoom = rooms.find(r => r.id === er.room_id);
        const extra = await createReservation(business.id, user.id, {
          room_id: er.room_id,
          guest_id: resForm.guest_id,
          check_in: resForm.check_in,
          check_out: resForm.check_out,
          num_guests: Number(resForm.num_guests),
          price_per_night: Number(er.price_per_night),
          notes: resForm.notes.trim() || undefined,
          group_id: groupId ?? created.id,
          weekendPrice: erRoom?.weekend_price_per_night ?? null,
        });
        setReservations((p) => [extra, ...p]);
      }

      success(validExtras.length > 0 ? `${1 + validExtras.length} réservations créées` : 'Réservation créée');
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
        setConflictWarning({ msg, onProceed: () => _doCreateReservation() });
        return;
      }
    } catch (e) { notifError(toUserError(e)); setSaving(false); return; }
    await _doCreateReservation();
  }

  async function saveEditedReservation() {
    if (!business || !user) return;
    const editPanel = panel?.type === 'editReservation' ? panel : null;
    if (!editPanel) return;
    if (!resForm.room_id || !resForm.check_in || !resForm.check_out || !resForm.price_per_night) return;
    if (resForm.check_out <= resForm.check_in) { notifError("La date de départ doit être après la date d'arrivée"); return; }
    setSaving(true);
    try {
      const conflicts = await getRoomConflicts(resForm.room_id, resForm.check_in, resForm.check_out, editPanel.reservation.id);
      setSaving(false);
      if (conflicts.length > 0) {
        const c = conflicts[0];
        const guestLabel = c.guest_name ? ` (${c.guest_name})` : '';
        const msg = `Chambre déjà réservée du ${fmt(c.check_in)} au ${fmt(c.check_out)}${guestLabel}. Modifier quand même ?`;
        setConflictWarning({ msg, onProceed: () => _doSaveEdit(editPanel.reservation) });
        return;
      }
    } catch (e) { notifError(toUserError(e)); setSaving(false); return; }
    await _doSaveEdit(editPanel.reservation);
  }

  async function _doSaveEdit(original: HotelReservation) {
    if (!business) return;
    setSaving(true);
    try {
      const erRoom = rooms.find(r => r.id === resForm.room_id);
      const updated = await updateReservation(original.id, {
        room_id: resForm.room_id,
        check_in: resForm.check_in,
        check_out: resForm.check_out,
        num_guests: Number(resForm.num_guests),
        price_per_night: Number(resForm.price_per_night),
        notes: resForm.notes.trim() || null,
        weekendPrice: erRoom?.weekend_price_per_night ?? null,
      });
      setReservations((p) => p.map((r) => r.id === updated.id ? updated : r));
      logAction({ business_id: business.id, action: 'hotel.reservation.updated', entity_type: 'reservation', entity_id: original.id, metadata: { room_id: resForm.room_id, check_in: resForm.check_in, check_out: resForm.check_out } });
      success('Réservation mise à jour');
      setPanel(null);
    } catch (e) { notifError(toUserError(e)); }
    finally { setSaving(false); setConflictWarning(null); }
  }

  async function handleCancelReservation(res: HotelReservation) {
    if (!confirm('Annuler cette réservation ?')) return;
    try {
      const updated = await cancelReservation(res.id);
      setReservations((p) => p.map((r) => r.id === updated.id ? updated : r));
      if (panel?.type === 'detail') setPanel({ type: 'detail', reservation: updated });
      if (business) logAction({ business_id: business.id, action: 'hotel.reservation.cancelled', entity_type: 'reservation', entity_id: res.id, metadata: { room_id: res.room_id } });
      success('Réservation annulée');
    } catch (e) { notifError(toUserError(e)); }
  }

  async function handleNoShow(res: HotelReservation) {
    if (!confirm('Marquer cette réservation comme no-show ?')) return;
    try {
      const updated = await markNoShow(res.id);
      setReservations((p) => p.map((r) => r.id === updated.id ? updated : r));
      if (panel?.type === 'detail') setPanel({ type: 'detail', reservation: updated });
      if (business) logAction({ business_id: business.id, action: 'hotel.no_show', entity_type: 'reservation', entity_id: res.id, metadata: { room_id: res.room_id } });
      success('Réservation marquée no-show');
    } catch (e) { notifError(toUserError(e)); }
  }

  async function handleCheckIn(res: HotelReservation) {
    try {
      const updated = await checkIn(res.id, res.room_id);
      setReservations((p) => p.map((r) => r.id === updated.id ? updated : r));
      setRooms((p) => p.map((r) => r.id === res.room_id ? { ...r, status: 'occupied' } : r));
      if (panel?.type === 'detail') setPanel({ type: 'detail', reservation: updated });
      if (business) logAction({ business_id: business.id, action: 'hotel.checkin', entity_type: 'reservation', entity_id: res.id, metadata: { room_id: res.room_id } });
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
      if (business) {
        logAction({ business_id: business.id, action: 'hotel.checkout', entity_type: 'reservation', entity_id: res.id, metadata: { room_id: res.room_id, total: updated.total, additional_payment: additional } });
        if (additional > 0) setRevenueToday(prev => prev + additional);
      }
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
      logAction({ business_id: business.id, action: 'hotel.payment', entity_type: 'reservation', entity_id: res.id, metadata: { amount, method: payForm.method } });
      const newPaid = res.paid_amount + amount;
      const newRes = { ...res, paid_amount: newPaid };
      setReservations((p) => p.map((r) => r.id === res.id ? newRes : r));
      if (panel?.type === 'detail') setPanel({ type: 'detail', reservation: newRes });
      setPayForm({ amount: '', method: 'cash' });
      setRevenueToday(prev => prev + amount);
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

  // --- Ménage / Housekeeping ------------------------------------------------

  async function openCleaningPanel(room: HotelRoom) {
    setPanel({ type: 'cleaning', room });
    setCleaningLogs([]);
    setCleaningLogsLoading(true);
    try {
      const [logs, staff] = await Promise.all([
        getCleaningLogs(room.id),
        staffList.length > 0 ? Promise.resolve(staffList) : (business ? getStaff(business.id) : Promise.resolve([])),
      ]);
      setCleaningLogs(logs);
      setStaffList(staff);
    } catch (e) { notifError(toUserError(e)); }
    finally { setCleaningLogsLoading(false); }
  }

  async function handleMarkClean(room: HotelRoom, notes: string) {
    if (!business) return;
    setCleaningSaving(true);
    try {
      const updated = await markRoomClean(room.id, business.id, { notes: notes || undefined, userId: user?.id });
      setRooms((p) => p.map((r) => r.id === updated.id ? updated : r));
      const log = await getCleaningLogs(room.id);
      setCleaningLogs(log);
      setPanel({ type: 'cleaning', room: updated });
      success('Chambre marquée propre — disponible');
    } catch (e) { notifError(toUserError(e)); }
    finally { setCleaningSaving(false); }
  }

  async function handleSendMaintenance(room: HotelRoom, notes: string) {
    if (!business) return;
    setCleaningSaving(true);
    try {
      const updated = await sendRoomToMaintenance(room.id, business.id, { notes: notes || undefined, userId: user?.id });
      setRooms((p) => p.map((r) => r.id === updated.id ? updated : r));
      const log = await getCleaningLogs(room.id);
      setCleaningLogs(log);
      setPanel({ type: 'cleaning', room: updated });
      success('Chambre envoyée en maintenance');
    } catch (e) { notifError(toUserError(e)); }
    finally { setCleaningSaving(false); }
  }

  async function handleMaintenanceDone(room: HotelRoom, notes: string) {
    if (!business) return;
    setCleaningSaving(true);
    try {
      const updated = await markMaintenanceDone(room.id, business.id, { notes: notes || undefined, userId: user?.id });
      setRooms((p) => p.map((r) => r.id === updated.id ? updated : r));
      const log = await getCleaningLogs(room.id);
      setCleaningLogs(log);
      setPanel({ type: 'cleaning', room: updated });
      success('Maintenance terminée — chambre disponible');
    } catch (e) { notifError(toUserError(e)); }
    finally { setCleaningSaving(false); }
  }

  async function handleAssignCleaner(room: HotelRoom, cleanerId: string | null) {
    if (!business) return;
    try {
      const updated = await assignRoomCleaner(room.id, cleanerId, business.id, { userId: user?.id });
      setRooms((p) => p.map((r) => r.id === updated.id ? updated : r));
      setPanel({ type: 'cleaning', room: updated });
      if (cleanerId) {
        const logs = await getCleaningLogs(room.id);
        setCleaningLogs(logs);
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

  // --- Données dérivées ------------------------------------------------------

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

  const stats = useMemo(() => {
    const available   = rooms.filter((r) => r.status === 'available').length;
    const occupied    = rooms.filter((r) => r.status === 'occupied').length;
    const cleaning    = rooms.filter((r) => r.status === 'cleaning').length;
    const maintenance = rooms.filter((r) => r.status === 'maintenance').length;
    const total       = rooms.length;
    const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;
    return { available, occupied, cleaning, maintenance, total, occupancyRate };
  }, [rooms]);

  const resNights = resForm.check_in && resForm.check_out && resForm.check_out > resForm.check_in
    ? nightsBetween(resForm.check_in, resForm.check_out) : 0;
  const mainRoom = rooms.find(r => r.id === resForm.room_id);
  const mainComputed = resNights > 0 && resForm.price_per_night
    ? computeRoomTotal(resForm.check_in, resForm.check_out, Number(resForm.price_per_night), mainRoom?.weekend_price_per_night ?? null)
    : null;
  const resTotal = mainComputed?.total ?? resNights * Number(resForm.price_per_night || 0);

  function activeResForRoom(roomId: string) { return reservations.find((r) => r.room_id === roomId && r.status === 'checked_in'); }
  function confirmedResForRoom(roomId: string) { return reservations.find((r) => r.room_id === roomId && r.status === 'confirmed'); }

  const checkoutsToday = useMemo(() =>
    reservations.filter((r) => r.check_out === today && r.status === 'checked_in'),
  [reservations, today]);

  const checkinsToday = useMemo(() =>
    reservations.filter((r) => r.check_in === today && r.status === 'confirmed'),
  [reservations, today]);

  const editReservation = panel?.type === 'editReservation' ? panel.reservation : null;

  // --- Render ---------------------------------------------------------------

  return (
    <div className="h-full flex flex-col relative">
      <div className="px-4 sm:px-6 pt-3 empty:hidden">
        <OnboardingChecklist />
      </div>
      {/* Header */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-surface-border flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-content-primary">Hôtel</h1>
          <p className="text-xs text-content-secondary">Chambres, réservations et check-in/check-out</p>
          <p className="text-xs text-content-muted truncate">
            {stats.available} dispo · {stats.occupied} occupée{stats.occupied !== 1 ? 's' : ''}
            {stats.occupancyRate > 0 && ` · ${stats.occupancyRate}% occupation`}
            {revenueToday > 0 && ` · ${fmtMoney(revenueToday, currency)} encaissé`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowReport(true)}
            className="btn-secondary flex items-center gap-1.5 h-9 text-xs sm:text-sm shrink-0"
            title="Rapport du jour"
          >
            <BarChart3 className="w-4 h-4" />
            <span className="hidden sm:inline">Rapport</span>
          </button>
          <button
            onClick={() => {
              setPolicyText(business?.hotel_cancellation_policy ?? '');
              setDepositText(business?.hotel_deposit_info ?? '');
              setShowShare(true);
            }}
            className="btn-secondary flex items-center gap-1.5 h-9 text-xs sm:text-sm shrink-0"
            title="Partager la page de réservation"
          >
            <Share2 className="w-4 h-4" />
            <span className="hidden sm:inline">Partager</span>
          </button>
          {/* Onglets */}
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
                  tab === id ? 'bg-brand-600 text-content-primary' : 'btn-secondary',
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
          {tab === 'reservations' && canManageReservations && (
            <button onClick={() => openReservationPanel()} className="btn-primary h-9 text-xs sm:text-sm flex items-center gap-1 shrink-0">
              <Plus className="w-4 h-4 shrink-0" /><span className="hidden sm:inline">Réservation</span>
            </button>
          )}
          {tab === 'clients' && canManageGuests && (
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
              className="flex-1 flex items-center gap-3 p-3 rounded-xl bg-badge-warning border border-status-warning/50 text-left hover:bg-badge-warning transition-colors"
            >
              <LogOut className="w-4 h-4 text-status-warning shrink-0" />
              <span className="text-sm text-status-warning font-medium">
                {checkoutsToday.length} départ{checkoutsToday.length > 1 ? 's' : ''} aujourd&apos;hui
              </span>
            </button>
          )}
          {checkinsToday.length > 0 && (
            <button
              onClick={() => { setTab('reservations'); setResFilter('today'); }}
              className="flex-1 flex items-center gap-3 p-3 rounded-xl bg-badge-success border border-status-success/50 text-left hover:bg-badge-success transition-colors"
            >
              <LogIn className="w-4 h-4 text-status-success shrink-0" />
              <span className="text-sm text-status-success font-medium">
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
          onOpenCleaning={openCleaningPanel}
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
          hasMore={hasMore}
          loadingMore={loadingMore}
          onFilterChange={(f) => { setResFilter(f); setShowDateCal(false); }}
          onToggleDateCal={() => { setResFilter('dates'); setShowDateCal((v) => !v); }}
          onDateSelect={(from, to) => { setDateFilterFrom(from); setDateFilterTo(to); if (from && to) setShowDateCal(false); }}
          onSearchChange={setSearch}
          openDetail={openDetail}
          onLoadMore={loadMoreReservations}
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
          stays={panel.item ? reservations.filter((r) => r.guest_id === panel.item!.id) : []}
          staysLoading={false}
          currency={currency}
          onChange={setGuestForm}
          onSave={saveGuest}
          onDelete={removeGuest}
          onOpenDetail={openDetail}
          onClose={() => setPanel(null)}
        />
      )}

      {(panel?.type === 'reservation' || panel?.type === 'editReservation') && (
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
          editItem={editReservation}
          extraRooms={extraRooms}
          onChange={setResForm}
          setGuestSearch={setGuestSearch}
          setGuestDropOpen={setGuestDropOpen}
          onSave={panel?.type === 'editReservation' ? saveEditedReservation : saveReservation}
          openGuestPanel={openGuestPanel}
          onClearConflict={() => setConflictWarning(null)}
          onClose={() => setPanel(null)}
          onAddExtraRoom={() => setExtraRooms(prev => [...prev, { room_id: '', price_per_night: '' }])}
          onRemoveExtraRoom={(idx) => setExtraRooms(prev => prev.filter((_, i) => i !== idx))}
          onChangeExtraRoom={(idx, er) => setExtraRooms(prev => prev.map((x, i) => i === idx ? er : x))}
        />
      )}

      {panel?.type === 'detail' && (() => {
        const res = reservations.find((r) => r.id === panel.reservation.id) ?? panel.reservation;
        return (
          <DetailPanel
            reservation={res}
            services={services}
            servicesLoading={servicesLoading}
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
            onNoShow={handleNoShow}
            onEdit={openEditReservationPanel}
            onAddPayment={handleAddPayment}
            onAddService={handleAddService}
            onDeleteService={handleDeleteService}
          />
        );
      })()}

      {/* Modal rapport journalier */}
      {showReport && (
        <DailyReportModal
          rooms={rooms}
          reservations={reservations}
          currency={currency}
          revenueToday={revenueToday}
          onClose={() => setShowReport(false)}
        />
      )}

      {/* Panneau ménage */}
      {panel?.type === 'cleaning' && (() => {
        const cleanRoom = rooms.find((r) => r.id === panel.room.id) ?? panel.room;
        return (
          <CleaningPanel
            room={cleanRoom}
            logs={cleaningLogs}
            logsLoading={cleaningLogsLoading}
            staff={staffList.map(s => ({ id: s.id, name: s.name }))}
            saving={cleaningSaving}
            onMarkClean={(notes) => handleMarkClean(cleanRoom, notes)}
            onSendMaintenance={(notes) => handleSendMaintenance(cleanRoom, notes)}
            onMaintenanceDone={(notes) => handleMaintenanceDone(cleanRoom, notes)}
            onAssignCleaner={(sid) => handleAssignCleaner(cleanRoom, sid)}
            onClose={() => setPanel(null)}
          />
        );
      })()}

      {/* Modal partage réservations en ligne */}
      {showShare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowShare(false)}>
          <div className="bg-surface-card border border-surface-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border shrink-0">
              <div className="flex items-center gap-2">
                <Share2 className="w-5 h-5 text-content-brand" />
                <h3 className="font-semibold text-content-primary">Réservations en ligne</h3>
              </div>
              <button onClick={() => setShowShare(false)} className="text-content-secondary hover:text-content-primary text-xl leading-none px-1">×</button>
            </div>
            <div className="overflow-y-auto p-5 space-y-5">
              {/* URL + copy */}
              <div className="flex items-center gap-2 bg-surface-input rounded-xl border border-surface-border px-3 py-2.5">
                <ExternalLink className="w-4 h-4 text-content-muted shrink-0" />
                <span className="flex-1 text-xs text-content-primary truncate font-mono">{hotelUrl}</span>
                <button
                  onClick={copyHotelLink}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    copied ? 'bg-badge-success text-status-success border border-status-success' : 'bg-brand-600 hover:bg-brand-700 text-content-primary'
                  }`}
                >
                  {copied ? <><Check className="w-3 h-3" />Copié !</> : <><Copy className="w-3 h-3" />Copier</>}
                </button>
              </div>

              {/* QR code */}
              <div className="flex flex-col items-center gap-2 py-2">
                <p className="text-xs text-content-secondary uppercase font-bold tracking-wide">QR Code</p>
                <div className="p-3 bg-white rounded-2xl border border-surface-border shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(hotelUrl)}`}
                    alt="QR code lien réservation"
                    width={180}
                    height={180}
                    className="rounded-lg"
                  />
                </div>
                <p className="text-[10px] text-content-muted">Scannez pour réserver directement</p>
              </div>

              {/* WhatsApp */}
              <button
                type="button"
                onClick={() => triggerWhatsAppShare(null, `Réservez votre chambre en ligne directement ici :\n${hotelUrl}`)}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 text-content-primary font-semibold text-sm transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Partager sur WhatsApp
              </button>

              {/* Conditions d'annulation */}
              {isManagerOrAbove && (
                <div className="space-y-3 border-t border-surface-border pt-4">
                  <p className="text-xs font-bold text-content-primary uppercase tracking-wider">
                    Paramètres affichés aux clients
                  </p>
                  <div className="space-y-1.5">
                    <label className="text-xs text-content-secondary">Conditions d&apos;annulation</label>
                    <textarea
                      rows={3}
                      value={policyText}
                      onChange={(e) => setPolicyText(e.target.value)}
                      className="input text-sm resize-none w-full"
                      placeholder="Ex: Annulation gratuite jusqu'à 48h avant l'arrivée. Au-delà, une nuit sera facturée."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-content-secondary">Information acompte</label>
                    <textarea
                      rows={2}
                      value={depositText}
                      onChange={(e) => setDepositText(e.target.value)}
                      className="input text-sm resize-none w-full"
                      placeholder="Ex: Un acompte de 30% est demandé à la réservation."
                    />
                  </div>
                  <button
                    onClick={saveHotelPolicy}
                    disabled={savingPolicy}
                    className="btn-primary h-9 text-sm w-full"
                  >
                    {savingPolicy ? 'Enregistrement…' : 'Enregistrer les paramètres'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
