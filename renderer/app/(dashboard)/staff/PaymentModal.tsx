import { useState, useEffect, useMemo } from 'react';
import { X, Loader2, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { fmtMoney, MONTH_NAMES } from './staff-utils';
import {
  createPayment,
  computePayroll,
  computeOvertime,
  SALARY_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  type Staff, type StaffAttendance, type StaffPayment, type PaymentMethod,
} from '@services/supabase/staff';
import { type LeaveRequest } from '@services/supabase/leave';
import { DEFAULT_TIME_SETTINGS, type StaffTimeSettings } from '@services/supabase/staff-schedules';
import {
  getContributionTypes, computeNetPayroll, insertPaymentLines,
  type PayrollContributionType,
} from '@services/supabase/payroll-settings';

export function PaymentModal({
  staff, attendance, overtimeAttendance, leaveRequests = [], year, month, currency, businessId, existingPayments, timeSettings, onClose, onSaved, notifError,
}: {
  staff:       Staff;
  attendance:  StaffAttendance[];
  overtimeAttendance: StaffAttendance[];
  leaveRequests?: LeaveRequest[];
  year:        number;
  month:       number;
  currency:    string;
  businessId:  string;
  existingPayments: StaffPayment[];
  timeSettings: StaffTimeSettings | null;
  onClose:     () => void;
  onSaved:     (p: StaffPayment) => void;
  notifError:  (m: string) => void;
}) {
  const weeklyThreshold    = timeSettings?.weekly_hours_threshold ?? DEFAULT_TIME_SETTINGS.weekly_hours_threshold;
  const overtimeMultiplier = timeSettings?.overtime_multiplier    ?? DEFAULT_TIME_SETTINGS.overtime_multiplier;
  const overtime = staff.salary_type === 'hourly'
    ? computeOvertime(overtimeAttendance, staff.id, weeklyThreshold, { year, month })
    : undefined;
  // Pass leaveRequests to computePayroll for accurate calculation
  const calc = computePayroll(staff, attendance, year, month, leaveRequests, overtime, overtimeMultiplier);

  const [saving, setSaving] = useState(false);
  const [bonuses,    setBonuses]    = useState('0');
  const [deductions, setDeductions] = useState('0');
  const [method,     setMethod]     = useState<PaymentMethod>('cash');
  const [date,       setDate]       = useState(new Date().toISOString().split('T')[0]);
  const [notes,      setNotes]      = useState('');
  const [contributionTypes, setContributionTypes] = useState<PayrollContributionType[]>([]);
  const [showBreakdown, setShowBreakdown] = useState(false);

  useEffect(() => {
    getContributionTypes(businessId).then(setContributionTypes).catch(() => setContributionTypes([]));
  }, [businessId]);

  const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const periodEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const bonus   = parseFloat(bonuses)    || 0;
  const deduct  = parseFloat(deductions) || 0;
  const gross   = calc.baseAmount + bonus;

  const payroll = useMemo(() => computeNetPayroll(gross, contributionTypes), [gross, contributionTypes]);
  const net     = Math.max(0, payroll.net - deduct);

  async function save() {
    // PREVENT DUPLICATE: Check if a paid payment already exists for this staff/period
    const alreadyPaid = existingPayments.some(p => 
      p.staff_id === staff.id && 
      p.status === 'paid' && 
      p.period_start === periodStart
    );
    
    if (alreadyPaid) {
      notifError('Un paiement a déjà été enregistré pour cet employé pour cette période.');
      return;
    }

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
        hours_worked:   calc.hoursWorked || 0,
        payment_method: method,
        payment_date:   date,
        status:         'paid',
        notes:          notes.trim(),
        gross_amount:                   gross,
        total_employee_contributions:  payroll.totalEmployeeContributions,
        total_employer_contributions:  payroll.totalEmployerContributions,
      });
      if (payroll.lines.length > 0) {
        await insertPaymentLines(saved.id, payroll.lines).catch(() => {});
      }
      onSaved(saved);
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-card border border-surface-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border bg-surface-card/30">
          <div>
            <h2 className="font-bold text-content-primary text-lg">Enregistrer un paiement</h2>
            <p className="text-xs text-content-secondary mt-0.5">{staff.name} · {MONTH_NAMES[month - 1]} {year}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-card text-content-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto scrollbar-thin">
          {/* Recap */}
          <div className="bg-surface-input rounded-xl p-4 space-y-2 text-sm border border-surface-border">
            <div className="flex justify-between text-content-secondary">
              <span>Jours travaillés</span>
              <span className="text-content-primary font-bold">{calc.daysWorked}j</span>
            </div>
            {staff.salary_type === 'hourly' && (
              <div className="flex justify-between text-content-secondary">
                <span>Heures travaillées</span>
                <span className="text-content-primary font-bold">{calc.hoursWorked}h</span>
              </div>
            )}
            {calc.overtimeHours > 0 && (
              <div className="flex justify-between text-status-warning">
                <span>Heures sup ({calc.overtimeHours.toFixed(1)}h × {overtimeMultiplier})</span>
                <span className="font-bold">+{fmtMoney(calc.overtimePay, currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-content-secondary">
              <span>Salaire de base ({SALARY_TYPE_LABELS[staff.salary_type]})</span>
              <span className="text-content-primary font-bold">{fmtMoney(calc.baseAmount, currency)}</span>
            </div>
          </div>

          {/* Bonuses / Deductions */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black text-content-muted uppercase tracking-widest block mb-1.5">Primes / Bonus</label>
              <input type="number" min="0" value={bonuses} onChange={(e) => setBonuses(e.target.value)}
                className="input w-full text-sm h-11" placeholder="0" />
            </div>
            <div>
              <label className="text-[10px] font-black text-content-muted uppercase tracking-widest block mb-1.5">Retenues / Avances</label>
              <input type="number" min="0" value={deductions} onChange={(e) => setDeductions(e.target.value)}
                className="input w-full text-sm h-11" placeholder="0" />
            </div>
          </div>

          {/* Cotisations */}
          {payroll.lines.length > 0 && (
            <div className="border border-surface-border rounded-xl overflow-hidden">
              <button onClick={() => setShowBreakdown((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-surface-input/40 text-xs font-bold text-content-secondary">
                <span>Brut {fmtMoney(gross, currency)} · Cotisations salariales -{fmtMoney(payroll.totalEmployeeContributions, currency)}</span>
                {showBreakdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showBreakdown && (
                <div className="p-3 space-y-1.5 text-xs">
                  {payroll.lines.map((l, i) => (
                    <div key={i} className="flex justify-between text-content-secondary">
                      <span>{l.name} ({l.payer === 'employee' ? 'salarié' : 'employeur'})</span>
                      <span className="text-content-primary font-medium">{fmtMoney(l.computed_amount, currency)}</span>
                    </div>
                  ))}
                  {payroll.totalEmployerContributions > 0 && (
                    <div className="flex justify-between pt-1.5 mt-1.5 border-t border-surface-border/50 text-content-muted">
                      <span>Coût total employeur</span>
                      <span className="font-bold">{fmtMoney(payroll.employerCost, currency)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Net */}
          <div className="bg-brand-500/5 border border-brand-500/20 rounded-xl p-4 flex justify-between items-center shadow-inner">
            <span className="text-content-primary font-bold text-sm">Net à payer</span>
            <span className="text-2xl font-black text-content-brand">{fmtMoney(net, currency)}</span>
          </div>

          {/* Payment method + date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black text-content-muted uppercase tracking-widest block mb-1.5">Mode de paiement</label>
              <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className="input w-full text-sm h-11">
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((k) => (
                  <option key={k} value={k}>{PAYMENT_METHOD_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-content-muted uppercase tracking-widest block mb-1.5">Date de paiement</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="input w-full text-sm h-11" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] font-black text-content-muted uppercase tracking-widest block mb-1.5">Notes</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Observations…" className="input w-full text-sm h-11" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button onClick={save} disabled={saving}
            className="w-full btn-primary flex items-center justify-center gap-2 py-3 text-sm font-black uppercase tracking-widest disabled:opacity-60 shadow-lg shadow-brand-500/20">
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Enregistrement…</>
              : <><CheckCircle className="w-4 h-4" /> Confirmer le paiement</>}
          </button>
        </div>
      </div>
    </div>
  );
}
