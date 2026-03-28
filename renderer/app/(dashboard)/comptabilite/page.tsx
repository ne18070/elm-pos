'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, RefreshCw, Plus, Trash2, ChevronDown, ChevronRight,
  TrendingUp, TrendingDown, DollarSign, Wallet, AlertCircle,
  FileText, BarChart3, Scale, X, Home, Users, Banknote,
  Wrench, ArrowLeftRight, ChevronLeft, CheckCircle2, Settings2, Printer,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency } from '@/lib/utils';
import {
  getJournalEntries, syncAccounting, syncHotelAccounting, getTrialBalance, createManualEntry,
  deleteManualEntry, getAccounts, computeIncomeStatement, computeBalanceSheet,
} from '@services/supabase/accounting';
import type { JournalEntry, TrialBalanceLine, Account, CreateEntryInput } from '@services/supabase/accounting';

type Tab = 'dashboard' | 'journal' | 'balance' | 'etats';

type Period = 'month' | 'quarter' | 'year' | 'custom';

function getPeriod(p: Period, customFrom?: string, customTo?: string) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based

  if (p === 'month') {
    const from = new Date(y, m, 1).toISOString().slice(0, 10);
    const to   = new Date(y, m + 1, 0).toISOString().slice(0, 10);
    return { from, to };
  }
  if (p === 'quarter') {
    const q = Math.floor(m / 3);
    const from = new Date(y, q * 3, 1).toISOString().slice(0, 10);
    const to   = new Date(y, q * 3 + 3, 0).toISOString().slice(0, 10);
    return { from, to };
  }
  if (p === 'year') {
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  return { from: customFrom ?? `${y}-01-01`, to: customTo ?? new Date().toISOString().slice(0, 10) };
}

const PERIOD_LABELS: Record<Period, string> = {
  month:   'Ce mois',
  quarter: 'Ce trimestre',
  year:    'Cette année',
  custom:  'Personnalisé',
};

const CLASS_LABELS: Record<number, string> = {
  1: 'Classe 1 – Ressources durables',
  2: 'Classe 2 – Actif immobilisé',
  3: 'Classe 3 – Stocks',
  4: 'Classe 4 – Tiers',
  5: 'Classe 5 – Trésorerie',
  6: 'Classe 6 – Charges',
  7: 'Classe 7 – Produits',
  8: 'Classe 8 – Autres charges et produits',
};

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  order:      { label: 'Vente',      color: 'text-green-400 bg-green-900/20 border-green-800' },
  stock:      { label: 'Achat',      color: 'text-blue-400 bg-blue-900/20 border-blue-800' },
  refund:     { label: 'Remb.',      color: 'text-orange-400 bg-orange-900/20 border-orange-800' },
  manual:     { label: 'Manuel',     color: 'text-purple-400 bg-purple-900/20 border-purple-800' },
  hotel:      { label: 'Hôtel',      color: 'text-teal-400 bg-teal-900/20 border-teal-700' },
  adjustment: { label: 'Ajustement', color: 'text-slate-400 bg-slate-800 border-slate-700' },
};

// ─── Templates d'opérations guidées ──────────────────────────────────────────

type PaySide = 'caisse' | 'banque' | 'mobile';

interface OpTemplate {
  id: string;
  label: string;
  desc: string;
  icon: React.ElementType;
  category: string;
  defaultDesc: string;
  /** si true, l'utilisateur choisit le moyen de paiement (côté cash) */
  hasPay?: boolean;
  /** lignes fixes (quand hasPay = false ou pour le côté non-cash) */
  debit:  { code: string; name: string };
  credit: { code: string; name: string };
}

const PAY_ACCOUNTS: Record<PaySide, { code: string; name: string }> = {
  caisse: { code: '571', name: 'Caisse' },
  banque: { code: '521', name: 'Banques – comptes courants' },
  mobile: { code: '576', name: 'Mobile Money' },
};

const OP_CATEGORIES = [
  { id: 'charges',    label: 'Charges',       icon: TrendingDown,    color: 'text-red-400 bg-red-900/20 border-red-800' },
  { id: 'tresorerie', label: 'Trésorerie',     icon: ArrowLeftRight,  color: 'text-cyan-400 bg-cyan-900/20 border-cyan-800' },
  { id: 'tiers',      label: 'Clients / Fourn.', icon: Users,         color: 'text-blue-400 bg-blue-900/20 border-blue-800' },
  { id: 'invest',     label: 'Investissement', icon: Wrench,          color: 'text-amber-400 bg-amber-900/20 border-amber-800' },
  { id: 'capital',    label: 'Capital',        icon: Banknote,        color: 'text-green-400 bg-green-900/20 border-green-800' },
] as const;

