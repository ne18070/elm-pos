import { toUserError } from '@/lib/user-error';
'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Loader2, LockOpen, Lock, RefreshCw, Banknote, CreditCard,
  Smartphone, RotateCcw, History, CheckCircle, AlertTriangle, X,
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

// ── Composant : carte métrique ────────────────────────────────────────────────

function MetricCard({
  label, value, icon: Icon, color = 'text-white',
}: { label: string; value: string; icon: React.ElementType; color?: string }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-surface-input flex items-center justify-center shrink-0">
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 truncate">{label}</p>
        <p className={`text-lg font-bold truncate ${color}`}>{value}</p>
      </div>
    </div>
  );
}

// ── Modal : ouverture de caisse ───────────────────────────────────────────────

function OpenModal({
  currency,
  onConfirm,
  onClose,
}: { currency: string; onConfirm: (amount: number) => Promise<void>; onClose: () => void }) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm(parseFloat(amount) || 0);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card p-6 w-full max-w-sm space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white text-lg">Ouvrir la caisse</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label className="label">Fond de caisse (espèces disponibles)</label>
          <input
            type="number"
            min="0"
            step="100"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input text-xl font-bold text-center"
            placeholder="0"
            autoFocus
          />
          <p className="text-xs text-slate-500 mt-1.5">
            Montant en espèces present dans la caisse en début de session.
          </p>
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1 h-11">Annuler</button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="btn-primary flex-1 h-11 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            <LockOpen className="w-4 h-4" />
            Ouvrir
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal : clôture de caisse ─────────────────────────────────────────────────

