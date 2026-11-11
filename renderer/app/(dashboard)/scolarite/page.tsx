'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Receipt, Search, Loader2, Plus, Users, Phone, MessageCircle, CheckCircle2, Wallet, Clock,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { toUserError } from '@/lib/user-error';
import { formatCurrency } from '@/lib/utils';
import { triggerWhatsAppShare } from '@/lib/whatsapp-direct';
import { useUrlTab } from '@/hooks/useUrlTab';
import { Modal } from '@/components/ui/Modal';
import {
  getStudents, getClassrooms,
  getPendingSchoolFees, getPaidSchoolFees, getSchoolFeesCollectedSince,
  createSchoolFee, issueClassFees, paySchoolFee,
  type SchoolFee, type FeePaymentMethod,
} from '@services/supabase/education';
import type { Student, Classroom } from '@pos-types';

/*
 * Frais de scolarité (migration 171). Un frais = une commande liée à l'élève ;
 * il se règle en une ou plusieurs fois. Parcours :
 *   - « Émettre pour une classe » : la mensualité de toute une classe d'un coup,
 *     ce qui donne la liste de qui reste à payer ;
 *   - « Encaisser » sur un frais, ou « Encaisser des frais » pour un paiement
 *     au guichet sans frais émis au préalable ;
 *   - relance et reçu au parent sur WhatsApp, appel en un geste.
 */

const TABS = [
  { id: 'a-encaisser', label: 'À encaisser' },
  { id: 'regles',      label: 'Réglés' },
] as const;
type TabId = (typeof TABS)[number]['id'];
const TAB_IDS: readonly TabId[] = TABS.map((t) => t.id);

const METHODS: { id: FeePaymentMethod; label: string }[] = [
  { id: 'cash',         label: 'Espèces' },
  { id: 'mobile_money', label: 'Mobile Money' },
  { id: 'card',         label: 'Carte' },
];
const METHOD_LABEL: Record<string, string> = Object.fromEntries(METHODS.map((m) => [m.id, m.label]));

const monthName = () => new Date().toLocaleDateString('fr-FR', { month: 'long' });
const monthFee  = () => `Mensualité ${monthName()}`;
const OTHER_LABELS = ['Inscription', 'Tenue', 'Cantine', 'Transport', 'Fournitures'];

type Money  = (n: number) => string;
type Person = { first_name: string; last_name: string };

const fullName = (s: Person | null | undefined) => (s ? `${s.first_name} ${s.last_name}` : 'Élève supprimé');

