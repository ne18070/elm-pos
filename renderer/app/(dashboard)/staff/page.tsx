'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Users, Plus, Pencil, Trash2, X, Loader2, ChevronLeft, ChevronRight,
  Clock, CheckCircle, AlertCircle, CalendarDays, Banknote, UserMinus,
  UserCheck, Coffee, Plane, Star, Phone, Mail, Building2, Save,
  TrendingUp, DollarSign, Link2, Unlink, RefreshCw, Copy, Check, LogIn,
  Printer, FileText, LayoutList, Calendar, Wallet, Search as SearchIcon, History,
  LayoutGrid, List, Map as MapIcon, Briefcase
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { toUserError } from '@/lib/user-error';
import { displayCurrency, cn } from '@/lib/utils';
import {
  generateStaffPayslip, generateStaffAttendanceSheet, printHtml,
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
import { StaffOffices } from '@/components/admin/StaffOffices';

// ─── Types & constants ────────────────────────────────────────────────────────

type Tab = 'employes' | 'presences' | 'paie';
type StaffView = 'list' | 'offices';

const ATTENDANCE_CFG: Record<AttendanceStatus, { label: string; short: string; color: string; bg: string }> = {
  present:  { label: 'Présent',       short: 'P',  color: 'text-green-300',  bg: 'bg-green-900/60 border-green-700'  },
  absent:   { label: 'Absent',        short: 'A',  color: 'text-red-300',    bg: 'bg-red-900/60 border-red-700'      },
  half_day: { label: 'Demi-journée',  short: 'D',  color: 'text-amber-300',  bg: 'bg-amber-900/60 border-amber-700'  },
  leave:    { label: 'Congé',         short: 'C',  color: 'text-blue-300',   bg: 'bg-blue-900/60 border-blue-700'    },
  holiday:  { label: 'Férié',         short: 'F',  color: 'text-slate-400',  bg: 'bg-surface-hover border-surface-border' },
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
  const [staffView, setStaffView] = useState<StaffView>('list');
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

  function handlePrintPayslip(staff: Staff | Partial<Staff>, payment: StaffPayment) {
    if (!business) return;
    // Fallback: try to find the full staff record in our list to ensure we have all fields (like salary_rate)
    const fullStaff = staffList.find((s) => s.id === payment.staff_id) || staff;
    const html = generateStaffPayslip(fullStaff as Staff, payment, business);
    printHtml(html);
  }

  function handlePrintAttendanceSheet(staff: Staff) {
    if (!business) return;
    const staffAttendance = attendance.filter((a) => a.staff_id === staff.id);
    const html = generateStaffAttendanceSheet(staff, staffAttendance, year, month, business);
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
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border bg-surface-card shrink-0">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-slate-400" />
          <h1 className="font-bold text-white text-xl tracking-tight">Personnel</h1>
        </div>
        
        {tab === 'employes' && (
          <button 
            onClick={() => setStaffPanel({ item: null })}
            className="btn-primary flex items-center gap-2 text-sm h-10 px-4 transition-all"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline font-medium">Ajouter un employé</span>
          </button>
        )}
      </div>

      {/* Tabs - Professional & Sober */}
      <div className="flex px-4 bg-surface-card border-b border-surface-border shrink-0 overflow-x-auto no-scrollbar">
        {[
          { id: 'employes', label: 'Équipe', icon: LayoutList },
          { id: 'presences', label: 'Présences', icon: Calendar },
          { id: 'paie', label: 'Paie & Salaires', icon: Wallet },
        ].map((t) => (
          <button 
            key={t.id} 
            onClick={() => setTab(t.id as Tab)}
            className={`flex items-center gap-2.5 px-6 py-4 text-sm font-semibold transition-colors relative whitespace-nowrap ${
              tab === t.id
                ? 'text-brand-400'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <t.icon className="w-4 h-4" />
            <span>{t.label}</span>
            {tab === t.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500 rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-400" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto bg-surface">
          {/* ─── Tab: Employés ────────────────────────────────── */}
          {tab === 'employes' && (
            <div className="p-4 max-w-7xl mx-auto space-y-4">
              {/* Search + filter bar */}
              <div className="flex flex-col sm:flex-row gap-3 items-center">
                <div className="relative flex-1 w-full">
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher (nom, poste, dépt)..."
                    className="input pl-10 text-sm h-11 bg-surface-input/50 focus:bg-surface-input w-full"
                  />
                  {search && (
                    <button 
                      onClick={() => setSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* View Toggle */}
                <div className="flex bg-surface-input p-1 rounded-xl border border-surface-border self-stretch sm:self-center">
                  <button
                    onClick={() => setStaffView('list')}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all",
                      staffView === 'list' ? "bg-brand-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
                    )}
                  >
                    <List className="w-3.5 h-3.5" />
                    Liste
                  </button>
                  <button
                    onClick={() => setStaffView('offices')}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all",
                      staffView === 'offices' ? "bg-brand-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
                    )}
                  >
                    <MapIcon className="w-3.5 h-3.5" />
                    Espaces
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between px-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  {filteredStaff.length} Résultat{filteredStaff.length > 1 ? 's' : ''}
                </span>
                <div className="sm:hidden h-8 w-px bg-surface-border mx-4" />
                <div className="text-xs text-slate-500">
                  <span className="text-green-500 font-bold">{activeStaff.length}</span> actifs
                </div>
              </div>

              {filteredStaff.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center bg-surface-card/30 rounded-3xl border border-dashed border-surface-border">
                  <div className="w-20 h-20 bg-surface-input rounded-full flex items-center justify-center mb-6">
                    <Users className="w-10 h-10 text-slate-600" />
                  </div>
                  <p className="text-slate-300 font-bold text-lg">Aucun employé trouvé</p>
                  <p className="text-slate-500 text-sm mt-2 max-w-xs mx-auto">
                    {search ? "Réessayez avec d'autres mots-clés ou effacez la recherche." : "Commencez par ajouter votre premier employé à l'équipe."}
                  </p>
                  {!search && (
                    <button onClick={() => setStaffPanel({ item: null })}
                      className="mt-8 btn-primary px-6 py-3 flex items-center gap-2 font-bold">
                      <Plus className="w-5 h-5" /> Ajouter un employé
                    </button>
                  )}
                </div>
              ) : staffView === 'offices' ? (
                <StaffOffices 
                  staffList={filteredStaff} 
                  onUpdateStaff={async (id, form) => {
                    const saved = await updateStaff(id, form);
                    setStaff((prev) => prev.map((x) => x.id === saved.id ? saved : x));
                    notifSuccess('Emplacement mis à jour');
                  }}
                />
              ) : (
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 pb-20 sm:pb-4">
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
            <div className="p-4 max-w-7xl mx-auto space-y-6">
              {/* Month nav - Clean & Functional */}
              <div className="flex items-center justify-between bg-surface-card px-2 py-2 rounded-xl border border-surface-border shadow-sm">
                <button onClick={prevMonth} className="p-3 rounded-lg hover:bg-surface-hover text-slate-400 transition-colors">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="text-center">
                  <h2 className="font-bold text-white text-base leading-tight">
                    {MONTH_NAMES[month - 1]}
                  </h2>
                  <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">{year}</p>
                </div>
                <button onClick={nextMonth} className="p-3 rounded-lg hover:bg-surface-hover text-slate-400 transition-colors">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* Attendance stats - Professional Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Présents',      value: attStats.presentDays, icon: UserCheck,  color: 'text-green-500',  border: 'border-green-900/30' },
                  { label: 'Absents',       value: attStats.absentDays,  icon: UserMinus,  color: 'text-red-500',    border: 'border-red-900/30'   },
                  { label: 'Demi-j.',       value: attStats.halfDays,    icon: Coffee,     color: 'text-amber-500',  border: 'border-amber-900/30' },
                  { label: 'Congés',         value: attStats.leaveDays,   icon: Plane,      color: 'text-blue-500',   border: 'border-blue-900/30'  },
                ].map(({ label, value, icon: Icon, color, border }) => (
                  <div key={label} className={`bg-surface-card border ${border} rounded-xl p-4 flex flex-col items-center justify-center`}>
                    <Icon className={`w-4 h-4 mb-2 ${color}`} />
                    <p className="text-xl font-bold text-white">{value}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">{label}</p>
                  </div>
                ))}
              </div>

              {/* Grid with horizontal scroll */}
              {activeStaff.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-20 bg-surface-card/20 rounded-xl border border-dashed border-surface-border italic">Aucun employé actif pour ce mois</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Registre de présence</h3>
                    <span className="text-[10px] text-slate-500 italic">Clic pour cycler le statut</span>
                  </div>
                  
                  <div className="overflow-x-auto rounded-xl border border-surface-border bg-surface-card shadow-sm no-scrollbar">
                    <table className="min-w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-surface-hover/30">
                          <th className="sticky left-0 z-20 bg-surface-card border-r border-surface-border text-left px-4 py-3 text-slate-500 font-bold uppercase tracking-tight min-w-[150px]">
                            Employé
                          </th>
                          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                            const dateObj = new Date(year, month - 1, d);
                            const dow = dateObj.getDay();
                            const isWeekend = dow === 0 || dow === 6;
                            return (
                              <th key={d}
                                onClick={() => bulkMarkAttendance(d)}
                                className={`px-1 py-3 text-center font-bold w-10 min-w-[36px] cursor-pointer hover:bg-surface-hover transition-colors border-r border-surface-border/50 last:border-r-0 ${isWeekend ? 'text-red-500/40 bg-red-500/5' : 'text-slate-500'}`}>
                                {d}
                              </th>
                            );
                          })}
                          <th className="px-4 py-3 text-right text-brand-400 font-bold uppercase tracking-tight min-w-[70px]">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeStaff.map((s) => {
                          const calc = computePayroll(s, attendance, year, month);
                          return (
                            <tr key={s.id} className="border-t border-surface-border hover:bg-surface-hover/10 transition-colors text-slate-300">
                              <td className="sticky left-0 z-10 bg-surface-card border-r border-surface-border px-4 py-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="font-bold text-white truncate max-w-[100px]">{s.name}</p>
                                    {s.position && <p className="text-[9px] text-slate-500 font-bold truncate uppercase tracking-tight">{s.position}</p>}
                                  </div>
                                  <button
                                    onClick={() => handlePrintAttendanceSheet(s)}
                                    title="Imprimer la feuille de présence"
                                    className="p-1.5 text-slate-500 hover:text-brand-400 hover:bg-brand-500/10 rounded-lg transition-all"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                                const record = getAttendanceRecord(s.id, d);
                                const key = `${s.id}-${d}`;
                                const spinning = savingAttendance === key;
                                const cfg = record ? ATTENDANCE_CFG[record.status] : null;
                                return (
                                  <td key={d} className="px-1 py-1.5 text-center border-r border-surface-border/30 last:border-r-0">
                                    <button
                                      onClick={() => cycleAttendance(s.id, d)}
                                      disabled={spinning}
                                      className={cn(
                                        "w-7 h-7 rounded text-[10px] font-bold transition-all flex items-center justify-center mx-auto",
                                        spinning ? "opacity-30" : "active:opacity-70",
                                        cfg ? `${cfg.bg} ${cfg.color} border` : "bg-surface-input/20 text-slate-800 hover:text-slate-500"
                                      )}
                                    >
                                      {spinning ? <Loader2 className="w-3 h-3 animate-spin" /> : (cfg?.short ?? '·')}
                                    </button>
                                  </td>
                                );
                              })}
                              <td className="px-4 py-2.5 text-right font-bold bg-surface-hover/5">
                                <p className="text-slate-200">{calc.daysWorked}j</p>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── Tab: Paie ────────────────────────────────────── */}
          {tab === 'paie' && (
            <div className="p-4 max-w-7xl mx-auto space-y-6">
              {/* Month nav */}
              <div className="flex items-center justify-between bg-surface-card px-2 py-2 rounded-xl border border-surface-border shadow-sm">
                <button onClick={prevMonth} className="p-3 rounded-lg hover:bg-surface-hover text-slate-400 transition-colors">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="text-center">
                  <h2 className="font-bold text-white text-base leading-tight">
                    {MONTH_NAMES[month - 1]}
                  </h2>
                  <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">{year}</p>
                </div>
                <button onClick={nextMonth} className="p-3 rounded-lg hover:bg-surface-hover text-slate-400 transition-colors">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* Payroll summary - Discreet cards */}
              {payrollData.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-surface-card border border-surface-border rounded-xl p-5 flex items-center gap-4">
                    <TrendingUp className="w-5 h-5 text-brand-500" />
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Masse salariale</p>
                      <p className="text-lg font-bold text-white leading-tight">{fmtMoney(payrollData.reduce((s, d) => s + d.calc.baseAmount, 0), cur)}</p>
                    </div>
                  </div>
                  <div className="bg-surface-card border border-surface-border rounded-xl p-5 flex items-center gap-4">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Employés Payés</p>
                      <p className="text-lg font-bold text-white leading-tight">{payrollData.filter((d) => d.paid).length} / {payrollData.length}</p>
                    </div>
                  </div>
                  <div className="bg-surface-card border border-surface-border rounded-xl p-5 flex items-center gap-4">
                    <Clock className="w-5 h-5 text-amber-600" />
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">En attente</p>
                      <p className="text-lg font-bold text-white leading-tight">{payrollData.filter((d) => !d.paid).length}</p>
                    </div>
                  </div>
                </div>
              )}

              {payrollData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center bg-surface-card/20 rounded-xl border border-dashed border-surface-border">
                  <Banknote className="w-10 h-10 text-slate-700 mb-4" />
                  <p className="text-slate-500 font-bold">Aucun employé actif pour ce mois</p>
                </div>
              ) : (
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                  {payrollData.map(({ staff: s, calc, paid }) => (
                    <div key={s.id}
                      className="bg-surface-card border border-surface-border rounded-xl p-5 flex flex-col gap-4">
                      
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-lg bg-surface-input border border-surface-border flex items-center justify-center shrink-0">
                          <span className="text-slate-300 text-base font-bold">{initials(s.name)}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-white text-base truncate leading-tight">{s.name}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{s.position ?? SALARY_TYPE_LABELS[s.salary_type]}</p>
                        </div>
                        {paid && (
                          <div className="text-green-600">
                            <CheckCircle className="w-5 h-5" />
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-1 bg-surface-input/20 border border-surface-border/50 rounded-lg p-3">
                        <div className="text-center">
                          <p className="text-xs font-bold text-white">{calc.daysWorked}j</p>
                          <p className="text-[9px] font-bold text-slate-500 uppercase">Présences</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-bold text-white">{calc.absentDays}j</p>
                          <p className="text-[9px] font-bold text-slate-500 uppercase">Absences</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs font-bold text-brand-400">{fmtMoney(calc.baseAmount, cur)}</p>
                          <p className="text-[9px] font-bold text-slate-500 uppercase">Salaire</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-4 pt-1">
                        {paid ? (
                          <div className="flex items-center gap-4 w-full">
                            <button onClick={() => handlePrintPayslip(s, paid)}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-surface-hover hover:bg-surface-border text-slate-400 font-bold text-xs rounded-lg transition-colors">
                              <Printer className="w-4 h-4" /> Bulletin
                            </button>
                            <div className="text-right">
                              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">Payé le</p>
                              <p className="text-xs font-bold text-slate-400 leading-none">{paid.payment_date ? new Date(paid.payment_date).toLocaleDateString('fr-FR') : '—'}</p>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setPayModal({ staff: s })}
                            className="w-full btn-primary flex items-center justify-center gap-2 py-3 font-bold text-xs rounded-lg transition-colors">
                            <DollarSign className="w-4 h-4" /> Enregistrer le paiement
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Payment history - Professional List */}
              {payments.length > 0 && (
                <div className="pt-6">
                  <div className="flex items-center gap-2 mb-4 px-1">
                    <History className="w-4 h-4 text-slate-600" />
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Historique des paiements</h3>
                  </div>
                  
                  <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden divide-y divide-surface-border">
                    {payments.map((p) => (
                      <div key={p.id} className="px-5 py-4 flex items-center justify-between hover:bg-surface-hover/20 transition-colors">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-200 truncate">{p.staff?.name ?? '—'}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">
                            {p.payment_date ? new Date(p.payment_date).toLocaleDateString('fr-FR') : '—'}
                            {' · '}{PAYMENT_METHOD_LABELS[p.payment_method]}
                          </p>
                        </div>
                        <div className="flex items-center gap-6">
                          <p className="font-bold text-slate-300">{fmtMoney(p.net_amount, cur)}</p>
                          <div className="flex gap-2">
                            <button onClick={() => handlePrintPayslip(p.staff as Staff, p)}
                              className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors">
                              <Printer className="w-4 h-4" />
                            </button>
                            <button onClick={() => askConfirm('Supprimer ce paiement ?', async () => {
                              try {
                                await deletePayment(p.id);
                                setPayments((prev) => prev.filter((x) => x.id !== p.id));
                              } catch (e) { notifError(toUserError(e)); }
                            })} className="p-1.5 text-slate-600 hover:text-red-500 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
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
      : `${s.salary_rate.toLocaleString('fr-FR')} ${displayCurrency(currency)}/m`;

  return (
    <div className="bg-surface-card border border-surface-border rounded-xl p-5 flex flex-col gap-4 relative overflow-hidden transition-all hover:border-slate-700">
      {/* Discreet status indicator */}
      <div className={`absolute top-0 left-0 w-1 h-full ${s.status === 'active' ? 'bg-green-600' : 'bg-slate-700'}`} />
      
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-surface-input border border-surface-border flex items-center justify-center shrink-0">
            <span className="text-slate-300 font-bold text-lg">{initials(s.name)}</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-white text-base truncate">{s.name}</h3>
            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">{s.position ?? 'Poste non défini'}</p>
          </div>
        </div>
        
        <div className="flex flex-col items-end shrink-0">
          <p className="text-sm font-bold text-brand-400">{rate}</p>
          <span className={`text-[10px] font-bold mt-1 px-1.5 py-0.5 rounded border ${
            s.status === 'active' ? 'border-green-900/50 text-green-500 bg-green-950/20' : 'border-slate-800 text-slate-500 bg-slate-900/20'
          }`}>
            {s.status === 'active' ? 'ACTIF' : 'INACTIF'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 py-4 border-y border-surface-border/50">
        {s.phone && (
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <Phone className="w-3.5 h-3.5" />
            <span>{s.phone}</span>
          </div>
        )}
        {s.email && (
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <Mail className="w-3.5 h-3.5" />
            <span className="truncate">{s.email}</span>
          </div>
        )}
        {s.department && (
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <Building2 className="w-3.5 h-3.5" />
            <span>Département : {s.department}</span>
          </div>
        )}
      </div>

      <div className="space-y-3 pt-1">
        {teamMember ? (
          <div className="flex items-center justify-between bg-surface-input/50 border border-surface-border rounded-lg px-3 py-2">
            <div className="flex items-center gap-3 min-w-0">
              <LogIn className="w-3.5 h-3.5 text-green-600" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Accès utilisateur</p>
                <p className="text-xs text-slate-300 truncate font-medium">{teamMember.email}</p>
              </div>
            </div>
            <button onClick={onUnlinkAccount} 
              className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
              title="Délier le compte">
              <Unlink className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button onClick={onLinkAccount}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-slate-700 text-slate-500 hover:text-brand-400 hover:border-brand-500 transition-all text-xs font-semibold">
            <Link2 className="w-4 h-4" /> Activer accès application
          </button>
        )}

        <div className="flex gap-2">
          <button onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-2 py-2 bg-surface-hover hover:bg-surface-border text-slate-300 rounded-lg transition-all text-xs font-semibold">
            <Pencil className="w-3.5 h-3.5" /> Modifier
          </button>
          <button onClick={onDelete}
            className="px-3 flex items-center justify-center border border-surface-border hover:border-red-900/50 hover:bg-red-950/10 text-slate-500 hover:text-red-500 rounded-lg transition-all">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
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
                        : 'bg-surface-hover border-surface-border text-slate-400'
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
