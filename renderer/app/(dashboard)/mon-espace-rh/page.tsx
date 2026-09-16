'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UserCircle, Loader2, Wallet, Palmtree, FileText, Download, Plus,
  Clock, CheckCircle2, XCircle, Ban, Lock, Contact, ListChecks, Briefcase, CalendarDays,
  Target, ChevronLeft, ChevronRight, GraduationCap, Plane, Lightbulb, MapPin, Banknote, PiggyBank,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollableTabBar } from '@/components/shared/ScrollableTabBar';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { generateStaffPayslip, printHtml } from '@/lib/invoice-templates';
import {
  getMyStaffRecord, getStaffById, getStaff, getPayments, getMyAttendance,
  type Staff, type StaffPayment, type StaffAttendance,
} from '@services/supabase/staff';
import { getPaymentLines } from '@services/supabase/payroll-settings';
import {
  getLeaveTypes, getLeaveRequests, createLeaveRequest,
  type LeaveType, type LeaveRequest, type LeaveStatus,
} from '@services/supabase/leave';
import {
  getStaffDocuments, getSignedUrl, formatBytes, getFileIcon, STAFF_DOCUMENT_CATEGORY_LABELS,
  type StaffDocument, type StaffDocumentCategory,
} from '@services/supabase/staff-documents';
import { getChecklistItems, type StaffChecklistItem } from '@services/supabase/staff-checklist';
import { getStaffSchedules, WEEKDAY_LABELS, type StaffSchedule } from '@services/supabase/staff-schedules';
import {
  getStaffTasks, createTask, updateTaskStatus,
  TASK_STATUS_LABELS, TASK_PRIORITY_LABELS,
  type StaffTask, type TaskStatus, type TaskPriority,
} from '@services/supabase/staff-tasks';
import {
  getObjectives, markObjectiveProgress,
  OBJECTIVE_STATUS_LABELS,
  type StaffObjective, type ObjectiveStatus,
} from '@services/supabase/staff-objectives';
import {
  getTrainingRequests, createTrainingRequest,
  TRAINING_STATUS_LABELS,
  type StaffTrainingRequest, type TrainingStatus,
} from '@services/supabase/staff-training';
import {
  getMyMissions, createMission,
  MISSION_STATUS_LABELS,
  type StaffMission, type MissionStatus,
} from '@services/supabase/staff-missions';
import {
  getFinancialRequests, createFinancialRequest,
  FINANCIAL_REQUEST_STATUS_LABELS,
  type StaffFinancialRequest, type FinancialRequestStatus,
} from '@services/supabase/staff-finance';

type Tab = 'dossier' | 'bulletins' | 'conges' | 'taches' | 'objectifs' | 'formation' | 'mission' | 'prets' | 'avance' | 'documents';

const STATUS_CFG: Record<LeaveStatus, { label: string; color: string; icon: typeof Clock }> = {
  pending:   { label: 'En attente', color: 'text-status-warning', icon: Clock },
  approved:  { label: 'Approuvé',   color: 'text-status-success', icon: CheckCircle2 },
  rejected:  { label: 'Refusé',     color: 'text-status-error',   icon: XCircle },
  cancelled: { label: 'Annulé',     color: 'text-content-muted',  icon: Ban },
};

