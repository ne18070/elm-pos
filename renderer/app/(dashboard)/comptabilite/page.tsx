'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { BookOpen, RefreshCw, BarChart3, Scale, FileText, Printer, Download, List, Settings, Upload, Trash2, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { displayCurrency } from '@/lib/utils';
import { exportToExcel } from '@/lib/export-excel';
import { useNotificationStore } from '@/store/notifications';
import { hasFeature } from '@/lib/permissions';
import { useCan } from '@/hooks/usePermission';

import {
  getJournalEntries, syncAccounting, syncHotelAccounting, getTrialBalance,
  deleteJournalEntries, getAccounts, computeIncomeStatement, computeBalanceSheet,
  syncHonorairesAccounting, syncServiceOrdersAccounting, clearJournal,
} from '@services/supabase/accounting';
import type { JournalEntry, TrialBalanceLine, Account } from '@services/supabase/accounting';

import { getPeriod, PERIOD_LABELS, CLASS_LABELS, SOURCE_LABELS } from './components/accounting-constants';
import type { Tab, Period } from './components/accounting-constants';
import { DashboardTab }  from './components/DashboardTab';
import { JournalTab }    from './components/JournalTab';
import { GrandLivreTab } from './components/GrandLivreTab';
import { BalanceTab }    from './components/BalanceTab';
import { EtatsTab }      from './components/EtatsTab';
import { SettingsTab }   from './components/SettingsTab';
import { NewEntryModal } from './components/NewEntryModal';
import { EtombImportModal } from './components/EtombImportModal';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard',   label: 'Tableau de bord', icon: BarChart3 },
  { id: 'journal',     label: 'Journal',         icon: BookOpen },
  { id: 'grand-livre', label: 'Grand Livre',     icon: List },
  { id: 'balance',     label: 'Balance',         icon: Scale },
  { id: 'etats',       label: 'États financiers', icon: FileText },
  { id: 'settings',    label: 'Configuration',   icon: Settings },
];

