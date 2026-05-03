'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, Plus, Loader2, LayoutList, Calendar, Wallet, Palmtree, 
  UserMinus, Clock, Unlink, Banknote, AlertCircle
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useCan } from '@/hooks/usePermission';
import { toUserError } from '@/lib/user-error';
import { displayCurrency, cn } from '@/lib/utils';
import { 
  generateStaffPayslip, generateStaffAttendanceSheet, printHtml 
} from '@/lib/invoice-templates';
import {
  getStaff, updateStaff, deleteStaff,
  getAttendanceForMonth, getPayments,
  unlinkStaffUser,
  type Staff, type StaffAttendance, type StaffPayment,
} from '@services/supabase/staff';
import { getTeamMembers } from '@services/supabase/users';
import { getLeaveRequests } from '@services/supabase/leave';
import type { User as SystemUser } from '@pos-types';
import { useConfirm } from '@/components/shared/ConfirmDialog';

// Modular Components
import { StaffTab, fmtMoney } from './staff-utils';
import { StaffPanel } from './StaffPanel';
import { PaymentModal } from './PaymentModal';
import { LinkAccountModal } from './LinkAccountModal';
import { EmployeesTab } from './EmployeesTab';
import { AttendanceTab } from './AttendanceTab';
import { PayrollTab } from './PayrollTab';
import { LeaveManagementContent } from './LeaveManagementContent';

