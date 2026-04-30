import { displayCurrency } from '@/lib/utils';
import { type AttendanceStatus } from '@services/supabase/staff';

export const ATTENDANCE_CFG: Record<AttendanceStatus, { label: string; short: string; color: string; bg: string }> = {
  present:  { label: 'Présent',       short: 'P',  color: 'text-status-success',  bg: 'bg-badge-success border-status-success'  },
  absent:   { label: 'Absent',        short: 'A',  color: 'text-status-error',    bg: 'bg-badge-error border-status-error'      },
  half_day: { label: 'Demi-journée',  short: 'D',  color: 'text-status-warning',  bg: 'bg-badge-warning border-status-warning'  },
  leave:    { label: 'Congé',         short: 'C',  color: 'text-blue-300',   bg: 'bg-badge-info border-blue-700'    },
  holiday:  { label: 'Férié',         short: 'F',  color: 'text-content-secondary',  bg: 'bg-surface-hover border-surface-border' },
};

export const CYCLE: (AttendanceStatus | null)[] = ['present', 'absent', 'half_day', 'leave', 'holiday', null];

export const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Ottobre', 'Novembre', 'Décembre',
];

export function fmtMoney(amount: number, currency: string) {
  return `${amount.toLocaleString('fr-FR')} ${displayCurrency(currency)}`;
}

export function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

export type StaffTab = 'employes' | 'presences' | 'paie' | 'conges';
export type StaffView = 'list' | 'offices';
