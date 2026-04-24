import type { RoomStatus, ReservationStatus, RoomType } from '@services/supabase/hotel';

export type Tab       = 'chambres' | 'reservations' | 'clients' | 'calendrier';
export type PayMethod = 'cash' | 'card' | 'mobile_money';
export type ResFilter = 'active' | 'today' | 'all' | 'dates';

export const ROOM_TYPES: { value: RoomType; label: string }[] = [
  { value: 'simple',    label: 'Simple'    },
  { value: 'double',    label: 'Double'    },
  { value: 'twin',      label: 'Twin'      },
  { value: 'suite',     label: 'Suite'     },
  { value: 'familiale', label: 'Familiale' },
];

export const AMENITIES = ['WiFi', 'TV', 'Climatisation', 'Minibar', 'Salle de bain', 'Coffre-fort', 'Balcon', 'Vue mer'];

export const ID_TYPES = ['CIN', 'Passeport', 'Titre de séjour', 'Autre'];

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
export function tomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
export function fmt(date: string): string {
  return new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function fmtMoney(amount: number, currency = 'XOF'): string {
  return new Intl.NumberFormat('fr-FR', { style: 'decimal', maximumFractionDigits: 0 }).format(amount) + ' ' + currency;
}

export function roomStatusStyle(status: RoomStatus): string {
  switch (status) {
    case 'available':   return 'border-status-success bg-badge-success text-status-success';
    case 'occupied':    return 'border-brand-700 bg-badge-brand text-content-brand';
    case 'cleaning':    return 'border-status-warning bg-badge-warning text-status-warning';
    case 'maintenance': return 'border-slate-600 bg-slate-800/40 text-content-secondary';
  }
}
export function roomStatusLabel(status: RoomStatus): string {
  switch (status) {
    case 'available':   return 'Disponible';
    case 'occupied':    return 'Occupée';
    case 'cleaning':    return 'Nettoyage';
    case 'maintenance': return 'Maintenance';
  }
}
export function resStatusStyle(status: ReservationStatus): string {
  switch (status) {
    case 'confirmed':   return 'bg-slate-700 text-white';
    case 'checked_in':  return 'bg-brand-700 text-white';
    case 'checked_out': return 'bg-badge-success text-status-success';
    case 'cancelled':   return 'bg-badge-error text-status-error';
    case 'no_show':     return 'bg-badge-warning text-status-warning';
  }
}
export function resStatusLabel(status: ReservationStatus): string {
  switch (status) {
    case 'confirmed':   return 'Confirmée';
    case 'checked_in':  return 'En cours';
    case 'checked_out': return 'Parti';
    case 'cancelled':   return 'Annulée';
    case 'no_show':     return 'No-show';
  }
}
