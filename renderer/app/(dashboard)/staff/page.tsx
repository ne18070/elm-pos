'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Users, Plus, Pencil, Trash2, X, Loader2, ChevronLeft, ChevronRight,
  Clock, CheckCircle, AlertCircle, CalendarDays, Banknote, UserMinus,
  UserCheck, Coffee, Plane, Star, Phone, Mail, Building2, Save,
  TrendingUp, DollarSign, Link2, Unlink, RefreshCw, Copy, Check, LogIn,
  Printer, FileText,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { toUserError } from '@/lib/user-error';
import { displayCurrency } from '@/lib/utils';
import {
  generateStaffPayslip, printHtml,
} from '@/lib/invoice-templates';
import {
  getStaff, createStaff, updateStaff, deleteStaff,
  getAttendanceForMonth, upsertAttendance, deleteAttendance,
  getPayments, createPayment, markPaymentPaid, deletePayment,
  computePayroll, linkStaffToUser, unlinkStaffUser,
  SALARY_TYPE_LABELS, PAYMENT_METHOD_LABELS,
  type Staff, type StaffForm, type StaffAttendance, type StaffPayment,
  type AttendanceStatus, type PaymentMethod, type SalaryType,
} from '@services/supabase/staff';
import { getTeamMembers, inviteUser } from '@services/supabase/users';
import type { User as SystemUser } from '@pos-types';
import { useConfirm } from '@/components/shared/ConfirmDialog';

// ─── Types & constants ────────────────────────────────────────────────────────

type Tab = 'employes' | 'presences' | 'paie';

const ATTENDANCE_CFG: Record<AttendanceStatus, { label: string; short: string; color: string; bg: string }> = {
  present:  { label: 'Présent',       short: 'P',  color: 'text-green-300',  bg: 'bg-green-900/60 border-green-700'  },
  absent:   { label: 'Absent',        short: 'A',  color: 'text-red-300',    bg: 'bg-red-900/60 border-red-700'      },
  half_day: { label: 'Demi-journée',  short: 'D',  color: 'text-amber-300',  bg: 'bg-amber-900/60 border-amber-700'  },
  leave:    { label: 'Congé',         short: 'C',  color: 'text-blue-300',   bg: 'bg-blue-900/60 border-blue-700'    },
  holiday:  { label: 'Férié',         short: 'F',  color: 'text-slate-400',  bg: 'bg-slate-800 border-slate-700'     },
};