export default function ComptabilitePage() {
  const { business, user } = useAuthStore();
  const can = useCan();
  const isOwnerOrAdmin = can('view_financials');
  const { success, error: notifErr, warning: notifWarn } = useNotificationStore();

  const [tab, setTab]               = useState<Tab>('dashboard');
  const [period, setPeriod]         = useState<Period>(new Date().getDate() <= 5 ? 'lastmonth' : 'month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo]     = useState('');
  const [syncing, setSyncing]       = useState(false);
  const [loading, setLoading]       = useState(true);
  // Vrai dès qu'un premier chargement a abouti. Ensuite, les onglets restent
  // montés pendant les rechargements (sync, suppression, nouvelle écriture…) :
  // démontés à chaque fois, le Journal perdait sa page et sa sélection, le
  // Grand Livre son compte, et chaque onglet relançait ses propres requêtes.
  const [hasLoaded, setHasLoaded]   = useState(false);

  const [entries, setEntries]   = useState<JournalEntry[]>([]);
  const [balance, setBalance]   = useState<TrialBalanceLine[]>([]);
  // Balance CUMULÉE (origine → `to`) : le bilan se calcule sur des SOLDES, pas
  // sur les mouvements d'une période. `balance` (période) reste pour le compte
  // de résultat et l'onglet Balance.
  const [bsBalance, setBsBalance] = useState<TrialBalanceLine[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [reloadToken, setReloadToken]       = useState(0);
  const [showNewEntry, setShowNewEntry]     = useState(false);
  const [showImport, setShowImport]         = useState(false);
  const [clearing, setClearing]             = useState(false);
  const [expandedClasses, setExpandedClasses] = useState<Set<number>>(new Set([5, 6, 7]));

  const { from, to } = getPeriod(period, customFrom, customTo);
  const currency = business?.currency;

  const is = useMemo(() => computeIncomeStatement(balance), [balance]);
  const bs = useMemo(() => computeBalanceSheet(bsBalance), [bsBalance]);
  const byClass = useMemo(() =>
    Array.from(new Set(balance.map((r) => r.class_num))).sort().map((cls) => ({
      cls,
      rows: balance.filter((r) => r.class_num === cls),
      totalDebit:  balance.filter((r) => r.class_num === cls).reduce((s, r) => s + r.total_debit, 0),
      totalCredit: balance.filter((r) => r.class_num === cls).reduce((s, r) => s + r.total_credit, 0),
    })),
  [balance]);

  const load = useCallback(async () => {
    if (!business?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const [e, b, bCum, a] = await Promise.all([
        getJournalEntries(business.id, { dateFrom: from, dateTo: to, limit: 5000 }),
        getTrialBalance(business.id, from, to),
        getTrialBalance(business.id, undefined, to),
        getAccounts(business.id),
      ]);
      setEntries(e);
      setBalance(b);
      setBsBalance(bCum);
      setAccounts(a);
      setHasLoaded(true);
    } catch (err) {
      notifErr(String(err));
    } finally {
      setLoading(false);
    }
  }, [business?.id, from, to, notifErr]);

  // Recharge : load() + signal aux composants auto-paginés (onglet Journal)
  const reload = useCallback(async () => {
    await load();
    setReloadToken((t) => t + 1);
  }, [load]);

  useEffect(() => { load(); }, [load]);

  async function handleSync() {
    if (!business?.id) return;
    setSyncing(true);
    try {
      const results = await Promise.allSettled([
        syncAccounting(business.id),
        hasFeature(business, 'hotel') ? syncHotelAccounting(business.id) : Promise.resolve(0),
        hasFeature(business, 'honoraires') || hasFeature(business, 'dossiers') ? syncHonorairesAccounting(business.id) : Promise.resolve(0),
        hasFeature(business, 'service') || hasFeature(business, 'services') ? syncServiceOrdersAccounting(business.id) : Promise.resolve(0),
      ]);

      const total = results.reduce((s, r) => s + (r.status === 'fulfilled' ? (r.value as number) : 0), 0);
      const errors = results.filter(r => r.status === 'rejected').map(r => (r as PromiseRejectedResult).reason?.message ?? 'Erreur');
      if (errors.length > 0) notifErr(errors.join(' / '));
      if (total > 0) {
        success(`${total} écriture${total > 1 ? 's' : ''} synchronisée${total > 1 ? 's' : ''}`);
        await reload();
      } else if (errors.length === 0) {
        success('Journal à jour - aucune nouvelle écriture');
      }
    } catch (err) {
      notifErr(String(err));
    } finally {
      setSyncing(false);
    }
  }

  function handleExport() {
    if (entries.length >= 5000) {
      notifWarn("Export limité aux 5 000 dernières écritures de la période. Restreignez la période pour un journal complet.");
    }
    const journalData = entries.flatMap((e) =>
      (e.lines ?? []).map((l) => ({
        Date: e.entry_date,
        Référence: e.reference || '',
        Description: e.description,
        Source: SOURCE_LABELS[e.source]?.label ?? 'Manuel',
        Compte: l.account_code,
        Intitulé: l.account_name,
        Débit: l.debit,
        Crédit: l.credit,
      }))
    );

    const balanceData = balance.map((b) => {
      const solde = b.total_debit - b.total_credit;
      return {
        Compte: b.account_code,
        Intitulé: b.account_name,
        Classe: b.class_num,
        Nature: b.nature,
        'Total Débit': b.total_debit,
        'Total Crédit': b.total_credit,
        Solde: Math.abs(solde),
        Sens: solde >= 0 ? 'Débit' : 'Crédit',
      };
    });

    const isData = [
      { Libellé: 'Ventes & Prestations (70x)', Montant: is.ventesGross },
      { Libellé: 'RRR accordés (709)', Montant: -is.rrrAccordes },
      { Libellé: "CHIFFRE D'AFFAIRES NET", Montant: is.caNet },
      { Libellé: "Coût d'achat des marchandises (60x)", Montant: -is.achatsMarchandises },
      { Libellé: 'MARGE BRUTE', Montant: is.margeBrute },
      { Libellé: 'Autres produits (71-79)', Montant: is.autresProduits },
      { Libellé: 'Transports (61)', Montant: -is.transports },
      { Libellé: 'Services extérieurs (62/63)', Montant: -is.servicesExterieurs },
      { Libellé: 'Impôts et taxes (64)', Montant: -is.impotsTaxes },
      { Libellé: 'Charges de personnel (66)', Montant: -is.chargesPersonnel },
      { Libellé: 'Autres charges externes', Montant: -is.autresCharges },
      { Libellé: 'EXCÉDENT BRUT EXPLOIT. (EBE)', Montant: is.ebe },
      { Libellé: 'Dotations amort. (68)', Montant: -is.dotations },
      { Libellé: "RÉSULTAT D'EXPLOITATION", Montant: is.resultatExpl },
      { Libellé: 'Résultat financier', Montant: is.resultatFinancier },
      { Libellé: 'Résultat HAO (8)', Montant: is.resultatHAO },
      { Libellé: "RÉSULTAT AVANT IMPÔT", Montant: is.resultatAvantImpot },
      { Libellé: 'Impôts sur résultat (69)', Montant: -is.impots },
      { Libellé: 'RÉSULTAT NET', Montant: is.resultatNet },
    ];

    const bsData = [
      { Section: 'ACTIF', Poste: 'Actif immobilisé', Montant: bs.actifImmobilise },
      { Section: 'ACTIF', Poste: 'Stocks', Montant: bs.stocks },
      { Section: 'ACTIF', Poste: 'Clients', Montant: bs.creancesClients },
      { Section: 'ACTIF', Poste: 'TVA récupérable', Montant: bs.tvaRecuperable },
      { Section: 'ACTIF', Poste: 'Autres actifs CT', Montant: bs.autresActifCT },
      { Section: 'ACTIF', Poste: 'Trésorerie', Montant: bs.tresorerie },
      { Section: 'ACTIF', Poste: 'TOTAL ACTIF', Montant: bs.totalActif },
      { Section: '---', Poste: '---', Montant: null },
      { Section: 'PASSIF', Poste: 'Capitaux propres', Montant: bs.capitaux },
      { Section: 'PASSIF', Poste: "Résultat de l'exercice", Montant: bs.resultatExercice },
      { Section: 'PASSIF', Poste: 'Emprunts', Montant: bs.dettesLT },
      { Section: 'PASSIF', Poste: 'Fournisseurs', Montant: bs.dettesFF },
      { Section: 'PASSIF', Poste: 'Dettes fiscales', Montant: bs.dettesFiscales },
      { Section: 'PASSIF', Poste: 'Dettes sociales', Montant: bs.dettesSociales },
      { Section: 'PASSIF', Poste: 'Découverts bancaires', Montant: bs.decouvertsBancaires },
      { Section: 'PASSIF', Poste: 'Autres dettes CT', Montant: bs.autresDettesCT },
      { Section: 'PASSIF', Poste: 'TOTAL PASSIF', Montant: bs.totalPassif },
      { Section: 'CONTRÔLE', Poste: 'Écart de bilan (doit être nul)', Montant: bs.ecartBilan },
    ];

    exportToExcel(
      {
        Journal: journalData,
        Balance: balanceData,
        'Compte de résultat': isData,
        Bilan: bsData,
      },
      `Comptabilite_${business?.name || 'Export'}_${from}_${to}`
    );
    success('Exportation Excel réussie');
  }

  async function handleClearJournal() {
    if (!business?.id) return;
    if (!confirm('Effacer TOUTES les écritures du journal (ventes, achats, manuelles, imports) ?\n\nAction irréversible. Un « Synchroniser » recréera les écritures issues de la caisse.')) return;
    if (!confirm('Confirmer définitivement le vidage complet du journal ?')) return;
    setClearing(true);
    try {
      const n = await clearJournal(business.id);
      success(`${n} écriture${n > 1 ? 's' : ''} supprimée${n > 1 ? 's' : ''}`);
      await reload();
    } catch (err) {
      notifErr(String(err));
    } finally {
      setClearing(false);
    }
  }

  async function handleDeleteEntries(ids: string[]) {
    if (ids.length === 0 || !business?.id) return;
    const msg = ids.length === 1
      ? 'Supprimer cette écriture ?'
      : `Supprimer ${ids.length} écritures ?`;
    if (!confirm(msg)) return;
    try {
      const n = await deleteJournalEntries(business.id, ids);
      success(`${n} écriture${n > 1 ? 's' : ''} supprimée${n > 1 ? 's' : ''}`);
      await reload();
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

  function handlePrint() {
    // Échappement HTML — libellés de comptes, descriptions d'écritures et nom
    // d'établissement sont des données utilisateur écrites telles quelles dans
    // la fenêtre d'impression : sans échappement, un « <script> » ou un
    // « </td> » dans un nom de produit casse la page (ou pire).
    const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
    ));
    const periodLabel = period === 'custom' ? `${from} → ${to}` : PERIOD_LABELS[period];
    const bizName  = esc(business?.name ?? 'Établissement');
    const printDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const fmt = (n: number) =>
      new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(n) + ' ' + displayCurrency(business?.currency ?? 'XOF');

    const TAB_TITLES: Record<Tab, string> = {
      dashboard:     'Tableau de bord',
      journal:       'Journal général',
      'grand-livre': 'Grand Livre',
      balance:       'Balance des comptes',
      etats:         'États financiers',
      settings:      'Configuration plan comptable',
    };

    const journalRows = entries.map((e) => {
      const src = SOURCE_LABELS[e.source]?.label ?? 'Manuel';
      const linesHtml = (e.lines ?? []).map((l) => `
        <tr style="background:#f9fafb">
          <td></td>
          <td style="padding:2px 8px;font-family:monospace;color:#6366f1;font-size:11px">${esc(l.account_code)}</td>
          <td style="padding:2px 8px;font-size:11px;color:#555;font-style:italic">${esc(l.account_name)}</td>
          <td style="padding:2px 8px;text-align:right;font-family:monospace;font-size:11px">${l.debit > 0 ? fmt(l.debit) : ''}</td>
          <td style="padding:2px 8px;text-align:right;font-family:monospace;font-size:11px">${l.credit > 0 ? fmt(l.credit) : ''}</td>
        </tr>`).join('');
      const total = (e.lines ?? []).reduce((s, l) => s + l.debit, 0);
      return `
        <tr>
          <td style="padding:5px 8px;font-size:12px;color:#888">${esc(e.entry_date)}</td>
          <td style="padding:5px 8px;font-family:monospace;font-size:11px;color:#888">${esc(e.reference ?? '')}</td>
          <td style="padding:5px 8px;font-size:12px;font-weight:600">${esc(e.description)}</td>
          <td style="padding:5px 8px"><span style="font-size:10px;background:#e0e7ff;color:#4338ca;padding:1px 6px;border-radius:9px">${esc(src)}</span></td>
          <td style="padding:5px 8px;text-align:right;font-family:monospace;font-size:12px">${total > 0 ? fmt(total) : ''}</td>
        </tr>${linesHtml}`;
    }).join('');

    const byClass = Array.from(new Set(balance.map((r) => r.class_num))).sort().map((cls) => ({
      cls,
      rows: balance.filter((r) => r.class_num === cls),
      totalDebit:  balance.filter((r) => r.class_num === cls).reduce((s, r) => s + r.total_debit, 0),
      totalCredit: balance.filter((r) => r.class_num === cls).reduce((s, r) => s + r.total_credit, 0),
    }));

    const balanceRows = byClass.map(({ cls, rows, totalDebit, totalCredit }) => {
      const header = `<tr style="background:#1e293b;color:#94a3b8">
        <td colspan="5" style="padding:6px 8px;font-weight:700;font-size:11px;letter-spacing:.05em;text-transform:uppercase">
          ${CLASS_LABELS[cls] ?? `Classe ${cls}`}
        </td></tr>`;
      const detail = rows.map((r) => {
        const solde = r.total_debit - r.total_credit;
        return `<tr>
          <td style="padding:4px 8px;font-family:monospace;font-size:11px;color:#4f46e5">${esc(r.account_code)}</td>
          <td style="padding:4px 8px;font-size:11px">${esc(r.account_name)}</td>
          <td style="padding:4px 8px;text-align:right;font-family:monospace;font-size:11px">${r.total_debit > 0 ? fmt(r.total_debit) : ''}</td>
          <td style="padding:4px 8px;text-align:right;font-family:monospace;font-size:11px">${r.total_credit > 0 ? fmt(r.total_credit) : ''}</td>
          <td style="padding:4px 8px;text-align:right;font-family:monospace;font-size:11px;color:${solde > 0 ? '#16a34a' : solde < 0 ? '#dc2626' : '#888'}">
            ${solde !== 0 ? fmt(Math.abs(solde)) + (solde > 0 ? ' D' : ' C') : '-'}
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

    const is = computeIncomeStatement(balance);
    const bs = computeBalanceSheet(bsBalance); // bilan = SOLDES cumulés, pas mouvements de période

    const plRows: [string, number, boolean, boolean?, boolean?][] = [
      ['Ventes & Prestations (70x)',      is.ventesGross,        false],
      ["RRR accordés (7091)",            -is.rrrAccordes,       true],
      ["CHIFFRE D'AFFAIRES NET",          is.caNet,              false, true],
      ["Coût d'achat marchandises (60x)", -is.achatsMarchandises, true],
      ['MARGE BRUTE',                     is.margeBrute,         false, true],
      ['Autres produits (71-79)',         is.autresProduits,      true],
      ['Transports (61)',                -is.transports,         true],
      ['Services extérieurs (62/63)',    -is.servicesExterieurs, true],
      ['Impôts et taxes (64)',           -is.impotsTaxes,        true],
      ['Charges de personnel (66)',      -is.chargesPersonnel,   true],
      ['Autres charges (6xx)',           -is.autresCharges,      true],
      ['EXCÉDENT BRUT (EBE)',             is.ebe,                false, true],
      ['Dotations amort. (68)',          -is.dotations,          true],
      ["RÉSULTAT D'EXPLOITATION",         is.resultatExpl,       false, true],
      ['Produits financiers (76/77)',     is.produitsFinanciers,  true],
      ['Charges financières (67/661)',   -is.chargesFinancieres, true],
      ['Résultat HAO (8)',                is.resultatHAO,         true],
      ["RÉSULTAT AVANT IMPÔT",            is.resultatAvantImpot, false, true],
      ['Impôts sur résultat (69)',       -is.impots,             true],
      ['RÉSULTAT NET',                    is.resultatNet,        false, true, true],
    ];

    const plHtml = plRows.map(([label, val, indent, bold, big]) => `
      <tr style="${bold ? 'background:#f8fafc;' : ''}">
        <td style="padding:${big ? '6' : '4'}px 8px;${indent ? 'padding-left:24px;' : ''}font-size:${big ? '13' : '12'}px;${bold ? 'font-weight:700;' : ''}">${label}</td>
        <td style="padding:${big ? '6' : '4'}px 8px;text-align:right;font-family:monospace;font-size:${big ? '13' : '12'}px;${bold ? 'font-weight:700;' : ''}color:${val >= 0 ? (bold ? '#15803d' : '#222') : '#dc2626'}">
          ${val !== 0 ? fmt(val) : '-'}
        </td>
      </tr>`).join('');

    const bsActif  = [['Actif immobilisé (Cl. 2)', bs.actifImmobilise], ['Stocks (Cl. 3)', bs.stocks], ['Clients (411)', bs.creancesClients], ['TVA récupérable (4451)', bs.tvaRecuperable], ['Autres actifs CT', bs.autresActifCT], ['Trésorerie (521+531+571+576)', bs.tresorerie]] as [string, number][];
    const bsPassif = [['Capitaux propres (Cl. 1)', bs.capitaux], ["Résultat de l'exercice", bs.resultatExercice], ['Emprunts (161)', bs.dettesLT], ['Fournisseurs (401)', bs.dettesFF], ['Dettes fiscales', bs.dettesFiscales], ['Dettes sociales', bs.dettesSociales], ['Découverts bancaires', bs.decouvertsBancaires], ['Autres dettes CT', bs.autresDettesCT]] as [string, number][];

    const bsHtml = `
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#1e293b;color:#94a3b8">
          <th style="padding:6px 8px;text-align:left;font-size:11px">ACTIF</th>
          <th style="padding:6px 8px;text-align:right;font-size:11px">Montant</th>
          <th style="padding:6px 8px;text-align:left;font-size:11px">PASSIF</th>
          <th style="padding:6px 8px;text-align:right;font-size:11px">Montant</th>
        </tr></thead>
        <tbody>
          ${Array.from({ length: Math.max(bsActif.length, bsPassif.length) }).map((_, i) => `<tr>
            <td style="padding:4px 8px;font-size:11px">${bsActif[i]?.[0] ?? ''}</td>
            <td style="padding:4px 8px;text-align:right;font-family:monospace;font-size:11px">${bsActif[i] ? fmt(bsActif[i][1]) : ''}</td>
            <td style="padding:4px 8px;font-size:11px">${bsPassif[i]?.[0] ?? ''}</td>
            <td style="padding:4px 8px;text-align:right;font-family:monospace;font-size:11px">${bsPassif[i] ? fmt(bsPassif[i][1]) : ''}</td>
          </tr>`).join('')}
          <tr style="background:#f1f5f9;font-weight:700">
            <td style="padding:5px 8px;font-size:12px">TOTAL ACTIF</td>
            <td style="padding:5px 8px;text-align:right;font-family:monospace;font-size:12px">${fmt(bs.totalActif)}</td>
            <td style="padding:5px 8px;font-size:12px">TOTAL PASSIF</td>
            <td style="padding:5px 8px;text-align:right;font-family:monospace;font-size:12px">${fmt(bs.totalPassif)}</td>
          </tr>
          ${Math.abs(bs.ecartBilan) > 0.5 ? `<tr style="background:#fef2f2;color:#b91c1c;font-weight:700">
            <td colspan="3" style="padding:5px 8px;font-size:11px">⚠ ÉCART DE BILAN (écriture(s) déséquilibrée(s))</td>
            <td style="padding:5px 8px;text-align:right;font-family:monospace;font-size:12px">${fmt(bs.ecartBilan)}</td>
          </tr>` : ''}
        </tbody>
      </table>`;

    // Onglets sans section d'impression dédiée (Grand Livre, Configuration) :
    // on imprime le jeu complet plutôt qu'une page vide.
    const printAll = tab === 'dashboard' || tab === 'grand-livre' || tab === 'settings';
    let body = '';
    if (tab === 'journal' || printAll) {
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
    if (tab === 'balance' || printAll) {
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
    if (tab === 'etats' || printAll) {
      body += `
        <h2 style="font-size:14px;font-weight:700;margin:24px 0 8px;color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:4px">Compte de résultat</h2>
        <table style="width:50%;border-collapse:collapse;font-size:12px"><tbody>${plHtml}</tbody></table>
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
    Document généré par ${bizName} · ELM APP · ${printDate}
  </p>
</body></html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 400);
  }

  const visibleTabs = isOwnerOrAdmin ? TABS : TABS.filter((t) => t.id === 'dashboard' || t.id === 'journal');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-6 border-b border-surface-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-content-primary">Comptabilité OHADA</h1>
            <p className="text-xs text-content-secondary mt-0.5">Tableau de bord · Journal · Balance · États financiers — SYSCOHADA Révisé</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} className="input py-1.5 text-sm">
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
            <button onClick={handleSync} disabled={syncing} className="btn-secondary flex items-center gap-2 py-1.5">
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Synchroniser</span>
            </button>
            {isOwnerOrAdmin && (
              <button onClick={() => setShowImport(true)} className="btn-secondary flex items-center gap-2 py-1.5">
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Importer</span>
              </button>
            )}
            {isOwnerOrAdmin && (
              <button
                onClick={handleClearJournal}
                disabled={clearing}
                className="btn-secondary flex items-center gap-2 py-1.5 text-status-error hover:bg-badge-error"
              >
                {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span className="hidden sm:inline">Effacer</span>
              </button>
            )}
            <button onClick={handleExport} className="btn-secondary flex items-center gap-2 py-1.5">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Exporter</span>
            </button>
            <button onClick={handlePrint} className="btn-secondary flex items-center gap-2 py-1.5">
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Imprimer</span>
            </button>
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto">
          {visibleTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                tab === id ? 'bg-brand-600 text-content-primary' : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto p-6 ${loading && hasLoaded ? 'opacity-60 pointer-events-none' : ''}`}>
        {loading && !hasLoaded ? (
          <div className="text-content-secondary text-center py-16">Chargement…</div>
        ) : (
          <>
            {tab === 'dashboard' && (
              <DashboardTab entries={entries} is={is} bs={bs} currency={currency} />
            )}
            {tab === 'journal' && (
              <JournalTab
                from={from}
                to={to}
                currency={currency}
                canDelete={isOwnerOrAdmin}
                reloadToken={reloadToken}
                onNewEntry={() => setShowNewEntry(true)}
                onDelete={handleDeleteEntries}
              />
            )}
            {tab === 'grand-livre' && (
              <GrandLivreTab
                entries={entries}
                accounts={accounts}
                currency={currency}
              />
            )}
            {tab === 'balance' && (
              <BalanceTab
                byClass={byClass}
                expandedClasses={expandedClasses}
                toggleClass={toggleClass}
                currency={currency}
              />
            )}
            {tab === 'etats' && (
              <EtatsTab is={is} bs={bs} currency={currency} />
            )}
            {tab === 'settings' && business?.id && (
              <SettingsTab
                accounts={accounts}
                businessId={business.id}
                onRefresh={load}
              />
            )}
          </>
        )}
      </div>

      {showNewEntry && business?.id && (
        <NewEntryModal
          accounts={accounts}
          businessId={business.id}
          currency={currency}
          onClose={() => setShowNewEntry(false)}
          onSaved={() => { setShowNewEntry(false); reload(); }}
        />
      )}

      {showImport && business?.id && (
        <EtombImportModal
          businessId={business.id}
          currency={currency}
          onClose={() => setShowImport(false)}
          onDone={reload}
        />
      )}
    </div>
  );
}


