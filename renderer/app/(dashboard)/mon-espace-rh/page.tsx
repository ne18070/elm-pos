'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UserCircle, Loader2, Wallet, Palmtree, FileText, Download, Plus,
  Clock, CheckCircle2, XCircle, Ban, Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { generateStaffPayslip, printHtml } from '@/lib/invoice-templates';
import {
  getMyStaffRecord, getPayments,
  type Staff, type StaffPayment,
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

type Tab = 'bulletins' | 'conges' | 'documents';

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
  const [tab, setTab] = useState<Tab>('bulletins');

  const [payments, setPayments] = useState<StaffPayment[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [documents, setDocuments] = useState<StaffDocument[]>([]);

  const load = useCallback(async () => {
    if (!business || !user) return;
    setLoading(true);
    try {
      const staff = await getMyStaffRecord(business.id, user.id);
      setMyStaff(staff);
      if (staff) {
        const [p, lt, lr, docs] = await Promise.all([
          getPayments(business.id, { staff_id: staff.id }),
          getLeaveTypes(business.id),
          getLeaveRequests(business.id, { staff_id: staff.id }),
          getStaffDocuments(staff.id),
        ]);
        setPayments(p);
        setLeaveTypes(lt);
        setLeaveRequests(lr);
        setDocuments(docs);
      }
    } catch (e) { notifError(String(e)); }
    finally { setLoading(false); }
  }, [business, user, notifError]);

  useEffect(() => { load(); }, [load]);

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

      <div className="flex px-4 bg-surface-card border-b border-surface-border shrink-0 overflow-x-auto no-scrollbar">
        {[
          { id: 'bulletins', label: 'Mes bulletins', icon: Wallet },
          { id: 'conges',    label: 'Mes congés',     icon: Palmtree },
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
      </div>

      <div className="flex-1 overflow-y-auto bg-surface/20 scrollbar-thin p-4 max-w-4xl w-full mx-auto space-y-4">
        {tab === 'bulletins' && (
          <BulletinsPanel payments={payments} currency={business?.currency ?? 'XOF'} onDownload={handleDownloadPayslip} />
        )}
        {tab === 'conges' && (
          <CongesPanel
            myStaff={myStaff} businessId={business!.id} leaveTypes={leaveTypes} leaveRequests={leaveRequests}
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

function CongesPanel({ myStaff, businessId, leaveTypes, leaveRequests, onRefresh, notifError, notifSuccess }: {
  myStaff: Staff; businessId: string; leaveTypes: LeaveType[]; leaveRequests: LeaveRequest[];
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
          {form.start_date && form.end_date && (
            <p className="text-xs text-content-muted">{daysBetween(form.start_date, form.end_date)} jour(s)</p>
          )}
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
