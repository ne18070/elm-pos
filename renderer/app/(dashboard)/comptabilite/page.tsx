'use client';

import { useState, useEffect, useCallback } from 'react';
import { BookOpen, RefreshCw, BarChart3, Scale, FileText, Printer } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { displayCurrency } from '@/lib/utils';
import { useNotificationStore } from '@/store/notifications';
import { canViewFinancials } from '@/lib/permissions';
import {
  getJournalEntries, syncAccounting, syncHotelAccounting, getTrialBalance,
  deleteManualEntry, getAccounts, computeIncomeStatement, computeBalanceSheet,
  syncHonorairesAccounting, syncServiceOrdersAccounting,
} from '@services/supabase/accounting';
import type { JournalEntry, TrialBalanceLine, Account } from '@services/supabase/accounting';

import { getPeriod, PERIOD_LABELS, CLASS_LABELS, SOURCE_LABELS } from './components/accounting-constants';
import type { Tab, Period } from './components/accounting-constants';
import { DashboardTab }  from './components/DashboardTab';
import { JournalTab }    from './components/JournalTab';
import { BalanceTab }    from './components/BalanceTab';
import { EtatsTab }      from './components/EtatsTab';
import { NewEntryModal } from './components/NewEntryModal';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: BarChart3 },
  { id: 'journal',   label: 'Journal',         icon: BookOpen },
  { id: 'balance',   label: 'Balance',         icon: Scale },
  { id: 'etats',     label: 'États financiers', icon: FileText },
];