export default function MonEspaceRhPage() {
  const { business, user } = useAuthStore();
  const { success: notifSuccess, error: notifError } = useNotificationStore();

  const [loading, setLoading] = useState(true);
  const [myStaff, setMyStaff] = useState<Staff | null>(null);
  const [tab, setTab] = useState<Tab>('dossier');

  const [payments, setPayments] = useState<StaffPayment[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [documents, setDocuments] = useState<StaffDocument[]>([]);
  const [manager, setManager] = useState<Staff | null>(null);
  const [checklistItems, setChecklistItems] = useState<StaffChecklistItem[]>([]);
  const [schedules, setSchedules] = useState<StaffSchedule[]>([]);
  const [assignedTasks, setAssignedTasks] = useState<StaffTask[]>([]);
  const [createdTasks, setCreatedTasks] = useState<StaffTask[]>([]);
  const [colleagues, setColleagues] = useState<Staff[]>([]);
  const [objectives, setObjectives] = useState<StaffObjective[]>([]);
  const [myAttendance, setMyAttendance] = useState<StaffAttendance[]>([]);
  const [trainingRequests, setTrainingRequests] = useState<StaffTrainingRequest[]>([]);
  const [myMissions, setMyMissions] = useState<StaffMission[]>([]);
  const [financialRequests, setFinancialRequests] = useState<StaffFinancialRequest[]>([]);

  const now = new Date();
  const [attMonth, setAttMonth] = useState(now.getMonth() + 1);
  const [attYear, setAttYear] = useState(now.getFullYear());

  const load = useCallback(async () => {
    if (!business || !user) return;
    setLoading(true);
    try {
      const staff = await getMyStaffRecord(business.id, user.id);
      setMyStaff(staff);
      if (staff) {
        const [p, lt, lr, docs, mgr, checklist, sched, assigned, created, roster, objs, training, missions, finance] = await Promise.all([
          getPayments(business.id, { staff_id: staff.id }),
          getLeaveTypes(business.id),
          getLeaveRequests(business.id, { staff_id: staff.id }),
          getStaffDocuments(staff.id),
          staff.manager_id ? getStaffById(staff.manager_id) : Promise.resolve(null),
          getChecklistItems(staff.id, 'onboarding'),
          getStaffSchedules(staff.id),
          getStaffTasks(business.id, { assignedTo: staff.id }),
          getStaffTasks(business.id, { createdBy: user.id }),
          getStaff(business.id).catch(() => [] as Staff[]),
          getObjectives(business.id, staff.id),
          getTrainingRequests(business.id, staff.id),
          getMyMissions(business.id, staff.id),
          getFinancialRequests(business.id, { staffId: staff.id }),
        ]);
        setPayments(p);
        setLeaveTypes(lt);
        setLeaveRequests(lr);
        setDocuments(docs);
        setManager(mgr);
        setTrainingRequests(training);
        setMyMissions(missions);
        setFinancialRequests(finance);
        setChecklistItems(checklist);
        setSchedules(sched);
        setAssignedTasks(assigned);
        setCreatedTasks(created);
        setColleagues(roster.filter((s) => s.id !== staff.id && s.status === 'active'));
        setObjectives(objs);
      }
    } catch (e) { notifError(String(e)); }
    finally { setLoading(false); }
  }, [business, user, notifError]);

  useEffect(() => { load(); }, [load]);

  // Rechargement léger de la présence seule à la navigation mois (évite de recharger
  // bulletins/congés/tâches/objectifs juste pour changer de mois sur le calendrier perso).
  useEffect(() => {
    if (!myStaff) return;
    getMyAttendance(myStaff.id, attYear, attMonth).then(setMyAttendance).catch(() => {});
  }, [myStaff, attYear, attMonth]);

  async function handleDownloadPayslip(payment: StaffPayment) {
    if (!business || !myStaff) return;
    const lines = await getPaymentLines(payment.id).catch(() => []);
    const html = generateStaffPayslip(myStaff, payment, business, lines);
    printHtml(html);
  }

  async function handleOpenDocument(doc: StaffDocument) {
    try {
      const url = await getSignedUrl(doc.storage_path);
      window.open(url, '_blank', 'noopener');
    } catch (e) { notifError(String(e)); }
  }

  if (loading) {
    return <div className="h-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-content-brand" /></div>;
  }

  if (!myStaff) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <UserCircle className="w-12 h-12 text-content-muted mx-auto mb-4 opacity-30" />
          <p className="text-content-primary font-bold">Aucune fiche employé liée</p>
          <p className="text-sm text-content-muted mt-1">Votre compte n&apos;est pas relié à une fiche employé. Contactez un administrateur pour activer votre accès RH.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-surface">
      <div className="px-6 py-5 border-b border-surface-border bg-surface-card shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-500/10 flex items-center justify-center text-content-brand shadow-glow">
            <UserCircle size={24} />
          </div>
          <div>
            <h1 className="font-black text-content-primary text-2xl tracking-tight uppercase italic">Mon Espace RH</h1>
            <p className="text-xs text-content-secondary font-medium mt-0.5">{myStaff.name} · {myStaff.position ?? 'Poste non défini'}</p>
          </div>
        </div>
      </div>

      <ScrollableTabBar className="bg-surface-card border-b border-surface-border shrink-0">
        {[
          { id: 'dossier',   label: 'Votre dossier',  icon: Contact },
          { id: 'bulletins', label: 'Mes bulletins', icon: Wallet },
          { id: 'conges',    label: 'Mes congés',     icon: Palmtree },
          { id: 'taches',    label: 'Mes tâches',     icon: ListChecks },
          { id: 'objectifs', label: 'Mes objectifs',  icon: Target },
          { id: 'formation', label: 'Formation',      icon: GraduationCap },
          { id: 'mission',   label: 'Mission',         icon: Plane },
          { id: 'prets',     label: 'Prêts',           icon: Banknote },
          { id: 'avance',    label: 'Avance sur salaire', icon: PiggyBank },
          { id: 'documents', label: 'Mes documents',  icon: FileText },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id as Tab)}
            className={cn(
              'flex items-center gap-2.5 px-6 py-4 text-[11px] font-black uppercase tracking-widest transition-all relative whitespace-nowrap',
              tab === t.id ? 'text-content-brand' : 'text-content-muted hover:text-content-primary'
            )}>
            <t.icon className="w-4 h-4" />
            <span>{t.label}</span>
            {tab === t.id && <div className="absolute bottom-0 left-4 right-4 h-1 bg-brand-500 rounded-t-full shadow-glow" />}
          </button>
        ))}
      </ScrollableTabBar>

      <div className="flex-1 overflow-y-auto bg-surface/20 scrollbar-thin p-4 max-w-4xl w-full mx-auto space-y-4">
        {tab === 'dossier' && (
          <DossierPanel
            myStaff={myStaff} manager={manager} checklistItems={checklistItems} schedules={schedules}
            onViewDocuments={() => setTab('documents')} documentsCount={documents.length}
          />
        )}
        {tab === 'bulletins' && (
          <BulletinsPanel payments={payments} currency={business?.currency ?? 'XOF'} onDownload={handleDownloadPayslip} />
        )}
        {tab === 'conges' && (
          <CongesPanel
            myStaff={myStaff} businessId={business!.id} leaveTypes={leaveTypes} leaveRequests={leaveRequests}
            attendance={myAttendance} attYear={attYear} attMonth={attMonth}
            onPrevMonth={() => { if (attMonth === 1) { setAttMonth(12); setAttYear((y) => y - 1); } else setAttMonth((m) => m - 1); }}
            onNextMonth={() => { if (attMonth === 12) { setAttMonth(1); setAttYear((y) => y + 1); } else setAttMonth((m) => m + 1); }}
            onRefresh={load} notifError={notifError} notifSuccess={notifSuccess}
          />
        )}
        {tab === 'taches' && (
          <TachesPanel
            myStaff={myStaff} businessId={business!.id} userId={user!.id} colleagues={colleagues}
            assignedTasks={assignedTasks} createdTasks={createdTasks}
            onRefresh={load} notifError={notifError} notifSuccess={notifSuccess}
          />
        )}
        {tab === 'objectifs' && (
          <ObjectifsPanel objectives={objectives} onRefresh={load} notifError={notifError} notifSuccess={notifSuccess} />
        )}
        {tab === 'formation' && (
          <FormationPanel
            myStaff={myStaff} businessId={business!.id} requests={trainingRequests}
            onRefresh={load} notifError={notifError} notifSuccess={notifSuccess}
          />
        )}
        {tab === 'mission' && (
          <MissionPanel
            myStaff={myStaff} businessId={business!.id} missions={myMissions}
            onRefresh={load} notifError={notifError} notifSuccess={notifSuccess}
          />
        )}
        {tab === 'prets' && (
          <FinancialRequestPanel
            kind="pret" myStaff={myStaff} businessId={business!.id}
            requests={financialRequests.filter((r) => r.kind === 'pret')} currency={business?.currency ?? 'XOF'}
            onRefresh={load} notifError={notifError} notifSuccess={notifSuccess}
          />
        )}
        {tab === 'avance' && (
          <FinancialRequestPanel
            kind="avance_salaire" myStaff={myStaff} businessId={business!.id}
            requests={financialRequests.filter((r) => r.kind === 'avance_salaire')} currency={business?.currency ?? 'XOF'}
            onRefresh={load} notifError={notifError} notifSuccess={notifSuccess}
          />
        )}
        {tab === 'documents' && (
          <DocumentsPanel documents={documents} onOpen={handleOpenDocument} />
        )}
      </div>
    </div>
  );
}

