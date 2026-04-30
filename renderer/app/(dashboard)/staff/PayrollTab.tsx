import { useMemo } from 'react';
import { 
  ChevronLeft, ChevronRight, Wallet, Printer, Banknote, 
  TrendingUp, Users, DollarSign, Clock
} from 'lucide-react';
import { 
  MONTH_NAMES, fmtMoney, initials 
} from './staff-utils';
import { 
  computePayroll, SALARY_TYPE_LABELS,
  type Staff, type StaffAttendance, type StaffPayment 
} from '@services/supabase/staff';
import { type LeaveRequest } from '@services/supabase/leave';

export function PayrollTab({ 
  staffList, attendance, leaveRequests = [], payments, year, month, currency, onPrevMonth, onNextMonth, onPay, onPrintPayslip
}: { 
  staffList: Staff[]; 
  attendance: StaffAttendance[];
  leaveRequests?: LeaveRequest[];
  payments: StaffPayment[];
  year: number;
  month: number;
  currency: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onPay: (s: Staff) => void;
  onPrintPayslip: (s: Staff, p: StaffPayment) => void;
}) {
  const activeStaff = useMemo(() => staffList.filter(s => s.status === 'active'), [staffList]);

  const payrollData = useMemo(() => {
    return activeStaff.map((s) => ({
      staff: s,
      calc:  computePayroll(s, attendance, year, month, leaveRequests),
      paid:  payments.find((p) => p.staff_id === s.id && p.status === 'paid' && p.period_start === `${year}-${String(month).padStart(2, '0')}-01`),
    }));
  }, [activeStaff, attendance, leaveRequests, payments, year, month]);

  const kpis = useMemo(() => {
    const totalNet = payrollData.reduce((acc, curr) => acc + (curr.paid?.net_amount || curr.calc.baseAmount), 0);
    const unpaidCount = payrollData.filter(p => !p.paid).length;
    return [
      { label: 'Total Masse Salariale', value: fmtMoney(totalNet, currency), icon: Wallet, color: 'text-brand-500' },
      { label: 'Employés à payer', value: unpaidCount, icon: Users, color: 'text-status-warning' },
      { label: 'Moyenne / Employé', value: activeStaff.length ? fmtMoney(totalNet / activeStaff.length, currency) : '0', icon: TrendingUp, color: 'text-status-info' },
    ];
  }, [payrollData, activeStaff.length, currency]);

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-6 pb-20 sm:pb-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-surface-card border border-surface-border rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:border-brand-500/30 transition-all">
            <div className={`w-12 h-12 rounded-xl bg-surface-input flex items-center justify-center ${k.color}`}>
              <k.icon size={24} />
            </div>
            <div>
              <p className="text-xl font-black text-content-primary tracking-tight">{k.value}</p>
              <p className="text-[10px] font-bold text-content-muted uppercase tracking-widest mt-0.5">{k.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between bg-surface-card px-2 py-2 rounded-2xl border border-surface-border shadow-sm">
        <button onClick={onPrevMonth} className="p-3 rounded-xl hover:bg-surface-hover text-content-secondary transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center font-black text-content-primary uppercase tracking-widest">
          {MONTH_NAMES[month - 1]} {year}
        </div>
        <button onClick={onNextMonth} className="p-3 rounded-xl hover:bg-surface-hover text-content-secondary transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid gap-3">
        {payrollData.map(({ staff, calc, paid }) => (
          <div key={staff.id} className="bg-surface-card border border-surface-border rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-6 group hover:border-brand-500/30 transition-all">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-surface-input border border-surface-border flex items-center justify-center font-black text-content-secondary shrink-0 shadow-inner">
                {initials(staff.name)}
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-content-primary text-base truncate tracking-tight">{staff.name}</h3>
                <p className="text-[10px] text-content-muted font-bold uppercase tracking-widest">{staff.position} · {SALARY_TYPE_LABELS[staff.salary_type]}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:flex items-center gap-10 text-center sm:text-right shrink-0">
              <div>
                <p className="text-[9px] font-black text-content-muted uppercase tracking-widest mb-1.5 flex items-center justify-center sm:justify-end gap-1.5"><Clock size={10} /> Présence</p>
                <p className="text-sm font-bold text-content-primary tracking-tight">{calc.daysWorked}j {staff.salary_type === 'hourly' && ` / ${calc.hoursWorked}h`}</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-content-muted uppercase tracking-widest mb-1.5 flex items-center justify-center sm:justify-end gap-1.5"><DollarSign size={10} /> Salaire Base</p>
                <p className="text-sm font-black text-content-brand tracking-tight">{fmtMoney(calc.baseAmount, currency)}</p>
              </div>
            </div>

            <div className="w-full sm:w-auto flex items-center gap-3 shrink-0 pt-4 sm:pt-0 border-t sm:border-t-0 border-surface-border/50">
              {paid ? (
                <div className="flex-1 sm:flex-none flex items-center justify-between sm:justify-end gap-5 bg-badge-success border border-status-success/20 px-5 py-3 rounded-2xl shadow-inner">
                  <div className="text-right">
                    <p className="text-[9px] font-black text-status-success uppercase tracking-widest">
                      Payé le {paid.payment_date ? new Date(paid.payment_date).toLocaleDateString() : 'N/A'}
                    </p>
                    <p className="text-base font-black text-status-success tracking-tight">{fmtMoney(paid.net_amount, currency)}</p>
                  </div>
                  <button onClick={() => onPrintPayslip(staff, paid)} className="p-2.5 bg-green-500/10 text-status-success rounded-xl hover:bg-green-500/20 transition-all border border-green-500/20">
                    <Printer size={18} />
                  </button>
                </div>
              ) : (
                <button onClick={() => onPay(staff)} className="flex-1 sm:flex-none btn-primary px-8 py-3.5 text-xs font-black uppercase tracking-widest shadow-lg shadow-brand-500/20 hover:scale-105 active:scale-95 transition-all">
                  <Banknote size={16} className="mr-2 inline" /> Enregistrer Paiement
                </button>
              )}
            </div>
          </div>
        ))}
        {payrollData.length === 0 && (
          <div className="py-20 text-center bg-surface-input/20 rounded-3xl border border-dashed border-surface-border text-content-muted text-sm italic">Aucun employé actif ce mois-ci.</div>
        )}
      </div>
    </div>
  );
}
