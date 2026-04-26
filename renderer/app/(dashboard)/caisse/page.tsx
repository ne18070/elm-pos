'use client';
import { toUserError } from '@/lib/user-error';

import { useEffect, useState, useCallback } from 'react';
import {
  Loader2, LockOpen, Lock, RefreshCw, Banknote, CreditCard,
  Smartphone, RotateCcw, History, CheckCircle, AlertTriangle, X,
  Printer, FileText,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useCashSessionStore } from '@/store/cashSession';
import { formatCurrency } from '@/lib/utils';
import {
  openSession, closeSession, getLiveSummary, getSessionHistory,
  type CashSession, type SessionLiveSummary,
} from '@services/supabase/cash-sessions';
import { logAction } from '@services/supabase/logger';

// -- Report data ---------------------------------------------------------------

interface ReportData {
  type:          'X' | 'Z';
  businessName:  string;
  generatedAt:   string;
  openedAt:      string;
  closedAt?:     string | null;
  cashierName:   string;
  currency:      string;
  openingAmount: number;
  totalSales:    number;
  totalCash:     number;
  totalCard:     number;
  totalMobile:   number;
  totalOrders:   number;
  totalRefunds:  number;
  expectedCash:  number;
  actualCash?:   number | null;
  difference?:   number | null;
  notes?:        string | null;
}

function buildReportData(
  type: 'X' | 'Z',
  session: CashSession,
  summary: SessionLiveSummary | null,
  businessName: string,
  cashierName: string,
  currency: string,
): ReportData {
  const isZ    = type === 'Z';
  const cash   = isZ ? (session.total_cash    ?? 0) : (summary?.total_cash    ?? 0);
  const card   = isZ ? (session.total_card    ?? 0) : (summary?.total_card    ?? 0);
  const mobile = isZ ? (session.total_mobile  ?? 0) : (summary?.total_mobile  ?? 0);
  return {
    type, businessName, cashierName, currency,
    generatedAt:   new Date().toISOString(),
    openedAt:      session.opened_at,
    closedAt:      session.closed_at,
    openingAmount: session.opening_amount,
    totalSales:    isZ ? (session.total_sales   ?? 0) : (summary?.total_sales   ?? 0),
    totalCash:     cash,
    totalCard:     card,
    totalMobile:   mobile,
    totalOrders:   isZ ? (session.total_orders  ?? 0) : (summary?.total_orders  ?? 0),
    totalRefunds:  isZ ? (session.total_refunds ?? 0) : (summary?.total_refunds ?? 0),
    expectedCash:  isZ ? (session.expected_cash ?? session.opening_amount + cash)
                       : session.opening_amount + cash,
    actualCash:  isZ ? session.actual_cash  : undefined,
    difference:  isZ ? session.difference   : undefined,
    notes:       isZ ? session.notes        : undefined,
  };
}

// -- Print (new window, inline styles — works on thermal + regular printers) --