function CloseModal({
  session,
  summary,
  currency,
  onConfirm,
  onClose,
}: {
  session: CashSession;
  summary: SessionLiveSummary;
  currency: string;
  onConfirm: (actualCash: number, notes: string) => Promise<void>;
  onClose: () => void;
}) {
  const [actualCash, setActualCash] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const fmt = (n: number) => formatCurrency(n, currency);
  const expectedCash = session.opening_amount + summary.total_cash;
  const actualNum = parseFloat(actualCash) || 0;
  const difference = actualNum - expectedCash;

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm(actualNum, notes);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card p-6 w-full max-w-md space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white text-lg">Clôturer la caisse</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Résumé session */}
        <div className="bg-surface-input rounded-xl p-4 space-y-2 text-sm">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-3">
            Résumé de la session
          </p>
          <div className="flex justify-between">
            <span className="text-slate-400">Fond de caisse</span>
            <span className="text-white font-medium">{fmt(session.opening_amount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Ventes espèces</span>
            <span className="text-green-400 font-medium">+{fmt(summary.total_cash)}</span>
          </div>
          {summary.total_card > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-400">Ventes carte</span>
              <span className="text-white">{fmt(summary.total_card)}</span>
            </div>
          )}
          {summary.total_mobile > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-400">Ventes mobile money</span>
              <span className="text-white">{fmt(summary.total_mobile)}</span>
            </div>
          )}
          {summary.total_refunds > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-400">Remboursements</span>
              <span className="text-red-400">-{fmt(summary.total_refunds)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold border-t border-surface-border pt-2 mt-1">
            <span className="text-slate-300">Total ventes</span>
            <span className="text-brand-400">{fmt(summary.total_sales)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span className="text-slate-300">Espèces attendues en caisse</span>
            <span className="text-white">{fmt(expectedCash)}</span>
          </div>
        </div>

        {/* Comptage */}
        <div>
          <label className="label">Espèces comptées (montant réel en caisse)</label>
          <input
            type="number"
            min="0"
            step="100"
            value={actualCash}
            onChange={(e) => setActualCash(e.target.value)}
            className="input text-xl font-bold text-center"
            placeholder={fmt(expectedCash)}
            autoFocus
          />
        </div>

        {/* Écart */}
        {actualCash && (
          <div className={`rounded-xl p-4 border text-center ${
            Math.abs(difference) < 1
              ? 'bg-green-900/20 border-green-700'
              : difference > 0
                ? 'bg-blue-900/20 border-blue-700'
                : 'bg-red-900/20 border-red-700'
          }`}>
            <p className="text-xs text-slate-400 mb-1">Écart</p>
            <p className={`text-2xl font-bold ${
              Math.abs(difference) < 1
                ? 'text-green-400'
                : difference > 0
                  ? 'text-blue-400'
                  : 'text-red-400'
            }`}>
              {difference >= 0 ? '+' : ''}{fmt(difference)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {Math.abs(difference) < 1
                ? 'Caisse équilibrée'
                : difference > 0
                  ? 'Excédent de caisse'
                  : 'Déficit de caisse'}
            </p>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="label">Notes (optionnel)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input resize-none h-16"
            placeholder="Ex : Erreur de rendu, billet abîmé…"
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1 h-11">Annuler</button>
          <button
            onClick={handleConfirm}
            disabled={loading || !actualCash}
            className="btn-danger flex-1 h-11 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            <Lock className="w-4 h-4" />
            Clôturer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function CaissePage() {
  const { business } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const { session, setSession, loaded, setLoaded } = useCashSessionStore();

  const [summary, setSummary] = useState<SessionLiveSummary | null>(null);
  const [history, setHistory] = useState<CashSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [tab, setTab] = useState<'session' | 'historique'>('session');

  const currency = business?.currency ?? 'XOF';
  const fmt = (n: number) => formatCurrency(n, currency);

  const loadSummary = useCallback(async () => {
    if (!session) return;
    try {
      const s = await getLiveSummary(session.id);
      setSummary(s);
    } catch { /* silencieux */ }
  }, [session]);

  const loadHistory = useCallback(async () => {
    if (!business) return;
    const h = await getSessionHistory(business.id);
    setHistory(h);
  }, [business]);

  // Chargement initial
  useEffect(() => {
    if (!loaded || !business) return;
    loadHistory();
  }, [loaded, business, loadHistory]);

  // Rafraîchir le résumé live toutes les 30s
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
          actual_cash: actualCash,
          expected_cash: closed.expected_cash,
          difference: closed.difference,
          total_sales: closed.total_sales,
          notes: notes || null,
        },
      });
      setHistory((h) => [closed, ...h.filter((s) => s.id !== closed.id)]);
    } catch (e) {
      notifError(toUserError(e));
    }
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
            <h1 className="text-xl font-bold text-white">Clôture de caisse</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {session
                ? `Session ouverte le ${format(new Date(session.opened_at), 'dd MMM à HH:mm', { locale: fr })}`
                : 'Aucune session active'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {session && (
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="btn-secondary p-2"
                title="Actualiser"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
            {!session ? (
              <button
                onClick={() => setShowOpenModal(true)}
                className="btn-primary flex items-center gap-2"
              >
                <LockOpen className="w-4 h-4" />
                Ouvrir la caisse
              </button>
            ) : (
              <button
                onClick={() => { loadSummary().then(() => setShowCloseModal(true)); }}
                className="btn-danger flex items-center gap-2"
              >
                <Lock className="w-4 h-4" />
                Clôturer
              </button>
            )}
          </div>
        </div>

        {/* Explication pour novice */}
        <div className="card p-5 border-l-4 border-brand-500 space-y-4">
          <p className="text-sm font-semibold text-white">Comment ça fonctionne ?</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
              <div>
                <p className="text-sm font-medium text-white">Ouvrir la caisse</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  En début de journée (ou de service), indiquez le montant d'espèces déjà présent dans la caisse — c'est le <strong className="text-slate-300">fond de caisse</strong>.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
              <div>
                <p className="text-sm font-medium text-white">Encaisser normalement</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Toutes les ventes effectuées pendant la session sont automatiquement comptabilisées ici, par mode de paiement.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
              <div>
                <p className="text-sm font-medium text-white">Clôturer en fin de service</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Comptez les billets et pièces dans la caisse, saisissez le total. Le système calcule l'<strong className="text-slate-300">écart</strong> entre ce qui est attendu et ce que vous avez réellement.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 pt-1 border-t border-surface-border text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Écart nul = caisse équilibrée</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Écart positif = excédent (plus d'argent que prévu)</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Écart négatif = déficit (manque d'argent)</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-surface-input rounded-xl p-1 w-fit">
          {([
            { id: 'session',    label: 'Session en cours' },
            { id: 'historique', label: 'Historique' },
          ] as const).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${tab === id ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Onglet Session ── */}
        {tab === 'session' && (
          <>
            {!session ? (
              <div className="card p-12 flex flex-col items-center gap-4 text-center">
                <div className="w-16 h-16 rounded-2xl bg-surface-input flex items-center justify-center">
                  <Lock className="w-8 h-8 text-slate-500" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-white">Caisse fermée</p>
                  <p className="text-sm text-slate-400 mt-1">
                    Ouvrez une session pour commencer à encaisser.
                  </p>
                </div>
                <button
                  onClick={() => setShowOpenModal(true)}
                  className="btn-primary flex items-center gap-2 mt-2"
                >
                  <LockOpen className="w-4 h-4" />
                  Ouvrir la caisse
                </button>
              </div>
            ) : (
              <>
                {/* Fond de caisse */}
                <div className="card p-4 flex items-center gap-3 border-l-4 border-brand-500">
                  <Banknote className="w-5 h-5 text-brand-400 shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">Fond de caisse initial</p>
                    <p className="text-xl font-bold text-white">{fmt(session.opening_amount)}</p>
                  </div>
                </div>

                {/* Métriques live */}
                {summary ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <MetricCard
                      label="Total ventes"
                      value={fmt(summary.total_sales)}
                      icon={CheckCircle}
                      color="text-brand-400"
                    />
                    <MetricCard
                      label="Espèces"
                      value={fmt(summary.total_cash)}
                      icon={Banknote}
                      color="text-green-400"
                    />
                    <MetricCard
                      label="Carte"
                      value={fmt(summary.total_card)}
                      icon={CreditCard}
                      color="text-blue-400"
                    />
                    <MetricCard
                      label="Mobile Money"
                      value={fmt(summary.total_mobile)}
                      icon={Smartphone}
                      color="text-purple-400"
                    />
                    <MetricCard
                      label="Transactions"
                      value={String(summary.total_orders)}
                      icon={CheckCircle}
                      color="text-slate-300"
                    />
                    {summary.total_refunds > 0 && (
                      <MetricCard
                        label="Remboursements"
                        value={`-${fmt(summary.total_refunds)}`}
                        icon={RotateCcw}
                        color="text-red-400"
                      />
                    )}
                  </div>
                ) : (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
                  </div>
                )}

                {summary && (
                  <div className="card p-4 space-y-2 text-sm">
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">
                      Espèces attendues en caisse
                    </p>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Fond initial</span>
                      <span className="text-white">{fmt(session.opening_amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">+ Ventes espèces</span>
                      <span className="text-green-400">+{fmt(summary.total_cash)}</span>
                    </div>
                    <div className="flex justify-between font-bold border-t border-surface-border pt-2">
                      <span className="text-white">Total attendu</span>
                      <span className="text-brand-400">
                        {fmt(session.opening_amount + summary.total_cash)}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── Onglet Historique ── */}
        {tab === 'historique' && (
          <div className="space-y-3">
            {history.filter((s) => s.status === 'closed').length === 0 ? (
              <div className="card p-12 flex flex-col items-center gap-3 text-center">
                <History className="w-10 h-10 text-slate-600" />
                <p className="text-slate-500">Aucune clôture enregistrée</p>
              </div>
            ) : (
              history
                .filter((s) => s.status === 'closed')
                .map((s) => {
                  const diff = s.difference ?? 0;
                  return (
                    <div key={s.id} className="card p-4 space-y-3">
                      {/* En-tête ligne */}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {format(new Date(s.opened_at), 'EEEE dd MMMM yyyy', { locale: fr })}
                          </p>
                          <p className="text-xs text-slate-500">
                            {format(new Date(s.opened_at), 'HH:mm')}
                            {' → '}
                            {s.closed_at && format(new Date(s.closed_at), 'HH:mm')}
                          </p>
                        </div>
                        <span className={`text-sm font-bold ${
                          Math.abs(diff) < 1
                            ? 'text-green-400'
                            : diff > 0
                              ? 'text-blue-400'
                              : 'text-red-400'
                        }`}>
                          {diff >= 0 ? '+' : ''}{fmt(diff)}
                        </span>
                      </div>

                      {/* Métriques */}
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-surface-input rounded-lg px-3 py-2">
                          <p className="text-slate-500">Ventes</p>
                          <p className="text-white font-semibold">{fmt(s.total_sales ?? 0)}</p>
                        </div>
                        <div className="bg-surface-input rounded-lg px-3 py-2">
                          <p className="text-slate-500">Espèces attendues</p>
                          <p className="text-white font-semibold">{fmt(s.expected_cash ?? 0)}</p>
                        </div>
                        <div className="bg-surface-input rounded-lg px-3 py-2">
                          <p className="text-slate-500">Espèces comptées</p>
                          <p className="text-white font-semibold">{fmt(s.actual_cash ?? 0)}</p>
                        </div>
                      </div>

                      {/* Écart */}
                      {Math.abs(diff) >= 1 && (
                        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
                          diff > 0
                            ? 'border-blue-800 bg-blue-900/20 text-blue-400'
                            : 'border-red-800 bg-red-900/20 text-red-400'
                        }`}>
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          {diff > 0 ? 'Excédent' : 'Déficit'} de {fmt(Math.abs(diff))}
                          {s.notes && ` — ${s.notes}`}
                        </div>
                      )}

                      {/* Détail par méthode */}
                      <div className="flex gap-3 text-xs text-slate-500">
                        <span className="text-green-400">Esp. {fmt(s.total_cash ?? 0)}</span>
                        <span>·</span>
                        <span className="text-blue-400">CB {fmt(s.total_card ?? 0)}</span>
                        <span>·</span>
                        <span className="text-purple-400">Mobile {fmt(s.total_mobile ?? 0)}</span>
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
        <OpenModal
          currency={currency}
          onConfirm={handleOpen}
          onClose={() => setShowOpenModal(false)}
        />
      )}
      {showCloseModal && session && summary && (
        <CloseModal
          session={session}
          summary={summary}
          currency={currency}
          onConfirm={handleClose}
          onClose={() => setShowCloseModal(false)}
        />
      )}
    </div>
  );
}