const OP_TEMPLATES: OpTemplate[] = [
  // ── Charges ──
  { id: 'loyer',       label: 'Loyer',                  desc: 'Paiement du loyer du local',      icon: Home,       category: 'charges',    defaultDesc: 'Loyer',                      hasPay: true,  debit: { code: '613', name: 'Loyers et charges locatives' },      credit: { code: '571', name: 'Caisse' } },
  { id: 'salaire',     label: 'Salaires',               desc: 'Paiement des salaires du personnel', icon: Users,   category: 'charges',    defaultDesc: 'Salaires du personnel',      hasPay: true,  debit: { code: '641', name: 'Rémunérations du personnel' },        credit: { code: '571', name: 'Caisse' } },
  { id: 'cs',          label: 'Charges sociales',       desc: 'Cotisations CNSS / sécurité sociale', icon: Users,  category: 'charges',    defaultDesc: 'Charges sociales',           hasPay: true,  debit: { code: '646', name: 'Charges sociales' },                  credit: { code: '571', name: 'Caisse' } },
  { id: 'transport',   label: 'Transport',              desc: 'Frais de livraison ou déplacement', icon: TrendingDown, category: 'charges', defaultDesc: 'Frais de transport',         hasPay: true,  debit: { code: '611', name: 'Transports sur achats' },             credit: { code: '571', name: 'Caisse' } },
  { id: 'telephone',   label: 'Téléphone / Internet',   desc: 'Facture télécom ou internet',     icon: TrendingDown, category: 'charges',   defaultDesc: 'Frais de télécommunications', hasPay: true, debit: { code: '625', name: 'Frais de télécommunications' },       credit: { code: '571', name: 'Caisse' } },
  { id: 'publicite',   label: 'Publicité',              desc: 'Dépenses marketing ou pub',       icon: TrendingDown, category: 'charges',   defaultDesc: 'Publicité',                  hasPay: true,  debit: { code: '621', name: 'Publicité, publications' },           credit: { code: '571', name: 'Caisse' } },
  { id: 'frais_banque',label: 'Frais bancaires',        desc: 'Commissions et agios bancaires',  icon: TrendingDown, category: 'charges',   defaultDesc: 'Frais bancaires',            hasPay: false, debit: { code: '631', name: 'Frais bancaires' },                   credit: { code: '521', name: 'Banques – comptes courants' } },
  { id: 'impots',      label: 'Impôts / Taxes',         desc: 'Paiement d\'impôts ou taxes',     icon: TrendingDown, category: 'charges',   defaultDesc: 'Impôts et taxes',            hasPay: true,  debit: { code: '444', name: 'État – impôts et taxes divers' },     credit: { code: '571', name: 'Caisse' } },
  { id: 'autre_charge',label: 'Autre dépense',          desc: 'Toute autre dépense courante',    icon: TrendingDown, category: 'charges',   defaultDesc: 'Autre dépense',              hasPay: true,  debit: { code: '628', name: 'Divers services extérieurs' },        credit: { code: '571', name: 'Caisse' } },
  // ── Trésorerie ──
  { id: 'depot_banque',  label: 'Dépôt en banque',      desc: 'Verser des espèces à la banque',  icon: ArrowLeftRight, category: 'tresorerie', defaultDesc: 'Dépôt espèces en banque',  hasPay: false, debit: { code: '521', name: 'Banques – comptes courants' }, credit: { code: '571', name: 'Caisse' } },
  { id: 'retrait_banque',label: 'Retrait bancaire',      desc: 'Retirer des espèces de la banque', icon: ArrowLeftRight, category: 'tresorerie', defaultDesc: 'Retrait bancaire',       hasPay: false, debit: { code: '571', name: 'Caisse' },                     credit: { code: '521', name: 'Banques – comptes courants' } },
  { id: 'depot_mobile',  label: 'Dépôt Mobile Money',   desc: 'Verser des espèces en mobile money', icon: ArrowLeftRight, category: 'tresorerie', defaultDesc: 'Dépôt Mobile Money',  hasPay: false, debit: { code: '576', name: 'Mobile Money' },                credit: { code: '571', name: 'Caisse' } },
  { id: 'retrait_mobile',label: 'Retrait Mobile Money',  desc: 'Recevoir des espèces du mobile money', icon: ArrowLeftRight, category: 'tresorerie', defaultDesc: 'Retrait Mobile Money', hasPay: false, debit: { code: '571', name: 'Caisse' },                   credit: { code: '576', name: 'Mobile Money' } },
  // ── Clients / Fournisseurs ──
  { id: 'paiement_fourn',   label: 'Paiement fournisseur', desc: 'Régler une facture fournisseur', icon: Users,  category: 'tiers', defaultDesc: 'Paiement fournisseur', hasPay: true,  debit: { code: '401', name: 'Fournisseurs' },              credit: { code: '571', name: 'Caisse' } },
  { id: 'encaissement_cli', label: 'Encaissement client',  desc: 'Recevoir un paiement client',    icon: Users,  category: 'tiers', defaultDesc: 'Encaissement client',  hasPay: false, debit: { code: '571', name: 'Caisse' },                    credit: { code: '411', name: 'Clients' } },
  { id: 'avance_fourn',     label: 'Avance fournisseur',   desc: 'Verser une avance à un fournisseur', icon: Users, category: 'tiers', defaultDesc: 'Avance fournisseur', hasPay: true, debit: { code: '481', name: 'Fournisseurs – avances versées' }, credit: { code: '571', name: 'Caisse' } },
  // ── Investissement ──
  { id: 'achat_materiel',  label: 'Achat matériel',         desc: 'Machines, équipements…',          icon: Wrench, category: 'invest', defaultDesc: 'Achat de matériel',           hasPay: true,  debit: { code: '241', name: 'Matériel et outillage industriel' },  credit: { code: '571', name: 'Caisse' } },
  { id: 'achat_mobilier',  label: 'Mobilier / agencement',  desc: 'Tables, chaises, rayonnages…',    icon: Wrench, category: 'invest', defaultDesc: 'Achat mobilier',              hasPay: true,  debit: { code: '245', name: 'Mobilier et agencement' },            credit: { code: '571', name: 'Caisse' } },
  { id: 'achat_info',      label: 'Matériel informatique',  desc: 'Ordinateur, imprimante…',         icon: Wrench, category: 'invest', defaultDesc: 'Achat matériel informatique', hasPay: true,  debit: { code: '244', name: 'Matériel de bureau et informatique' }, credit: { code: '571', name: 'Caisse' } },
  { id: 'achat_vehicule',  label: 'Véhicule',               desc: 'Voiture, moto, camion…',          icon: Wrench, category: 'invest', defaultDesc: 'Achat véhicule',              hasPay: true,  debit: { code: '248', name: 'Matériel de transport' },             credit: { code: '571', name: 'Caisse' } },
  // ── Capital ──
  { id: 'apport',   label: 'Apport en capital',      desc: 'Le propriétaire apporte des fonds', icon: Banknote, category: 'capital', defaultDesc: 'Apport en capital', hasPay: false, debit: { code: '571', name: 'Caisse' }, credit: { code: '101', name: 'Capital social' } },
  { id: 'emprunt',  label: 'Réception d\'emprunt',   desc: 'Réception d\'un prêt bancaire',     icon: Banknote, category: 'capital', defaultDesc: 'Emprunt bancaire',  hasPay: false, debit: { code: '521', name: 'Banques – comptes courants' }, credit: { code: '161', name: 'Emprunts' } },
  { id: 'rembours', label: 'Remboursement emprunt',  desc: 'Mensualité d\'un emprunt',          icon: Banknote, category: 'capital', defaultDesc: 'Remboursement emprunt', hasPay: false, debit: { code: '161', name: 'Emprunts' }, credit: { code: '521', name: 'Banques – comptes courants' } },
];

// ─── Modal nouvelle écriture ──────────────────────────────────────────────────