function printReport(data: ReportData) {
  const fmt  = (n: number) => formatCurrency(n, data.currency);
  const isZ  = data.type === 'Z';
  const diff = data.difference ?? 0;

  const row = (l: string, v: string, bold = false) =>
    `<div style="display:flex;justify-content:space-between;padding:1px 0${bold ? ';font-weight:bold' : ''}">
       <span>${l}</span><span>${v}</span></div>`;
  const hr = `<hr style="border:none;border-top:1px dashed #aaa;margin:3px 0">`;

  const body = [
    `<p style="text-align:center;font-weight:bold;font-size:13pt;margin:0 0 2px">${data.businessName}</p>`,
    `<p style="text-align:center;margin:0">${isZ ? '=== RAPPORT Z ===' : '=== RAPPORT X ==='}</p>`,
    `<p style="text-align:center;font-size:9pt;margin:0 0 4px">${format(new Date(data.generatedAt), 'dd/MM/yyyy HH:mm:ss', { locale: fr })}</p>`,
    hr,
    row('Ouverture', format(new Date(data.openedAt), 'dd/MM/yyyy HH:mm', { locale: fr })),
    isZ && data.closedAt ? row('Clôture', format(new Date(data.closedAt), 'dd/MM/yyyy HH:mm', { locale: fr })) : '',
    row('Caissier', data.cashierName),
    hr,
    row('Fond de caisse', fmt(data.openingAmount)),
    hr,
    row('Espèces',       fmt(data.totalCash)),
    row('Carte bancaire',fmt(data.totalCard)),
    row('Mobile Money',  fmt(data.totalMobile)),
    data.totalRefunds > 0 ? row('Remboursements', `-${fmt(data.totalRefunds)}`) : '',
    hr,
    row('TOTAL VENTES',  fmt(data.totalSales), true),
    row('Transactions',  String(data.totalOrders)),
    hr,
    row('Fond initial',       fmt(data.openingAmount)),
    row('+ Espèces reçues',  `+${fmt(data.totalCash)}`),
    row('= ESPÈCES ATTENDUES', fmt(data.expectedCash), true),
    ...(isZ && data.actualCash != null ? [
      hr,
      row('Espèces comptées', fmt(data.actualCash)),
      row('ÉCART', `${diff >= 0 ? '+' : ''}${fmt(diff)}`, true),
      `<p style="text-align:center;font-weight:bold">${
        Math.abs(diff) < 1 ? '*** CAISSE ÉQUILIBRÉE ***'
          : diff > 0 ? '*** EXCÉDENT ***' : '*** DÉFICIT ***'
      }</p>`,
    ] : []),
    ...(data.notes ? [hr, `<p style="font-size:9pt;font-style:italic">Notes : ${data.notes}</p>`] : []),
    hr,
    `<p style="text-align:center;font-size:9pt">${isZ ? 'Clôture définitive' : 'Document non définitif'}</p>`,
    `<p style="text-align:center;font-size:9pt">elm-pos</p>`,
  ].join('');

  const win = window.open('', '_blank', 'width=380,height=750');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Rapport ${data.type}</title>
    <style>body{font-family:'Courier New',monospace;font-size:11pt;width:72mm;margin:0;padding:4mm}
    @media print{@page{margin:4mm}}</style>
  </head><body>${body}</body></html>`);
  win.document.close();
  setTimeout(() => { win.print(); win.close(); }, 300);
}

// -- ReportModal ---------------------------------------------------------------

function RRow({ label, value, bold = false, color }: {
  label: string; value: string; bold?: boolean; color?: string;
}) {
  return (
    <div className={`flex justify-between gap-2 text-[11px] ${bold ? 'font-bold' : ''}`}>
      <span className="text-gray-500">{label}</span>
      <span className={color ?? 'text-gray-800'}>{value}</span>
    </div>
  );
}

function ReportModal({ data, onClose }: { data: ReportData; onClose: () => void }) {
  const fmt  = (n: number) => formatCurrency(n, data.currency);
  const isZ  = data.type === 'Z';
  const diff = data.difference ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="card p-0 w-full max-w-sm overflow-hidden flex flex-col" style={{ maxHeight: '90vh' }}>

        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-surface-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-brand-600/20 rounded-lg">
              <FileText className="w-4 h-4 text-content-brand" />
            </div>
            <div>
              <h2 className="font-semibold text-content-primary text-base leading-none">
                Rapport {data.type} — {isZ ? 'Clôture' : 'Lecture'}
              </h2>
              <p className="text-xs text-content-muted mt-0.5">
                {isZ ? 'Clôture définitive de session' : 'Lecture en cours de journée'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-content-secondary hover:text-content-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="bg-white rounded-xl p-4 font-mono shadow-inner">
            <p className="text-center font-bold text-sm text-content-primary mb-0.5">{data.businessName}</p>
            <p className="text-center text-[10px] text-gray-500 border-b border-dashed border-gray-300 pb-1 mb-1">
              {isZ ? '— RAPPORT Z — CLÔTURE —' : '— RAPPORT X — LECTURE —'}
            </p>
            <p className="text-center text-[10px] text-gray-500 mb-1">
              {format(new Date(data.generatedAt), 'dd/MM/yyyy HH:mm', { locale: fr })}
            </p>

            <div className="border-t border-dashed border-gray-200 pt-1 pb-1 space-y-0.5">
              <RRow label="Ouverture" value={format(new Date(data.openedAt), 'dd/MM HH:mm', { locale: fr })} />
              {isZ && data.closedAt && <RRow label="Clôture" value={format(new Date(data.closedAt), 'dd/MM HH:mm', { locale: fr })} />}
              <RRow label="Caissier" value={data.cashierName} />
            </div>

            <div className="border-t border-dashed border-gray-200 pt-1 pb-1 space-y-0.5">
              <RRow label="Fond de caisse" value={fmt(data.openingAmount)} />
            </div>

            <div className="border-t border-dashed border-gray-200 pt-1 pb-1 space-y-0.5">
              <RRow label="Espèces"      value={fmt(data.totalCash)} />
              <RRow label="Carte"        value={fmt(data.totalCard)} />
              <RRow label="Mobile Money" value={fmt(data.totalMobile)} />
              {data.totalRefunds > 0 && <RRow label="Remboursements" value={`-${fmt(data.totalRefunds)}`} />}
            </div>

            <div className="border-t border-dashed border-gray-200 pt-1 pb-1 space-y-0.5">
              <RRow label="TOTAL VENTES" value={fmt(data.totalSales)}    bold />
              <RRow label="Transactions" value={String(data.totalOrders)} />
            </div>

            <div className="border-t border-dashed border-gray-200 pt-1 pb-1 space-y-0.5">
              <RRow label="Fond initial"      value={fmt(data.openingAmount)} />
              <RRow label="+ Espèces reçues"  value={fmt(data.totalCash)} />
              <RRow label="= ATTENDUES"       value={fmt(data.expectedCash)} bold />
            </div>

            {isZ && data.actualCash != null && (
              <div className="border-t border-dashed border-gray-200 pt-1 pb-1 space-y-0.5">
                <RRow label="Espèces comptées" value={fmt(data.actualCash)} />
                <RRow
                  label="ÉCART"
                  value={`${diff >= 0 ? '+' : ''}${fmt(diff)}`}
                  bold
                  color={Math.abs(diff) < 1 ? 'text-green-700' : diff > 0 ? 'text-blue-700' : 'text-red-700'}
                />
                <p className={`text-center text-[11px] font-bold ${
                  Math.abs(diff) < 1 ? 'text-green-700' : diff > 0 ? 'text-blue-700' : 'text-red-700'
                }`}>
                  {Math.abs(diff) < 1 ? '✓ ÉQUILIBRÉE' : diff > 0 ? '▲ EXCÉDENT' : '▼ DÉFICIT'}
                </p>
              </div>
            )}

            {data.notes && (
              <div className="border-t border-dashed border-gray-200 pt-1">
                <p className="text-[10px] italic text-gray-500">Notes : {data.notes}</p>
              </div>
            )}

            <p className="text-center text-[10px] text-gray-400 border-t border-dashed border-gray-200 pt-1 mt-1">
              {isZ ? 'Document définitif' : 'Non définitif'} · elm-pos
            </p>
          </div>
        </div>

        <div className="flex gap-2 p-4 border-t border-surface-border">
          <button onClick={onClose} className="btn-secondary flex-1 h-11">Fermer</button>
          <button
            onClick={() => printReport(data)}
            className="btn-primary flex-1 h-11 flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Imprimer
          </button>
        </div>
      </div>
    </div>
  );
}

// -- MetricCard ----------------------------------------------------------------

function MetricCard({
  label, value, icon: Icon, color = 'text-content-primary',
}: { label: string; value: string; icon: React.ElementType; color?: string }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-surface-input flex items-center justify-center shrink-0">
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-content-muted truncate">{label}</p>
        <p className={`text-lg font-bold truncate ${color}`}>{value}</p>
      </div>
    </div>
  );
}

// -- OpenModal -----------------------------------------------------------------

function OpenModal({
  currency,
  onConfirm,
  onClose,
}: { currency: string; onConfirm: (amount: number) => Promise<void>; onClose: () => void }) {
  const [amount, setAmount]   = useState('');
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try { await onConfirm(parseFloat(amount) || 0); } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card p-6 w-full max-w-sm space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-content-primary text-lg">Ouvrir la caisse</h2>
          <button onClick={onClose} className="text-content-secondary hover:text-content-primary"><X className="w-5 h-5" /></button>
        </div>
        <div>
          <label className="label">Fond de caisse (espèces disponibles)</label>
          <input
            type="number" min="0" step="100" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input text-xl font-bold text-center"
            placeholder="0" autoFocus
          />
          <p className="text-xs text-content-muted mt-1.5">
            Montant en espèces présent dans la caisse en début de session.
          </p>
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1 h-11">Annuler</button>
          <button
            onClick={handleConfirm} disabled={loading}
            className="btn-primary flex-1 h-11 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            <LockOpen className="w-4 h-4" />Ouvrir
          </button>
        </div>
      </div>
    </div>
  );
}

// -- CloseModal ----------------------------------------------------------------

function CloseModal({
  session, summary, currency, onConfirm, onClose,
}: {
  session: CashSession; summary: SessionLiveSummary; currency: string;
  onConfirm: (actualCash: number, notes: string) => Promise<void>; onClose: () => void;
}) {
  const [actualCash, setActualCash] = useState('');
  const [notes, setNotes]           = useState('');
  const [loading, setLoading]       = useState(false);

  const fmt          = (n: number) => formatCurrency(n, currency);
  const expectedCash = session.opening_amount + summary.total_cash;
  const actualNum    = parseFloat(actualCash) || 0;
  const difference   = actualNum - expectedCash;

  async function handleConfirm() {
    setLoading(true);
    try { await onConfirm(actualNum, notes); } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card p-6 w-full max-w-md space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-content-primary text-lg">Clôturer la caisse</h2>
          <button onClick={onClose} className="text-content-secondary hover:text-content-primary"><X className="w-5 h-5" /></button>
        </div>

        <div className="bg-surface-input rounded-xl p-4 space-y-2 text-sm">
          <p className="text-xs text-content-muted uppercase tracking-wider font-medium mb-3">Résumé de la session</p>
          <div className="flex justify-between"><span className="text-content-secondary">Fond de caisse</span><span className="text-content-primary font-medium">{fmt(session.opening_amount)}</span></div>
          <div className="flex justify-between"><span className="text-content-secondary">Ventes espèces</span><span className="text-status-success font-medium">+{fmt(summary.total_cash)}</span></div>
          {summary.total_card > 0 && <div className="flex justify-between"><span className="text-content-secondary">Ventes carte</span><span className="text-content-primary">{fmt(summary.total_card)}</span></div>}
          {summary.total_mobile > 0 && <div className="flex justify-between"><span className="text-content-secondary">Ventes mobile money</span><span className="text-content-primary">{fmt(summary.total_mobile)}</span></div>}
          {summary.total_refunds > 0 && <div className="flex justify-between"><span className="text-content-secondary">Remboursements</span><span className="text-status-error">-{fmt(summary.total_refunds)}</span></div>}
          <div className="flex justify-between font-bold border-t border-surface-border pt-2 mt-1"><span className="text-content-primary">Total ventes</span><span className="text-content-brand">{fmt(summary.total_sales)}</span></div>
          <div className="flex justify-between font-semibold"><span className="text-content-primary">Espèces attendues en caisse</span><span className="text-content-primary">{fmt(expectedCash)}</span></div>
        </div>

        <div>
          <label className="label">Espèces comptées (montant réel en caisse)</label>
          <input
            type="number" min="0" step="100" value={actualCash}
            onChange={(e) => setActualCash(e.target.value)}
            className="input text-xl font-bold text-center"
            placeholder={fmt(expectedCash)} autoFocus
          />
        </div>

        {actualCash && (
          <div className={`rounded-xl p-4 border text-center ${
            Math.abs(difference) < 1 ? 'bg-badge-success border-status-success'
              : difference > 0       ? 'bg-badge-info border-blue-700'
                                     : 'bg-badge-error border-status-error'
          }`}>
            <p className="text-xs text-content-secondary mb-1">Écart</p>
            <p className={`text-2xl font-bold ${
              Math.abs(difference) < 1 ? 'text-status-success' : difference > 0 ? 'text-status-info' : 'text-status-error'
            }`}>
              {difference >= 0 ? '+' : ''}{fmt(difference)}
            </p>
            <p className="text-xs text-content-muted mt-1">
              {Math.abs(difference) < 1 ? 'Caisse équilibrée' : difference > 0 ? 'Excédent de caisse' : 'Déficit de caisse'}
            </p>
          </div>
        )}

        <div>
          <label className="label">Notes (optionnel)</label>
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)}
            className="input resize-none h-16" placeholder="Ex : Erreur de rendu, billet abîmé…"
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1 h-11">Annuler</button>
          <button
            onClick={handleConfirm} disabled={loading || !actualCash}
            className="btn-danger flex-1 h-11 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            <Lock className="w-4 h-4" />Clôturer
          </button>
        </div>
      </div>
    </div>
  );
}

// -- Page principale -----------------------------------------------------------

export default function CaissePage() {
  const { business, user }                      = useAuthStore();
  const { success, error: notifError }          = useNotificationStore();
  const { session, setSession, loaded }         = useCashSessionStore();

  const [summary, setSummary]               = useState<SessionLiveSummary | null>(null);
  const [history, setHistory]               = useState<CashSession[]>([]);
  const [refreshing, setRefreshing]         = useState(false);
  const [showOpenModal, setShowOpenModal]   = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [tab, setTab]                       = useState<'session' | 'historique'>('session');
  const [reportData, setReportData]         = useState<ReportData | null>(null);

  const currency     = business?.currency ?? 'XOF';
  const fmt          = (n: number) => formatCurrency(n, currency);
  const cashierName  = user?.full_name ?? '—';
  const businessName = business?.name  ?? 'Caisse';

  const loadSummary = useCallback(async () => {
    if (!session) return;
    try { setSummary(await getLiveSummary(session.id)); } catch { /* silencieux */ }
  }, [session]);

  const loadHistory = useCallback(async () => {
    if (!business) return;
    setHistory(await getSessionHistory(business.id));
  }, [business]);

  useEffect(() => {
    if (!loaded || !business) return;
    loadHistory();
  }, [loaded, business, loadHistory]);

  useEffect(() => {
    if (!session) return;
    loadSummary();
    const id = setInterval(loadSummary, 30_000);
    return () => clearInterval(id);
  }, [session, loadSummary]);

  async function handleRefresh() {
    setRefreshing(true);
    try { await loadSummary(); } finally { setRefreshing(false); }
  }

  async function handleOpen(amount: number) {
    if (!business) return;
    const s = await openSession(business.id, amount);
    setSession(s);
    setShowOpenModal(false);
    setSummary(null);
    success('Caisse ouverte');
    logAction({ business_id: business.id, action: 'cash_session.opened', metadata: { opening_amount: amount } });
    await loadHistory();
  }

  async function handleClose(actualCash: number, notes: string) {
    if (!session) return;
    try {
      const closed = await closeSession(session.id, actualCash, notes || undefined);
      setSession(null);
      setShowCloseModal(false);
      setSummary(null);
      success('Caisse clôturée');
      logAction({
        business_id: session.business_id,
        action: 'cash_session.closed',
        metadata: {
          actual_cash:   actualCash,
          expected_cash: closed.expected_cash,
          difference:    closed.difference,
          total_sales:   closed.total_sales,
          notes:         notes || null,
        },
      });
      setHistory((h) => [closed, ...h.filter((s) => s.id !== closed.id)]);
      // Afficher le Z-Report automatiquement après clôture
      setReportData(buildReportData('Z', closed, null, businessName, cashierName, currency));
    } catch (e) {
      notifError(toUserError(e));
    }
  }

  function handleShowXReport() {
    if (!session || !summary) return;
    setReportData(buildReportData('X', session, summary, businessName, cashierName, currency));
  }

  function handleShowZReport(s: CashSession) {
    setReportData(buildReportData('Z', s, null, businessName, '—', currency));
  }

  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* En-tête */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-content-primary">Clôture de caisse</h1>
            <p className="text-sm text-content-secondary mt-0.5">
              {session
                ? `Session ouverte le ${format(new Date(session.opened_at), 'dd MMM à HH:mm', { locale: fr })}`
                : 'Aucune session active'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {session && (
              <>
                <button
                  onClick={handleRefresh} disabled={refreshing}
                  className="btn-secondary p-2" title="Actualiser"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
                {summary && (
                  <button
                    onClick={handleShowXReport}
                    className="btn-secondary flex items-center gap-1.5 text-sm"
                    title="Rapport X — lecture de caisse"
                  >
                    <FileText className="w-4 h-4" />
                    Rapport X
                  </button>
                )}
              </>
            )}
            {!session ? (
              <button onClick={() => setShowOpenModal(true)} className="btn-primary flex items-center gap-2">
                <LockOpen className="w-4 h-4" />Ouvrir la caisse
              </button>
            ) : (
              <button
                onClick={() => { loadSummary().then(() => setShowCloseModal(true)); }}
                className="btn-danger flex items-center gap-2"
              >
                <Lock className="w-4 h-4" />Clôturer
              </button>
            )}
          </div>
        </div>

        {/* Explication */}
        <div className="card p-5 border-l-4 border-brand-500 space-y-4">
          <p className="text-sm font-semibold text-content-primary">Comment ça fonctionne ?</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { n: 1, title: 'Ouvrir la caisse', body: "Indiquez le montant d'espèces déjà présent — c'est le fond de caisse." },
              { n: 2, title: 'Encaisser normalement', body: 'Toutes les ventes de la session sont comptabilisées automatiquement.' },
              { n: 3, title: 'Clôturer en fin de service', body: "Comptez les billets, saisissez le total. Le Z-Report calcule l'écart." },
            ].map(({ n, title, body }) => (
              <div key={n} className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-full bg-brand-600 text-content-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</span>
                <div>
                  <p className="text-sm font-medium text-content-primary">{title}</p>
                  <p className="text-xs text-content-secondary mt-0.5 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 pt-1 border-t border-surface-border text-xs text-content-muted">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />Écart nul = caisse équilibrée</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />Écart positif = excédent</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Écart négatif = déficit</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-surface-input rounded-xl p-1 w-fit">
          {([
            { id: 'session',    label: 'Session en cours' },
            { id: 'historique', label: 'Historique' },
          ] as const).map(({ id, label }) => (
            <button
              key={id} onClick={() => setTab(id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${tab === id ? 'bg-brand-600 text-content-primary' : 'text-content-secondary hover:text-content-primary'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* -- Onglet Session -- */}
        {tab === 'session' && (
          <>
            {!session ? (
              <div className="card p-12 flex flex-col items-center gap-4 text-center">
                <div className="w-16 h-16 rounded-2xl bg-surface-input flex items-center justify-center">
                  <Lock className="w-8 h-8 text-content-muted" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-content-primary">Caisse fermée</p>
                  <p className="text-sm text-content-secondary mt-1">Ouvrez une session pour commencer à encaisser.</p>
                </div>
                <button onClick={() => setShowOpenModal(true)} className="btn-primary flex items-center gap-2 mt-2">
                  <LockOpen className="w-4 h-4" />Ouvrir la caisse
                </button>
              </div>
            ) : (
              <>
                <div className="card p-4 flex items-center gap-3 border-l-4 border-brand-500">
                  <Banknote className="w-5 h-5 text-content-brand shrink-0" />
                  <div>
                    <p className="text-xs text-content-muted">Fond de caisse initial</p>
                    <p className="text-xl font-bold text-content-primary">{fmt(session.opening_amount)}</p>
                  </div>
                </div>

                {summary ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <MetricCard label="Total ventes"   value={fmt(summary.total_sales)}              icon={CheckCircle} color="text-content-brand" />
                    <MetricCard label="Espèces"         value={fmt(summary.total_cash)}              icon={Banknote}    color="text-status-success" />
                    <MetricCard label="Carte"           value={fmt(summary.total_card)}              icon={CreditCard}  color="text-status-info" />
                    <MetricCard label="Mobile Money"    value={fmt(summary.total_mobile)}            icon={Smartphone}  color="text-status-purple" />
                    <MetricCard label="Transactions"    value={String(summary.total_orders)}         icon={CheckCircle} color="text-content-primary" />
                    {summary.total_refunds > 0 && (
                      <MetricCard label="Remboursements" value={`-${fmt(summary.total_refunds)}`}   icon={RotateCcw}   color="text-status-error" />
                    )}
                  </div>
                ) : (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-content-brand" />
                  </div>
                )}

                {summary && (
                  <div className="card p-4 space-y-2 text-sm">
                    <p className="text-xs text-content-muted uppercase tracking-wider font-medium">Espèces attendues en caisse</p>
                    <div className="flex justify-between"><span className="text-content-secondary">Fond initial</span><span className="text-content-primary">{fmt(session.opening_amount)}</span></div>
                    <div className="flex justify-between"><span className="text-content-secondary">+ Ventes espèces</span><span className="text-status-success">+{fmt(summary.total_cash)}</span></div>
                    <div className="flex justify-between font-bold border-t border-surface-border pt-2">
                      <span className="text-content-primary">Total attendu</span>
                      <span className="text-content-brand">{fmt(session.opening_amount + summary.total_cash)}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* -- Onglet Historique -- */}
        {tab === 'historique' && (
          <div className="space-y-3">
            {history.filter((s) => s.status === 'closed').length === 0 ? (
              <div className="card p-12 flex flex-col items-center gap-3 text-center">
                <History className="w-10 h-10 text-content-muted" />
                <p className="text-content-muted">Aucune clôture enregistrée</p>
              </div>
            ) : (
              history.filter((s) => s.status === 'closed').map((s) => {
                const diff = s.difference ?? 0;
                return (
                  <div key={s.id} className="card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-content-primary">
                          {format(new Date(s.opened_at), 'EEEE dd MMMM yyyy', { locale: fr })}
                        </p>
                        <p className="text-xs text-content-muted">
                          {format(new Date(s.opened_at), 'HH:mm')}
                          {' → '}
                          {s.closed_at && format(new Date(s.closed_at), 'HH:mm')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleShowZReport(s)}
                          className="flex items-center gap-1.5 text-xs text-content-secondary hover:text-content-brand transition-colors px-2 py-1 rounded-lg hover:bg-surface-hover"
                          title="Voir le rapport Z"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Rapport Z
                        </button>
                        <span className={`text-sm font-bold ${
                          Math.abs(diff) < 1 ? 'text-status-success' : diff > 0 ? 'text-status-info' : 'text-status-error'
                        }`}>
                          {diff >= 0 ? '+' : ''}{fmt(diff)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-surface-input rounded-lg px-3 py-2">
                        <p className="text-content-muted">Ventes</p>
                        <p className="text-content-primary font-semibold">{fmt(s.total_sales ?? 0)}</p>
                      </div>
                      <div className="bg-surface-input rounded-lg px-3 py-2">
                        <p className="text-content-muted">Espèces attendues</p>
                        <p className="text-content-primary font-semibold">{fmt(s.expected_cash ?? 0)}</p>
                      </div>
                      <div className="bg-surface-input rounded-lg px-3 py-2">
                        <p className="text-content-muted">Espèces comptées</p>
                        <p className="text-content-primary font-semibold">{fmt(s.actual_cash ?? 0)}</p>
                      </div>
                    </div>

                    {Math.abs(diff) >= 1 && (
                      <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
                        diff > 0 ? 'border-blue-800 bg-badge-info text-status-info'
                                 : 'border-status-error bg-badge-error text-status-error'
                      }`}>
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        {diff > 0 ? 'Excédent' : 'Déficit'} de {fmt(Math.abs(diff))}
                        {s.notes && ` — ${s.notes}`}
                      </div>
                    )}

                    <div className="flex gap-3 text-xs text-content-muted">
                      <span className="text-status-success">Esp. {fmt(s.total_cash ?? 0)}</span>
                      <span>·</span>
                      <span className="text-status-info">CB {fmt(s.total_card ?? 0)}</span>
                      <span>·</span>
                      <span className="text-status-purple">Mobile {fmt(s.total_mobile ?? 0)}</span>
                      <span>·</span>
                      <span>{s.total_orders ?? 0} ventes</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showOpenModal && (
        <OpenModal currency={currency} onConfirm={handleOpen} onClose={() => setShowOpenModal(false)} />
      )}
      {showCloseModal && session && summary && (
        <CloseModal
          session={session} summary={summary} currency={currency}
          onConfirm={handleClose} onClose={() => setShowCloseModal(false)}
        />
      )}
      {reportData && (
        <ReportModal data={reportData} onClose={() => setReportData(null)} />
      )}
    </div>
  );
}
