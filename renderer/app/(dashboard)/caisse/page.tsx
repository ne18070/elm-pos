'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Loader2, LockOpen, Lock, RefreshCw, Banknote, CreditCard,
  Smartphone, RotateCcw, History, CheckCircle, AlertTriangle,
  Printer, FileText, Search, Filter, Calendar, Clock, User
} from 'lucide-react';
import { format, differenceInMinutes, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useCan } from '@/hooks/usePermission';
import { useCashSessionStore } from '@/store/cashSession';

import { formatCurrency } from '@/lib/utils';
import { toUserError } from '@/lib/user-error';
import {
  openSession, closeSession, getLiveSummary, getSessionHistory,
  type CashSession, type SessionLiveSummary,
} from '@services/supabase/cash-sessions';
import { logAction } from '@services/supabase/logger';

// Local components & utils
import { MetricCard } from './_components/MetricCard';
import { OpenModal } from './_components/OpenModal';
import { CloseModal } from './_components/CloseModal';
import { ReportModal } from './_components/ReportModal';
import { buildReportData, type ReportData } from './_lib/report-utils';

export default function CaissePage() {
  const { business, user }                      = useAuthStore();
  const { success, error: notifError }          = useNotificationStore();
  const { session, setSession, loaded }         = useCashSessionStore();
  const can = useCan();

  const [summary, setSummary]               = useState<SessionLiveSummary | null>(null);
  const [history, setHistory]               = useState<CashSession[]>([]);
  const [refreshing, setRefreshing]         = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showOpenModal, setShowOpenModal]   = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [tab, setTab]                       = useState<'session' | 'historique'>('session');
  const [reportData, setReportData]         = useState<ReportData | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Filters for history
  const [historySearch, setHistorySearch]   = useState('');
  const [historyFilter, setHistoryFilter]   = useState<'all' | 'discrepancy'>('all');
  const [dateRange, setDateRange]           = useState<{ from?: Date; to?: Date }>({});

  const currency     = business?.currency ?? 'XOF';
  const fmt          = (n: number) => formatCurrency(n, currency);
  const cashierName  = user?.full_name ?? '—';
  const businessName = business?.name  ?? 'Caisse';

  // Point 2: Improved error handling for summary loading
  const loadSummary = useCallback(async (showError = false) => {
    if (!session) return;
    try { 
      const data = await getLiveSummary(session.id);
      setSummary(data); 
      setLastRefreshedAt(new Date());
    } catch (e) {
      if (showError) notifError(toUserError(e));
      console.error('Failed to load session summary:', e);
    }
  }, [session, notifError]);

  // Point 2: Improved error handling for history loading
  const loadHistory = useCallback(async (showError = false) => {
    if (!business) return;
    setLoadingHistory(true);
    try {
      const data = await getSessionHistory(business.id);
      setHistory(data);
    } catch (e) {
      if (showError) notifError(toUserError(e));
    } finally {
      setLoadingHistory(false);
    }
  }, [business, notifError]);

  useEffect(() => {
    if (!loaded || !business) return;
    loadHistory();
  }, [loaded, business, loadHistory]);

  useEffect(() => {
    if (!session) return;
    loadSummary();
    const id = setInterval(() => loadSummary(false), 30_000);
    return () => clearInterval(id);
  }, [session, loadSummary]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadSummary(true);
    setRefreshing(false);
  }

  // Point 2: Improved error handling for opening session
  async function handleOpen(amount: number) {
    if (!business) return;
    try {
      const s = await openSession(business.id, amount);
      setSession(s);
      setShowOpenModal(false);
      setSummary(null);
      success('Caisse ouverte');
      logAction({ business_id: business.id, action: 'cash_session.opened', metadata: { opening_amount: amount } });
      await loadHistory();
    } catch (e) {
      notifError(toUserError(e));
    }
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

  // Point 6: History filtering
  const filteredHistory = useMemo(() => {
    return history.filter(s => {
      if (s.status !== 'closed') return false;
      
      const matchesSearch = !historySearch || 
        (s.notes?.toLowerCase().includes(historySearch.toLowerCase())) ||
        (s.id.toLowerCase().includes(historySearch.toLowerCase()));
      
      const matchesDiscrepancy = historyFilter === 'all' || Math.abs(s.difference ?? 0) >= 1;
      
      const date = new Date(s.opened_at);
      const matchesDate = (!dateRange.from || date >= startOfDay(dateRange.from)) &&
                          (!dateRange.to   || date <= endOfDay(dateRange.to));

      return matchesSearch && matchesDiscrepancy && matchesDate;
    });
  }, [history, historySearch, historyFilter, dateRange]);

  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  // Point 4: Session status calculation
  const sessionDuration = session 
    ? differenceInMinutes(new Date(), new Date(session.opened_at))
    : 0;
  const durationStr = sessionDuration > 60 
    ? `${Math.floor(sessionDuration / 60)}h ${sessionDuration % 60}m`
    : `${sessionDuration}m`;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* En-tête - Point 5: Improved mobile layout */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-content-primary">Gestion de caisse</h1>
            <p className="text-xs text-content-secondary mt-0.5">
              Ouvrez une session, encaissez, puis clôturez en fin de service
            </p>
          </div>
          <div className="flex items-center gap-2">
            {session && (
              <>
                <button
                  onClick={handleRefresh} disabled={refreshing}
                  className="btn-secondary p-2.5" title="Actualiser"
                  aria-label="Actualiser les données"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
                {summary && (
                  <button
                    onClick={handleShowXReport}
                    className="btn-secondary flex items-center gap-1.5 text-sm h-10 px-3"
                    title="Rapport X — lecture de caisse"
                  >
                    <FileText className="w-4 h-4" />
                    <span className="hidden sm:inline">Rapport X</span>
                    <span className="sm:hidden">X-Report</span>
                  </button>
                )}
              </>
            )}
            {can('manage_cash_session') && (
              <>
                {!session ? (
                  <button onClick={() => setShowOpenModal(true)} className="btn-primary flex-1 sm:flex-none flex items-center justify-center gap-2 h-10 px-4">
                    <LockOpen className="w-4 h-4" />Ouvrir la caisse
                  </button>
                ) : (
                  <button
                    onClick={() => { loadSummary(true).then(() => setShowCloseModal(true)); }}
                    className="btn-danger flex-1 sm:flex-none flex items-center justify-center gap-2 h-10 px-4"
                  >
                    <Lock className="w-4 h-4" />Clôturer
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Tabs - Point 5: Scrollable on mobile if needed */}
        <div className="flex gap-1 bg-surface-input rounded-xl p-1 w-full sm:w-fit overflow-x-auto no-scrollbar">
          {([
            { id: 'session',    label: 'Session en cours' },
            { id: 'historique', label: 'Historique' },
          ] as const).map(({ id, label }) => (
            <button
              key={id} onClick={() => setTab(id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-1 sm:flex-none
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
              <div className="space-y-4">
                {/* État fermé */}
                <div className="card p-8 flex flex-col items-center gap-3 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-surface-input flex items-center justify-center">
                    <Lock className="w-8 h-8 text-content-muted" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-content-primary">Caisse fermée</p>
                    <p className="text-sm text-content-secondary mt-1">Aucune session active — cliquez sur le bouton pour démarrer.</p>
                  </div>
                  <button onClick={() => setShowOpenModal(true)} className="btn-primary flex items-center gap-2 mt-1">
                    <LockOpen className="w-4 h-4" />Ouvrir la caisse
                  </button>
                </div>

                {/* Conditions / guide d'ouverture */}
                <div className="card p-5 border-l-4 border-brand-500 space-y-4">
                  <p className="text-sm font-semibold text-content-primary">Comment ça fonctionne ?</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { n: 1, title: 'Ouvrir la caisse', body: "Indiquez le montant d'espèces déjà présent dans le tiroir — c'est le fond de caisse de départ." },
                      { n: 2, title: 'Encaisser normalement', body: 'Toutes les ventes de la session sont comptabilisées automatiquement en temps réel.' },
                      { n: 3, title: 'Clôturer en fin de service', body: "Comptez les billets, saisissez le total. Le Z-Report calcule l'écart et imprime le rapport." },
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
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Point 4: Active session status strip */}
                <div className="bg-surface-input rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-y-2 gap-x-6 text-[11px] font-medium text-content-secondary border border-surface-border">
                  <div className="flex items-center gap-1.5" title="Caissier actuel">
                    <User className="w-3.5 h-3.5 text-content-muted" />
                    <span>Caissier : <span className="text-content-primary">{cashierName}</span></span>
                  </div>
                  <div className="flex items-center gap-1.5" title="Durée de la session">
                    <Clock className="w-3.5 h-3.5 text-content-muted" />
                    <span>Ouvert depuis : <span className="text-content-primary">{durationStr}</span></span>
                  </div>
                  <div className="flex items-center gap-1.5" title="Dernière mise à jour des données">
                    <RefreshCw className={`w-3.5 h-3.5 text-content-muted ${refreshing ? 'animate-spin' : ''}`} />
                    <span>MàJ : <span className="text-content-primary">{format(lastRefreshedAt, 'HH:mm:ss')}</span></span>
                  </div>
                  {summary && (
                    <div className="ml-auto flex items-center gap-1.5" title="Espèces attendues actuellement">
                      <Banknote className="w-3.5 h-3.5 text-status-success" />
                      <span>Attendu : <span className="text-content-primary font-bold">{fmt(session.opening_amount + summary.total_cash - summary.total_refunds)}</span></span>
                    </div>
                  )}
                </div>

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
                    {summary.total_refunds > 0 && (
                       <div className="flex justify-between"><span className="text-content-secondary">- Remboursements</span><span className="text-status-error">-{fmt(summary.total_refunds)}</span></div>
                    )}
                    <div className="flex justify-between font-bold border-t border-surface-border pt-2">
                      <span className="text-content-primary">Total attendu</span>
                      <span className="text-content-brand">{fmt(session.opening_amount + summary.total_cash - summary.total_refunds)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* -- Onglet Historique -- */}
        {tab === 'historique' && (
          <div className="space-y-4">
            
            {/* Point 6: History Filters */}
            <div className="card p-3 space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
                  <input 
                    type="text"
                    placeholder="Rechercher par note ou ID..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="input pl-9 h-10 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <select 
                    value={historyFilter}
                    onChange={(e) => setHistoryFilter(e.target.value as any)}
                    className="input h-10 text-sm py-0 px-3 w-40"
                  >
                    <option value="all">Toutes les sessions</option>
                    <option value="discrepancy">Écarts uniquement</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[11px] text-content-muted border-t border-surface-border pt-2">
                <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Filtrer par date :</span>
                <div className="flex items-center gap-2">
                  <input 
                    type="date" 
                    onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value ? new Date(e.target.value) : undefined }))}
                    className="bg-transparent border-none p-0 focus:ring-0 text-[11px] text-content-primary"
                  />
                  <span>→</span>
                  <input 
                    type="date" 
                    onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value ? new Date(e.target.value) : undefined }))}
                    className="bg-transparent border-none p-0 focus:ring-0 text-[11px] text-content-primary"
                  />
                  {(dateRange.from || dateRange.to || historySearch || historyFilter !== 'all') && (
                    <button 
                      onClick={() => { setHistorySearch(''); setHistoryFilter('all'); setDateRange({}); }}
                      className="text-brand-500 hover:text-brand-600 font-medium ml-2"
                    >
                      Réinitialiser
                    </button>
                  )}
                </div>
              </div>
            </div>

            {loadingHistory ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="card p-12 flex flex-col items-center gap-3 text-center">
                <History className="w-10 h-10 text-content-muted" />
                <p className="text-content-muted">Aucune clôture enregistrée avec ces filtres</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredHistory.map((s) => {
                  const diff = s.difference ?? 0;
                  return (
                    <div key={s.id} className="card p-4 space-y-3 hover:border-surface-border-hover transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-content-primary">
                            {format(new Date(s.opened_at), 'EEEE dd MMMM yyyy', { locale: fr })}
                          </p>
                          <p className="text-xs text-content-muted flex items-center gap-1.5 mt-0.5">
                            <Clock className="w-3 h-3" />
                            {format(new Date(s.opened_at), 'HH:mm')}
                            {' → '}
                            {s.closed_at && format(new Date(s.closed_at), 'HH:mm')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleShowZReport(s)}
                            className="flex items-center gap-1.5 text-xs text-content-secondary hover:text-content-brand transition-colors px-2 py-1.5 rounded-lg hover:bg-surface-hover border border-transparent hover:border-surface-border"
                            title="Voir le rapport Z"
                            aria-label="Voir le rapport Z"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Rapport Z</span>
                          </button>
                          <span className={`text-sm font-bold px-2 py-1 rounded-lg ${
                            Math.abs(diff) < 1 ? 'text-status-success bg-status-success/10' 
                              : diff > 0 ? 'text-status-info bg-status-info/10' 
                              : 'text-status-error bg-status-error/10'
                          }`}>
                            {diff >= 0 ? '+' : ''}{fmt(diff)}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-[11px]">
                        <div className="bg-surface-input/50 rounded-lg px-3 py-2 border border-surface-border/50">
                          <p className="text-content-muted mb-0.5">Ventes totales</p>
                          <p className="text-content-primary font-bold">{fmt(s.total_sales ?? 0)}</p>
                        </div>
                        <div className="bg-surface-input/50 rounded-lg px-3 py-2 border border-surface-border/50">
                          <p className="text-content-muted mb-0.5">Esp. attendues</p>
                          <p className="text-content-primary font-bold">{fmt(s.expected_cash ?? 0)}</p>
                        </div>
                        <div className="bg-surface-input/50 rounded-lg px-3 py-2 border border-surface-border/50">
                          <p className="text-content-muted mb-0.5">Esp. comptées</p>
                          <p className="text-content-primary font-bold">{fmt(s.actual_cash ?? 0)}</p>
                        </div>
                      </div>

                      {Math.abs(diff) >= 1 && (
                        <div className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg border ${
                          diff > 0 ? 'border-blue-800/30 bg-badge-info/50 text-status-info'
                                   : 'border-status-error/30 bg-badge-error/50 text-status-error'
                        }`}>
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold">{diff > 0 ? 'Excédent' : 'Déficit'} de {fmt(Math.abs(diff))}</span>
                            {s.notes && <p className="mt-0.5 opacity-90 italic">« {s.notes} »</p>}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-content-muted pt-1 border-t border-surface-border/30">
                        <span className="flex items-center gap-1"><Banknote className="w-3 h-3" /> {fmt(s.total_cash ?? 0)}</span>
                        <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" /> {fmt(s.total_card ?? 0)}</span>
                        <span className="flex items-center gap-1"><Smartphone className="w-3 h-3" /> {fmt(s.total_mobile ?? 0)}</span>
                        {s.total_refunds ? (
                          <span className="flex items-center gap-1 text-status-error"><RotateCcw className="w-3 h-3" /> {fmt(s.total_refunds)}</span>
                        ) : null}
                        <span className="ml-auto">{s.total_orders ?? 0} transactions</span>
                      </div>
                    </div>
                  );
                })}
              </div>
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