/** Montant saisi → nombre (espaces tolérés) ; 0 si vide, NaN si illisible. */
function parseAmount(v: string): number {
  const n = Number(v.replace(/[\s  ]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

/** Message WhatsApp au parent : reçu d'un versement, ou relance du reste dû. */
function parentMessage(kind: 'receipt' | 'reminder', p: {
  parentName?: string | null;
  studentName: string;
  label:       string;
  paid:        number;
  balance:     number;
  school:      string;
  money:       Money;
}): string {
  const hello = p.parentName ? `Bonjour ${p.parentName},` : 'Bonjour,';
  if (kind === 'reminder') {
    return `${hello} nous vous rappelons que « ${p.label} » de ${p.studentName} reste à régler : ${p.money(p.balance)}. Merci. ${p.school}`;
  }
  const rest = p.balance > 0.005
    ? ` Reste à régler : ${p.money(p.balance)}.`
    : ' Ce frais est entièrement réglé.';
  return `${hello} nous confirmons la réception de ${p.money(p.paid)} pour « ${p.label} » de ${p.studentName}.${rest} Merci. ${p.school}`;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ScolaritePage() {
  const { business } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const currency = business?.currency || 'XOF';
  const money: Money = useCallback((n: number) => formatCurrency(n, currency), [currency]);
  const school = business?.name ?? '';

  const [tab, setTab] = useUrlTab<TabId>('a-encaisser', TAB_IDS);
  const [pending, setPending]       = useState<SchoolFee[]>([]);
  const [paid, setPaid]             = useState<SchoolFee[]>([]);
  const [collected, setCollected]   = useState(0);
  const [students, setStudents]     = useState<Student[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [classFilter, setClassFilter] = useState('');

  const [collectFor, setCollectFor] = useState<{ studentId?: string } | null>(null);
  const [payFee, setPayFee]         = useState<SchoolFee | null>(null);
  const [issueOpen, setIssueOpen]   = useState(false);

  // Rechargement silencieux après un encaissement (pas de squelette qui clignote)
  const load = useCallback(async () => {
    if (!business?.id) return;
    try {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const [p, d, c, s, cl] = await Promise.all([
        getPendingSchoolFees(business.id),
        getPaidSchoolFees(business.id),
        getSchoolFeesCollectedSince(business.id, monthStart.toISOString()),
        getStudents(business.id),
        getClassrooms(business.id),
      ]);
      setPending(p);
      setPaid(d);
      setCollected(c);
      setStudents(s);
      setClassrooms(cl);
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setLoading(false);
    }
  }, [business?.id, notifError]);

  useEffect(() => { load(); }, [load]);

  // Lien « Encaisser » de la Base Élèves : /scolarite?eleve=<id> ouvre la saisie
  // pour cet élève, puis le paramètre est retiré (un rafraîchissement ne la rouvre pas).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const studentId = params.get('eleve');
    if (!studentId) return;
    setCollectFor({ studentId });
    params.delete('eleve');
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, []);

  const q = search.trim().toLowerCase();
  const filtering = q !== '' || classFilter !== '';
  const shown = useMemo(() => (tab === 'a-encaisser' ? pending : paid).filter((f) =>
    (!classFilter || f.student?.classroom_id === classFilter)
    && (!q || [fullName(f.student), f.student?.parent_name, f.notes, f.student?.classroom?.name]
      .some((v) => v?.toLowerCase().includes(q))),
  ), [tab, pending, paid, classFilter, q]);

  const toCollect    = pending.reduce((sum, f) => sum + Number(f.balance_due), 0);
  const lateStudents = new Set(pending.map((f) => f.student?.id).filter(Boolean)).size;

  function messageParent(f: SchoolFee, kind: 'receipt' | 'reminder') {
    triggerWhatsAppShare(f.student?.parent_phone, parentMessage(kind, {
      parentName:  f.student?.parent_name,
      studentName: fullName(f.student),
      label:       f.notes ?? 'Frais de scolarité',
      paid:        Number(f.amount_paid),
      balance:     Number(f.balance_due),
      school,
      money,
    }));
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
        {/* En-tête */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-badge-warning border border-status-warning/30 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-status-warning" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-content-primary">Suivi Scolarité</h1>
              <p className="text-xs text-content-secondary">Frais à encaisser, versements et relances des parents</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIssueOpen(true)}
              className="btn-secondary h-11 px-4 flex items-center gap-2 text-content-primary"
            >
              <Users className="w-4 h-4" /> Émettre pour une classe
            </button>
            <button onClick={() => setCollectFor({})} className="btn-primary h-11 px-4 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Encaisser des frais
            </button>
          </div>
        </div>

        {/* Chiffres */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="card p-4">
            <p className="text-xs text-content-secondary flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Reste à percevoir
            </p>
            <p className="text-2xl font-bold text-content-primary mt-1">{loading ? '—' : money(toCollect)}</p>
            <p className="text-xs text-content-muted mt-0.5">
              {lateStudents} élève{lateStudents > 1 ? 's' : ''} avec un solde à régler
            </p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-content-secondary flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5" /> Encaissé ce mois
            </p>
            <p className="text-2xl font-bold text-status-success mt-1">{loading ? '—' : money(collected)}</p>
            <p className="text-xs text-content-muted mt-0.5">Versements reçus depuis le 1er {monthName()}</p>
          </div>
        </div>

        {/* Onglets + filtres */}
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex bg-surface-input border border-surface-border rounded-xl p-1 self-start">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`h-10 px-4 rounded-lg text-sm font-semibold transition-colors ${
                  tab === t.id ? 'bg-brand-600 text-content-primary' : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                {t.label}
                {t.id === 'a-encaisser' && pending.length > 0 && (
                  <span className="ml-1.5 text-xs opacity-80">{pending.length}</span>
                )}
              </button>
            ))}
          </div>
          <div className="flex flex-1 flex-col sm:flex-row gap-2 md:justify-end">
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="input h-10 sm:w-48"
              aria-label="Filtrer par classe"
            >
              <option value="">Toutes les classes</option>
              {classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="relative sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Élève, parent ou motif…"
                aria-label="Rechercher un élève, un parent ou un motif"
                className="input h-10 pl-10 w-full"
              />
            </div>
          </div>
        </div>

        {/* Liste */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="card h-32 animate-pulse" />)}
          </div>
        ) : shown.length === 0 ? (
          <div className="card py-14 px-6 text-center space-y-3">
            <Receipt className="w-10 h-10 text-content-muted mx-auto" />
            {pending.length === 0 && paid.length === 0 ? (
              <>
                <p className="font-medium text-content-primary">Aucun frais enregistré</p>
                <p className="text-sm text-content-secondary max-w-md mx-auto">
                  Émettez la mensualité d&apos;une classe pour savoir qui reste à payer,
                  ou encaissez directement un paiement au guichet.
                </p>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  <button
                    onClick={() => setIssueOpen(true)}
                    className="btn-secondary h-11 px-4 flex items-center gap-2 text-content-primary"
                  >
                    <Users className="w-4 h-4" /> Émettre pour une classe
                  </button>
                  <button onClick={() => setCollectFor({})} className="btn-primary h-11 px-4 flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Encaisser des frais
                  </button>
                </div>
              </>
            ) : filtering ? (
              <p className="text-content-secondary">Aucun frais ne correspond à cette recherche.</p>
            ) : tab === 'a-encaisser' ? (
              <p className="text-content-secondary">Tout est réglé : aucun frais en attente.</p>
            ) : (
              <p className="text-content-secondary">Aucun frais réglé pour l&apos;instant.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {shown.map((f) => (tab === 'a-encaisser' ? (
              <PendingCard
                key={f.id}
                fee={f}
                money={money}
                onPay={() => setPayFee(f)}
                onRemind={() => messageParent(f, 'reminder')}
              />
            ) : (
              <PaidCard key={f.id} fee={f} money={money} onReceipt={() => messageParent(f, 'receipt')} />
            )))}
          </div>
        )}
      </div>

      {collectFor && business && (
        <CollectModal
          businessId={business.id}
          students={students}
          pending={pending}
          initialStudentId={collectFor.studentId}
          money={money}
          school={school}
          onPayExisting={(f) => { setCollectFor(null); setPayFee(f); }}
          onSaved={load}
          onClose={() => setCollectFor(null)}
        />
      )}

      {payFee && (
        <PayModal fee={payFee} money={money} school={school} onSaved={load} onClose={() => setPayFee(null)} />
      )}

      {issueOpen && business && (
        <IssueModal
          businessId={business.id}
          classrooms={classrooms}
          students={students}
          money={money}
          onSaved={(message) => { success(message); load(); }}
          onClose={() => setIssueOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Cartes ──────────────────────────────────────────────────────────────────

function PendingCard({ fee, money, onPay, onRemind }: {
  fee: SchoolFee; money: Money; onPay: () => void; onRemind: () => void;
}) {
  const phone   = fee.student?.parent_phone;
  const partial = Number(fee.amount_paid) > 0;
  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-content-primary truncate">{fullName(fee.student)}</p>
          <p className="text-xs text-content-secondary truncate">
            {fee.student?.classroom?.name ?? 'Sans classe'} · {fee.notes}
          </p>
          <p className="text-[11px] text-content-muted mt-0.5">
            Émis le {new Date(fee.created_at).toLocaleDateString('fr-FR')}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-status-warning">{money(Number(fee.balance_due))}</p>
          <p className="text-[11px] text-content-muted">
            {partial ? `reste sur ${money(Number(fee.total))}` : 'à régler'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {phone && (
          <>
            <a
              href={`tel:${phone}`}
              aria-label={`Appeler ${fee.student?.parent_name ?? 'le parent'}`}
              className="btn-secondary h-11 w-11 p-0 flex items-center justify-center text-content-secondary"
            >
              <Phone className="w-4 h-4" />
            </a>
            <button onClick={onRemind} className="btn-secondary h-11 px-3 flex items-center gap-1.5 text-content-primary">
              <MessageCircle className="w-4 h-4" /> Relancer
            </button>
          </>
        )}
        <button onClick={onPay} className="btn-primary h-11 px-5 ml-auto">Encaisser</button>
      </div>
    </div>
  );
}

function PaidCard({ fee, money, onReceipt }: { fee: SchoolFee; money: Money; onReceipt: () => void }) {
  const lastPaidAt = fee.payments.reduce<string | null>((d, p) => (!d || p.paid_at > d ? p.paid_at : d), null);
  const methods    = Array.from(new Set(fee.payments.map((p) => METHOD_LABEL[p.method] ?? p.method))).join(', ');
  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-content-primary truncate">{fullName(fee.student)}</p>
          <p className="text-xs text-content-secondary truncate">
            {fee.student?.classroom?.name ?? 'Sans classe'} · {fee.notes}
          </p>
          <p className="text-[11px] text-content-muted mt-0.5">
            Réglé{lastPaidAt ? ` le ${new Date(lastPaidAt).toLocaleDateString('fr-FR')}` : ''}
            {methods ? ` · ${methods}` : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-content-primary">{money(Number(fee.total))}</p>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-status-success">
            <CheckCircle2 className="w-3 h-3" /> Payé
          </span>
        </div>
      </div>
      {fee.student?.parent_phone && (
        <button onClick={onReceipt} className="btn-secondary h-11 px-3 self-start flex items-center gap-1.5 text-content-primary">
          <MessageCircle className="w-4 h-4" /> Envoyer le reçu
        </button>
      )}
    </div>
  );
}

// ─── Champs partagés ─────────────────────────────────────────────────────────

function LabelPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const suggestions = [monthFee(), ...OTHER_LABELS];
  return (
    <div>
      <label className="label" htmlFor="fee-label">Motif</label>
      <input
        id="fee-label"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Ex. ${monthFee()}`}
        className="input h-11 w-full"
      />
      <div className="flex flex-wrap gap-2 mt-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={`h-9 px-3 rounded-full text-xs font-medium border transition-colors ${
              value === s
                ? 'bg-brand-600 border-brand-600 text-content-primary'
                : 'border-surface-border text-content-secondary hover:bg-surface-hover'
            }`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MethodPicker({ value, onChange }: { value: FeePaymentMethod; onChange: (m: FeePaymentMethod) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Moyen de paiement">
      {METHODS.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={value === m.id}
          onClick={() => onChange(m.id)}
          className={`h-11 rounded-xl text-sm font-medium border transition-colors ${
            value === m.id
              ? 'bg-brand-600 border-brand-600 text-content-primary'
              : 'border-surface-border text-content-secondary hover:bg-surface-hover'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

/** Confirmation après enregistrement, avec envoi du reçu au parent. */
function SavedModal({ title, lines, phone, onReceipt, onClose }: {
  title: string; lines: string[]; phone?: string | null; onReceipt?: () => void; onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      size="sm"
      footer={(
        <>
          {onReceipt && phone && (
            <button
              type="button"
              onClick={onReceipt}
              className="btn-secondary h-11 px-4 flex items-center gap-2 text-content-primary"
            >
              <MessageCircle className="w-4 h-4" /> Envoyer le reçu
            </button>
          )}
          <button type="button" onClick={onClose} className="btn-primary h-11 px-5">Terminer</button>
        </>
      )}
    >
      <div className="flex items-start gap-3">
        <CheckCircle2 className="w-6 h-6 text-status-success shrink-0" />
        <div className="space-y-1">
          {lines.map((l) => <p key={l} className="text-sm text-content-primary">{l}</p>)}
          {onReceipt && !phone && (
            <p className="text-xs text-content-muted">
              Ajoutez le téléphone du parent dans la Base Élèves pour lui envoyer un reçu.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ─── Encaisser des frais (paiement au guichet) ───────────────────────────────

function CollectModal({
  businessId, students, pending, initialStudentId, money, school, onPayExisting, onSaved, onClose,
}: {
  businessId:        string;
  students:          Student[];
  pending:           SchoolFee[];
  initialStudentId?: string;
  money:             Money;
  school:            string;
  onPayExisting:     (fee: SchoolFee) => void;
  onSaved:           () => void;
  onClose:           () => void;
}) {
  const { error: notifError } = useNotificationStore();
  const [studentId, setStudentId] = useState(initialStudentId ?? '');
  const [query, setQuery]         = useState('');
  const [label, setLabel]         = useState(monthFee);
  const [amount, setAmount]       = useState('');
  // null : le versement suit le montant dû (cas courant : paiement complet)
  const [paidInput, setPaidInput] = useState<string | null>(null);
  const [method, setMethod]       = useState<FeePaymentMethod>('cash');
  const [saving, setSaving]       = useState(false);
  const [done, setDone]           = useState<{ paid: number; balance: number } | null>(null);

  const student = students.find((s) => s.id === studentId) ?? null;
  const due     = parseAmount(amount);
  const paidNow = paidInput === null ? due : parseAmount(paidInput);
  const owed    = pending.filter((f) => f.student?.id === studentId);
  const q       = query.trim().toLowerCase();
  const matches = q
    ? students.filter((s) => `${fullName(s)} ${s.parent_name ?? ''}`.toLowerCase().includes(q)).slice(0, 8)
    : [];

  const dueError  = amount !== '' && !(due > 0) ? 'Saisissez un montant supérieur à 0.' : null;
  const paidError = paidInput !== null && due > 0 && !(paidNow >= 0 && paidNow <= due)
    ? `Le versement doit être compris entre 0 et ${money(due)}.`
    : null;
  const valid = !!student && label.trim() !== '' && due > 0 && paidNow >= 0 && paidNow <= due;

  async function submit() {
    if (!valid || !student || saving) return;
    setSaving(true);
    try {
      await createSchoolFee({
        businessId, studentId: student.id, label: label.trim(), amount: due, paidAmount: paidNow, method,
      });
      setDone({ paid: paidNow, balance: due - paidNow });
      onSaved();
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSaving(false);
    }
  }

  if (done && student) {
    const name = fullName(student);
    const lines = done.paid > 0
      ? [
          `${money(done.paid)} reçus pour « ${label.trim()} » — ${name}.`,
          done.balance > 0.005 ? `Reste à régler : ${money(done.balance)}.` : 'Frais entièrement réglé.',
        ]
      : [`« ${label.trim()} » enregistré pour ${name} : ${money(due)} à encaisser.`];
    return (
      <SavedModal
        title={done.paid > 0 ? 'Paiement enregistré' : 'Frais enregistré'}
        lines={lines}
        phone={student.parent_phone}
        onReceipt={done.paid > 0 ? () => triggerWhatsAppShare(student.parent_phone, parentMessage('receipt', {
          parentName: student.parent_name, studentName: name, label: label.trim(),
          paid: done.paid, balance: done.balance, school, money,
        })) : undefined}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal
      title="Encaisser des frais"
      onClose={onClose}
      guard={amount !== '' && !saving}
      footer={(requestClose) => (
        <>
          <button type="button" onClick={requestClose} className="btn-secondary h-11 px-4 text-content-primary">
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid || saving}
            className="btn-primary h-11 px-5 flex items-center gap-2 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {valid && paidNow > 0 ? `Encaisser ${money(paidNow)}` : 'Enregistrer le frais'}
          </button>
        </>
      )}
    >
      <div className="space-y-5">
        {/* Élève */}
        <div>
          <label className="label" htmlFor="fee-student">Élève</label>
          {student ? (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-input border border-surface-border">
              <div className="min-w-0">
                <p className="font-medium text-content-primary truncate">{fullName(student)}</p>
                <p className="text-xs text-content-secondary truncate">
                  {student.classroom?.name ?? 'Sans classe'}
                  {student.parent_name ? ` · ${student.parent_name}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setStudentId(''); setQuery(''); }}
                className="text-sm font-medium text-content-brand hover:underline shrink-0 min-h-[44px] px-2"
              >
                Changer
              </button>
            </div>
          ) : (
            <div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
                <input
                  id="fee-student"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={students.length ? "Nom de l'élève ou du parent" : 'Chargement des élèves…'}
                  className="input h-11 pl-10 w-full"
                />
              </div>
              {q && (
                <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-surface-border divide-y divide-surface-border">
                  {matches.length === 0 ? (
                    <p className="p-3 text-sm text-content-muted">Aucun élève ne correspond.</p>
                  ) : matches.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStudentId(s.id)}
                      className="w-full text-left px-3 py-2.5 min-h-[44px] hover:bg-surface-hover transition-colors"
                    >
                      <span className="text-sm text-content-primary">{fullName(s)}</span>
                      <span className="text-xs text-content-muted ml-2">{s.classroom?.name ?? 'Sans classe'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Frais déjà émis pour cet élève : les régler plutôt que d'en créer un second */}
        {owed.length > 0 && (
          <div className="rounded-xl border border-status-warning/30 bg-badge-warning p-3 space-y-2">
            <p className="text-xs font-semibold text-status-warning">Déjà à payer pour cet élève</p>
            {owed.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2">
                <span className="text-sm text-content-primary min-w-0 truncate">
                  {f.notes} · reste {money(Number(f.balance_due))}
                </span>
                <button
                  type="button"
                  onClick={() => onPayExisting(f)}
                  className="btn-primary h-10 px-3 text-xs shrink-0"
                >
                  Encaisser
                </button>
              </div>
            ))}
          </div>
        )}

        <LabelPicker value={label} onChange={setLabel} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="fee-amount">Montant dû</label>
            <input
              id="fee-amount"
              type="number"
              inputMode="numeric"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="25000"
              className="input h-11 w-full"
            />
            {dueError && <p className="text-xs text-status-error mt-1">{dueError}</p>}
          </div>
          <div>
            <label className="label" htmlFor="fee-paid">Versé aujourd&apos;hui</label>
            <input
              id="fee-paid"
              type="number"
              inputMode="numeric"
              min={0}
              value={paidInput ?? amount}
              onChange={(e) => setPaidInput(e.target.value)}
              className="input h-11 w-full"
            />
            {paidError ? (
              <p className="text-xs text-status-error mt-1">{paidError}</p>
            ) : (
              <p className="text-xs text-content-muted mt-1">Moins que le montant dû : acompte. 0 : à encaisser plus tard.</p>
            )}
          </div>
        </div>

        {paidNow > 0 && (
          <div>
            <p className="label">Moyen de paiement</p>
            <MethodPicker value={method} onChange={setMethod} />
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Encaisser un frais émis (tout ou partie) ────────────────────────────────

function PayModal({ fee, money, school, onSaved, onClose }: {
  fee: SchoolFee; money: Money; school: string; onSaved: () => void; onClose: () => void;
}) {
  const { error: notifError } = useNotificationStore();
  const balance = Number(fee.balance_due);
  const [amount, setAmount] = useState(String(balance));
  const [method, setMethod] = useState<FeePaymentMethod>('cash');
  const [saving, setSaving] = useState(false);
  const [done, setDone]     = useState<{ paid: number; balance: number } | null>(null);

  const n     = parseAmount(amount);
  const valid = n > 0 && n <= balance;
  const error = amount !== '' && !valid ? `Saisissez un montant entre 1 et ${money(balance)}.` : null;
  const name  = fullName(fee.student);
  const label = fee.notes ?? 'Frais de scolarité';

  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const rest = await paySchoolFee(fee.id, n, method);
      setDone({ paid: n, balance: rest });
      onSaved();
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <SavedModal
        title="Paiement enregistré"
        lines={[
          `${money(done.paid)} reçus pour « ${label} » — ${name}.`,
          done.balance > 0.005 ? `Reste à régler : ${money(done.balance)}.` : 'Frais entièrement réglé.',
        ]}
        phone={fee.student?.parent_phone}
        onReceipt={() => triggerWhatsAppShare(fee.student?.parent_phone, parentMessage('receipt', {
          parentName: fee.student?.parent_name, studentName: name, label,
          paid: done.paid, balance: done.balance, school, money,
        }))}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal
      title="Encaisser"
      onClose={onClose}
      size="sm"
      footer={(
        <>
          <button type="button" onClick={onClose} className="btn-secondary h-11 px-4 text-content-primary">Annuler</button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid || saving}
            className="btn-primary h-11 px-5 flex items-center gap-2 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {valid ? `Encaisser ${money(n)}` : 'Encaisser'}
          </button>
        </>
      )}
    >
      <div className="space-y-5">
        <div className="p-3 rounded-xl bg-surface-input border border-surface-border">
          <p className="font-medium text-content-primary">{name}</p>
          <p className="text-xs text-content-secondary">
            {label} · reste {money(balance)}
            {Number(fee.amount_paid) > 0 ? ` sur ${money(Number(fee.total))}` : ''}
          </p>
        </div>
        <div>
          <label className="label" htmlFor="pay-amount">Montant versé</label>
          <input
            id="pay-amount"
            type="number"
            inputMode="numeric"
            min={0}
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input h-11 w-full"
          />
          {error ? (
            <p className="text-xs text-status-error mt-1">{error}</p>
          ) : valid && n < balance ? (
            <p className="text-xs text-content-muted mt-1">Acompte : il restera {money(balance - n)} à régler.</p>
          ) : null}
        </div>
        <div>
          <p className="label">Moyen de paiement</p>
          <MethodPicker value={method} onChange={setMethod} />
        </div>
      </div>
    </Modal>
  );
}

// ─── Émettre un frais pour toute une classe ──────────────────────────────────

function IssueModal({ businessId, classrooms, students, money, onSaved, onClose }: {
  businessId: string;
  classrooms: Classroom[];
  students:   Student[];
  money:      Money;
  onSaved:    (message: string) => void;
  onClose:    () => void;
}) {
  const { error: notifError } = useNotificationStore();
  const [classroomId, setClassroomId] = useState(classrooms[0]?.id ?? '');
  const [label, setLabel]   = useState(monthFee);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const classroom = classrooms.find((c) => c.id === classroomId) ?? null;
  const count     = students.filter((s) => s.classroom_id === classroomId && (s.status ?? 'active') === 'active').length;
  const n         = parseAmount(amount);
  const valid     = !!classroom && label.trim() !== '' && n > 0 && count > 0;

  async function submit() {
    if (!valid || !classroom || saving) return;
    setSaving(true);
    try {
      const created = await issueClassFees({ businessId, classroomId: classroom.id, label: label.trim(), amount: n });
      onSaved(created > 0
        ? `${created} frais « ${label.trim()} » à encaisser pour ${classroom.name}.`
        : `Tous les élèves de ${classroom.name} ont déjà le frais « ${label.trim()} ».`);
      onClose();
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSaving(false);
    }
  }

  if (classrooms.length === 0) {
    return (
      <Modal
        title="Émettre pour une classe"
        onClose={onClose}
        size="sm"
        footer={<Link href="/classes" className="btn-primary h-11 px-5 flex items-center">Créer une classe</Link>}
      >
        <p className="text-sm text-content-secondary">
          Créez d&apos;abord vos classes et rangez-y vos élèves : le frais sera ensuite créé pour chacun d&apos;eux en une fois.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      title="Émettre pour une classe"
      onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} className="btn-secondary h-11 px-4 text-content-primary">Annuler</button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid || saving}
            className="btn-primary h-11 px-5 flex items-center gap-2 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {valid ? `Créer ${count} frais` : 'Créer les frais'}
          </button>
        </>
      )}
    >
      <div className="space-y-5">
        <div>
          <label className="label" htmlFor="issue-class">Classe</label>
          <select
            id="issue-class"
            value={classroomId}
            onChange={(e) => setClassroomId(e.target.value)}
            className="input h-11 w-full"
          >
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.level ? ` (${c.level})` : ''}</option>
            ))}
          </select>
          <p className={`text-xs mt-1 ${count > 0 ? 'text-content-muted' : 'text-status-warning'}`}>
            {count > 0
              ? `${count} élève${count > 1 ? 's' : ''} actif${count > 1 ? 's' : ''} dans cette classe.`
              : 'Aucun élève actif dans cette classe : rangez vos élèves dans leur classe depuis la Base Élèves.'}
          </p>
        </div>

        <LabelPicker value={label} onChange={setLabel} />

        <div>
          <label className="label" htmlFor="issue-amount">Montant par élève</label>
          <input
            id="issue-amount"
            type="number"
            inputMode="numeric"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="25000"
            className="input h-11 w-full"
          />
          {amount !== '' && !(n > 0) && <p className="text-xs text-status-error mt-1">Saisissez un montant supérieur à 0.</p>}
        </div>

        {valid && (
          <p className="text-sm text-content-secondary p-3 rounded-xl bg-surface-input border border-surface-border">
            {count} frais de {money(n)}, soit {money(n * count)} à encaisser. Un élève qui a déjà ce motif
            n&apos;est pas facturé deux fois.
          </p>
        )}
      </div>
    </Modal>
  );
}