export default function StaffPage() {
  const { business } = useAuthStore();
  const { success: notifSuccess, error: notifError } = useNotificationStore();
  const cur = business?.currency ?? 'XOF';
  const can = useCan();

  const [tab, setTab] = useState<StaffTab>('employes');
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [attendance, setAttendance] = useState<StaffAttendance[]>([]);
  const [payments, setPayments] = useState<StaffPayment[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<SystemUser[]>([]);

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  // Panels
  const [staffPanel, setStaffPanel] = useState<{ item: Staff | null } | null>(null);
  const [payModal, setPayModal] = useState<{ staff: Staff } | null>(null);
  const [linkModal, setLinkModal] = useState<{ staff: Staff } | null>(null);

  const { askConfirm, ConfirmDialog } = useConfirm();

  const loadData = useCallback(async () => {
    if (!business) return;
    try {
      const [s, m, a, p, l] = await Promise.all([
        getStaff(business.id),
        getTeamMembers(business.id).catch(() => [] as SystemUser[]),
        getAttendanceForMonth(business.id, year, month),
        getPayments(business.id, { year, month }),
        getLeaveRequests(business.id).catch(() => []),
      ]);
      setStaffList(s);
      setTeamMembers(m);
      setAttendance(a);
      setPayments(p);
      setLeaveRequests(l);
    } catch (e) { notifError(toUserError(e)); }
  }, [business, year, month, notifError]);

  useEffect(() => {
    if (!business) return;
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [business?.id, year, month, loadData]);

  // -- Month nav ----------------------------------------------------------------

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  // -- Actions ------------------------------------------------------------------

  async function handleDeleteStaff(s: Staff) {
    askConfirm(`Supprimer ${s.name} ? Cette action est irréversible.`, async () => {
      try {
        await deleteStaff(s.id);
        setStaffList((prev) => prev.filter((x) => x.id !== s.id));
        notifSuccess(`${s.name} supprimé`);
      } catch (e) { notifError(toUserError(e)); }
    });
  }

  async function handleUnlinkAccount(s: Staff) {
    askConfirm(`Supprimer le compte de connexion de ${s.name} ?`, async () => {
      try {
        await unlinkStaffUser(s.id);
        setStaffList((prev) => prev.map((x) => x.id === s.id ? { ...x, user_id: null } : x));
        notifSuccess('Compte délié');
      } catch (e) { notifError(toUserError(e)); }
    });
  }

  function handlePrintPayslip(staff: Staff, payment: StaffPayment) {
    if (!business) return;
    const html = generateStaffPayslip(staff, payment, business);
    printHtml(html);
  }

  function handlePrintAttendanceSheet(staff: Staff) {
    if (!business) return;
    const staffAttendance = attendance.filter((a) => a.staff_id === staff.id);
    const html = generateStaffAttendanceSheet(staff, staffAttendance, year, month, business);
    printHtml(html);
  }

  // -- Global KPIs --------------------------------------------------------------

  const kpis = useMemo(() => {
    const activeStaff = staffList.filter(s => s.status === 'active');
    const today = new Date().toISOString().split('T')[0];
    const absentToday = attendance.filter(a => a.date === today && a.status === 'absent').length;
    const pendingLeaves = leaveRequests.filter(l => l.status === 'pending').length;
    const unlinkedCount = activeStaff.filter(s => !s.user_id).length;
    
    return [
      { label: 'Employés actifs', value: activeStaff.length, icon: Users, color: 'text-status-success' },
      { label: 'Absents aujourd\'hui', value: absentToday, icon: UserMinus, color: 'text-status-error' },
      { label: 'Congés en attente', value: pendingLeaves, icon: Clock, color: 'text-status-warning' },
      { label: 'Sans compte App', value: unlinkedCount, icon: Unlink, color: 'text-blue-500' },
    ];
  }, [staffList, attendance, leaveRequests]);

  if (!business) return null;

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="px-6 py-5 border-b border-surface-border bg-surface-card shrink-0">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-brand-500/10 flex items-center justify-center text-content-brand shadow-glow">
              <Users size={24} />
            </div>
            <div>
              <h1 className="font-black text-content-primary text-2xl tracking-tight uppercase italic">Gestion du Personnel</h1>
              <p className="text-xs text-content-secondary font-medium mt-0.5">Pointage automatique, Paie et Congés</p>
            </div>
          </div>
          
          {can('manage_staff') && (
            <button 
              onClick={() => setStaffPanel({ item: null })}
              className="btn-primary flex items-center gap-2 h-11 px-6 shadow-lg shadow-brand-500/20 active:scale-95 transition-all font-black text-xs uppercase tracking-widest"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Ajouter un employé</span>
            </button>
          )}
        </div>

        {/* Top KPIs Row - Operational visibility */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <div key={k.label} className="flex items-center gap-3 bg-surface/30 p-3 rounded-xl border border-surface-border/50 group hover:border-brand-500/30 transition-colors">
              <div className={cn("p-2 rounded-lg bg-surface-card shadow-sm", k.color)}>
                <k.icon size={16} />
              </div>
              <div>
                <p className="text-sm font-black text-content-primary leading-tight tracking-tight">{k.value}</p>
                <p className="text-[9px] font-bold text-content-muted uppercase tracking-widest">{k.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-4 bg-surface-card border-b border-surface-border shrink-0 overflow-x-auto no-scrollbar">
        {[
          { id: 'employes', label: 'Équipe', icon: LayoutList, show: true },
          { id: 'presences', label: 'Présences', icon: Calendar, show: can('manage_staff_attendance') },
          { id: 'paie', label: 'Paie & Salaires', icon: Wallet, show: can('manage_staff_payroll') },
          { id: 'conges', label: 'Congés & Absences', icon: Palmtree, show: true },
        ].filter(t => t.show).map((t) => (
          <button 
            key={t.id} 
            onClick={() => setTab(t.id as StaffTab)}
            className={cn(
              "flex items-center gap-2.5 px-6 py-4 text-[11px] font-black uppercase tracking-widest transition-all relative whitespace-nowrap group",
              tab === t.id ? "text-content-brand" : "text-content-muted hover:text-content-primary"
            )}
          >
            <t.icon className={cn("w-4 h-4 transition-transform group-hover:scale-110", tab === t.id ? "scale-110" : "")} />
            <span>{t.label}</span>
            {tab === t.id && (
              <div className="absolute bottom-0 left-4 right-4 h-1 bg-brand-500 rounded-t-full shadow-glow" />
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-content-brand" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto bg-surface/20 scrollbar-thin">
          {tab === 'employes' && (
            <EmployeesTab 
              staffList={staffList} teamMembers={teamMembers} currency={cur}
              onAdd={() => setStaffPanel({ item: null })}
              onEdit={(s) => setStaffPanel({ item: s })}
              onDelete={handleDeleteStaff}
              onUpdateStaff={async (id, form) => {
                await updateStaff(id, form);
                loadData();
              }}
              onLinkAccount={(s) => setLinkModal({ staff: s })}
              onUnlinkAccount={handleUnlinkAccount}
            />
          )}

          {tab === 'presences' && (
            <AttendanceTab 
              staffList={staffList} attendance={attendance} year={year} month={month}
              onPrevMonth={prevMonth} onNextMonth={nextMonth}
              onPrintSheet={handlePrintAttendanceSheet}
              onRefresh={loadData}
              businessId={business.id}
            />
          )}

          {tab === 'paie' && (
            <PayrollTab 
              staffList={staffList} attendance={attendance} payments={payments}
              leaveRequests={leaveRequests}
              year={year} month={month} currency={cur}
              onPrevMonth={prevMonth} onNextMonth={nextMonth}
              onPay={(s) => setPayModal({ staff: s })}
              onPrintPayslip={handlePrintPayslip}
            />
          )}

          {tab === 'conges' && (
            <LeaveManagementContent staffList={staffList} askConfirm={askConfirm} />
          )}
        </div>
      )}

      {/* Panels & Modals */}
      {staffPanel && (
        <StaffPanel
          staff={staffPanel.item}
          onClose={() => setStaffPanel(null)}
          onSaved={() => {
            setStaffPanel(null);
            loadData();
            notifSuccess(staffPanel.item ? 'Employé modifié' : 'Employé ajouté');
          }}
          businessId={business.id}
          notifError={notifError}
        />
      )}

      {payModal && (
        <PaymentModal
          staff={payModal.staff}
          attendance={attendance}
          leaveRequests={leaveRequests}
          year={year}
          month={month}
          currency={cur}
          businessId={business.id}
          existingPayments={payments}
          onClose={() => setPayModal(null)}
          onSaved={() => {
            setPayModal(null);
            loadData();
            notifSuccess(`Paiement enregistré pour ${payModal.staff.name}`);
          }}
          notifError={notifError}
        />
      )}

      {linkModal && (
        <LinkAccountModal
          staff={linkModal.staff}
          businessId={business.id}
          teamMembers={teamMembers}
          linkedUserIds={staffList.filter((s) => s.user_id).map((s) => s.user_id as string)}
          onClose={() => setLinkModal(null)}
          onLinked={() => {
            setLinkModal(null);
            loadData();
            notifSuccess('Compte lié');
          }}
          onTeamRefresh={async () => {
            const freshMembers = await getTeamMembers(business.id);
            setTeamMembers(freshMembers);
          }}
          notifError={notifError}
          notifSuccess={notifSuccess}
        />
      )}

      <ConfirmDialog />
    </div>
  );
}
