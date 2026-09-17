import { useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, UserCheck, UserMinus, Coffee, Plane,
  Printer, Loader2, Zap, Info, List, Clock, Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  MONTH_NAMES, ATTENDANCE_CFG, CYCLE
} from './staff-utils';
import {
  computePayroll, computeOvertime, upsertAttendance, deleteAttendance,
  type Staff, type StaffAttendance, type OvertimeCalc
} from '@services/supabase/staff';
import { DEFAULT_TIME_SETTINGS, type StaffTimeSettings } from '@services/supabase/staff-schedules';
import { useNotificationStore } from '@/store/notifications';
import { useCan } from '@/hooks/usePermission';
import { ScheduleSettingsModal } from './ScheduleSettingsModal';

export function AttendanceTab({
  staffList, attendance, overtimeAttendance, year, month, onPrevMonth, onNextMonth, onPrintSheet, onRefresh, businessId, timeSettings
}: {
  staffList: Staff[];
  attendance: StaffAttendance[];
  overtimeAttendance: StaffAttendance[];
  year: number;
  month: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onPrintSheet: (s: Staff) => void;
  onRefresh: () => void;
  businessId: string;
  timeSettings: StaffTimeSettings | null;
}) {
  const { error: notifError, success: notifSuccess } = useNotificationStore();
  const can = useCan();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [showSchedules, setShowSchedules] = useState(false);
  const weeklyThreshold = timeSettings?.weekly_hours_threshold ?? DEFAULT_TIME_SETTINGS.weekly_hours_threshold;

  const activeStaff = useMemo(() => staffList.filter(s => s.status === 'active'), [staffList]);
  const daysInMonth = new Date(year, month, 0).getDate();

  const clockModeCounts = useMemo(() => {
    const auto   = activeStaff.filter((s) => s.clock_mode === 'auto').length;
    const badge  = activeStaff.filter((s) => s.clock_mode === 'badge').length;
    const manual = activeStaff.filter((s) => s.clock_mode === 'manual').length;
    return { auto, badge, manual, total: activeStaff.length };
  }, [activeStaff]);

  // PERFORMANCE: un seul recalcul par changement de données/seuil, pas par render/clic.
  const payrollByStaff = useMemo(() => {
    const map = new Map<string, { calc: ReturnType<typeof computePayroll>; overtime: OvertimeCalc }>();
    for (const s of activeStaff) {
      map.set(s.id, {
        calc:     computePayroll(s, attendance, year, month),
        overtime: computeOvertime(overtimeAttendance, s.id, weeklyThreshold, { year, month }),
      });
    }
    return map;
  }, [activeStaff, attendance, overtimeAttendance, year, month, weeklyThreshold]);

  // PERFORMANCE: Memoized map for attendance lookups
  const attendanceMap = useMemo(() => {
    const map = new Map<string, StaffAttendance>();
    attendance.forEach(a => {
      map.set(`${a.staff_id}-${a.date}`, a);
    });
    return map;
  }, [attendance]);

  const stats = useMemo(() => {
    const presentDays = attendance.filter((a) => a.status === 'present').length;
    const retardDays  = attendance.filter((a) => a.status === 'retard').length;
    const absentDays  = attendance.filter((a) => a.status === 'absent').length;
    const halfDays    = attendance.filter((a) => a.status === 'half_day').length;
    const leaveDays   = attendance.filter((a) => a.status === 'leave').length;
    return { presentDays, retardDays, absentDays, halfDays, leaveDays };
  }, [attendance]);

  async function cycleAttendance(staffId: string, day: number) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const key = `${staffId}-${date}`;
    setSavingKey(key);
    try {
      const record = attendanceMap.get(key);
      const currentStatus = record?.status ?? null;
      const idx = CYCLE.indexOf(currentStatus);
      const nextStatus = CYCLE[(idx + 1) % CYCLE.length];

      if (nextStatus === null) {
        if (record) await deleteAttendance(record.id);
      } else {
        const hours = nextStatus === 'present' || nextStatus === 'retard' ? 8 : nextStatus === 'half_day' ? 4 : null;
        await upsertAttendance({
          business_id:  businessId,
          staff_id:     staffId,
          date,
          status:       nextStatus,
          clock_in:     record?.clock_in ?? null,
          clock_out:    record?.clock_out ?? null,
          hours_worked: hours,
          notes:        record?.notes ?? null,
        });
      }
      onRefresh();
    } catch (e) { notifError(String(e)); }
    finally { setSavingKey(null); }
  }

  async function bulkMarkAttendance(day: number) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSavingKey(`bulk-${day}`);
    try {
      await Promise.all(activeStaff.map((s) =>
        upsertAttendance({
          business_id:  businessId,
          staff_id:     s.id,
          date,
          status:       'present',
          hours_worked: 8,
        })
      ));
      notifSuccess(`Présences enregistrées pour le ${day}/${month}`);
      onRefresh();
    } catch (e) { notifError(String(e)); }
    finally { setSavingKey(null); }
  }

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-6">
      {/* Pointage Banner — reflète la méthode réellement configurée par employé (clock_mode) */}
      <div className="bg-brand-500/5 border border-brand-500/20 rounded-2xl p-4 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0">
          <Zap className="w-5 h-5 text-content-brand" />
        </div>
        <div className="space-y-1">
          {clockModeCounts.total === 0 ? null : clockModeCounts.auto === clockModeCounts.total ? (
            <>
              <h3 className="text-sm font-bold text-content-brand">Pointage Automatique Activé</h3>
              <p className="text-xs text-content-secondary leading-relaxed">
                Les présences sont gérées par le système : l'arrivée est enregistrée à la <strong>connexion</strong>,
                l'activité est suivie en temps réel, et le départ est validé à la <strong>déconnexion</strong>.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-sm font-bold text-content-brand">Méthodes de pointage mixtes</h3>
              <p className="text-xs text-content-secondary leading-relaxed">
                {clockModeCounts.auto > 0 && <>{clockModeCounts.auto} en <strong>automatique</strong> (connexion/déconnexion)</>}
                {clockModeCounts.auto > 0 && (clockModeCounts.badge > 0 || clockModeCounts.manual > 0) && ' · '}
                {clockModeCounts.badge > 0 && <>{clockModeCounts.badge} par <strong>badge</strong></>}
                {clockModeCounts.badge > 0 && clockModeCounts.manual > 0 && ' · '}
                {clockModeCounts.manual > 0 && <>{clockModeCounts.manual} en <strong>manuel</strong></>}
                {' '}— configurez la méthode de chaque employé dans sa fiche.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between bg-surface-card px-2 py-2 rounded-2xl border border-surface-border shadow-sm">
        <button onClick={onPrevMonth} className="p-3 rounded-xl hover:bg-surface-hover text-content-secondary transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <h2 className="font-black text-content-primary text-base leading-tight uppercase tracking-tight">
            {MONTH_NAMES[month - 1]}
          </h2>
          <p className="text-[10px] text-content-muted font-black tracking-[0.2em] uppercase">{year}</p>
        </div>
        <button onClick={onNextMonth} className="p-3 rounded-xl hover:bg-surface-hover text-content-secondary transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Présents',      value: stats.presentDays, icon: UserCheck,  color: 'text-status-success',  border: 'border-green-900/20', bg: 'bg-green-500/5' },
          { label: 'Retards',       value: stats.retardDays,  icon: Clock,      color: 'text-status-orange',   border: 'border-orange-900/20', bg: 'bg-orange-500/5' },
          { label: 'Absents',       value: stats.absentDays,  icon: UserMinus,  color: 'text-status-error',    border: 'border-red-900/20', bg: 'bg-red-500/5'   },
          { label: 'Demi-j.',       value: stats.halfDays,    icon: Coffee,     color: 'text-status-warning',  border: 'border-amber-900/20', bg: 'bg-amber-500/5' },
          { label: 'Congés',         value: stats.leaveDays,   icon: Plane,      color: 'text-blue-400',   border: 'border-blue-900/20', bg: 'bg-blue-500/5'  },
        ].map(({ label, value, icon: Icon, color, border, bg }) => (
          <div key={label} className={`bg-surface-card border ${border} ${bg} rounded-2xl p-4 flex flex-col items-center justify-center shadow-sm`}>
            <Icon className={`w-4 h-4 mb-2 ${color}`} />
            <p className="text-2xl font-black text-content-primary tracking-tighter">{value}</p>
            <p className="text-[9px] font-black text-content-muted uppercase tracking-widest mt-1.5">{label}</p>
          </div>
        ))}
      </div>

      {activeStaff.length === 0 ? (
        <div className="py-20 text-center bg-surface-card/20 rounded-3xl border border-dashed border-surface-border">
          <p className="text-content-muted text-sm italic">Aucun employé actif pour ce mois</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[10px] font-black text-content-muted uppercase tracking-widest flex items-center gap-2">
              <List size={14} /> Registre de présence
            </h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 text-[9px] font-bold text-content-muted uppercase">
                {Object.entries(ATTENDANCE_CFG).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1.5">
                    <div className={cn("w-3 h-3 rounded-sm border", v.bg)} />
                    <span>{v.short}</span>
                  </div>
                ))}
              </div>
              <div className="h-4 w-px bg-surface-border" />
              <span className="text-[9px] text-content-brand font-black uppercase flex items-center gap-1">
                <Info size={12} /> Clic case pour modifier
              </span>
              {can('manage_staff_attendance') && (
                <button onClick={() => setShowSchedules(true)}
                  className="flex items-center gap-1.5 text-[9px] font-black uppercase text-content-muted hover:text-content-brand transition-colors">
                  <Settings size={12} /> Horaires
                </button>
              )}
            </div>
          </div>
          
          <div className="overflow-x-auto rounded-2xl border border-surface-border bg-surface-card shadow-2xl no-scrollbar">
            <table className="min-w-full text-[11px] border-collapse">
              <thead>
                <tr className="bg-surface-hover/30 border-b border-surface-border">
                  <th className="sticky left-0 z-20 bg-surface-card border-r border-surface-border text-left px-5 py-4 text-content-muted font-black uppercase tracking-widest min-w-[180px]">
                    Employé
                  </th>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                    const dateObj = new Date(year, month - 1, d);
                    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                    const isBulkLoading = savingKey === `bulk-${d}`;
                    return (
                      <th key={d}
                        onClick={() => bulkMarkAttendance(d)}
                        className={cn(
                          "px-1 py-4 text-center font-black w-10 min-w-[36px] cursor-pointer hover:bg-brand-500/10 hover:text-content-brand transition-all border-r border-surface-border/30 last:border-r-0 relative group",
                          isWeekend ? 'text-status-error/40 bg-red-500/5' : 'text-content-muted'
                        )}
                      >
                        {isBulkLoading ? <Loader2 size={10} className="animate-spin mx-auto" /> : d}
                        <div className="absolute inset-0 bg-brand-500/10 opacity-0 group-hover:opacity-100 pointer-events-none" />
                      </th>
                    );
                  })}
                  <th className="px-5 py-4 text-right text-content-brand font-black uppercase tracking-widest min-w-[80px] bg-brand-500/5">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/50">
                {activeStaff.map((s) => {
                  const { calc, overtime } = payrollByStaff.get(s.id)!;
                  return (
                    <tr key={s.id} className="hover:bg-surface-hover/10 transition-colors text-content-primary group">
                      <td className="sticky left-0 z-10 bg-surface-card border-r border-surface-border px-5 py-3 group-hover:bg-surface-card transition-colors">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-bold text-content-primary truncate tracking-tight">{s.name}</p>
                            {s.position && <p className="text-[9px] text-content-muted font-black truncate uppercase tracking-widest mt-0.5">{s.position}</p>}
                          </div>
                          <button
                            onClick={() => onPrintSheet(s)}
                            className="p-1.5 text-content-muted hover:text-content-brand hover:bg-brand-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Printer size={14} />
                          </button>
                        </div>
                      </td>
                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                        const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                        const key = `${s.id}-${date}`;
                        const record = attendanceMap.get(key);
                        const spinning = savingKey === key;
                        const cfg = record ? ATTENDANCE_CFG[record.status] : null;
                        return (
                          <td key={d} className="px-0.5 py-1.5 text-center border-r border-surface-border/20 last:border-r-0 group/cell">
                            <button
                              onClick={() => cycleAttendance(s.id, d)}
                              disabled={spinning}
                              className={cn(
                                "w-7 h-7 rounded-lg text-[10px] font-black transition-all flex items-center justify-center mx-auto shadow-sm",
                                spinning ? "opacity-30" : "active:scale-90",
                                cfg ? `${cfg.bg} ${cfg.color} border shadow-inner` : "bg-surface-input/10 text-content-muted hover:bg-surface-input hover:text-content-primary"
                              )}
                            >
                              {spinning ? <Loader2 size={12} className="animate-spin" /> : (cfg?.short ?? '·')}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-5 py-3 text-right font-black bg-brand-500/5 group-hover:bg-brand-500/10 transition-colors">
                        <p className="text-content-brand">{calc.daysWorked}j</p>
                        {overtime.overtimeHours > 0 && (
                          <p className="flex items-center justify-end gap-1 text-status-warning text-[9px] font-black mt-0.5">
                            <Clock size={10} /> +{overtime.overtimeHours.toFixed(1)}h sup
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showSchedules && (
        <ScheduleSettingsModal
          businessId={businessId}
          staffList={activeStaff}
          timeSettings={timeSettings}
          onClose={() => setShowSchedules(false)}
          onSaved={onRefresh}
          notifError={notifError}
          notifSuccess={notifSuccess}
        />
      )}
    </div>
  );
}