export default function ComptabilitePage() {
  const { business, user } = useAuthStore();
  const isOwnerOrAdmin = canViewFinancials(user?.role);
  const { success, error: notifErr } = useNotificationStore();

  const [tab, setTab]               = useState<Tab>('dashboard');
  const [period, setPeriod]         = useState<Period>(new Date().getDate() <= 5 ? 'lastmonth' : 'month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo]     = useState('');
  const [syncing, setSyncing]       = useState(false);
  const [loading, setLoading]       = useState(false);

  const [entries, setEntries]   = useState<JournalEntry[]>([]);
  const [balance, setBalance]   = useState<TrialBalanceLine[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [expandedEntry, setExpandedEntry]   = useState<string | null>(null);
  const [showNewEntry, setShowNewEntry]     = useState(false);
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
      const features = (business as any)?.features ?? [];
      const results = await Promise.allSettled([
        syncAccounting(business.id),
        business.type === 'hotel' || features.includes('hotel') ? syncHotelAccounting(business.id) : Promise.resolve(0),
        features.includes('honoraires') || features.includes('dossiers') ? syncHonorairesAccounting(business.id) : Promise.resolve(0),
        business.type === 'service' || features.includes('service') || features.includes('services') ? syncServiceOrdersAccounting(business.id) : Promise.resolve(0),
      ]);

      const total = results.reduce((s, r) => s + (r.status === 'fulfilled' ? (r.value as number) : 0), 0);
      const errors = results.filter(r => r.status === 'rejected').map(r => (r as PromiseRejectedResult).reason?.message ?? 'Erreur');
      if (errors.length > 0) notifErr(errors.join(' / '));
      if (total > 0) {
        success(`${total} écriture${total > 1 ? 's' : ''} synchronisée${total > 1 ? 's' : ''}`);
        await load();
      } else if (errors.length === 0) {
        success('Journal à jour - aucune nouvelle écriture');
      }
    } catch (err) {
      notifErr(String(err));
    } finally {
      setSyncing(false);
    }
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

  function handlePrint() {
    const periodLabel = period === 'custom' ? `${customFrom} -${customTo}` : PERIOD_LABELS[period];
    const bizName  = business?.name ?? 'Établissement';
    const printDate = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const fmt = (n: number) =>
      new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(n) + ' ' + displayCurrency(business?.currency ?? 'XOF');

    const TAB_TITLES: Record<Tab, string> = {
      dashboard: 'Tableau de bord',
      journal:   'Journal général',
      balance:   'Balance des comptes',
      etats:     'États financiers',
    };

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
          <td style="padding:4px 8px;font-family:monospace;font-size:11px;color:#4f46e5">${r.account_code}</td>
          <td style="padding:4px 8px;font-size:11px">${r.account_name}</td>
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
    const bs = computeBalanceSheet(balance);

    const plRows: [string, number, boolean, boolean?, boolean?][] = [
      ['Ventes & Prestations (70x)',      is.ventesGross,        false],
      ["RRR accordés (7091)",            -is.rrrAccordes,       true],
      ["CHIFFRE D'AFFAIRES NET",          is.caNet,              false, true],
      ['Achats de marchandises (601)',   -is.achatsMarchandises, true],
      ['MARGE BRUTE',                     is.margeBrute,         false, true],
      ['Autres charges (6xx)',           -is.autresCharges,      true],
      ["RÉSULTAT D'EXPLOITATION",         is.resultatExpl,       false, true],
      ['Produits financiers',             is.produitsFinanciers,  true],
      ['Charges financières (661)',      -is.chargesFinancieres, true],
      ["RÉSULTAT AVANT IMPÔT",            is.resultatAvantImpot, false, true],
      ['Impôts sur résultat (691)',      -is.impots,             true],
      ['RÉSULTAT NET',                    is.resultatNet,        false, true, true],
    ];

    const plHtml = plRows.map(([label, val, indent, bold, big]) => `
      <tr style="${bold ? 'background:#f8fafc;' : ''}">
        <td style="padding:${big ? '6' : '4'}px 8px;${indent ? 'padding-left:24px;' : ''}font-size:${big ? '13' : '12'}px;${bold ? 'font-weight:700;' : ''}">${label}</td>
        <td style="padding:${big ? '6' : '4'}px 8px;text-align:right;font-family:monospace;font-size:${big ? '13' : '12'}px;${bold ? 'font-weight:700;' : ''}color:${val >= 0 ? (bold ? '#15803d' : '#222') : '#dc2626'}">
          ${val !== 0 ? fmt(val) : '-'}
        </td>
      </tr>`).join('');

    const bsActif  = [['Actif immobilisé (Cl. 2)', bs.actifImmobilise], ['Stocks (Cl. 3)', bs.stocks], ['Clients (411)', bs.creancesClients], ['TVA récupérable (4451)', bs.tvaRecuperable], ['Autres actifs CT', bs.autresActifCT], ['Trésorerie (521+571+576)', bs.tresorerie]] as [string, number][];
    const bsPassif = [['Capitaux propres (Cl. 1)', bs.capitaux], ['Emprunts (161)', bs.dettesLT], ['Fournisseurs (401)', bs.dettesFF], ['Dettes fiscales', bs.dettesFiscales], ['Dettes sociales', bs.dettesSociales], ['Autres dettes CT', bs.autresDettesCT]] as [string, number][];

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
        <table style="width:50%;border-collapse:collapse;font-size:12px"><tbody>${plHtml}</tbody></table>
        <h2 style="font-size:14px;font-weight:700;margin:24px 0 8px;color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:4px">Bilan simplifié</h2>
        ${bsHtml}`;
    }

    const html = `<!DOCTYPE html>
<html lang="fr"><head>
  <meta charset="UTF-8">
  <title>Comptabilité -${bizName}</title>
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
      <p style="font-size:12px;color:#64748b;margin:2px 0 0">Comptabilité OHADA -SYSCOHADA Révisé</p>
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

  const is = computeIncomeStatement(balance);
  const bs = computeBalanceSheet(balance);

  const byClass = Array.from(new Set(balance.map((r) => r.class_num))).sort().map((cls) => ({
    cls,
    rows: balance.filter((r) => r.class_num === cls),
    totalDebit:  balance.filter((r) => r.class_num === cls).reduce((s, r) => s + r.total_debit, 0),
    totalCredit: balance.filter((r) => r.class_num === cls).reduce((s, r) => s + r.total_credit, 0),
  }));

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

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="text-content-secondary text-center py-16">Chargement…</div>
        ) : (
          <>
            {tab === 'dashboard' && (
              <DashboardTab entries={entries} is={is} bs={bs} currency={currency} />
            )}
            {tab === 'journal' && (
              <JournalTab
                entries={entries}
                expandedEntry={expandedEntry}
                setExpandedEntry={setExpandedEntry}
                currency={currency}
                onNewEntry={() => setShowNewEntry(true)}
                onDeleteEntry={handleDeleteEntry}
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
          </>
        )}
      </div>

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