// ─── Bulletins ────────────────────────────────────────────────────────────────

function BulletinsPanel({ payments, currency, onDownload }: {
  payments: StaffPayment[]; currency: string; onDownload: (p: StaffPayment) => void;
}) {
  if (payments.length === 0) {
    return <p className="text-center text-content-muted text-sm py-12">Aucun bulletin de paie pour le moment.</p>;
  }
  return (
    <div className="space-y-2">
      {payments.map((p) => (
        <div key={p.id} className="flex items-center gap-3 bg-surface-card border border-surface-border rounded-2xl p-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-content-primary">
              {new Date(p.period_start).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
            </p>
            <p className="text-[11px] text-content-muted mt-0.5">
              {p.status === 'paid' ? `Payé le ${p.payment_date ? new Date(p.payment_date).toLocaleDateString('fr-FR') : '—'}` : 'En attente de paiement'}
            </p>
          </div>
          <p className="text-lg font-black text-content-brand">{p.net_amount.toLocaleString('fr-FR')} {currency}</p>
          {p.status === 'paid' && (
            <button onClick={() => onDownload(p)} className="p-2.5 bg-brand-500/10 text-content-brand rounded-xl hover:bg-brand-500/20 transition-all">
              <Download size={16} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Congés ───────────────────────────────────────────────────────────────────

function CongesPanel({
  myStaff, businessId, leaveTypes, leaveRequests, attendance, attYear, attMonth,
  onPrevMonth, onNextMonth, onRefresh, notifError, notifSuccess,
}: {
  myStaff: Staff; businessId: string; leaveTypes: LeaveType[]; leaveRequests: LeaveRequest[];
  attendance: StaffAttendance[]; attYear: number; attMonth: number;
  onPrevMonth: () => void; onNextMonth: () => void;
  onRefresh: () => void; notifError: (m: string) => void; notifSuccess: (m: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ leave_type_id: leaveTypes[0]?.id ?? '', start_date: '', end_date: '', reason: '' });

  const currentYear = new Date().getFullYear();

  const balances = useMemo(() => leaveTypes.map((lt) => {
    const usedDays = leaveRequests
      .filter((r) => r.leave_type_id === lt.id && r.status === 'approved' && new Date(r.start_date).getFullYear() === currentYear)
      .reduce((sum, r) => sum + r.total_days, 0);
    return { type: lt, used: usedDays, remaining: Math.max(0, lt.yearly_days - usedDays) };
  }), [leaveTypes, leaveRequests, currentYear]);

  function daysBetween(start: string, end: string): number {
    if (!start || !end) return 0;
    const diff = (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 ? diff + 1 : 0;
  }

  async function handleSubmit() {
    if (!form.leave_type_id || !form.start_date || !form.end_date) { notifError('Merci de compléter le formulaire'); return; }
    const totalDays = daysBetween(form.start_date, form.end_date);
    if (totalDays <= 0) { notifError('Dates invalides'); return; }

    setSaving(true);
    try {
      await createLeaveRequest({
        business_id:   businessId,
        staff_id:      myStaff.id,
        leave_type_id: form.leave_type_id,
        start_date:    form.start_date,
        end_date:      form.end_date,
        total_days:    totalDays,
        reason:        form.reason.trim() || null,
        admin_notes:   null,
        approved_at:   null,
        approved_by:   null,
        attachments:   [],
      });
      notifSuccess('Demande de congé envoyée');
      setShowForm(false);
      setForm({ leave_type_id: leaveTypes[0]?.id ?? '', start_date: '', end_date: '', reason: '' });
      onRefresh();
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {balances.map(({ type, remaining }) => (
          <div key={type.id} className="bg-surface-card border border-surface-border rounded-2xl p-4">
            <p className="text-[9px] font-black text-content-muted uppercase tracking-widest">{type.name}</p>
            <p className="text-2xl font-black text-content-primary mt-1">{remaining}<span className="text-xs font-bold text-content-muted"> j restants</span></p>
          </div>
        ))}
      </div>

      <MyAttendanceCalendar
        attendance={attendance} leaveRequests={leaveRequests}
        year={attYear} month={attMonth} onPrevMonth={onPrevMonth} onNextMonth={onNextMonth}
      />

      <button onClick={() => setShowForm((v) => !v)}
        className="w-full h-11 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-surface-border text-content-muted hover:text-content-brand hover:border-brand-500 transition-all text-xs font-black uppercase tracking-widest">
        <Plus className="w-4 h-4" /> Nouvelle demande de congé
      </button>

      {showForm && (
        <div className="bg-surface-card border border-surface-border rounded-2xl p-4 space-y-3">
          <select value={form.leave_type_id} onChange={(e) => setForm((f) => ({ ...f, leave_type_id: e.target.value }))} className="input w-full text-sm">
            {leaveTypes.map((lt) => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} className="input text-sm" />
            <input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} className="input text-sm" />
          </div>
          {form.start_date && form.end_date && (() => {
            const requestedDays = daysBetween(form.start_date, form.end_date);
            const selectedBalance = balances.find((b) => b.type.id === form.leave_type_id);
            const remainingAfter = selectedBalance ? selectedBalance.remaining - requestedDays : null;
            return (
              <p className={cn('text-xs', remainingAfter !== null && remainingAfter < 0 ? 'text-status-error font-bold' : 'text-content-muted')}>
                {requestedDays} jour(s)
                {remainingAfter !== null && ` · Solde après cette demande : ${remainingAfter} j`}
              </p>
            );
          })()}
          <input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            placeholder="Motif (optionnel)" className="input w-full text-sm" />
          <button onClick={handleSubmit} disabled={saving}
            className="w-full btn-primary py-2.5 text-sm font-bold disabled:opacity-60">
            {saving ? 'Envoi…' : 'Envoyer la demande'}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {leaveRequests.length === 0 && <p className="text-center text-content-muted text-sm py-6">Aucune demande de congé.</p>}
        {leaveRequests.map((r) => {
          const cfg = STATUS_CFG[r.status];
          return (
            <div key={r.id} className="flex items-center gap-3 bg-surface-card border border-surface-border rounded-xl p-3">
              <cfg.icon className={cn('w-4 h-4 shrink-0', cfg.color)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-content-primary">{r.leave_type?.name ?? '—'} · {r.total_days}j</p>
                <p className="text-[11px] text-content-muted">{new Date(r.start_date).toLocaleDateString('fr-FR')} – {new Date(r.end_date).toLocaleDateString('fr-FR')}</p>
              </div>
              <span className={cn('text-[10px] font-black uppercase', cfg.color)}>{cfg.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Documents ────────────────────────────────────────────────────────────────

function DocumentsPanel({ documents, onOpen }: { documents: StaffDocument[]; onOpen: (d: StaffDocument) => void }) {
  if (documents.length === 0) {
    return (
      <div className="text-center py-12">
        <Lock className="w-8 h-8 text-content-muted mx-auto mb-3 opacity-30" />
        <p className="text-content-muted text-sm">Aucun document partagé pour le moment.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {documents.map((d) => (
        <button key={d.id} onClick={() => onOpen(d)}
          className="w-full flex items-center gap-3 bg-surface-card border border-surface-border rounded-xl p-3 text-left hover:border-brand-500/30 transition-all">
          <span className="text-xl">{getFileIcon(d.mime_type)}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-content-primary truncate">{d.nom}</p>
            <p className="text-[11px] text-content-muted">
              {STAFF_DOCUMENT_CATEGORY_LABELS[d.category as StaffDocumentCategory] ?? d.category} · {formatBytes(d.taille_bytes)}
            </p>
          </div>
          <Download className="w-4 h-4 text-content-muted shrink-0" />
        </button>
      ))}
    </div>
  );
}

// ─── Dossier ──────────────────────────────────────────────────────────────────

function DossierPanel({
  myStaff, manager, checklistItems, schedules, onViewDocuments, documentsCount,
}: {
  myStaff: Staff; manager: Staff | null; checklistItems: StaffChecklistItem[]; schedules: StaffSchedule[];
  onViewDocuments: () => void; documentsCount: number;
}) {
  const doneCount = checklistItems.filter((i) => i.is_done).length;
  const fields: Array<[string, string | null]> = [
    ['Téléphone', myStaff.phone],
    ['Email', myStaff.email],
    ['Département', myStaff.department],
    ['Type de contrat', myStaff.contract_type],
    ['Début de contrat', myStaff.contract_start_date ? new Date(myStaff.contract_start_date).toLocaleDateString('fr-FR') : null],
    ['Fin de contrat', myStaff.contract_end_date ? new Date(myStaff.contract_end_date).toLocaleDateString('fr-FR') : null],
    ['Date d\'embauche', myStaff.hire_date ? new Date(myStaff.hire_date).toLocaleDateString('fr-FR') : null],
  ];

  return (
    <div className="space-y-4">
      <div className="bg-surface-card border border-surface-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-brand-500/10 flex items-center justify-center text-content-brand shrink-0">
            <Briefcase size={20} />
          </div>
          <div>
            <p className="font-bold text-content-primary">{myStaff.name}</p>
            <p className="text-xs text-content-muted">{myStaff.position ?? 'Poste non défini'}{manager ? ` · Rattaché à ${manager.name}` : ''}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {fields.filter(([, v]) => v).map(([label, value]) => (
            <div key={label}>
              <p className="text-[9px] font-black text-content-muted uppercase tracking-widest">{label}</p>
              <p className="text-sm text-content-primary mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {schedules.length > 0 && (
        <div className="bg-surface-card border border-surface-border rounded-2xl p-4">
          <p className="text-[10px] font-black text-content-muted uppercase tracking-widest mb-3 flex items-center gap-2">
            <CalendarDays size={14} /> Horaires hebdomadaires
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {schedules.map((s) => (
              <div key={s.id} className="bg-surface-input/30 border border-surface-border rounded-lg p-2 text-center">
                <p className="text-[10px] font-black text-content-muted uppercase">{WEEKDAY_LABELS[s.weekday]}</p>
                <p className="text-xs text-content-primary font-bold mt-0.5">{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {checklistItems.length > 0 && (
        <div className="bg-surface-card border border-surface-border rounded-2xl p-4">
          <p className="text-[10px] font-black text-content-muted uppercase tracking-widest mb-3">
            Intégration · {doneCount}/{checklistItems.length} tâches
          </p>
          <div className="space-y-1.5">
            {checklistItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className={cn('w-4 h-4 shrink-0', item.is_done ? 'text-status-success' : 'text-content-muted opacity-40')} />
                <span className={cn('text-content-primary', item.is_done && 'line-through opacity-60')}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={onViewDocuments}
        className="w-full flex items-center justify-between bg-surface-card border border-surface-border rounded-2xl p-4 hover:border-brand-500/30 transition-all">
        <span className="flex items-center gap-2 text-sm font-bold text-content-primary">
          <FileText size={16} className="text-content-brand" /> Mes documents
        </span>
        <span className="text-xs text-content-muted">{documentsCount} document{documentsCount === 1 ? '' : 's'}</span>
      </button>
    </div>
  );
}

// ─── Tâches et demandes ────────────────────────────────────────────────────────

const TASK_STATUS_CFG: Record<TaskStatus, { color: string; icon: typeof Clock }> = {
  a_faire:  { color: 'text-content-muted',   icon: Clock },
  en_cours: { color: 'text-status-warning',  icon: Clock },
  terminee: { color: 'text-status-success',  icon: CheckCircle2 },
  annulee:  { color: 'text-status-error',    icon: Ban },
};

function TachesPanel({
  myStaff, businessId, userId, colleagues, assignedTasks, createdTasks, onRefresh, notifError, notifSuccess,
}: {
  myStaff: Staff; businessId: string; userId: string; colleagues: Staff[];
  assignedTasks: StaffTask[]; createdTasks: StaffTask[];
  onRefresh: () => void; notifError: (m: string) => void; notifSuccess: (m: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', assigned_to: myStaff.id, priority: 'normale' as TaskPriority, due_date: '' });

  async function handleCreate() {
    if (!form.title.trim() || !form.assigned_to) { notifError('Titre et destinataire requis'); return; }
    setSaving(true);
    try {
      await createTask({
        business_id: businessId,
        assigned_to: form.assigned_to,
        created_by:  userId,
        title:       form.title.trim(),
        description: form.description.trim() || null,
        priority:    form.priority,
        due_date:    form.due_date || null,
      });
      notifSuccess('Tâche créée');
      setForm({ title: '', description: '', assigned_to: myStaff.id, priority: 'normale', due_date: '' });
      setShowForm(false);
      onRefresh();
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); }
  }

  async function handleStatusChange(task: StaffTask, status: TaskStatus) {
    try { await updateTaskStatus(task.id, status); onRefresh(); }
    catch (e) { notifError(String(e)); }
  }

  function TaskRow({ task }: { task: StaffTask }) {
    const cfg = TASK_STATUS_CFG[task.status];
    return (
      <div className="flex items-center gap-3 bg-surface-card border border-surface-border rounded-xl p-3">
        <cfg.icon className={cn('w-4 h-4 shrink-0', cfg.color)} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-content-primary truncate">{task.title}</p>
          <p className="text-[11px] text-content-muted">
            {task.assignee?.name ?? '—'} · {TASK_PRIORITY_LABELS[task.priority]}
            {task.due_date && ` · ${new Date(task.due_date).toLocaleDateString('fr-FR')}`}
          </p>
        </div>
        <select value={task.status} onChange={(e) => handleStatusChange(task, e.target.value as TaskStatus)} className="input h-8 text-[11px]">
          {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((k) => <option key={k} value={k}>{TASK_STATUS_LABELS[k]}</option>)}
        </select>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button onClick={() => setShowForm((v) => !v)}
        className="w-full h-11 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-surface-border text-content-muted hover:text-content-brand hover:border-brand-500 transition-all text-xs font-black uppercase tracking-widest">
        <Plus className="w-4 h-4" /> Nouvelle tâche
      </button>

      {showForm && (
        <div className="bg-surface-card border border-surface-border rounded-2xl p-4 space-y-3">
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Titre de la tâche" className="input w-full text-sm" />
          <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Description (optionnel)" rows={2} className="input w-full text-sm resize-none" />
          <div className="grid grid-cols-3 gap-3">
            <select value={form.assigned_to} onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))} className="input text-sm">
              <option value={myStaff.id}>Moi-même</option>
              {colleagues.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))} className="input text-sm">
              {(Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]).map((k) => <option key={k} value={k}>{TASK_PRIORITY_LABELS[k]}</option>)}
            </select>
            <input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} className="input text-sm" />
          </div>
          <button onClick={handleCreate} disabled={saving} className="w-full btn-primary py-2.5 text-sm font-bold disabled:opacity-60">
            {saving ? 'Envoi…' : 'Créer la tâche'}
          </button>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Assignées à moi</p>
        {assignedTasks.length === 0 && <p className="text-center text-content-muted text-sm py-4">Aucune tâche assignée.</p>}
        {assignedTasks.map((t) => <TaskRow key={t.id} task={t} />)}
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Créées par moi</p>
        {createdTasks.length === 0 && <p className="text-center text-content-muted text-sm py-4">Aucune tâche créée.</p>}
        {createdTasks.map((t) => <TaskRow key={t.id} task={t} />)}
      </div>
    </div>
  );
}

// ─── Mon planning (présences + congés) ─────────────────────────────────────────

const ATT_DAY_CFG: Record<string, { short: string; color: string; bg: string }> = {
  present:  { short: 'P', color: 'text-status-success',    bg: 'bg-badge-success' },
  retard:   { short: 'R', color: 'text-status-orange',     bg: 'bg-badge-orange' },
  absent:   { short: 'A', color: 'text-status-error',      bg: 'bg-badge-error' },
  half_day: { short: 'D', color: 'text-status-warning',    bg: 'bg-badge-warning' },
  leave:    { short: 'C', color: 'text-blue-300',           bg: 'bg-badge-info' },
  holiday:  { short: 'F', color: 'text-content-secondary',  bg: 'bg-surface-hover' },
};

function MyAttendanceCalendar({
  attendance, leaveRequests, year, month, onPrevMonth, onNextMonth,
}: {
  attendance: StaffAttendance[]; leaveRequests: LeaveRequest[];
  year: number; month: number; onPrevMonth: () => void; onNextMonth: () => void;
}) {
  const daysInMonth = new Date(year, month, 0).getDate();

  const attendanceByDate = useMemo(() => {
    const map = new Map<string, StaffAttendance>();
    attendance.forEach((a) => map.set(a.date, a));
    return map;
  }, [attendance]);

  function leaveOnDay(dateStr: string) {
    return leaveRequests.find((r) => r.status === 'approved' && dateStr >= r.start_date && dateStr <= r.end_date);
  }

  return (
    <div className="bg-surface-card border border-surface-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-black text-content-muted uppercase tracking-widest flex items-center gap-2">
          <CalendarDays size={14} /> Mon planning
        </p>
        <div className="flex items-center gap-1">
          <button onClick={onPrevMonth} className="p-1.5 rounded-lg hover:bg-surface-hover text-content-secondary transition-colors">
            <ChevronLeft size={14} />
          </button>
          <span className="text-[10px] font-black text-content-primary uppercase w-24 text-center">
            {new Date(year, month - 1).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
          </span>
          <button onClick={onNextMonth} className="p-1.5 rounded-lg hover:bg-surface-hover text-content-secondary transition-colors">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const record = attendanceByDate.get(dateStr);
          const leave = !record ? leaveOnDay(dateStr) : null;
          const cfg = record ? ATT_DAY_CFG[record.status] : (leave ? ATT_DAY_CFG.leave : null);
          return (
            <div key={d}
              className={cn(
                'aspect-square rounded-lg flex items-center justify-center text-[10px] font-black',
                cfg ? cfg.bg : 'bg-surface-input/20'
              )}>
              <span className={cfg?.color ?? 'text-content-muted'}>{d}</span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 mt-3">
        {Object.entries(ATT_DAY_CFG).map(([status, cfg]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={cn('w-2.5 h-2.5 rounded-sm', cfg.bg)} />
            <span className="text-[9px] font-bold text-content-muted uppercase">{cfg.short}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Objectifs ──────────────────────────────────────────────────────────────────

const OBJECTIVE_STATUS_CFG: Record<ObjectiveStatus, { color: string; icon: typeof Clock }> = {
  assigne:     { color: 'text-content-muted',  icon: Clock },
  en_cours:    { color: 'text-status-warning', icon: Clock },
  atteint:     { color: 'text-status-success', icon: CheckCircle2 },
  non_atteint: { color: 'text-status-error',   icon: XCircle },
};

function ObjectifsPanel({
  objectives, onRefresh, notifError, notifSuccess,
}: {
  objectives: StaffObjective[]; onRefresh: () => void;
  notifError: (m: string) => void; notifSuccess: (m: string) => void;
}) {
  async function handleProgress(obj: StaffObjective, status: ObjectiveStatus) {
    try {
      await markObjectiveProgress(obj.id, status);
      notifSuccess(status === 'atteint' ? 'Objectif marqué comme atteint' : 'Progression mise à jour');
      onRefresh();
    } catch (e) { notifError(String(e)); }
  }

  if (objectives.length === 0) {
    return (
      <div className="text-center py-12">
        <Target className="w-8 h-8 text-content-muted mx-auto mb-3 opacity-30" />
        <p className="text-content-muted text-sm">Aucun objectif assigné pour le moment.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {objectives.map((o) => {
        const cfg = OBJECTIVE_STATUS_CFG[o.status];
        return (
          <div key={o.id} className="bg-surface-card border border-surface-border rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-3">
              <cfg.icon className={cn('w-4 h-4 shrink-0', cfg.color)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-content-primary">{o.title}</p>
                {o.target_date && (
                  <p className="text-[11px] text-content-muted">Échéance : {new Date(o.target_date).toLocaleDateString('fr-FR')}</p>
                )}
              </div>
              <span className={cn('text-[10px] font-black uppercase shrink-0', cfg.color)}>{OBJECTIVE_STATUS_LABELS[o.status]}</span>
            </div>
            {o.description && <p className="text-xs text-content-secondary">{o.description}</p>}
            <div className="flex gap-2 pt-1">
              {(['en_cours', 'atteint', 'non_atteint'] as ObjectiveStatus[]).map((s) => (
                <button key={s} onClick={() => handleProgress(o, s)} disabled={o.status === s}
                  className={cn(
                    'flex-1 h-8 rounded-lg text-[10px] font-black uppercase transition-colors',
                    o.status === s ? 'bg-surface-hover text-content-muted cursor-default' : 'bg-surface-input/40 text-content-secondary hover:bg-brand-500/10 hover:text-content-brand'
                  )}>
                  {OBJECTIVE_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Formation ──────────────────────────────────────────────────────────────────

const TRAINING_STATUS_COLOR: Record<TrainingStatus, string> = {
  exprime:    'text-content-muted',
  en_attente: 'text-status-warning',
  approuvee:  'text-status-success',
  rejetee:    'text-status-error',
  realisee:   'text-blue-400',
};

function FormationPanel({
  myStaff, businessId, requests, onRefresh, notifError, notifSuccess,
}: {
  myStaff: Staff; businessId: string; requests: StaffTrainingRequest[];
  onRefresh: () => void; notifError: (m: string) => void; notifSuccess: (m: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', is_need_only: false, desired_period_start: '', desired_period_end: '', justification: '' });

  async function handleSubmit() {
    if (!form.title.trim()) { notifError('Titre requis'); return; }
    setSaving(true);
    try {
      await createTrainingRequest({
        business_id:  businessId,
        staff_id:     myStaff.id,
        title:        form.title.trim(),
        is_need_only: form.is_need_only,
        desired_period_start: form.is_need_only ? null : (form.desired_period_start || null),
        desired_period_end:   form.is_need_only ? null : (form.desired_period_end || null),
        justification: form.justification.trim() || null,
      });
      notifSuccess(form.is_need_only ? 'Besoin exprimé' : 'Demande de formation envoyée');
      setForm({ title: '', is_need_only: false, desired_period_start: '', desired_period_end: '', justification: '' });
      setShowForm(false);
      onRefresh();
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <button onClick={() => setShowForm((v) => !v)}
        className="w-full h-11 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-surface-border text-content-muted hover:text-content-brand hover:border-brand-500 transition-all text-xs font-black uppercase tracking-widest">
        <Plus className="w-4 h-4" /> Nouveau besoin ou demande
      </button>

      {showForm && (
        <div className="bg-surface-card border border-surface-border rounded-2xl p-4 space-y-3">
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Intitulé de la formation" className="input w-full text-sm" />
          <div className="flex gap-2">
            <button onClick={() => setForm((f) => ({ ...f, is_need_only: true }))}
              className={cn('flex-1 h-9 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5',
                form.is_need_only ? 'bg-brand-600 text-content-primary' : 'bg-surface-input/40 text-content-secondary')}>
              <Lightbulb size={13} /> Simple besoin
            </button>
            <button onClick={() => setForm((f) => ({ ...f, is_need_only: false }))}
              className={cn('flex-1 h-9 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5',
                !form.is_need_only ? 'bg-brand-600 text-content-primary' : 'bg-surface-input/40 text-content-secondary')}>
              <GraduationCap size={13} /> Demande précise
            </button>
          </div>
          {!form.is_need_only && (
            <div className="grid grid-cols-2 gap-3">
              <input type="date" value={form.desired_period_start} onChange={(e) => setForm((f) => ({ ...f, desired_period_start: e.target.value }))} className="input text-sm" />
              <input type="date" value={form.desired_period_end} onChange={(e) => setForm((f) => ({ ...f, desired_period_end: e.target.value }))} className="input text-sm" />
            </div>
          )}
          <textarea value={form.justification} onChange={(e) => setForm((f) => ({ ...f, justification: e.target.value }))}
            placeholder="Justification (optionnel)" rows={2} className="input w-full text-sm resize-none" />
          <button onClick={handleSubmit} disabled={saving} className="w-full btn-primary py-2.5 text-sm font-bold disabled:opacity-60">
            {saving ? 'Envoi…' : 'Envoyer'}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {requests.length === 0 && <p className="text-center text-content-muted text-sm py-6">Aucun besoin ou demande de formation.</p>}
        {requests.map((r) => (
          <div key={r.id} className="flex items-center gap-3 bg-surface-card border border-surface-border rounded-xl p-3">
            {r.is_need_only ? <Lightbulb className="w-4 h-4 shrink-0 text-content-muted" /> : <GraduationCap className="w-4 h-4 shrink-0 text-content-brand" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-content-primary truncate">{r.title}</p>
              {r.desired_period_start && (
                <p className="text-[11px] text-content-muted">
                  {new Date(r.desired_period_start).toLocaleDateString('fr-FR')}
                  {r.desired_period_end && ` – ${new Date(r.desired_period_end).toLocaleDateString('fr-FR')}`}
                </p>
              )}
            </div>
            <span className={cn('text-[10px] font-black uppercase shrink-0', TRAINING_STATUS_COLOR[r.status])}>{TRAINING_STATUS_LABELS[r.status]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Mission ────────────────────────────────────────────────────────────────────

const MISSION_STATUS_COLOR: Record<MissionStatus, string> = {
  en_attente: 'text-status-warning',
  approuvee:  'text-status-success',
  rejetee:    'text-status-error',
  terminee:   'text-content-muted',
};

function MissionPanel({
  myStaff, businessId, missions, onRefresh, notifError, notifSuccess,
}: {
  myStaff: Staff; businessId: string; missions: StaffMission[];
  onRefresh: () => void; notifError: (m: string) => void; notifSuccess: (m: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ destination: '', objet: '', start_date: '', end_date: '' });

  const requested  = missions.filter((m) => m.requested_by === myStaff.id);
  const memberOnly = missions.filter((m) => m.requested_by !== myStaff.id);

  async function handleSubmit() {
    if (!form.destination.trim() || !form.objet.trim() || !form.start_date || !form.end_date) {
      notifError('Merci de compléter le formulaire');
      return;
    }
    setSaving(true);
    try {
      await createMission({
        business_id:  businessId,
        requested_by: myStaff.id,
        destination:  form.destination.trim(),
        objet:        form.objet.trim(),
        start_date:   form.start_date,
        end_date:     form.end_date,
      });
      notifSuccess('Demande d\'ordre de mission envoyée');
      setForm({ destination: '', objet: '', start_date: '', end_date: '' });
      setShowForm(false);
      onRefresh();
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); }
  }

  function MissionRow({ m }: { m: StaffMission }) {
    return (
      <div className="flex items-center gap-3 bg-surface-card border border-surface-border rounded-xl p-3">
        <Plane className="w-4 h-4 shrink-0 text-content-brand" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-content-primary truncate">{m.objet}</p>
          <p className="text-[11px] text-content-muted flex items-center gap-1">
            <MapPin size={11} /> {m.destination} · {new Date(m.start_date).toLocaleDateString('fr-FR')} – {new Date(m.end_date).toLocaleDateString('fr-FR')}
          </p>
        </div>
        <span className={cn('text-[10px] font-black uppercase shrink-0', MISSION_STATUS_COLOR[m.status])}>{MISSION_STATUS_LABELS[m.status]}</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button onClick={() => setShowForm((v) => !v)}
        className="w-full h-11 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-surface-border text-content-muted hover:text-content-brand hover:border-brand-500 transition-all text-xs font-black uppercase tracking-widest">
        <Plus className="w-4 h-4" /> Nouvelle demande d'ordre de mission
      </button>

      {showForm && (
        <div className="bg-surface-card border border-surface-border rounded-2xl p-4 space-y-3">
          <input value={form.destination} onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
            placeholder="Destination" className="input w-full text-sm" />
          <input value={form.objet} onChange={(e) => setForm((f) => ({ ...f, objet: e.target.value }))}
            placeholder="Objet de la mission" className="input w-full text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} className="input text-sm" />
            <input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} className="input text-sm" />
          </div>
          <button onClick={handleSubmit} disabled={saving} className="w-full btn-primary py-2.5 text-sm font-bold disabled:opacity-60">
            {saving ? 'Envoi…' : 'Envoyer la demande'}
          </button>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Mes demandes</p>
        {requested.length === 0 && <p className="text-center text-content-muted text-sm py-4">Aucune demande de mission.</p>}
        {requested.map((m) => <MissionRow key={m.id} m={m} />)}
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Missions dont je suis membre</p>
        {memberOnly.length === 0 && <p className="text-center text-content-muted text-sm py-4">Aucune mission en tant que membre.</p>}
        {memberOnly.map((m) => <MissionRow key={m.id} m={m} />)}
      </div>
    </div>
  );
}

// ─── Prêts / Avance sur salaire ─────────────────────────────────────────────────

const FINANCIAL_REQUEST_STATUS_COLOR: Record<FinancialRequestStatus, string> = {
  en_attente: 'text-status-warning',
  approuvee:  'text-status-success',
  rejetee:    'text-status-error',
  decaissee:  'text-blue-400',
  remboursee: 'text-content-muted',
};

function FinancialRequestPanel({
  kind, myStaff, businessId, requests, currency, onRefresh, notifError, notifSuccess,
}: {
  kind: 'pret' | 'avance_salaire'; myStaff: Staff; businessId: string; requests: StaffFinancialRequest[]; currency: string;
  onRefresh: () => void; notifError: (m: string) => void; notifSuccess: (m: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ amount: '', reason: '', repayment_months: '' });

  async function handleSubmit() {
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) { notifError('Montant invalide'); return; }
    setSaving(true);
    try {
      await createFinancialRequest({
        business_id: businessId,
        staff_id:    myStaff.id,
        kind,
        amount,
        reason:      form.reason.trim() || null,
        repayment_months: kind === 'pret' && form.repayment_months ? parseInt(form.repayment_months, 10) : null,
      });
      notifSuccess(kind === 'pret' ? 'Demande de prêt envoyée' : 'Demande d\'avance envoyée');
      setForm({ amount: '', reason: '', repayment_months: '' });
      setShowForm(false);
      onRefresh();
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <button onClick={() => setShowForm((v) => !v)}
        className="w-full h-11 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-surface-border text-content-muted hover:text-content-brand hover:border-brand-500 transition-all text-xs font-black uppercase tracking-widest">
        <Plus className="w-4 h-4" /> {kind === 'pret' ? 'Nouvelle demande de prêt' : 'Nouvelle demande d\'avance'}
      </button>

      {showForm && (
        <div className="bg-surface-card border border-surface-border rounded-2xl p-4 space-y-3">
          <input type="number" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder={`Montant (${currency})`} className="input w-full text-sm" />
          {kind === 'pret' && (
            <input type="number" min="1" value={form.repayment_months} onChange={(e) => setForm((f) => ({ ...f, repayment_months: e.target.value }))}
              placeholder="Remboursement sur combien de mois ?" className="input w-full text-sm" />
          )}
          <textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            placeholder="Motif (optionnel)" rows={2} className="input w-full text-sm resize-none" />
          <button onClick={handleSubmit} disabled={saving} className="w-full btn-primary py-2.5 text-sm font-bold disabled:opacity-60">
            {saving ? 'Envoi…' : 'Envoyer la demande'}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {requests.length === 0 && <p className="text-center text-content-muted text-sm py-6">Aucune demande.</p>}
        {requests.map((r) => (
          <div key={r.id} className="flex items-center gap-3 bg-surface-card border border-surface-border rounded-xl p-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-content-primary">{r.amount.toLocaleString('fr-FR')} {currency}</p>
              {r.repayment_months && <p className="text-[11px] text-content-muted">Sur {r.repayment_months} mois</p>}
              {r.reason && <p className="text-[11px] text-content-secondary italic">{r.reason}</p>}
            </div>
            <span className={cn('text-[10px] font-black uppercase shrink-0', FINANCIAL_REQUEST_STATUS_COLOR[r.status])}>
              {FINANCIAL_REQUEST_STATUS_LABELS[r.status]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
