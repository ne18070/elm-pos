import { toUserError } from '@/lib/user-error';
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, TrendingDown, Trash2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { getJournalEntries, createManualEntry, deleteManualEntry } from '@services/supabase/accounting';
import type { JournalEntry } from '@services/supabase/accounting';
import { canDelete } from '@/lib/permissions';

// ─── Catégories de dépenses ───────────────────────────────────────────────────

const EXPENSE_TYPES = [
  { id: 'loyer',        label: 'Loyer',                  debit: { code: '613', name: 'Loyers et charges locatives' },           credit: { code: '571', name: 'Caisse' } },
  { id: 'salaire',      label: 'Salaires',               debit: { code: '641', name: 'Rémunérations du personnel' },            credit: { code: '571', name: 'Caisse' } },
  { id: 'cs',           label: 'Charges sociales',       debit: { code: '646', name: 'Charges sociales' },                      credit: { code: '571', name: 'Caisse' } },
  { id: 'transport',    label: 'Transport',              debit: { code: '611', name: 'Transports sur achats' },                  credit: { code: '571', name: 'Caisse' } },
  { id: 'telephone',    label: 'Téléphone / Internet',   debit: { code: '625', name: 'Frais de télécommunications' },            credit: { code: '571', name: 'Caisse' } },
  { id: 'publicite',    label: 'Publicité',              debit: { code: '621', name: 'Publicité, publications' },                credit: { code: '571', name: 'Caisse' } },
  { id: 'frais_banque', label: 'Frais bancaires',        debit: { code: '631', name: 'Frais bancaires' },                       credit: { code: '521', name: 'Banques – comptes courants' } },
  { id: 'impots',       label: 'Impôts / Taxes',         debit: { code: '444', name: 'État – impôts et taxes divers' },         credit: { code: '571', name: 'Caisse' } },
  { id: 'fournitures',  label: 'Fournitures',            debit: { code: '604', name: 'Achats de fournitures' },                  credit: { code: '571', name: 'Caisse' } },
  { id: 'eau_electricite', label: 'Eau / Électricité',   debit: { code: '626', name: 'Eau, gaz, électricité' },                 credit: { code: '571', name: 'Caisse' } },
  { id: 'entretien',    label: 'Entretien / Réparation', debit: { code: '615', name: 'Entretien et réparations' },               credit: { code: '571', name: 'Caisse' } },
  { id: 'autre',        label: 'Autre dépense',          debit: { code: '628', name: 'Divers services extérieurs' },            credit: { code: '571', name: 'Caisse' } },
] as const;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtMoney(n: number, currency: string) {
  return new Intl.NumberFormat('fr-FR').format(n) + ' ' + currency;
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DepensesPage() {
  const { business, user } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const currency = business?.currency ?? 'XOF';

  const [entries, setEntries]     = useState<JournalEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    type:        EXPENSE_TYPES[0].id as string,
    amount:      '',
    date:        todayStr(),
    description: '',
    payMethod:   'cash' as 'cash' | 'card' | 'mobile',
  });

  const isOwnerOrAdmin = canDelete(user?.role);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      const data = await getJournalEntries(business.id, { source: 'manual', limit: 200 });
      // Garder uniquement les écritures de dépenses (débit sur comptes 6xx)
      const expenses = data.filter((e) =>
        e.lines?.some((l) => l.debit > 0 && l.account_code.startsWith('6'))
      );
      setEntries(expenses);
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setLoading(false);
    }
  }, [business?.id, notifError]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!business?.id) return;
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { notifError('Montant invalide'); return; }

    const tpl = EXPENSE_TYPES.find((t) => t.id === form.type) ?? EXPENSE_TYPES[EXPENSE_TYPES.length - 1];
    const creditAccount = form.payMethod === 'card'
      ? { code: '521', name: 'Banques – comptes courants' }
      : form.payMethod === 'mobile'
      ? { code: '576', name: 'Mobile Money' }
      : tpl.credit;

    const description = form.description.trim() || tpl.label;

    setSaving(true);
    try {
      await createManualEntry({
        businessId:  business.id,
        entry_date:  form.date,
        description,
        lines: [
          { account_code: tpl.debit.code, account_name: tpl.debit.name, debit: amount, credit: 0 },
          { account_code: creditAccount.code, account_name: creditAccount.name, debit: 0, credit: amount },
        ],
      });
      success('Dépense enregistrée');
      setForm({ type: EXPENSE_TYPES[0].id, amount: '', date: todayStr(), description: '', payMethod: 'cash' });
      setShowForm(false);
      await load();
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (deletingId !== id) { setDeletingId(id); return; }
    try {
      await deleteManualEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setDeletingId(null);
      success('Dépense supprimée');
    } catch (err) {
      notifError(toUserError(err));
    }
  }

  const totalMonth = entries
    .filter((e) => e.entry_date.startsWith(todayStr().slice(0, 7)))
    .reduce((s, e) => s + (e.lines?.find((l) => l.debit > 0 && l.account_code.startsWith('6'))?.debit ?? 0), 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-surface-border flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-red-400" />
            Dépenses
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Ce mois : <span className="text-red-400 font-semibold">{fmtMoney(totalMonth, currency)}</span>
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Nouvelle dépense
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">

        {/* ── Formulaire ── */}
        {showForm && (
          <div className="card p-5 space-y-4 border-brand-700/50">
            <h2 className="font-semibold text-white">Enregistrer une dépense</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Type */}
              <div className="sm:col-span-2">
                <label className="label">Type de dépense</label>
                <select
                  className="input"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                >
                  {EXPENSE_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className="sm:col-span-2">
                <label className="label">Description <span className="text-slate-500 font-normal">(optionnel)</span></label>
                <input
                  className="input"
                  placeholder={EXPENSE_TYPES.find((t) => t.id === form.type)?.label ?? ''}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              {/* Montant */}
              <div>
                <label className="label">Montant <span className="text-red-400">*</span></label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input"
                  placeholder="0"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>

              {/* Date */}
              <div>
                <label className="label">Date</label>
                <input
                  type="date"
                  className="input"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>

              {/* Mode de paiement */}
              <div className="sm:col-span-2">
                <label className="label">Payé par</label>
                <div className="flex gap-2">
                  {([['cash', 'Caisse'], ['card', 'Banque / Carte'], ['mobile', 'Mobile Money']] as const).map(([v, lbl]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, payMethod: v }))}
                      className={`flex-1 py-2 rounded-lg border text-sm transition-all ${
                        form.payMethod === v
                          ? 'border-brand-600 bg-brand-600/10 text-white'
                          : 'border-surface-border text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving || !form.amount}
                className="btn-primary flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Enregistrer
              </button>
              <button onClick={() => setShowForm(false)} className="btn-secondary">
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* ── Liste ── */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
            <TrendingDown className="w-10 h-10 opacity-30" />
            <p>Aucune dépense enregistrée</p>
            <button onClick={() => setShowForm(true)} className="btn-secondary text-sm">
              Enregistrer la première dépense
            </button>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border text-xs text-slate-400 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left w-6" />
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">Catégorie</th>
                  <th className="px-4 py-3 text-right">Montant</th>
                  {isOwnerOrAdmin && <th className="px-3 py-3 w-10" />}
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => {
                  const debitLine  = e.lines?.find((l) => l.debit > 0 && l.account_code.startsWith('6'));
                  const creditLine = e.lines?.find((l) => l.credit > 0);
                  const amount     = debitLine?.debit ?? 0;
                  const isOpen     = expanded === e.id;
                  return (
                    <>
                      <tr
                        key={e.id}
                        className={`border-b border-surface-border hover:bg-surface-hover cursor-pointer ${i % 2 === 0 ? '' : 'bg-surface-card/30'}`}
                        onClick={() => setExpanded(isOpen ? null : e.id)}
                      >
                        <td className="px-3 py-3 text-slate-500">
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{fmtDate(e.entry_date)}</td>
                        <td className="px-4 py-3 text-white">{e.description}</td>
                        <td className="px-4 py-3 text-slate-400 hidden sm:table-cell text-xs">
                          {debitLine?.account_name ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-red-400">
                          -{fmtMoney(amount, currency)}
                        </td>
                        {isOwnerOrAdmin && (
                          <td className="px-3 py-3">
                            <button
                              onClick={(ev) => { ev.stopPropagation(); handleDelete(e.id); }}
                              className={`p-1.5 rounded-lg transition-colors ${
                                deletingId === e.id
                                  ? 'text-red-400 bg-red-900/30'
                                  : 'text-slate-600 hover:text-red-400 hover:bg-red-900/20'
                              }`}
                              title={deletingId === e.id ? 'Confirmer la suppression' : 'Supprimer'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                      {isOpen && (
                        <tr key={`${e.id}-detail`} className="bg-surface-input/50">
                          <td />
                          <td colSpan={isOwnerOrAdmin ? 5 : 4} className="px-4 py-3">
                            <div className="flex gap-8 text-xs text-slate-400">
                              <span>Débit : <span className="text-white font-mono">{debitLine?.account_code} – {debitLine?.account_name}</span></span>
                              <span>Crédit : <span className="text-white font-mono">{creditLine?.account_code} – {creditLine?.account_name}</span></span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
