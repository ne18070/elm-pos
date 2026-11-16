'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Search, Smartphone } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { loovOperatorLabel } from '@/lib/loov-operators';
import { useNotificationStore } from '@/store/notifications';
import { useUrlTab } from '@/hooks/useUrlTab';
import { Badge, Button, EmptyState, SkeletonRows, Tabs, type BadgeTone } from '@/components/ui';
import {
  getMobilePayment, getSubscriptionPaymentsAdmin,
  type AdminSubscriptionPayment, type SubscriptionPaymentStatus,
} from '@services/supabase/subscriptions';

// Paiements d'abonnement par mobile money (Loov) : chaque tentative avance par le
// webhook /api/webhooks/loov ou par le polling de /billing. Cette page sert au support :
// « j'ai payé mais mon abonnement n'est pas actif ».

/** Même seuil que /api/billing/loov/pay/[id] : au-delà, une tentative sans réponse est suspecte. */
const STALE_MS = 30 * 60_000;

const STATUS: Record<SubscriptionPaymentStatus, { label: string; tone: BadgeTone }> = {
  pending:    { label: 'En attente', tone: 'warning' },
  processing: { label: 'En cours',   tone: 'info' },
  succeeded:  { label: 'Réussi',     tone: 'success' },
  failed:     { label: 'Échoué',     tone: 'error' },
  expired:    { label: 'Expiré',     tone: 'neutral' },
};

type Tab = 'tous' | 'a_verifier' | 'reussis' | 'echecs' | 'en_attente';
const TABS: readonly Tab[] = ['tous', 'a_verifier', 'reussis', 'echecs', 'en_attente'];

const PERIODS = [
  { days: 7,   label: '7 derniers jours' },
  { days: 30,  label: '30 derniers jours' },
  { days: 90,  label: '90 derniers jours' },
  { days: 365, label: '12 derniers mois' },
] as const;

/** Anomalie à traiter par le support, ou null. */
function anomaly(p: AdminSubscriptionPayment): string | null {
  if (p.status === 'succeeded' && !p.applied_at) return 'Payé mais abonnement non activé';
  const age = Date.now() - new Date(p.created_at).getTime();
  if ((p.status === 'pending' || p.status === 'processing') && age > STALE_MS) {
    return 'Aucune réponse de Loov depuis plus de 30 min';
  }
  if (p.failure_code === 'amount_mismatch') return 'Montant payé différent du plan';
  return null;
}

