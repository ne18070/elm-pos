'use client';

import { useState } from 'react';
import {
  X, ChevronLeft, ChevronRight, CheckCircle2, Settings2, Plus, AlertCircle,
} from 'lucide-react';
import { useNotificationStore } from '@/store/notifications';
import { createManualEntry } from '@services/supabase/accounting';
import { formatCurrency, displayCurrency } from '@/lib/utils';
import type { Account } from '@services/supabase/accounting';
import {
  OP_CATEGORIES, OP_TEMPLATES, PAY_ACCOUNTS,
  type OpTemplate, type PaySide,
} from './accounting-constants';

interface Props {
  accounts:   Account[];
  businessId: string;
  currency?:  string;
  onClose:    () => void;
  onSaved:    () => void;
}

export function NewEntryModal({ accounts, businessId, currency, onClose, onSaved }: Props) {
  const { success, error: notifErr } = useNotificationStore();
  const [saving, setSaving]     = useState(false);
  const [expertMode, setExpertMode] = useState(false);

  // -- Mode guidé --
  const [category, setCategory] = useState<string | null>(null);
  const [op, setOp]             = useState<OpTemplate | null>(null);
  const [amount, setAmount]     = useState('');
  const [paySide, setPaySide]   = useState<PaySide>('caisse');
  const [date, setDate]         = useState(new Date().toISOString().slice(0, 10));
  const [desc, setDesc]         = useState('');

  // -- Mode expert --
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));
  const [expRef, setExpRef]   = useState('');
  const [expDesc, setExpDesc] = useState('');
  const [lines, setLines]     = useState([
    { account_code: '', account_name: '', debit: 0, credit: 0 },
    { account_code: '', account_name: '', debit: 0, credit: 0 },
  ]);

  function selectOp(tmpl: OpTemplate) { setOp(tmpl); setDesc(tmpl.defaultDesc); setAmount(''); }
  function back() { if (op) { setOp(null); return; } setCategory(null); }

  function buildGuidedLines(tmpl: OpTemplate, amt: number, pay: PaySide) {
    const payAcct    = PAY_ACCOUNTS[pay];
    const debitAcct  = tmpl.hasPay && tmpl.debit.code  === '571' ? payAcct : tmpl.debit;
    const creditAcct = tmpl.hasPay && tmpl.credit.code === '571' ? payAcct : tmpl.credit;
    return [
      { account_code: debitAcct.code,  account_name: debitAcct.name,  debit: amt, credit: 0 },
      { account_code: creditAcct.code, account_name: creditAcct.name, debit: 0,   credit: amt },
    ];
  }

  async function saveGuided() {
    const amt = parseFloat(amount);
    if (!op) return;
    if (!desc.trim()) return notifErr('Libellé requis');
    if (!amt || amt <= 0) return notifErr('Montant invalide');
    setSaving(true);
    try {
      await createManualEntry({ businessId, entry_date: date, description: desc, lines: buildGuidedLines(op, amt, paySide) });
      success('Écriture enregistrée');
      onSaved();
    } catch (err) { notifErr(String(err)); }
    finally { setSaving(false); }
  }

  const expTotalDebit  = lines.reduce((s, l) => s + (l.debit  || 0), 0);
  const expTotalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const expBalanced    = Math.abs(expTotalDebit - expTotalCredit) < 0.01 && expTotalDebit > 0;

  function updateLine(i: number, field: string, value: string | number) {
    setLines((prev) => prev.map((l, idx) => {
      if (idx !== i) return l;
      if (field === 'account_code') {
        const acc = accounts.find((a) => a.code === value);
        return { ...l, account_code: String(value), account_name: acc?.name ?? l.account_name };
      }
      return { ...l, [field]: value };
    }));
  }

  async function saveExpert() {
    if (!expDesc.trim()) return notifErr('Libellé requis');
    if (!expBalanced) return notifErr("L'écriture doit être équilibrée (Débit = Crédit)");
    const validLines = lines.filter((l) => l.account_code && (l.debit > 0 || l.credit > 0));
    if (validLines.length < 2) return notifErr('Au moins 2 lignes');
    setSaving(true);
    try {
      await createManualEntry({ businessId, entry_date: expDate, reference: expRef || undefined, description: expDesc, lines: validLines });
      success('Écriture enregistrée');
      onSaved();
    } catch (err) { notifErr(String(err)); }
    finally { setSaving(false); }
  }

  const catOps = category ? OP_TEMPLATES.filter((t) => t.category === category) : [];
  const amt    = parseFloat(amount) || 0;
  const previewLines = op && amt > 0 ? buildGuidedLines(op, amt, paySide) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl">

        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <div className="flex items-center gap-2">
            {!expertMode && (category || op) && (
              <button onClick={back} className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-hover">
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-base font-bold text-content-primary">
              {expertMode ? 'Écriture comptable (expert)' :
               op ? op.label :
               category ? OP_CATEGORIES.find((c) => c.id === category)?.label :
               "Que s'est-il passé ?"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setExpertMode((v) => !v)}
              className="text-xs flex items-center gap-1 text-content-secondary hover:text-content-primary transition-colors">
              <Settings2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{expertMode ? 'Mode simple' : 'Mode expert'}</span>
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-hover">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!expertMode && (
            <div className="p-4 space-y-4">
              {!category && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {OP_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <button key={cat.id} onClick={() => setCategory(cat.id)}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all hover:scale-[1.02] ${cat.color}`}>
                        <Icon className="w-6 h-6" />
                        <span className="text-sm font-medium text-content-primary">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {category && !op && (
                <div className="space-y-2">
                  {catOps.map((tmpl) => {
                    const Icon = tmpl.icon;
                    return (
                      <button key={tmpl.id} onClick={() => selectOp(tmpl)}
                        className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-surface-border hover:border-brand-600 hover:bg-brand-600/10 text-left transition-all group">
                        <div className="w-9 h-9 rounded-xl bg-surface-input flex items-center justify-center shrink-0 group-hover:bg-brand-600/20">
                          <Icon className="w-4 h-4 text-content-secondary group-hover:text-content-brand" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-content-primary text-sm">{tmpl.label}</p>
                          <p className="text-xs text-content-primary truncate">{tmpl.desc}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-content-muted group-hover:text-content-brand ml-auto shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}

              {op && (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-surface-input flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-content-brand shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-content-primary">{op.label}</p>
                      <p className="text-xs text-content-primary">{op.desc}</p>
                    </div>
                  </div>
                  <div>
                    <label className="label">Montant *</label>
                    <div className="relative">
                      <input type="number" min="0" step="any" autoFocus value={amount}
                        onChange={(e) => setAmount(e.target.value)} placeholder="0"
                        className="input text-xl font-bold text-content-primary text-right pr-16" />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-content-secondary text-sm font-medium">
                        {displayCurrency(currency ?? 'XOF')}
                      </span>
                    </div>
                  </div>
                  {op.hasPay && (
                    <div>
                      <label className="label">Payé via</label>
                      <div className="flex gap-2">
                        {(['caisse', 'banque', 'mobile'] as PaySide[]).map((p) => (
                          <button key={p} onClick={() => setPaySide(p)}
                            className={`flex-1 py-2 px-3 rounded-xl border text-sm font-medium transition-colors capitalize ${
                              paySide === p ? 'bg-brand-600 border-brand-500 text-content-primary' : 'border-surface-border text-content-secondary hover:text-content-primary hover:bg-surface-hover'
                            }`}>
                            {p === 'caisse' ? '💵 Caisse' : p === 'banque' ? '🏦 Banque' : '📱 Mobile'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="label">Date</label>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
                  </div>
                  <div>
                    <label className="label">Note / précision</label>
                    <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)}
                      placeholder={op.defaultDesc} className="input" />
                  </div>
                  {previewLines && (
                    <div className="rounded-xl border border-surface-border overflow-hidden">
                      <div className="px-3 py-2 bg-surface-input border-b border-surface-border">
                        <p className="text-xs text-content-secondary uppercase tracking-wide">Écriture générée automatiquement</p>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-content-primary border-b border-surface-border">
                            <th className="px-3 py-2 text-left">Compte</th>
                            <th className="px-3 py-2 text-left">Intitulé</th>
                            <th className="px-3 py-2 text-right">Débit</th>
                            <th className="px-3 py-2 text-right">Crédit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewLines.map((l, i) => (
                            <tr key={i} className="border-b border-surface-border last:border-0">
                              <td className="px-3 py-2 font-mono text-content-brand">{l.account_code}</td>
                              <td className="px-3 py-2 text-content-primary">{l.account_name}</td>
                              <td className="px-3 py-2 text-right text-content-primary font-mono">{l.debit > 0 ? formatCurrency(l.debit, currency) : ''}</td>
                              <td className="px-3 py-2 text-right text-content-primary font-mono">{l.credit > 0 ? formatCurrency(l.credit, currency) : ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {expertMode && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Date</label>
                  <input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} className="input" />
                </div>
                <div>
                  <label className="label">Référence</label>
                  <input type="text" value={expRef} onChange={(e) => setExpRef(e.target.value)} placeholder="PV-001" className="input" />
                </div>
              </div>
              <div>
                <label className="label">Libellé *</label>
                <input type="text" value={expDesc} onChange={(e) => setExpDesc(e.target.value)} placeholder="Description" className="input" />
              </div>
              <div className="rounded-xl border border-surface-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-surface-input text-xs text-content-secondary uppercase border-b border-surface-border">
                    <tr>
                      <th className="px-2 py-2 text-left w-24">Compte</th>
                      <th className="px-2 py-2 text-left">Intitulé</th>
                      <th className="px-2 py-2 text-right w-24">Débit</th>
                      <th className="px-2 py-2 text-right w-24">Crédit</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, i) => (
                      <tr key={i} className="border-b border-surface-border">
                        <td className="px-1.5 py-1.5">
                          <input list={`al-${i}`} value={line.account_code}
                            onChange={(e) => updateLine(i, 'account_code', e.target.value)}
                            placeholder="571" className="input py-1 px-2 text-xs font-mono" />
                          <datalist id={`al-${i}`}>
                            {accounts.map((a) => <option key={a.code} value={a.code}>{a.code} —{a.name}</option>)}
                          </datalist>
                        </td>
                        <td className="px-1.5 py-1.5">
                          <input value={line.account_name} onChange={(e) => updateLine(i, 'account_name', e.target.value)}
                            placeholder="Intitulé" className="input py-1 px-2 text-xs" />
                        </td>
                        <td className="px-1.5 py-1.5">
                          <input type="number" min="0" step="any" value={line.debit || ''}
                            onChange={(e) => updateLine(i, 'debit', parseFloat(e.target.value) || 0)}
                            className="input py-1 px-2 text-xs text-right" />
                        </td>
                        <td className="px-1.5 py-1.5">
                          <input type="number" min="0" step="any" value={line.credit || ''}
                            onChange={(e) => updateLine(i, 'credit', parseFloat(e.target.value) || 0)}
                            className="input py-1 px-2 text-xs text-right" />
                        </td>
                        <td className="px-1">
                          <button onClick={() => lines.length > 2 && setLines(lines.filter((_, j) => j !== i))}
                            className="p-1 text-content-muted hover:text-status-error"><X className="w-3 h-3" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-surface-input border-t-2 border-surface-border">
                    <tr>
                      <td colSpan={2} className="px-3 py-2">
                        <button onClick={() => setLines([...lines, { account_code: '', account_name: '', debit: 0, credit: 0 }])}
                          className="text-xs text-content-brand flex items-center gap-1">
                          <Plus className="w-3 h-3" /> Ligne
                        </button>
                      </td>
                      <td className={`px-3 py-2 text-xs font-bold text-right ${expBalanced ? 'text-status-success' : 'text-status-error'}`}>
                        {formatCurrency(expTotalDebit, currency)}
                      </td>
                      <td className={`px-3 py-2 text-xs font-bold text-right ${expBalanced ? 'text-status-success' : 'text-status-error'}`}>
                        {formatCurrency(expTotalCredit, currency)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {!expBalanced && expTotalDebit > 0 && (
                <p className="text-xs text-status-error flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Écart : {formatCurrency(Math.abs(expTotalDebit - expTotalCredit), currency)}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 p-4 border-t border-surface-border">
          <button onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          {(!expertMode && op) && (
            <button onClick={saveGuided} disabled={saving || !amount || parseFloat(amount) <= 0 || !desc}
              className="btn-primary flex-1">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          )}
          {expertMode && (
            <button onClick={saveExpert} disabled={saving || !expBalanced} className="btn-primary flex-1">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