// Cycle on click: empty → present → absent → half_day → leave → holiday → (delete)
const CYCLE: (AttendanceStatus | null)[] = ['present', 'absent', 'half_day', 'leave', 'holiday', null];

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function fmtMoney(amount: number, currency: string) {
  return `${amount.toLocaleString('fr-FR')} ${displayCurrency(currency)}`;
}

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StaffPage() {
  const { business } = useAuthStore();
  const { success: notifSuccess, error: notifError } = useNotificationStore();
  const cur = business?.currency ?? 'XOF';

  const [tab, setTab]           = useState<Tab>('employes');
  const [loading, setLoading]   = useState(true);
  const [staffList, setStaff]   = useState<Staff[]>([]);
  const [attendance, setAttendance] = useState<StaffAttendance[]>([]);
  const [payments, setPayments] = useState<StaffPayment[]>([]);
  const [teamMembers, setTeamMembers] = useState<SystemUser[]>([]);

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [year, setYear]   = useState(now.getFullYear());

  // Panels
  const [staffPanel, setStaffPanel]     = useState<{ item: Staff | null } | null>(null);
  const [payModal, setPayModal]         = useState<{ staff: Staff } | null>(null);
  const [linkModal, setLinkModal]       = useState<{ staff: Staff } | null>(null);
  const [savingAttendance, setSavingAttendance] = useState<string | null>(null); // staffId-date

  // Search
  const [search, setSearch] = useState('');

  const { askConfirm, ConfirmDialog } = useConfirm();

  // ── Load ────────────────────────────────────────────────────────────────────

  async function loadStaff() {
    if (!business) return;
    try {
      const [s, m] = await Promise.all([
        getStaff(business.id),
        getTeamMembers(business.id).catch(() => [] as SystemUser[]),
      ]);
      setStaff(s);
      setTeamMembers(m);
    } catch (e) { notifError(toUserError(e)); }
  }

  async function refreshTeamMembers() {
    if (!business) return;
    try {
      const m = await getTeamMembers(business.id);
      setTeamMembers(m);
    } catch { /* silencieux */ }
  }

  async function loadAttendance() {
    if (!business) return;
    try {
      const a = await getAttendanceForMonth(business.id, year, month);
      setAttendance(a);
    } catch (e) { notifError(toUserError(e)); }
  }

  async function loadPayments() {
    if (!business) return;
    try {
      const p = await getPayments(business.id, { year, month });
      setPayments(p);
    } catch (e) { notifError(toUserError(e)); }
  }

  useEffect(() => {
    if (!business) return;
    setLoading(true);
    Promise.all([loadStaff(), loadAttendance(), loadPayments()])
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.id]);

  useEffect(() => {
    if (!business) return;
    loadAttendance();
    loadPayments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, business?.id]);

  // ── Month nav ────────────────────────────────────────────────────────────────

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  // ── Attendance ───────────────────────────────────────────────────────────────

  function getAttendanceRecord(staffId: string, day: number): StaffAttendance | undefined {
    const d = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return attendance.find((a) => a.staff_id === staffId && a.date === d);
  }

  async function cycleAttendance(staffId: string, day: number) {
    if (!business) return;
    const key = `${staffId}-${day}`;
    setSavingAttendance(key);
    try {
      const record = getAttendanceRecord(staffId, day);
      const currentStatus = record?.status ?? null;
      const idx = CYCLE.indexOf(currentStatus);
      const nextStatus = CYCLE[(idx + 1) % CYCLE.length];

      if (nextStatus === null) {
        if (record) await deleteAttendance(record.id);
        setAttendance((prev) => prev.filter((a) => !(a.staff_id === staffId && a.date === record!.date)));
      } else {
        const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const hours = nextStatus === 'present' ? 8 : nextStatus === 'half_day' ? 4 : null;
        const saved = await upsertAttendance({
          business_id:  business.id,
          staff_id:     staffId,
          date,
          status:       nextStatus,
          clock_in:     record?.clock_in ?? null,
          clock_out:    record?.clock_out ?? null,
          hours_worked: hours,
          notes:        record?.notes ?? null,
        });
        setAttendance((prev) => {
          const filtered = prev.filter((a) => !(a.staff_id === staffId && a.date === date));
          return [...filtered, saved];
        });
      }
    } catch (e) { notifError(toUserError(e)); }
    finally { setSavingAttendance(null); }
  }

  async function bulkMarkAttendance(day: number) {
    if (!business) return;
    askConfirm(`Marquer tous les employés actifs comme Présents pour le ${day}/${month}/${year} ?`, async () => {
      setLoading(true);
      try {
        const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const results = await Promise.all(staffList.filter((s) => s.status === 'active').map((s) =>
          upsertAttendance({
            business_id:  business.id,
            staff_id:     s.id,
            date,
            status:       'present',
            hours_worked: 8,
          })
        ));
        setAttendance((prev) => {
          const filtered = prev.filter((a) => a.date !== date);
          return [...filtered, ...results];
        });
        notifSuccess(`Présences enregistrées pour le ${day}/${month}`);
      } catch (e) { notifError(toUserError(e)); }
      finally { setLoading(false); }
    });
  }

  function handlePrintPayslip(staff: Staff, payment: StaffPayment) {
    if (!business) return;
    const html = generateStaffPayslip(staff, payment, business);
    printHtml(html);
  }

  // ── Staff actions ────────────────────────────────────────────────────────────

  async function handleDeleteStaff(s: Staff) {
    askConfirm(`Supprimer ${s.name} ? Cette action est irréversible.`, async () => {
      try {
        await deleteStaff(s.id);
        setStaff((prev) => prev.filter((x) => x.id !== s.id));
        notifSuccess(`${s.name} supprimé`);
      } catch (e) { notifError(toUserError(e)); }
    });
  }

  // ── Payroll ──────────────────────────────────────────────────────────────────

  const payrollData = useMemo(() => {
    return staffList
      .filter((s) => s.status === 'active')
      .map((s) => ({
        staff: s,
        calc:  computePayroll(s, attendance, year, month),
        paid:  payments.find((p) => p.staff_id === s.id && p.status === 'paid'),
      }));
  }, [staffList, attendance, payments, year, month]);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const activeStaff = staffList.filter((s) => s.status === 'active');
  const daysInMonth = new Date(year, month, 0).getDate();

  const filteredStaff = search.trim()
    ? staffList.filter((s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.position ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (s.department ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : staffList;

  // Attendance stats for the month
  const attStats = useMemo(() => {
    const presentDays = attendance.filter((a) => a.status === 'present').length;
    const absentDays  = attendance.filter((a) => a.status === 'absent').length;
    const halfDays    = attendance.filter((a) => a.status === 'half_day').length;
    const leaveDays   = attendance.filter((a) => a.status === 'leave').length;
    return { presentDays, absentDays, halfDays, leaveDays };
  }, [attendance]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border bg-surface-card shrink-0">
        <Users className="w-5 h-5 text-brand-400 shrink-0" />
        <h1 className="font-semibold text-white flex-1">Personnel & Paie</h1>
        {tab === 'employes' && (
          <button onClick={() => setStaffPanel({ item: null })}
            className="btn-primary flex items-center gap-2 text-sm h-9 px-3">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Employé</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 pt-3 pb-0 border-b border-surface-border shrink-0">
        {(['employes', 'presences', 'paie'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t
                ? 'bg-surface-card text-brand-400 border border-b-surface-card border-surface-border -mb-px'
                : 'text-slate-400 hover:text-white'
            }`}>
            {t === 'employes' ? 'Employés' : t === 'presences' ? 'Présences' : 'Paie'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* ─── Tab: Employés ────────────────────────────────── */}
          {tab === 'employes' && (
            <div className="p-4 space-y-4">
              {/* Search + stats */}
              <div className="flex gap-3 items-center">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un employé…"
                  className="input flex-1 text-sm"
                />
                <span className="text-xs text-slate-500 whitespace-nowrap">
                  {activeStaff.length} actif{activeStaff.length > 1 ? 's' : ''}
                </span>
              </div>

              {filteredStaff.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <Users className="w-12 h-12 text-slate-600 mb-4" />
                  <p className="text-slate-400 font-medium">Aucun employé</p>
                  <p className="text-slate-600 text-sm mt-1">
                    {search ? 'Aucun résultat pour cette recherche' : 'Ajoutez votre premier employé'}
                  </p>
                  {!search && (
                    <button onClick={() => setStaffPanel({ item: null })}
                      className="mt-4 btn-primary text-sm px-4 py-2 flex items-center gap-2">
                      <Plus className="w-4 h-4" /> Ajouter un employé
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredStaff.map((s) => (
                    <StaffCard key={s.id} staff={s} currency={cur}
                      teamMember={teamMembers.find((m) => m.id === s.user_id) ?? null}
                      onEdit={() => setStaffPanel({ item: s })}
                      onDelete={() => handleDeleteStaff(s)}
                      onLinkAccount={() => setLinkModal({ staff: s })}
                      onUnlinkAccount={() => askConfirm(`Supprimer le compte de connexion de ${s.name} ?`, async () => {
                        try {
                          await unlinkStaffUser(s.id);
                          setStaff((prev) => prev.map((x) => x.id === s.id ? { ...x, user_id: null } : x));
                          notifSuccess('Compte délié');
                        } catch (e) { notifError(toUserError(e)); }
                      })}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Tab: Présences ───────────────────────────────── */}
          {tab === 'presences' && (
            <div className="p-4 space-y-4">
              {/* Month nav */}
              <div className="flex items-center justify-between">
                <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-surface-hover transition-colors">
                  <ChevronLeft className="w-5 h-5 text-slate-400" />
                </button>
                <h2 className="font-semibold text-white text-base">
                  {MONTH_NAMES[month - 1]} {year}
                </h2>
                <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-surface-hover transition-colors">
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              {/* Attendance stats */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Présences',      value: attStats.presentDays, icon: UserCheck,  color: 'text-green-400' },
                  { label: 'Absences',       value: attStats.absentDays,  icon: UserMinus,  color: 'text-red-400'   },
                  { label: 'Demi-journées',  value: attStats.halfDays,    icon: Coffee,     color: 'text-amber-400' },
                  { label: 'Congés',         value: attStats.leaveDays,   icon: Plane,      color: 'text-blue-400'  },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="bg-surface-card border border-surface-border rounded-xl p-3 text-center">
                    <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} />
                    <p className="text-lg font-bold text-white">{value}</p>
                    <p className="text-xs text-slate-500">{label}</p>
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-3 text-xs">
                {Object.entries(ATTENDANCE_CFG).map(([key, cfg]) => (
                  <span key={key} className={`flex items-center gap-1 px-2 py-0.5 rounded border ${cfg.bg} ${cfg.color}`}>
                    <span className="font-bold">{cfg.short}</span> {cfg.label}
                  </span>
                ))}
                <span className="text-slate-500 italic">Cliquez sur une case pour changer le statut</span>
              </div>

              {/* Grid */}
              {activeStaff.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-10">Aucun employé actif</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-surface-border">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-surface-hover">
                        <th className="sticky left-0 z-10 bg-surface-hover text-left px-3 py-2 text-slate-400 font-medium min-w-[140px]">
                          Employé
                        </th>
                        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                          const dow = new Date(year, month - 1, d).getDay();
                          const isWeekend = dow === 0 || dow === 6;
                          return (
                            <th key={d}
                              onClick={() => bulkMarkAttendance(d)}
                              title="Cliquer pour marquer tout le monde présent ce jour"
                              className={`px-1 py-2 text-center font-medium w-8 min-w-[32px] cursor-pointer hover:bg-surface-border transition-colors ${isWeekend ? 'text-slate-600' : 'text-slate-400'}`}>
                              {d}
                            </th>
                          );
                        })}
                        <th className="px-3 py-2 text-right text-slate-400 font-medium min-w-[80px]">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeStaff.map((s) => {
                        const calc = computePayroll(s, attendance, year, month);
                        return (
                          <tr key={s.id} className="border-t border-surface-border hover:bg-surface-hover/30">
                            <td className="sticky left-0 z-10 bg-surface-card px-3 py-1.5">
                              <p className="font-medium text-white truncate max-w-[120px]">{s.name}</p>
                              {s.position && <p className="text-slate-500 truncate">{s.position}</p>}
                            </td>
                            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                              const record = getAttendanceRecord(s.id, d);
                              const key = `${s.id}-${d}`;
                              const spinning = savingAttendance === key;
                              const cfg = record ? ATTENDANCE_CFG[record.status] : null;
                              return (
                                <td key={d} className="px-0.5 py-1 text-center">
                                  <button
                                    onClick={() => cycleAttendance(s.id, d)}
                                    disabled={spinning}
                                    title={cfg?.label ?? 'Non renseigné'}
                                    className={`w-7 h-7 rounded text-xs font-bold transition-all border ${
                                      spinning ? 'opacity-50' : 'hover:scale-110 active:scale-95'
                                    } ${cfg ? `${cfg.bg} ${cfg.color}` : 'border-transparent text-slate-700 hover:border-slate-600 hover:text-slate-400'}`}
                                  >
                                    {spinning ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : (cfg?.short ?? '·')}
                                  </button>
                                </td>
                              );
                            })}
                            <td className="px-3 py-1.5 text-right">
                              <p className="font-medium text-white">{calc.daysWorked}j</p>
                              {s.salary_type === 'hourly' && (
                                <p className="text-slate-500">{calc.hoursWorked}h</p>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ─── Tab: Paie ────────────────────────────────────── */}
          {tab === 'paie' && (
            <div className="p-4 space-y-4">
              {/* Month nav */}
              <div className="flex items-center justify-between">
                <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-surface-hover transition-colors">
                  <ChevronLeft className="w-5 h-5 text-slate-400" />
                </button>
                <h2 className="font-semibold text-white text-base">
                  {MONTH_NAMES[month - 1]} {year}
                </h2>
                <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-surface-hover transition-colors">
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              {/* Payroll summary */}
              {payrollData.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-surface-card border border-surface-border rounded-xl p-3 text-center">
                    <TrendingUp className="w-4 h-4 mx-auto mb-1 text-brand-400" />
                    <p className="text-sm font-bold text-white">{fmtMoney(payrollData.reduce((s, d) => s + d.calc.baseAmount, 0), cur)}</p>
                    <p className="text-xs text-slate-500">Masse salariale</p>
                  </div>
                  <div className="bg-surface-card border border-surface-border rounded-xl p-3 text-center">
                    <CheckCircle className="w-4 h-4 mx-auto mb-1 text-green-400" />
                    <p className="text-sm font-bold text-white">{payrollData.filter((d) => d.paid).length}</p>
                    <p className="text-xs text-slate-500">Payés</p>
                  </div>
                  <div className="bg-surface-card border border-surface-border rounded-xl p-3 text-center">
                    <Clock className="w-4 h-4 mx-auto mb-1 text-amber-400" />
                    <p className="text-sm font-bold text-white">{payrollData.filter((d) => !d.paid).length}</p>
                    <p className="text-xs text-slate-500">En attente</p>
                  </div>
                </div>
              )}

              {payrollData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <Banknote className="w-12 h-12 text-slate-600 mb-4" />
                  <p className="text-slate-400 font-medium">Aucun employé actif</p>
                  <p className="text-slate-600 text-sm mt-1">Ajoutez des employés dans l'onglet Employés</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {payrollData.map(({ staff: s, calc, paid }) => (
                    <div key={s.id}
                      className="bg-surface-card border border-surface-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                      {/* Avatar + info */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-brand-900/50 border border-brand-700 flex items-center justify-center shrink-0">
                          <span className="text-brand-300 text-sm font-bold">{initials(s.name)}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-white truncate">{s.name}</p>
                          <p className="text-xs text-slate-400">{s.position ?? SALARY_TYPE_LABELS[s.salary_type]}</p>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex gap-4 text-sm shrink-0">
                        <div className="text-center">
                          <p className="font-semibold text-white">{calc.daysWorked}j</p>
                          <p className="text-xs text-slate-500">Travaillés</p>
                        </div>
                        {s.salary_type === 'hourly' && (
                          <div className="text-center">
                            <p className="font-semibold text-white">{calc.hoursWorked}h</p>
                            <p className="text-xs text-slate-500">Heures</p>
                          </div>
                        )}
                        <div className="text-center">
                          <p className="font-semibold text-white">{calc.absentDays}j</p>
                          <p className="text-xs text-slate-500">Absences</p>
                        </div>
                        <div className="text-center">
                          <p className="font-bold text-brand-300">{fmtMoney(calc.baseAmount, cur)}</p>
                          <p className="text-xs text-slate-500">Montant</p>
                        </div>
                      </div>

                      {/* Action */}
                      <div className="shrink-0 flex items-center gap-2">
                        {paid ? (
                          <>
                            <button onClick={() => handlePrintPayslip(s, paid)}
                              className="p-2 rounded-lg bg-surface-hover text-slate-400 hover:text-white transition-colors"
                              title="Imprimer le bulletin">
                              <Printer className="w-4 h-4" />
                            </button>
                            <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                              <CheckCircle className="w-4 h-4" />
                              <div>
                                <p>Payé</p>
                                {paid.payment_date && (
                                  <p className="text-xs text-slate-500">
                                    {new Date(paid.payment_date).toLocaleDateString('fr-FR')}
                                  </p>
                                )}
                              </div>
                            </div>
                          </>
                        ) : (
                          <button
                            onClick={() => setPayModal({ staff: s })}
                            className="btn-primary text-sm px-4 py-2 flex items-center gap-2">
                            <DollarSign className="w-4 h-4" /> Payer
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Payment history */}
              {payments.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Historique des paiements
                  </h3>
                  <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
                    {payments.map((p, i) => (
                      <div key={p.id}
                        className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-surface-border' : ''}`}>
                        <div>
                          <p className="text-sm font-medium text-white">{p.staff?.name ?? '—'}</p>
                          <p className="text-xs text-slate-500">
                            {p.payment_date
                              ? new Date(p.payment_date).toLocaleDateString('fr-FR')
                              : '—'}
                            {' · '}{PAYMENT_METHOD_LABELS[p.payment_method]}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="font-semibold text-white">{fmtMoney(p.net_amount, cur)}</p>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            p.status === 'paid'
                              ? 'bg-green-900/40 text-green-400'
                              : 'bg-amber-900/40 text-amber-400'
                          }`}>
                            {p.status === 'paid' ? 'Payé' : 'En attente'}
                          </span>
                          <button onClick={() => handlePrintPayslip(p.staff as Staff, p)}
                            className="p-1 text-slate-500 hover:text-white transition-colors" title="Imprimer">
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => askConfirm('Supprimer ce paiement ?', async () => {
                            try {
                              await deletePayment(p.id);
                              setPayments((prev) => prev.filter((x) => x.id !== p.id));
                            } catch (e) { notifError(toUserError(e)); }
                          })} className="p-1 text-slate-600 hover:text-red-400 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Staff panel ─────────────────────────────────────── */}
      {staffPanel && (
        <StaffPanel
          staff={staffPanel.item}
          onClose={() => setStaffPanel(null)}
          onSaved={(saved) => {
            if (staffPanel.item) {
              setStaff((prev) => prev.map((x) => x.id === saved.id ? saved : x));
            } else {
              setStaff((prev) => [...prev, saved]);
            }
            setStaffPanel(null);
            notifSuccess(staffPanel.item ? 'Employé modifié' : 'Employé ajouté');
          }}
          businessId={business?.id ?? ''}
          notifError={notifError}
        />
      )}

      {/* ─── Payment modal ────────────────────────────────────── */}
      {payModal && (
        <PaymentModal
          staff={payModal.staff}
          attendance={attendance}
          year={year}
          month={month}
          currency={cur}
          businessId={business?.id ?? ''}
          onClose={() => setPayModal(null)}
          onSaved={(saved) => {
            setPayments((prev) => [...prev, saved]);
            setPayModal(null);
            notifSuccess(`Paiement enregistré pour ${payModal.staff.name}`);
          }}
          notifError={notifError}
        />
      )}

      {/* ─── Link account modal ───────────────────────────────── */}
      {linkModal && (
        <LinkAccountModal
          staff={linkModal.staff}
          businessId={business?.id ?? ''}
          teamMembers={teamMembers}
          linkedUserIds={staffList.filter((s) => s.user_id).map((s) => s.user_id as string)}
          onClose={() => setLinkModal(null)}
          onLinked={(staffId, userId) => {
            setStaff((prev) => prev.map((s) => s.id === staffId ? { ...s, user_id: userId } : s));
            setLinkModal(null);
            notifSuccess('Compte lié — l\'employé peut maintenant se connecter');
          }}
          onTeamRefresh={refreshTeamMembers}
          notifError={notifError}
          notifSuccess={notifSuccess}
        />
      )}

      <ConfirmDialog />
    </div>
  );
}

// ─── StaffCard ────────────────────────────────────────────────────────────────

function StaffCard({
  staff: s, currency, teamMember, onEdit, onDelete, onLinkAccount, onUnlinkAccount,
}: {
  staff: Staff;
  currency: string;
  teamMember: SystemUser | null;
  onEdit: () => void;
  onDelete: () => void;
  onLinkAccount: () => void;
  onUnlinkAccount: () => void;
}) {
  const rate = s.salary_type === 'hourly'
    ? `${s.salary_rate.toLocaleString('fr-FR')} ${displayCurrency(currency)}/h`
    : s.salary_type === 'daily'
      ? `${s.salary_rate.toLocaleString('fr-FR')} ${displayCurrency(currency)}/j`
      : `${s.salary_rate.toLocaleString('fr-FR')} ${displayCurrency(currency)}/mois`;

  return (
    <div className="bg-surface-card border border-surface-border rounded-xl p-4 flex flex-col gap-3">
      {/* Top row */}
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-brand-900/50 border border-brand-700 flex items-center justify-center shrink-0">
          <span className="text-brand-300 font-bold text-sm">{initials(s.name)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-white truncate">{s.name}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
              s.status === 'active'
                ? 'bg-green-900/40 text-green-400'
                : 'bg-slate-800 text-slate-500'
            }`}>
              {s.status === 'active' ? 'Actif' : 'Inactif'}
            </span>
          </div>
          {s.position && <p className="text-sm text-slate-400 truncate">{s.position}</p>}
          {s.department && <p className="text-xs text-slate-500 truncate">{s.department}</p>}
        </div>
      </div>

      {/* Details */}
      <div className="space-y-1.5 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Star className="w-3.5 h-3.5 shrink-0 text-brand-500" />
          <span>{SALARY_TYPE_LABELS[s.salary_type]} · <span className="text-white font-medium">{rate}</span></span>
        </div>
        {s.phone && (
          <div className="flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 shrink-0" />
            <span>{s.phone}</span>
          </div>
        )}
        {s.email && (
          <div className="flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{s.email}</span>
          </div>
        )}
        {s.hire_date && (
          <div className="flex items-center gap-2">
            <CalendarDays className="w-3.5 h-3.5 shrink-0" />
            <span>Embauché le {new Date(s.hire_date).toLocaleDateString('fr-FR')}</span>
          </div>
        )}
      </div>

      {s.notes && (
        <div className="bg-surface-hover/50 p-2 rounded-lg">
          <p className="text-[10px] text-slate-500 italic line-clamp-2">
            "{s.notes}"
          </p>
        </div>
      )}

      {/* Account status */}
      {teamMember ? (
        <div className="flex items-center justify-between bg-green-900/20 border border-green-800/50 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <LogIn className="w-3.5 h-3.5 text-green-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-green-300">Compte actif</p>
              <p className="text-xs text-green-600 truncate">{teamMember.email}</p>
            </div>
          </div>
          <button onClick={onUnlinkAccount} title="Délier le compte"
            className="p-1 text-green-700 hover:text-red-400 transition-colors shrink-0 ml-2">
            <Unlink className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button onClick={onLinkAccount}
          className="flex items-center justify-center gap-2 text-xs py-2 rounded-lg border border-dashed border-slate-600 text-slate-500 hover:text-brand-300 hover:border-brand-600 transition-colors">
          <Link2 className="w-3.5 h-3.5" /> Créer / lier un compte de connexion
        </button>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1 border-t border-surface-border">
        <button onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg hover:bg-surface-hover text-slate-400 hover:text-white transition-colors">
          <Pencil className="w-3.5 h-3.5" /> Modifier
        </button>
        <button onClick={onDelete}
          className="flex items-center justify-center gap-1.5 text-xs py-1.5 px-3 rounded-lg hover:bg-red-900/30 text-slate-500 hover:text-red-400 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── StaffPanel ───────────────────────────────────────────────────────────────

function StaffPanel({
  staff, onClose, onSaved, businessId, notifError,
}: {
  staff:       Staff | null;
  onClose:     () => void;
  onSaved:     (s: Staff) => void;
  businessId:  string;
  notifError:  (m: string) => void;
}) {
  const isEdit = !!staff;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    name:        string;
    phone:       string;
    email:       string;
    position:    string;
    department:  string;
    salary_type: SalaryType;
    salary_rate: string;
    hire_date:   string;
    status:      'active' | 'inactive';
    notes:       string;
  }>({
    name:        staff?.name ?? '',
    phone:       staff?.phone ?? '',
    email:       staff?.email ?? '',
    position:    staff?.position ?? '',
    department:  staff?.department ?? '',
    salary_type: staff?.salary_type ?? 'monthly',
    salary_rate: staff?.salary_rate.toString() ?? '0',
    hire_date:   staff?.hire_date ?? '',
    status:      staff?.status ?? 'active',
    notes:       staff?.notes ?? '',
  });

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function save() {
    if (!form.name.trim()) { notifError('Nom requis'); return; }
    const rate = parseFloat(form.salary_rate);
    if (isNaN(rate) || rate < 0) { notifError('Taux de salaire invalide'); return; }

    setSaving(true);
    try {
      const input: StaffForm = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        position: form.position.trim() || null,
        department: form.department.trim() || null,
        salary_type: form.salary_type,
        salary_rate: rate,
        hire_date: form.hire_date || null,
        status: form.status,
        notes: form.notes.trim() || null,
        user_id: null
      };
      const saved = isEdit
        ? await updateStaff(staff.id, input)
        : await createStaff(businessId, input);
      onSaved(saved);
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); }
  }

  const salaryUnit = form.salary_type === 'hourly' ? '/heure' : form.salary_type === 'daily' ? '/jour' : '/mois';

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <div className="flex flex-col h-full w-full max-w-md bg-surface-card border-l border-surface-border shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border shrink-0">
          <h2 className="font-semibold text-white">{isEdit ? 'Modifier l\'employé' : 'Nouvel employé'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Identité */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Identité</h3>
            <Field label="Nom complet *" value={form.name} onChange={(v) => set('name', v)} placeholder="Jean Dupont" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Téléphone" value={form.phone} onChange={(v) => set('phone', v)} placeholder="+221 77 000 00 00" />
              <Field label="Email" value={form.email} onChange={(v) => set('email', v)} type="email" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Poste" value={form.position} onChange={(v) => set('position', v)} placeholder="Caissier" />
              <Field label="Département" value={form.department} onChange={(v) => set('department', v)} placeholder="Admin" />
            </div>
            <Field label="Date d'embauche" value={form.hire_date} onChange={(v) => set('hire_date', v)} type="date" />
          </section>

          {/* Salaire */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Rémunération</h3>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Type de salaire</label>
              <select value={form.salary_type} onChange={(e) => set('salary_type', e.target.value)}
                className="input w-full text-sm">
                {(Object.keys(SALARY_TYPE_LABELS) as SalaryType[]).map((k) => (
                  <option key={k} value={k}>{SALARY_TYPE_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Taux ({salaryUnit})</label>
              <input
                type="number"
                min="0"
                value={form.salary_rate}
                onChange={(e) => set('salary_rate', e.target.value)}
                className="input w-full text-sm"
                placeholder="0"
              />
              <p className="mt-1 text-xs text-slate-500">
                {form.salary_type === 'hourly' && 'Montant payé par heure travaillée'}
                {form.salary_type === 'daily' && 'Montant payé par jour de présence'}
                {form.salary_type === 'monthly' && 'Salaire mensuel fixe — proratisé selon les jours travaillés'}
              </p>
            </div>
          </section>

          {/* Statut */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Statut</h3>
            <div className="flex gap-2">
              {(['active', 'inactive'] as const).map((s) => (
                <button key={s} onClick={() => set('status', s)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
                    form.status === s
                      ? s === 'active'
                        ? 'bg-green-900/40 border-green-700 text-green-300'
                        : 'bg-slate-800 border-slate-600 text-slate-300'
                      : 'border-surface-border text-slate-500 hover:text-slate-300'
                  }`}>
                  {s === 'active' ? 'Actif' : 'Inactif'}
                </button>
              ))}
            </div>
          </section>

          {/* Notes */}
          <section>
            <label className="text-xs text-slate-400 block mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              placeholder="Informations complémentaires…"
              className="input w-full text-sm resize-none"
            />
          </section>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-surface-border shrink-0">
          <button onClick={save} disabled={saving}
            className="w-full btn-primary flex items-center justify-center gap-2 py-3 text-sm font-medium disabled:opacity-60">
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Enregistrement…</>
              : <><Save className="w-4 h-4" /> {isEdit ? 'Mettre à jour' : 'Ajouter l\'employé'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PaymentModal ─────────────────────────────────────────────────────────────

function PaymentModal({
  staff, attendance, year, month, currency, businessId, onClose, onSaved, notifError,
}: {
  staff:       Staff;
  attendance:  StaffAttendance[];
  year:        number;
  month:       number;
  currency:    string;
  businessId:  string;
  onClose:     () => void;
  onSaved:     (p: StaffPayment) => void;
  notifError:  (m: string) => void;
}) {
  const calc = computePayroll(staff, attendance, year, month);

  const [saving, setSaving] = useState(false);
  const [bonuses,    setBonuses]    = useState('0');
  const [deductions, setDeductions] = useState('0');
  const [method,     setMethod]     = useState<PaymentMethod>('cash');
  const [date,       setDate]       = useState(new Date().toISOString().split('T')[0]);
  const [notes,      setNotes]      = useState('');

  const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const periodEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const bonus   = parseFloat(bonuses)    || 0;
  const deduct  = parseFloat(deductions) || 0;
  const net     = Math.max(0, calc.baseAmount + bonus - deduct);

  async function save() {
    setSaving(true);
    try {
      const saved = await createPayment({
        business_id:    businessId,
        staff_id:       staff.id,
        period_start:   periodStart,
        period_end:     periodEnd,
        base_amount:    calc.baseAmount,
        bonuses:        bonus,
        deductions:     deduct,
        net_amount:     net,
        days_worked:    calc.daysWorked,
        hours_worked:   calc.hoursWorked || null,
        payment_method: method,
        payment_date:   date,
        status:         'paid',
        notes:          notes.trim(),
      });
      onSaved(saved);
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface-card border border-surface-border rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <div>
            <h2 className="font-semibold text-white">Enregistrer un paiement</h2>
            <p className="text-xs text-slate-400 mt-0.5">{staff.name} · {MONTH_NAMES[month - 1]} {year}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Recap */}
          <div className="bg-surface-hover rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between text-slate-400">
              <span>Jours travaillés</span>
              <span className="text-white font-medium">{calc.daysWorked}j</span>
            </div>
            {staff.salary_type === 'hourly' && (
              <div className="flex justify-between text-slate-400">
                <span>Heures travaillées</span>
                <span className="text-white font-medium">{calc.hoursWorked}h</span>
              </div>
            )}
            <div className="flex justify-between text-slate-400">
              <span>Salaire de base ({SALARY_TYPE_LABELS[staff.salary_type]})</span>
              <span className="text-white font-medium">{fmtMoney(calc.baseAmount, currency)}</span>
            </div>
          </div>

          {/* Bonuses / Deductions */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Primes / Bonus</label>
              <input type="number" min="0" value={bonuses} onChange={(e) => setBonuses(e.target.value)}
                className="input w-full text-sm" placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Retenues / Avances</label>
              <input type="number" min="0" value={deductions} onChange={(e) => setDeductions(e.target.value)}
                className="input w-full text-sm" placeholder="0" />
            </div>
          </div>

          {/* Net */}
          <div className="bg-brand-900/30 border border-brand-800 rounded-xl p-4 flex justify-between items-center">
            <span className="text-slate-300 font-medium">Net à payer</span>
            <span className="text-xl font-bold text-brand-300">{fmtMoney(net, currency)}</span>
          </div>

          {/* Payment method + date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Mode de paiement</label>
              <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className="input w-full text-sm">
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((k) => (
                  <option key={k} value={k}>{PAYMENT_METHOD_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Date de paiement</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="input w-full text-sm" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Notes</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Observations…" className="input w-full text-sm" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button onClick={save} disabled={saving}
            className="w-full btn-primary flex items-center justify-center gap-2 py-3 text-sm font-semibold disabled:opacity-60">
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Enregistrement…</>
              : <><CheckCircle className="w-4 h-4" /> Confirmer le paiement de {fmtMoney(net, currency)}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── LinkAccountModal ─────────────────────────────────────────────────────────

function generatePassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function LinkAccountModal({
  staff, businessId, teamMembers, linkedUserIds,
  onClose, onLinked, onTeamRefresh, notifError, notifSuccess,
}: {
  staff:          Staff;
  businessId:     string;
  teamMembers:    SystemUser[];
  linkedUserIds:  string[];   // user_ids already linked to another staff record
  onClose:        () => void;
  onLinked:       (staffId: string, userId: string) => void;
  onTeamRefresh:  () => Promise<void>;
  notifError:     (m: string) => void;
  notifSuccess:   (m: string) => void;
}) {
  const [mode, setMode]       = useState<'new' | 'existing'>('new');
  const [saving, setSaving]   = useState(false);
  const [copied, setCopied]   = useState(false);

  // New account form
  const [email, setEmail]     = useState(staff.email ?? '');
  const [password, setPassword] = useState(generatePassword);

  // Existing account picker
  // Only show team members not yet linked to another staff
  const availableMembers = teamMembers.filter((m) => !linkedUserIds.includes(m.id));
  const [selectedUserId, setSelectedUserId] = useState(availableMembers[0]?.id ?? '');

  async function handleCopyPassword() {
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (mode === 'new') {
        if (!email.trim()) { notifError('Email requis'); setSaving(false); return; }

        // Create the account
        await inviteUser({
          email:       email.trim(),
          full_name:   staff.name,
          role:        'staff',
          business_id: businessId,
          password,
          existing_user: false,
        });

        // Refresh team to get the new user's ID
        await onTeamRefresh();
        const freshMembers = await getTeamMembers(businessId);
        const newMember = freshMembers.find((m) => m.email.toLowerCase() === email.trim().toLowerCase());

        if (!newMember) {
          notifError('Compte créé mais introuvable — liez-le manuellement via "Compte existant"');
          onClose();
          return;
        }

        await linkStaffToUser(staff.id, newMember.id);
        onLinked(staff.id, newMember.id);

      } else {
        if (!selectedUserId) { notifError('Sélectionnez un compte'); setSaving(false); return; }
        await linkStaffToUser(staff.id, selectedUserId);
        onLinked(staff.id, selectedUserId);
      }
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface-card border border-surface-border rounded-2xl w-full max-w-md shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <div>
            <h2 className="font-semibold text-white">Compte de connexion</h2>
            <p className="text-xs text-slate-400 mt-0.5">{staff.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Mode tabs */}
          <div className="flex gap-1 bg-surface-input rounded-xl p-1">
            <button onClick={() => setMode('new')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === 'new' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
              }`}>
              Nouveau compte
            </button>
            <button onClick={() => setMode('existing')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === 'existing' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
              }`}>
              Compte existant
            </button>
          </div>

          {mode === 'new' ? (
            <>
              <p className="text-xs text-slate-400">
                Un compte Caissier sera créé. L'employé pourra se connecter et accéder à la caisse, aux commandes et aux livraisons.
              </p>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Adresse e-mail *</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="input w-full text-sm" placeholder="employe@exemple.com" autoFocus />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Mot de passe temporaire</label>
                <div className="flex gap-2">
                  <input type="text" value={password} onChange={(e) => setPassword(e.target.value)}
                    className="input flex-1 text-sm font-mono" />
                  <button onClick={() => setPassword(generatePassword())}
                    className="p-2 rounded-lg bg-surface-hover hover:bg-surface-border transition-colors" title="Régénérer">
                    <RefreshCw className="w-4 h-4 text-slate-400" />
                  </button>
                  <button onClick={handleCopyPassword}
                    className="p-2 rounded-lg bg-surface-hover hover:bg-surface-border transition-colors" title="Copier">
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-500">Copiez ce mot de passe et transmettez-le à l'employé.</p>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-slate-400">
                Liez cet employé à un compte déjà existant dans l'équipe.
              </p>
              {availableMembers.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-sm">
                  Aucun compte disponible — tous les membres sont déjà liés à un employé.
                </div>
              ) : (
                <div className="space-y-2">
                  {availableMembers.map((m) => (
                    <label key={m.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedUserId === m.id
                          ? 'border-brand-500 bg-brand-900/20'
                          : 'border-surface-border hover:border-slate-500'
                      }`}>
                      <input type="radio" name="existing_user" value={m.id}
                        checked={selectedUserId === m.id}
                        onChange={() => setSelectedUserId(m.id)}
                        className="accent-brand-500" />
                      <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-brand-400">
                          {m.full_name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{m.full_name}</p>
                        <p className="text-xs text-slate-400 truncate">{m.email}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button onClick={handleSave}
            disabled={saving || (mode === 'existing' && !selectedUserId)}
            className="w-full btn-primary flex items-center justify-center gap-2 py-3 text-sm font-semibold disabled:opacity-60">
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> En cours…</>
              : <><Link2 className="w-4 h-4" /> {mode === 'new' ? 'Créer et lier le compte' : 'Lier ce compte'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Field helper ─────────────────────────────────────────────────────────────

function Field({
  label, value, onChange, placeholder = '', type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="text-xs text-slate-400 block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input w-full text-sm"
      />
    </div>
  );
}