function canRecheck(p: AdminSubscriptionPayment) {
  return p.status === 'pending' || p.status === 'processing' || (p.status === 'succeeded' && !p.applied_at)
    || (p.status === 'failed' && !p.failure_code && !!p.reference);
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

/** 221771234567 → +221 77 123 45 67 */
function formatPhone(raw: string) {
  const m = raw.match(/^221(\d{2})(\d{3})(\d{2})(\d{2})$/);
  return m ? `+221 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : raw;
}

export default function PaiementsPage() {
  const { success, error: notifError } = useNotificationStore();
  const [payments, setPayments] = useState<AdminSubscriptionPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useUrlTab<Tab>('tous', TABS);
  const [recheckingId, setRecheckingId] = useState<string | null>(null);

  async function load(days = periodDays) {
    setLoading(true);
    setLoadError(false);
    try {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      setPayments(await getSubscriptionPaymentsAdmin(since));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(periodDays); }, [periodDays]); // eslint-disable-line react-hooks/exhaustive-deps

  async function recheck(p: AdminSubscriptionPayment) {
    setRecheckingId(p.id);
    try {
      const fresh = await getMobilePayment(p.id);
      await load();
      if (fresh.activated) success('Paiement confirmé par Loov : abonnement activé.');
      else success(`Statut Loov : ${STATUS[fresh.status as SubscriptionPaymentStatus]?.label ?? fresh.status}.`);
    } catch (e) {
      notifError(e instanceof Error ? e.message : 'Loov ne répond pas. Réessayez dans un instant.');
    } finally {
      setRecheckingId(null);
    }
  }

  const live = useMemo(() => payments.filter((p) => p.livemode), [payments]);
  const stats = useMemo(() => {
    const ok = live.filter((p) => p.status === 'succeeded');
    return {
      collected: ok.filter((p) => p.currency === 'XOF').reduce((acc, p) => acc + p.amount, 0),
      succeeded: ok.length,
      failed:    live.filter((p) => p.status === 'failed' || p.status === 'expired').length,
      // Taux sur les tentatives terminées : une tentative en cours ne compte pas encore
      rate: (() => {
        const done = live.filter((p) => p.status !== 'pending' && p.status !== 'processing').length;
        return done ? Math.round((ok.length / done) * 100) : null;
      })(),
    };
  }, [live]);

  const toCheck = useMemo(() => payments.filter((p) => anomaly(p)), [payments]);

  const counts: Record<Tab, number> = {
    tous:       payments.length,
    a_verifier: toCheck.length,
    reussis:    payments.filter((p) => p.status === 'succeeded').length,
    echecs:     payments.filter((p) => p.status === 'failed' || p.status === 'expired').length,
    en_attente: payments.filter((p) => p.status === 'pending' || p.status === 'processing').length,
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return payments.filter((p) => {
      if (tab === 'a_verifier' && !anomaly(p)) return false;
      if (tab === 'reussis' && p.status !== 'succeeded') return false;
      if (tab === 'echecs' && p.status !== 'failed' && p.status !== 'expired') return false;
      if (tab === 'en_attente' && p.status !== 'pending' && p.status !== 'processing') return false;
      if (!q) return true;
      return (p.business_name ?? '').toLowerCase().includes(q)
        || (p.reference ?? '').toLowerCase().includes(q)
        || (digits.length >= 4 && p.phone_number.includes(digits));
    });
  }, [payments, tab, search]);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content-primary">Paiements Mobile Money</h1>
          <p className="text-sm text-content-secondary mt-1">
            Abonnements payés par Orange Money, Wave, Free Money et Expresso (Loov). Mis à jour par le webhook Loov.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Période"
            value={periodDays}
            onChange={(e) => setPeriodDays(Number(e.target.value))}
            className="input h-10 py-0"
          >
            {PERIODS.map((p) => <option key={p.days} value={p.days}>{p.label}</option>)}
          </select>
          <Button variant="secondary" onClick={() => load()} loading={loading} icon={<RefreshCw className="w-4 h-4" />}>
            Actualiser
          </Button>
        </div>
      </div>

      {/* Chiffres sur les paiements réels uniquement (les essais en clés de test sont exclus) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Encaissé" value={formatCurrency(stats.collected, 'XOF')} />
        <Stat label="Paiements réussis" value={String(stats.succeeded)} />
        <Stat label="Échecs et expirés" value={String(stats.failed)} />
        <Stat label="Taux de réussite" value={stats.rate === null ? '—' : `${stats.rate} %`} />
      </div>

      {toCheck.length > 0 && tab !== 'a_verifier' && (
        <button
          onClick={() => setTab('a_verifier')}
          className="w-full flex items-center gap-3 p-4 rounded-xl border border-status-warning/30 bg-badge-warning text-left"
        >
          <AlertTriangle className="w-5 h-5 text-status-warning shrink-0" />
          <span className="text-sm text-content-primary">
            <strong>{toCheck.length} paiement{toCheck.length > 1 ? 's' : ''} à vérifier</strong>
            {' '}: payé sans activation, sans réponse de Loov, ou montant incorrect.
          </span>
        </button>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <Tabs
          tabs={[
            { id: 'tous',       label: 'Tous',        count: counts.tous },
            { id: 'a_verifier', label: 'À vérifier',  count: counts.a_verifier },
            { id: 'reussis',    label: 'Réussis',     count: counts.reussis },
            { id: 'echecs',     label: 'Échecs',      count: counts.echecs },
            { id: 'en_attente', label: 'En attente',  count: counts.en_attente },
          ]}
          value={tab}
          onChange={setTab}
        />
        <div className="relative lg:ml-auto lg:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
          <input
            aria-label="Rechercher"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Boutique, numéro ou référence Loov"
            className="input pl-9 w-full"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading && payments.length === 0 ? (
          <div className="p-4"><SkeletonRows rows={6} cols={6} /></div>
        ) : loadError ? (
          <EmptyState
            icon={AlertTriangle}
            title="Impossible de charger les paiements"
            description="Vérifiez votre connexion, puis réessayez."
            action={<Button onClick={() => load()}>Réessayer</Button>}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Smartphone}
            title={search ? 'Aucun paiement ne correspond' : 'Aucun paiement sur cette période'}
            description={
              search
                ? 'Essayez le nom de la boutique, les derniers chiffres du numéro ou la référence PAY… de Loov.'
                : tab === 'a_verifier'
                  ? 'Tous les paiements de la période sont cohérents.'
                  : 'Les paiements lancés depuis la page Abonnement des boutiques apparaîtront ici.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-content-secondary border-b border-surface-border">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Boutique</th>
                  <th className="px-4 py-3 font-medium">Opérateur</th>
                  <th className="px-4 py-3 font-medium text-right">Montant</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Détail</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const issue = anomaly(p);
                  return (
                    <tr key={p.id} className={cn('border-b border-surface-border last:border-0 align-top', issue && 'bg-badge-warning/40')}>
                      <td className="px-4 py-3 whitespace-nowrap text-content-secondary">{formatDateTime(p.created_at)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-content-primary">{p.business_name ?? 'Boutique supprimée'}</p>
                        <p className="text-xs text-content-muted">{p.plan_label ?? 'Plan'} ({p.days} j)</p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-content-primary">{loovOperatorLabel(p.operator)}</p>
                        <p className="text-xs text-content-muted tabular-nums">{formatPhone(p.phone_number)}</p>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-semibold text-content-primary tabular-nums">
                        {formatCurrency(p.amount, p.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <Badge tone={STATUS[p.status].tone} dot={p.status === 'pending' || p.status === 'processing'}>
                            {STATUS[p.status].label}
                          </Badge>
                          {!p.livemode && <Badge tone="purple">Test</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 min-w-[220px]">
                        {issue && <p className="text-status-warning font-medium">{issue}</p>}
                        {p.status === 'succeeded' && p.applied_at && (
                          <p className="text-content-secondary">
                            Abonnement activé{p.invoice_number ? `, facture ${p.invoice_number}` : ''}
                          </p>
                        )}
                        {(p.status === 'failed' || p.status === 'expired') && (p.failure_reason || p.failure_code) && (
                          <p className="text-content-secondary">{p.failure_reason ?? p.failure_code}</p>
                        )}
                        {p.reference && (
                          <p className="text-xs text-content-muted mt-0.5 select-all">{p.reference}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canRecheck(p) && (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={recheckingId === p.id}
                            disabled={recheckingId !== null}
                            onClick={() => recheck(p)}
                          >
                            Revérifier auprès de Loov
                          </Button>
                        )}
                      </td>
                    </tr>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-content-secondary">{label}</p>
      <p className="text-2xl font-bold text-content-primary mt-1 tabular-nums">{value}</p>
    </div>
  );
}