function NewEntryModal({
  accounts,
  businessId,
  currency,
  onClose,
  onSaved,
}: {
  accounts: Account[];
  businessId: string;
  currency?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { success, error: notifErr } = useNotificationStore();
  const [saving, setSaving]   = useState(false);
  const [expertMode, setExpertMode] = useState(false);

  // ── Mode guidé ──
  const [category, setCategory] = useState<string | null>(null);
  const [op, setOp]             = useState<OpTemplate | null>(null);
  const [amount, setAmount]     = useState('');
  const [paySide, setPaySide]   = useState<PaySide>('caisse');
  const [date, setDate]         = useState(new Date().toISOString().slice(0, 10));
  const [desc, setDesc]         = useState('');

  // ── Mode expert ──
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));
  const [expRef, setExpRef]   = useState('');
  const [expDesc, setExpDesc] = useState('');
  const [lines, setLines]     = useState([
    { account_code: '', account_name: '', debit: 0, credit: 0 },
    { account_code: '', account_name: '', debit: 0, credit: 0 },
  ]);

  // Quand on choisit une opération, pré-remplir le libellé
  function selectOp(tmpl: OpTemplate) {
    setOp(tmpl);
    setDesc(tmpl.defaultDesc);
    setAmount('');
  }

  function back() {
    if (op) { setOp(null); return; }
    setCategory(null);
  }

  // Lignes prévisualisées pour le mode guidé
  function buildGuidedLines(tmpl: OpTemplate, amt: number, pay: PaySide) {
    const payAcct = PAY_ACCOUNTS[pay];
    const debitAcct  = tmpl.hasPay && tmpl.debit.code  === '571' ? payAcct : tmpl.debit;
    const creditAcct = tmpl.hasPay && tmpl.credit.code === '571' ? payAcct : tmpl.credit;
    return [
      { account_code: debitAcct.code,  account_name: debitAcct.name,  debit: amt, credit: 0 },
      { account_code: creditAcct.code, account_name: creditAcct.name, debit: 0, credit: amt },
    ];
  }

  // ── Save guided ──
  async function saveGuided() {
    const amt = parseFloat(amount);
    if (!op) return;
    if (!desc.trim()) return notifErr('Libellé requis');
    if (!amt || amt <= 0) return notifErr('Montant invalide');

    setSaving(true);
    try {
      await createManualEntry({
        businessId,
        entry_date:  date,
        description: desc,
        lines: buildGuidedLines(op, amt, paySide),
      });
      success('Écriture enregistrée');
      onSaved();
    } catch (err) { notifErr(String(err)); }
    finally { setSaving(false); }
  }

  // ── Save expert ──
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
    if (!expBalanced) return notifErr('L\'écriture doit être équilibrée (Débit = Crédit)');
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

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <div className="flex items-center gap-2">
            {!expertMode && (category || op) && (
              <button onClick={back} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover">
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-base font-bold text-white">
              {expertMode ? 'Écriture comptable (expert)' :
               op ? op.label :
               category ? OP_CATEGORIES.find(c => c.id === category)?.label :
               'Que s\'est-il passé ?'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpertMode((v) => !v)}
              className="text-xs flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
              title="Basculer en mode expert (comptes débit/crédit)"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{expertMode ? 'Mode simple' : 'Mode expert'}</span>
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ══ MODE GUIDÉ ══ */}
          {!expertMode && (
            <div className="p-4 space-y-4">

              {/* Étape 1 : choisir la catégorie */}
              {!category && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {OP_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setCategory(cat.id)}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all hover:scale-[1.02] ${cat.color}`}
                      >
                        <Icon className="w-6 h-6" />
                        <span className="text-sm font-medium text-white">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Étape 2 : choisir l'opération */}
              {category && !op && (
                <div className="space-y-2">
                  {catOps.map((tmpl) => {
                    const Icon = tmpl.icon;
                    return (
                      <button
                        key={tmpl.id}
                        onClick={() => selectOp(tmpl)}
                        className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-surface-border hover:border-brand-600 hover:bg-brand-600/10 text-left transition-all group"
                      >
                        <div className="w-9 h-9 rounded-xl bg-surface-input flex items-center justify-center shrink-0 group-hover:bg-brand-600/20">
                          <Icon className="w-4 h-4 text-slate-400 group-hover:text-brand-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-white text-sm">{tmpl.label}</p>
                          <p className="text-xs text-slate-500 truncate">{tmpl.desc}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-brand-400 ml-auto shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Étape 3 : saisir les détails */}
              {op && (
                <div className="space-y-4">
                  {/* Description opération */}
                  <div className="p-3 rounded-xl bg-surface-input flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-brand-400 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-white">{op.label}</p>
                      <p className="text-xs text-slate-500">{op.desc}</p>
                    </div>
                  </div>

                  {/* Montant */}
                  <div>
                    <label className="label">Montant *</label>
                    <div className="relative">
                      <input
                        type="number" min="0" step="0.01" autoFocus
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0"
                        className="input text-xl font-bold text-white text-right pr-16"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">
                        {currency ?? 'XOF'}
                      </span>
                    </div>
                  </div>

                  {/* Moyen de paiement (si applicable) */}
                  {op.hasPay && (
                    <div>
                      <label className="label">Payé via</label>
                      <div className="flex gap-2">
                        {(['caisse', 'banque', 'mobile'] as PaySide[]).map((p) => (
                          <button
                            key={p}
                            onClick={() => setPaySide(p)}
                            className={`flex-1 py-2 px-3 rounded-xl border text-sm font-medium transition-colors capitalize ${
                              paySide === p
                                ? 'bg-brand-600 border-brand-500 text-white'
                                : 'border-surface-border text-slate-400 hover:text-white hover:bg-surface-hover'
                            }`}
                          >
                            {p === 'caisse' ? '💵 Caisse' : p === 'banque' ? '🏦 Banque' : '📱 Mobile'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Date */}
                  <div>
                    <label className="label">Date</label>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
                  </div>

                  {/* Libellé */}
                  <div>
                    <label className="label">Note / précision</label>
                    <input
                      type="text" value={desc} onChange={(e) => setDesc(e.target.value)}
                      placeholder={op.defaultDesc} className="input"
                    />
                  </div>

                  {/* Prévisualisation des écritures */}
                  {previewLines && (
                    <div className="rounded-xl border border-surface-border overflow-hidden">
                      <div className="px-3 py-2 bg-surface-input border-b border-surface-border">
                        <p className="text-xs text-slate-400 uppercase tracking-wide">Écriture générée automatiquement</p>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-500 border-b border-surface-border">
                            <th className="px-3 py-2 text-left">Compte</th>
                            <th className="px-3 py-2 text-left">Intitulé</th>
                            <th className="px-3 py-2 text-right">Débit</th>
                            <th className="px-3 py-2 text-right">Crédit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewLines.map((l, i) => (
                            <tr key={i} className="border-b border-surface-border last:border-0">
                              <td className="px-3 py-2 font-mono text-brand-400">{l.account_code}</td>
                              <td className="px-3 py-2 text-slate-300">{l.account_name}</td>
                              <td className="px-3 py-2 text-right text-white font-mono">
                                {l.debit > 0 ? formatCurrency(l.debit, currency) : ''}
                              </td>
                              <td className="px-3 py-2 text-right text-white font-mono">
                                {l.credit > 0 ? formatCurrency(l.credit, currency) : ''}
                              </td>
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

          {/* ══ MODE EXPERT ══ */}
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
                  <thead className="bg-surface-input text-xs text-slate-400 uppercase border-b border-surface-border">
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
                            {accounts.map((a) => <option key={a.code} value={a.code}>{a.code} – {a.name}</option>)}
                          </datalist>
                        </td>
                        <td className="px-1.5 py-1.5">
                          <input value={line.account_name} onChange={(e) => updateLine(i, 'account_name', e.target.value)}
                            placeholder="Intitulé" className="input py-1 px-2 text-xs" />
                        </td>
                        <td className="px-1.5 py-1.5">
                          <input type="number" min="0" step="0.01" value={line.debit || ''}
                            onChange={(e) => updateLine(i, 'debit', parseFloat(e.target.value) || 0)}
                            className="input py-1 px-2 text-xs text-right" />
                        </td>
                        <td className="px-1.5 py-1.5">
                          <input type="number" min="0" step="0.01" value={line.credit || ''}
                            onChange={(e) => updateLine(i, 'credit', parseFloat(e.target.value) || 0)}
                            className="input py-1 px-2 text-xs text-right" />
                        </td>
                        <td className="px-1">
                          <button onClick={() => lines.length > 2 && setLines(lines.filter((_, j) => j !== i))}
                            className="p-1 text-slate-600 hover:text-red-400"><X className="w-3 h-3" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-surface-input border-t-2 border-surface-border">
                    <tr>
                      <td colSpan={2} className="px-3 py-2">
                        <button onClick={() => setLines([...lines, { account_code: '', account_name: '', debit: 0, credit: 0 }])}
                          className="text-xs text-brand-400 flex items-center gap-1">
                          <Plus className="w-3 h-3" /> Ligne
                        </button>
                      </td>
                      <td className={`px-3 py-2 text-xs font-bold text-right ${expBalanced ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(expTotalDebit, currency)}
                      </td>
                      <td className={`px-3 py-2 text-xs font-bold text-right ${expBalanced ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(expTotalCredit, currency)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {!expBalanced && expTotalDebit > 0 && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Écart : {formatCurrency(Math.abs(expTotalDebit - expTotalCredit), currency)}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
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

// ─── Composant principal ───────────────────────────────────────────────────────

export default function ComptabilitePage() {
  const { business } = useAuthStore();
  const { success, error: notifErr } = useNotificationStore();

  const [tab, setTab]               = useState<Tab>('dashboard');
  const [period, setPeriod]         = useState<Period>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo]     = useState('');
  const [syncing, setSyncing]       = useState(false);
  const [loading, setLoading]       = useState(false);

  const [entries, setEntries]     = useState<JournalEntry[]>([]);
  const [balance, setBalance]     = useState<TrialBalanceLine[]>([]);
  const [accounts, setAccounts]   = useState<Account[]>([]);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [showNewEntry, setShowNewEntry]   = useState(false);
  const [expandedClasses, setExpandedClasses] = useState<Set<number>>(new Set([5, 6, 7]));

  const { from, to } = getPeriod(period, customFrom, customTo);
  const currency = business?.currency;

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      const [e, b, a] = await Promise.all([
        getJournalEntries(business.id, { dateFrom: from, dateTo: to }),
        getTrialBalance(business.id, from, to),
        getAccounts(business.id),
      ]);
      setEntries(e);
      setBalance(b);
      setAccounts(a);
    } catch (err) {
      notifErr(String(err));
    } finally {
      setLoading(false);
    }
  }, [business?.id, from, to, notifErr]);

  useEffect(() => { load(); }, [load]);

  async function handleSync() {
    if (!business?.id) return;
    setSyncing(true);
    try {
      const [posCount, hotelCount] = await Promise.all([
        syncAccounting(business.id),
        business.type === 'hotel' ? syncHotelAccounting(business.id) : Promise.resolve(0),
      ]);
      const total = posCount + hotelCount;
      if (total > 0) {
        success(`${total} écriture${total > 1 ? 's' : ''} synchronisée${total > 1 ? 's' : ''}`);
        await load();
      } else {
        success('Journal à jour — aucune nouvelle écriture');
      }
    } catch (err) {
      notifErr(String(err));
    } finally {
      setSyncing(false);
    }
  }

  function handlePrint() {
    const periodLabel = period === 'custom' ? `${customFrom} → ${customTo}` : PERIOD_LABELS[period];
    const bizName = business?.name ?? 'Établissement';
    const printDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(n) + ' ' + (business?.currency ?? 'XOF');

    const TAB_TITLES: Record<Tab, string> = {
      dashboard: 'Tableau de bord',
      journal:   'Journal général',
      balance:   'Balance des comptes',
      etats:     'États financiers',
    };

    // ── Journal HTML ──
    const journalRows = entries.map((e) => {
      const src = SOURCE_LABELS[e.source]?.label ?? 'Manuel';
      const linesHtml = (e.lines ?? []).map((l) => `
        <tr style="background:#f9fafb">
          <td></td>
          <td style="padding:2px 8px;font-family:monospace;color:#6366f1;font-size:11px">${l.account_code}</td>
          <td style="padding:2px 8px;font-size:11px;color:#555;font-style:italic">${l.account_name}</td>
          <td style="padding:2px 8px;text-align:right;font-family:monospace;font-size:11px">${l.debit > 0 ? fmt(l.debit) : ''}</td>
          <td style="padding:2px 8px;text-align:right;font-family:monospace;font-size:11px">${l.credit > 0 ? fmt(l.credit) : ''}</td>
        </tr>`).join('');
      const total = (e.lines ?? []).reduce((s, l) => s + l.debit, 0);
      return `
        <tr>
          <td style="padding:5px 8px;font-size:12px;color:#888">${e.entry_date}</td>
          <td style="padding:5px 8px;font-family:monospace;font-size:11px;color:#888">${e.reference ?? ''}</td>
          <td style="padding:5px 8px;font-size:12px;font-weight:600">${e.description}</td>
          <td style="padding:5px 8px"><span style="font-size:10px;background:#e0e7ff;color:#4338ca;padding:1px 6px;border-radius:9px">${src}</span></td>
          <td style="padding:5px 8px;text-align:right;font-family:monospace;font-size:12px">${total > 0 ? fmt(total) : ''}</td>
        </tr>${linesHtml}`;
    }).join('');

    // ── Balance HTML ──
    const balanceRows = byClass.map(({ cls, rows, totalDebit, totalCredit }) => {
      const header = `<tr style="background:#1e293b;color:#94a3b8">
        <td colspan="5" style="padding:6px 8px;font-weight:700;font-size:11px;letter-spacing:.05em;text-transform:uppercase">
          ${CLASS_LABELS[cls] ?? `Classe ${cls}`}
        </td></tr>`;
      const detail = rows.map((r) => {
        const solde = r.total_debit - r.total_credit;
        return `<tr>
          <td style="padding:4px 8px;font-family:monospace;font-size:11px;color:#4f46e5">${r.account_code}</td>
          <td style="padding:4px 8px;font-size:11px">${r.account_name}</td>
          <td style="padding:4px 8px;text-align:right;font-family:monospace;font-size:11px">${r.total_debit > 0 ? fmt(r.total_debit) : ''}</td>
          <td style="padding:4px 8px;text-align:right;font-family:monospace;font-size:11px">${r.total_credit > 0 ? fmt(r.total_credit) : ''}</td>
          <td style="padding:4px 8px;text-align:right;font-family:monospace;font-size:11px;color:${solde > 0 ? '#16a34a' : solde < 0 ? '#dc2626' : '#888'}">
            ${solde !== 0 ? fmt(Math.abs(solde)) + (solde > 0 ? ' D' : ' C') : '—'}
          </td>
        </tr>`;
      }).join('');
      const foot = `<tr style="background:#f1f5f9;font-weight:700">
        <td colspan="2" style="padding:4px 8px;font-size:11px">Sous-total Classe ${cls}</td>
        <td style="padding:4px 8px;text-align:right;font-family:monospace;font-size:11px">${fmt(totalDebit)}</td>
        <td style="padding:4px 8px;text-align:right;font-family:monospace;font-size:11px">${fmt(totalCredit)}</td>
        <td></td>
      </tr>`;
      return header + detail + foot;
    }).join('');

    // ── États financiers HTML ──
    const plRows = [
      ['Ventes de marchandises (701)',    is.ventesGross,        false],
      ['RRR accordés (7091)',             -is.rrrAccordes,       true],
      ['CHIFFRE D\'AFFAIRES NET',         is.caNet,              false, true],
      ['Achats de marchandises (601)',    -is.achatsMarchandises, true],
      ['MARGE BRUTE',                     is.margeBrute,         false, true],
      ['Autres charges (6xx)',            -is.autresCharges,      true],
      ['RÉSULTAT D\'EXPLOITATION',        is.resultatExpl,       false, true],
      ['Produits financiers',             is.produitsFinanciers,  true],
      ['Charges financières (661)',       -is.chargesFinancieres, true],
      ['RÉSULTAT AVANT IMPÔT',            is.resultatAvantImpot, false, true],
      ['Impôts sur résultat (691)',       -is.impots,             true],
      ['RÉSULTAT NET',                    is.resultatNet,        false, true, true],
    ] as [string, number, boolean, boolean?, boolean?][];

    const plHtml = plRows.map(([label, val, indent, bold, big]) => `
      <tr style="${bold ? 'background:#f8fafc;' : ''}">
        <td style="padding:${big ? '6' : '4'}px 8px;${indent ? 'padding-left:24px;' : ''}font-size:${big ? '13' : '12'}px;${bold ? 'font-weight:700;' : ''}">${label}</td>
        <td style="padding:${big ? '6' : '4'}px 8px;text-align:right;font-family:monospace;font-size:${big ? '13' : '12'}px;${bold ? 'font-weight:700;' : ''}color:${val >= 0 ? (bold ? '#15803d' : '#222') : '#dc2626'}">
          ${val !== 0 ? fmt(val) : '—'}
        </td>
      </tr>`).join('');

    const bsActif = [
      ['Actif immobilisé (Cl. 2)', bs.actifImmobilise],
      ['Stocks (Cl. 3)',           bs.stocks],
      ['Clients (411)',            bs.creancesClients],
      ['TVA récupérable (4451)',   bs.tvaRecuperable],
      ['Autres actifs CT',         bs.autresActifCT],
      ['Trésorerie (521+571+576)', bs.tresorerie],
    ] as [string, number][];

    const bsPassif = [
      ['Capitaux propres (Cl. 1)', bs.capitaux],
      ['Emprunts (161)',           bs.dettesLT],
      ['Fournisseurs (401)',       bs.dettesFF],
      ['Dettes fiscales',          bs.dettesFiscales],
      ['Dettes sociales',          bs.dettesSociales],
      ['Autres dettes CT',         bs.autresDettesCT],
    ] as [string, number][];

    const bsHtml = `
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#1e293b;color:#94a3b8">
          <th style="padding:6px 8px;text-align:left;font-size:11px">ACTIF</th>
          <th style="padding:6px 8px;text-align:right;font-size:11px">Montant</th>
          <th style="padding:6px 8px;text-align:left;font-size:11px">PASSIF</th>
          <th style="padding:6px 8px;text-align:right;font-size:11px">Montant</th>
        </tr></thead>
        <tbody>
          ${bsActif.map(([l, v], i) => `<tr>
            <td style="padding:4px 8px;font-size:11px">${l}</td>
            <td style="padding:4px 8px;text-align:right;font-family:monospace;font-size:11px">${fmt(v)}</td>
            <td style="padding:4px 8px;font-size:11px">${bsPassif[i]?.[0] ?? ''}</td>
            <td style="padding:4px 8px;text-align:right;font-family:monospace;font-size:11px">${bsPassif[i] ? fmt(bsPassif[i][1]) : ''}</td>
          </tr>`).join('')}
          <tr style="background:#f1f5f9;font-weight:700">
            <td style="padding:5px 8px;font-size:12px">TOTAL ACTIF</td>
            <td style="padding:5px 8px;text-align:right;font-family:monospace;font-size:12px">${fmt(bs.totalActif)}</td>
            <td style="padding:5px 8px;font-size:12px">TOTAL PASSIF</td>
            <td style="padding:5px 8px;text-align:right;font-family:monospace;font-size:12px">${fmt(bs.totalPassif)}</td>
          </tr>
        </tbody>
      </table>`;

    // ── Contenu selon l'onglet ──
    let body = '';
    if (tab === 'journal' || tab === 'dashboard') {
      body = `
        <h2 style="font-size:14px;font-weight:700;margin:16px 0 8px;color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:4px">Journal général</h2>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:#1e293b;color:#94a3b8">
            <th style="padding:6px 8px;text-align:left">Date</th>
            <th style="padding:6px 8px;text-align:left">Réf.</th>
            <th style="padding:6px 8px;text-align:left">Libellé</th>
            <th style="padding:6px 8px;text-align:left">Type</th>
            <th style="padding:6px 8px;text-align:right">Montant</th>
          </thead><tbody>${journalRows}</tbody>
        </table>`;
    }
    if (tab === 'balance' || tab === 'dashboard') {
      body += `
        <h2 style="font-size:14px;font-weight:700;margin:24px 0 8px;color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:4px">Balance des comptes</h2>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:#1e293b;color:#94a3b8">
            <th style="padding:6px 8px;text-align:left">Compte</th>
            <th style="padding:6px 8px;text-align:left">Intitulé</th>
            <th style="padding:6px 8px;text-align:right">Débit</th>
            <th style="padding:6px 8px;text-align:right">Crédit</th>
            <th style="padding:6px 8px;text-align:right">Solde</th>
          </thead><tbody>${balanceRows}</tbody>
        </table>`;
    }
    if (tab === 'etats' || tab === 'dashboard') {
      body += `
        <h2 style="font-size:14px;font-weight:700;margin:24px 0 8px;color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:4px">Compte de résultat</h2>
        <table style="width:50%;border-collapse:collapse;font-size:12px">
          <tbody>${plHtml}</tbody>
        </table>
        <h2 style="font-size:14px;font-weight:700;margin:24px 0 8px;color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:4px">Bilan simplifié</h2>
        ${bsHtml}`;
    }

    const html = `<!DOCTYPE html>
<html lang="fr"><head>
  <meta charset="UTF-8">
  <title>Comptabilité – ${bizName}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 0; padding: 24px 32px; font-size: 12px; }
    table { border-collapse: collapse; }
    tr { border-bottom: 1px solid #e2e8f0; }
    @media print { body { padding: 12px 18px; } }
  </style>
</head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:12px;border-bottom:3px solid #4f46e5">
    <div>
      <h1 style="font-size:20px;font-weight:800;color:#1e293b;margin:0">${bizName}</h1>
      <p style="font-size:12px;color:#64748b;margin:2px 0 0">Comptabilité OHADA – SYSCOHADA Révisé</p>
    </div>
    <div style="text-align:right">
      <p style="font-size:13px;font-weight:700;color:#4f46e5;margin:0">${TAB_TITLES[tab]}</p>
      <p style="font-size:11px;color:#64748b;margin:2px 0 0">Période : ${periodLabel}</p>
      <p style="font-size:11px;color:#64748b;margin:0">Édité le ${printDate}</p>
    </div>
  </div>
  ${body}
  <p style="margin-top:32px;font-size:10px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:8px">
    Document généré par ${bizName} · Elm POS · ${printDate}
  </p>
</body></html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 400);
  }

  async function handleDeleteEntry(id: string) {
    if (!confirm('Supprimer cette écriture manuelle ?')) return;
    try {
      await deleteManualEntry(id);
      success('Écriture supprimée');
      await load();
    } catch (err) {
      notifErr(String(err));
    }
  }

  function toggleClass(c: number) {
    setExpandedClasses((prev) => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });
  }

  // ── KPIs depuis la balance ──
  const is = computeIncomeStatement(balance);
  const bs = computeBalanceSheet(balance);

  // ── Comptes regroupés par classe (balance tab) ──
  const byClass = Array.from(new Set(balance.map((r) => r.class_num))).sort().map((cls) => ({
    cls,
    rows: balance.filter((r) => r.class_num === cls),
    totalDebit:  balance.filter((r) => r.class_num === cls).reduce((s, r) => s + r.total_debit, 0),
    totalCredit: balance.filter((r) => r.class_num === cls).reduce((s, r) => s + r.total_credit, 0),
  }));

  // ── Tabs ──
  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard', label: 'Tableau de bord', icon: BarChart3 },
    { id: 'journal',   label: 'Journal',         icon: BookOpen },
    { id: 'balance',   label: 'Balance',          icon: Scale },
    { id: 'etats',     label: 'États financiers', icon: FileText },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-surface-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-white">Comptabilité OHADA</h1>
            <p className="text-xs text-slate-500 mt-0.5">SYSCOHADA Révisé – Journal général et états financiers</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Sélecteur période */}
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className="input py-1.5 text-sm"
            >
              {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
              ))}
            </select>
            {period === 'custom' && (
              <>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="input py-1.5 text-sm" />
                <input type="date" value={customTo}   onChange={(e) => setCustomTo(e.target.value)}   className="input py-1.5 text-sm" />
              </>
            )}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="btn-secondary flex items-center gap-2 py-1.5"
              title="Synchroniser les ventes et achats vers le journal"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Synchroniser</span>
            </button>
            <button
              onClick={handlePrint}
              className="btn-secondary flex items-center gap-2 py-1.5"
              title="Imprimer le rapport"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Imprimer</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                tab === id
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-surface-hover'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="text-slate-400 text-center py-16">Chargement…</div>
        ) : (
          <>
            {/* ── Tableau de bord ── */}
            {tab === 'dashboard' && (
              <div className="space-y-6">
                {/* KPI cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="card p-5">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 rounded-xl bg-green-900/20 text-green-400">
                        <TrendingUp className="w-5 h-5" />
                      </div>
                      <span className="text-xs text-slate-400 uppercase tracking-wide">Chiffre d'affaires</span>
                    </div>
                    <p className="text-2xl font-bold text-white">{formatCurrency(is.caNet, currency)}</p>
                    {is.rrrAccordes > 0 && (
                      <p className="text-xs text-slate-500 mt-1">Brut : {formatCurrency(is.ventesGross, currency)} – Remises : {formatCurrency(is.rrrAccordes, currency)}</p>
                    )}
                  </div>

                  <div className="card p-5">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 rounded-xl bg-red-900/20 text-red-400">
                        <TrendingDown className="w-5 h-5" />
                      </div>
                      <span className="text-xs text-slate-400 uppercase tracking-wide">Charges totales</span>
                    </div>
                    <p className="text-2xl font-bold text-white">
                      {formatCurrency(is.achatsMarchandises + is.autresCharges, currency)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Achats : {formatCurrency(is.achatsMarchandises, currency)}
                    </p>
                  </div>

                  <div className="card p-5">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 rounded-xl ${is.resultatNet >= 0 ? 'bg-brand-900/20 text-brand-400' : 'bg-red-900/20 text-red-400'}`}>
                        <DollarSign className="w-5 h-5" />
                      </div>
                      <span className="text-xs text-slate-400 uppercase tracking-wide">Résultat net</span>
                    </div>
                    <p className={`text-2xl font-bold ${is.resultatNet >= 0 ? 'text-brand-400' : 'text-red-400'}`}>
                      {formatCurrency(is.resultatNet, currency)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Marge brute : {formatCurrency(is.margeBrute, currency)}
                    </p>
                  </div>

                  <div className="card p-5">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 rounded-xl bg-cyan-900/20 text-cyan-400">
                        <Wallet className="w-5 h-5" />
                      </div>
                      <span className="text-xs text-slate-400 uppercase tracking-wide">Trésorerie</span>
                    </div>
                    <p className="text-2xl font-bold text-white">{formatCurrency(bs.tresorerie, currency)}</p>
                    <p className="text-xs text-slate-500 mt-1">Caisse + Banque + Mobile</p>
                  </div>
                </div>

                {/* Dernières écritures */}
                <div className="card overflow-hidden">
                  <div className="px-5 py-4 border-b border-surface-border">
                    <h2 className="font-semibold text-white">Dernières écritures ({entries.length})</h2>
                  </div>
                  {entries.length === 0 ? (
                    <div className="p-8 text-center">
                      <BookOpen className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                      <p className="text-slate-400 text-sm">Aucune écriture pour cette période.</p>
                      <p className="text-slate-500 text-xs mt-1">Cliquez sur <strong className="text-white">Synchroniser</strong> pour importer les ventes et achats.</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="text-xs text-slate-400 uppercase border-b border-surface-border">
                        <tr>
                          <th className="px-5 py-3 text-left">Date</th>
                          <th className="px-5 py-3 text-left">Libellé</th>
                          <th className="px-5 py-3 text-left hidden sm:table-cell">Type</th>
                          <th className="px-5 py-3 text-right">Montant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.slice(0, 10).map((e) => {
                          const src = SOURCE_LABELS[e.source] ?? SOURCE_LABELS.manual;
                          const amt = e.lines?.reduce((s, l) => s + l.debit, 0) / 2;
                          return (
                            <tr key={e.id} className="border-b border-surface-border last:border-0 hover:bg-surface-hover">
                              <td className="px-5 py-3 text-slate-400 whitespace-nowrap">{e.entry_date}</td>
                              <td className="px-5 py-3 text-white">
                                {e.reference && <span className="font-mono text-xs text-slate-500 mr-2">{e.reference}</span>}
                                {e.description}
                              </td>
                              <td className="px-5 py-3 hidden sm:table-cell">
                                <span className={`inline-flex text-xs px-2 py-0.5 rounded-full border font-medium ${src.color}`}>
                                  {src.label}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-right font-medium text-white">{formatCurrency(amt, currency)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* ── Journal général ── */}
            {tab === 'journal' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-400">{entries.length} écriture{entries.length !== 1 ? 's' : ''}</p>
                  <button
                    onClick={() => setShowNewEntry(true)}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Nouvelle écriture
                  </button>
                </div>

                {entries.length === 0 ? (
                  <div className="card p-8 text-center">
                    <BookOpen className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">Journal vide pour cette période.</p>
                    <p className="text-slate-500 text-xs mt-1">Cliquez sur <strong className="text-white">Synchroniser</strong> pour importer les ventes et achats.</p>
                  </div>
                ) : (
                  <div className="card overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="text-xs text-slate-400 uppercase border-b border-surface-border bg-surface-card">
                        <tr>
                          <th className="px-4 py-3 text-left w-8"></th>
                          <th className="px-4 py-3 text-left w-28">Date</th>
                          <th className="px-4 py-3 text-left hidden sm:table-cell w-24">Réf.</th>
                          <th className="px-4 py-3 text-left">Libellé</th>
                          <th className="px-4 py-3 text-left hidden md:table-cell">Type</th>
                          <th className="px-4 py-3 text-right">Débit</th>
                          <th className="px-4 py-3 text-right">Crédit</th>
                          <th className="px-4 py-3 w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((e, i) => {
                          const src = SOURCE_LABELS[e.source] ?? SOURCE_LABELS.manual;
                          const totalDebit  = e.lines?.reduce((s, l) => s + l.debit, 0) ?? 0;
                          const totalCredit = e.lines?.reduce((s, l) => s + l.credit, 0) ?? 0;
                          const isOpen      = expandedEntry === e.id;
                          return (
                            <>
                              <tr
                                key={e.id}
                                className={`border-b border-surface-border hover:bg-surface-hover cursor-pointer ${i % 2 === 0 ? '' : 'bg-surface-card/30'}`}
                                onClick={() => setExpandedEntry(isOpen ? null : e.id)}
                              >
                                <td className="px-3 py-3 text-slate-500">
                                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </td>
                                <td className="px-4 py-3 text-slate-400 whitespace-nowrap font-mono text-xs">{e.entry_date}</td>
                                <td className="px-4 py-3 text-slate-500 font-mono text-xs hidden sm:table-cell">{e.reference ?? '—'}</td>
                                <td className="px-4 py-3 text-white max-w-[200px] truncate">{e.description}</td>
                                <td className="px-4 py-3 hidden md:table-cell">
                                  <span className={`inline-flex text-xs px-2 py-0.5 rounded-full border font-medium ${src.color}`}>
                                    {src.label}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-sm text-white">{formatCurrency(totalDebit, currency)}</td>
                                <td className="px-4 py-3 text-right font-mono text-sm text-white">{formatCurrency(totalCredit, currency)}</td>
                                <td className="px-3 py-3">
                                  {e.source === 'manual' && (
                                    <button
                                      onClick={(ev) => { ev.stopPropagation(); handleDeleteEntry(e.id); }}
                                      className="p-1.5 text-slate-600 hover:text-red-400 rounded-lg hover:bg-red-900/20"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                              {isOpen && e.lines?.map((line, li) => (
                                <tr key={li} className="bg-surface-input/50 border-b border-surface-border">
                                  <td></td>
                                  <td colSpan={2} className="px-4 py-2 font-mono text-xs text-brand-400">{line.account_code}</td>
                                  <td className="px-4 py-2 text-xs text-slate-300 italic">{line.account_name}</td>
                                  <td className="hidden md:table-cell"></td>
                                  <td className="px-4 py-2 text-right font-mono text-xs text-white">
                                    {line.debit > 0 ? formatCurrency(line.debit, currency) : ''}
                                  </td>
                                  <td className="px-4 py-2 text-right font-mono text-xs text-white">
                                    {line.credit > 0 ? formatCurrency(line.credit, currency) : ''}
                                  </td>
                                  <td></td>
                                </tr>
                              ))}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Balance des comptes ── */}
            {tab === 'balance' && (
              <div className="space-y-3">
                {byClass.length === 0 ? (
                  <div className="card p-8 text-center">
                    <Scale className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm">Aucun mouvement pour cette période.</p>
                  </div>
                ) : (
                  <>
                    {byClass.map(({ cls, rows, totalDebit, totalCredit }) => (
                      <div key={cls} className="card overflow-hidden">
                        <button
                          onClick={() => toggleClass(cls)}
                          className="w-full flex items-center justify-between px-5 py-3 hover:bg-surface-hover transition-colors"
                        >
                          <span className="font-semibold text-white text-sm">
                            {CLASS_LABELS[cls] ?? `Classe ${cls}`}
                          </span>
                          <div className="flex items-center gap-6">
                            <span className="text-xs text-slate-400 hidden sm:block">
                              D : {formatCurrency(totalDebit, currency)} | C : {formatCurrency(totalCredit, currency)}
                            </span>
                            {expandedClasses.has(cls) ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                          </div>
                        </button>
                        {expandedClasses.has(cls) && (
                          <div className="border-t border-surface-border">
                            <table className="w-full text-sm">
                              <thead className="text-xs text-slate-500 uppercase bg-surface-input">
                                <tr>
                                  <th className="px-4 py-2 text-left w-24">Compte</th>
                                  <th className="px-4 py-2 text-left">Intitulé</th>
                                  <th className="px-4 py-2 text-right">Débit</th>
                                  <th className="px-4 py-2 text-right">Crédit</th>
                                  <th className="px-4 py-2 text-right hidden sm:table-cell">Solde D</th>
                                  <th className="px-4 py-2 text-right hidden sm:table-cell">Solde C</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((row) => {
                                  const solde = row.total_debit - row.total_credit;
                                  return (
                                    <tr key={row.account_code} className="border-t border-surface-border hover:bg-surface-hover">
                                      <td className="px-4 py-2 font-mono text-xs text-brand-400">{row.account_code}</td>
                                      <td className="px-4 py-2 text-slate-300 text-xs">{row.account_name}</td>
                                      <td className="px-4 py-2 text-right font-mono text-xs text-white">
                                        {row.total_debit > 0 ? formatCurrency(row.total_debit, currency) : ''}
                                      </td>
                                      <td className="px-4 py-2 text-right font-mono text-xs text-white">
                                        {row.total_credit > 0 ? formatCurrency(row.total_credit, currency) : ''}
                                      </td>
                                      <td className="px-4 py-2 text-right font-mono text-xs text-green-400 hidden sm:table-cell">
                                        {solde > 0 ? formatCurrency(solde, currency) : ''}
                                      </td>
                                      <td className="px-4 py-2 text-right font-mono text-xs text-red-400 hidden sm:table-cell">
                                        {solde < 0 ? formatCurrency(-solde, currency) : ''}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot className="bg-surface-input border-t-2 border-surface-border">
                                <tr>
                                  <td colSpan={2} className="px-4 py-2 text-xs font-bold text-slate-400 uppercase">Total Classe {cls}</td>
                                  <td className="px-4 py-2 text-right font-bold text-white font-mono text-xs">{formatCurrency(totalDebit, currency)}</td>
                                  <td className="px-4 py-2 text-right font-bold text-white font-mono text-xs">{formatCurrency(totalCredit, currency)}</td>
                                  <td colSpan={2} className="hidden sm:table-cell"></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Total général */}
                    <div className="card p-4 bg-brand-600/10 border-brand-700/40">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white">TOTAL GÉNÉRAL</span>
                        <div className="flex gap-8">
                          <div className="text-right">
                            <p className="text-xs text-slate-400">Total Débit</p>
                            <p className="font-bold text-white font-mono">{formatCurrency(byClass.reduce((s, c) => s + c.totalDebit, 0), currency)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-slate-400">Total Crédit</p>
                            <p className="font-bold text-white font-mono">{formatCurrency(byClass.reduce((s, c) => s + c.totalCredit, 0), currency)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── États financiers ── */}
            {tab === 'etats' && (
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Compte de résultat */}
                <div className="card overflow-hidden">
                  <div className="px-5 py-4 border-b border-surface-border bg-surface-card">
                    <h2 className="font-bold text-white">Compte de résultat</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Activités ordinaires – SYSCOHADA</p>
                  </div>
                  <div className="p-5 space-y-1">
                    {[
                      { label: 'Ventes de marchandises (701)',      val: is.ventesGross,          indent: 0, style: 'text-slate-300' },
                      { label: 'RRR accordés (7091)',               val: -is.rrrAccordes,         indent: 1, style: 'text-red-400' },
                      { label: 'CHIFFRE D\'AFFAIRES NET',          val: is.caNet,                indent: 0, style: 'font-bold text-white', separator: true },
                      { label: 'Achats de marchandises (601)',      val: -is.achatsMarchandises,  indent: 1, style: 'text-red-400' },
                      { label: 'MARGE BRUTE',                      val: is.margeBrute,           indent: 0, style: `font-semibold ${is.margeBrute >= 0 ? 'text-green-400' : 'text-red-400'}`, separator: true },
                      { label: 'Autres charges (6xx)',              val: -is.autresCharges,       indent: 1, style: 'text-red-400' },
                      { label: 'RÉSULTAT D\'EXPLOITATION',         val: is.resultatExpl,         indent: 0, style: `font-semibold ${is.resultatExpl >= 0 ? 'text-green-400' : 'text-red-400'}`, separator: true },
                      { label: 'Produits financiers',               val: is.produitsFinanciers,   indent: 1, style: 'text-slate-300' },
                      { label: 'Charges financières (661)',         val: -is.chargesFinancieres,  indent: 1, style: 'text-red-400' },
                      { label: 'RÉSULTAT AVANT IMPÔT',             val: is.resultatAvantImpot,   indent: 0, style: `font-semibold ${is.resultatAvantImpot >= 0 ? 'text-green-400' : 'text-red-400'}`, separator: true },
                      { label: 'Impôts sur résultat (691)',         val: -is.impots,              indent: 1, style: 'text-red-400' },
                      { label: 'RÉSULTAT NET',                     val: is.resultatNet,          indent: 0, style: `font-bold text-lg ${is.resultatNet >= 0 ? 'text-brand-400' : 'text-red-400'}`, separator: true },
                    ].map((row, i) => (
                      <div key={i}>
                        {row.separator && <div className="border-t border-surface-border my-2" />}
                        <div className={`flex justify-between items-center py-1 ${row.indent ? 'pl-4' : ''}`}>
                          <span className={`text-sm ${row.indent ? 'text-slate-400' : row.style}`}>{row.label}</span>
                          <span className={`font-mono text-sm ${row.style}`}>
                            {row.val !== 0 ? formatCurrency(row.val, currency) : '—'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bilan simplifié */}
                <div className="card overflow-hidden">
                  <div className="px-5 py-4 border-b border-surface-border bg-surface-card">
                    <h2 className="font-bold text-white">Bilan simplifié</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Situation patrimoniale</p>
                  </div>
                  <div className="p-5 grid grid-cols-2 gap-4">
                    {/* ACTIF */}
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">ACTIF</p>
                      {[
                        { label: 'Actif immobilisé',  val: bs.actifImmobilise },
                        { label: 'Stocks',             val: bs.stocks },
                        { label: 'Clients',            val: bs.creancesClients },
                        { label: 'TVA récupérable',    val: bs.tvaRecuperable },
                        { label: 'Autres actifs CT',   val: bs.autresActifCT },
                        { label: 'Trésorerie',         val: bs.tresorerie },
                      ].map((row, i) => (
                        <div key={i} className="flex justify-between">
                          <span className="text-xs text-slate-400">{row.label}</span>
                          <span className="text-xs font-mono text-white">{formatCurrency(row.val, currency)}</span>
                        </div>
                      ))}
                      <div className="border-t border-surface-border pt-2 flex justify-between">
                        <span className="text-sm font-bold text-white">TOTAL ACTIF</span>
                        <span className="text-sm font-bold font-mono text-brand-400">{formatCurrency(bs.totalActif, currency)}</span>
                      </div>
                    </div>

                    {/* PASSIF */}
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">PASSIF</p>
                      {[
                        { label: 'Capitaux propres',  val: bs.capitaux },
                        { label: 'Emprunts LT',       val: bs.dettesLT },
                        { label: 'Fournisseurs',       val: bs.dettesFF },
                        { label: 'Dettes fiscales',    val: bs.dettesFiscales },
                        { label: 'Dettes sociales',    val: bs.dettesSociales },
                        { label: 'Autres dettes CT',   val: bs.autresDettesCT },
                      ].map((row, i) => (
                        <div key={i} className="flex justify-between">
                          <span className="text-xs text-slate-400">{row.label}</span>
                          <span className="text-xs font-mono text-white">{formatCurrency(row.val, currency)}</span>
                        </div>
                      ))}
                      <div className="border-t border-surface-border pt-2 flex justify-between">
                        <span className="text-sm font-bold text-white">TOTAL PASSIF</span>
                        <span className="text-sm font-bold font-mono text-brand-400">{formatCurrency(bs.totalPassif, currency)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal nouvelle écriture */}
      {showNewEntry && business?.id && (
        <NewEntryModal
          accounts={accounts}
          businessId={business.id}
          currency={currency}
          onClose={() => setShowNewEntry(false)}
          onSaved={() => { setShowNewEntry(false); load(); }}
        />
      )}
    </div>
  );
}
