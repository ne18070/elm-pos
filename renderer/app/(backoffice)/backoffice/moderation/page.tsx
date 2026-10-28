'use client';

import { useEffect, useMemo, useState } from 'react';
import { Ban, CheckCircle2, Flag, Loader2, RefreshCw, RotateCcw, ShieldAlert, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { ConfirmModal } from '@/components/ui/Modal';
import {
  getContentReports, getDirectorySuspensions, resolveBusinessReports,
  suspendFromDirectory, restoreToDirectory,
  type ContentReport, type DirectorySuspension, type ReportReason,
} from '@services/supabase/moderation';

// Signalements de l'app ELM Boutique (App Store, règle 1.2) : à traiter sous 24 h.
const SLA_HOURS = 24;

const REASON_LABEL: Record<ReportReason, string> = {
  offensive: 'Contenu choquant',
  fraud:     'Arnaque',
  illegal:   'Illégal',
  spam:      'Spam / trompeur',
  other:     'Autre',
};

const TARGET_LABEL = { business: 'Boutique', product: 'Produit', service: 'Prestation' } as const;

type Tab = 'open' | 'suspended' | 'closed';

interface BusinessGroup {
  businessId: string;
  name:       string;
  logoUrl:    string | null;
  reports:    ContentReport[];
  open:       ContentReport[];
  blocks:     number;
  oldestOpen: string | null;
  suspension: DirectorySuspension | undefined;
}

function hoursSince(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

function ageLabel(iso: string) {
  const h = hoursSince(iso);
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.floor(h)} h`;
  return `${Math.floor(h / 24)} j`;
}

export default function ModerationPage() {
  const { user } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [suspensions, setSuspensions] = useState<DirectorySuspension[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('open');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmSuspend, setConfirmSuspend] = useState<BusinessGroup | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([getContentReports(), getDirectorySuspensions()]);
      setReports(r);
      setSuspensions(s);
    } catch {
      notifError('Impossible de charger les signalements. Réessayez.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const groups = useMemo<BusinessGroup[]>(() => {
    const byBusiness = new Map<string, ContentReport[]>();
    for (const r of reports) byBusiness.set(r.business_id, [...(byBusiness.get(r.business_id) ?? []), r]);
    for (const s of suspensions) if (!byBusiness.has(s.business_id)) byBusiness.set(s.business_id, []);

    return [...byBusiness.entries()].map(([businessId, list]) => {
      const open = list.filter((r) => r.status === 'open');
      return {
        businessId,
        name:       list[0]?.business?.name ?? 'Boutique supprimée',
        logoUrl:    list[0]?.business?.logo_url ?? null,
        reports:    list,
        open,
        blocks:     list.filter((r) => r.blocked).length,
        oldestOpen: open.length ? open[open.length - 1].created_at : null,
        suspension: suspensions.find((s) => s.business_id === businessId),
      };
    });
  }, [reports, suspensions]);

  const visible = useMemo(() => {
    const list = groups.filter((g) =>
      tab === 'open' ? g.open.length > 0
      : tab === 'suspended' ? !!g.suspension
      : g.open.length === 0 && !g.suspension);
    // À traiter : le plus ancien signalement en premier
    return tab === 'open'
      ? list.sort((a, b) => (a.oldestOpen ?? '').localeCompare(b.oldestOpen ?? ''))
      : list;
  }, [groups, tab]);

  const counts = {
    open:      groups.filter((g) => g.open.length > 0).length,
    suspended: groups.filter((g) => g.suspension).length,
    closed:    groups.filter((g) => g.open.length === 0 && !g.suspension).length,
  };

  async function run(businessId: string, action: () => Promise<void>, message: string) {
    setBusyId(businessId);
    try {
      await action();
      success(message);
      await load();
    } catch {
      notifError('L’action a échoué. Réessayez.');
    } finally {
      setBusyId(null);
    }
  }

  function suspend(g: BusinessGroup) {
    setConfirmSuspend(null);
    const reasons = [...new Set(g.open.map((r) => r.reason).filter(Boolean))] as ReportReason[];
    run(g.businessId, async () => {
      await suspendFromDirectory(g.businessId, reasons.map((r) => REASON_LABEL[r]).join(', ') || 'Bloquée par des acheteurs', user!.id);
      await resolveBusinessReports(g.businessId, 'actioned', user!.id);
    }, `${g.name} est retirée de l’annuaire.`);
  }

  function dismiss(g: BusinessGroup) {
    run(g.businessId, () => resolveBusinessReports(g.businessId, 'dismissed', user!.id), 'Signalements classés sans suite.');
  }

  // Boutique déjà retirée : nouveaux signalements simplement clos
  function resolveAndKeep(g: BusinessGroup) {
    run(g.businessId, () => resolveBusinessReports(g.businessId, 'actioned', user!.id), 'Signalements marqués comme traités.');
  }

  function restore(g: BusinessGroup) {
    run(g.businessId, () => restoreToDirectory(g.businessId), `${g.name} est de nouveau visible dans l’annuaire.`);
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'open',      label: 'À traiter' },
    { key: 'suspended', label: 'Retirées de l’annuaire' },
    { key: 'closed',    label: 'Classées' },
  ];

  return (
    <div className="p-4 md:p-8 space-y-6 pb-32">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-content-primary tracking-tight uppercase">Modération</h1>
          <p className="text-content-muted text-sm mt-1">
            Signalements et blocages envoyés depuis l’app ELM Boutique. À traiter sous {SLA_HOURS} h.
          </p>
        </div>
        <button onClick={load} className="btn-secondary h-11 px-4 flex items-center gap-2 self-start">
          <RefreshCw className={loading ? 'animate-spin' : ''} size={16} />
          <span>Actualiser</span>
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'px-4 h-11 rounded-xl text-xs font-black uppercase tracking-widest border transition-all whitespace-nowrap',
              tab === t.key
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-surface-card border-surface-border text-content-muted hover:text-content-primary',
            )}
          >
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="card h-28 animate-pulse" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="card p-16 text-center space-y-3 border-dashed">
          <ShieldAlert className="mx-auto text-content-muted" size={40} />
          <p className="text-content-muted font-medium">
            {tab === 'open'
              ? 'Aucun signalement en attente. Les signalements et blocages des acheteurs apparaîtront ici.'
              : tab === 'suspended'
                ? 'Aucune boutique retirée de l’annuaire.'
                : 'Aucun signalement classé.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((g) => {
            const late = g.oldestOpen && hoursSince(g.oldestOpen) > SLA_HOURS - 6;
            const shown = tab === 'open' ? g.open : g.reports;
            const busy = busyId === g.businessId;
            return (
              <div key={g.businessId} className="card p-5 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-white border border-surface-border overflow-hidden flex items-center justify-center shrink-0">
                      {g.logoUrl
                        ? <img src={g.logoUrl} alt="" className="w-full h-full object-contain" />
                        : <Store className="w-5 h-5 text-content-muted" />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-black text-content-primary truncate">{g.name}</h3>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-muted mt-0.5">
                        <span className="flex items-center gap-1"><Flag size={12} /> {g.reports.length} signalement{g.reports.length > 1 ? 's' : ''}</span>
                        {g.blocks > 0 && <span className="flex items-center gap-1"><Ban size={12} /> bloquée par {g.blocks} acheteur{g.blocks > 1 ? 's' : ''}</span>}
                        {g.oldestOpen && (
                          <span className={cn('font-bold', late ? 'text-status-error' : 'text-status-warning')}>
                            en attente depuis {ageLabel(g.oldestOpen)}
                          </span>
                        )}
                        {g.suspension && <span className="text-status-error font-bold">Retirée de l’annuaire</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 shrink-0">
                    {g.suspension ? (
                      <button
                        disabled={busy}
                        onClick={() => restore(g)}
                        className="btn-secondary h-11 px-4 flex items-center gap-2 text-sm"
                      >
                        {busy ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                        Rétablir dans l’annuaire
                      </button>
                    ) : g.open.length > 0 && (
                      <button
                        disabled={busy}
                        onClick={() => setConfirmSuspend(g)}
                        className="h-11 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm flex items-center gap-2 transition-colors"
                      >
                        {busy ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                        Retirer de l’annuaire
                      </button>
                    )}
                    {g.open.length > 0 && (
                      <button
                        disabled={busy}
                        onClick={() => g.suspension ? resolveAndKeep(g) : dismiss(g)}
                        className="btn-secondary h-11 px-4 flex items-center gap-2 text-sm"
                      >
                        <CheckCircle2 size={16} />
                        {g.suspension ? 'Marquer traité' : 'Classer sans suite'}
                      </button>
                    )}
                  </div>
                </div>

                <ul className="divide-y divide-surface-border border border-surface-border rounded-xl overflow-hidden">
                  {shown.map((r) => (
                    <li key={r.id} className="p-3 text-sm bg-surface-input/40 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-badge-warning text-status-warning">
                          {r.reason ? REASON_LABEL[r.reason] : 'Blocage'}
                        </span>
                        {r.blocked && r.reason && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-badge-error text-status-error">+ bloquée</span>
                        )}
                        <span className="text-content-secondary">
                          {TARGET_LABEL[r.target_type]}{r.target_label ? ` : ${r.target_label}` : ''}
                        </span>
                        <span className="text-content-muted text-xs ml-auto">
                          {new Date(r.created_at).toLocaleString('fr-FR')}{r.platform ? ` · ${r.platform}` : ''}
                          {r.status !== 'open' && ` · ${r.status === 'actioned' ? 'traité' : 'sans suite'}`}
                        </span>
                      </div>
                      {r.details && <p className="text-content-primary whitespace-pre-wrap">{r.details}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {confirmSuspend && (
        <ConfirmModal
          title={`Retirer ${confirmSuspend.name} ?`}
          message="La boutique disparaît de l’annuaire de l’app ELM Boutique pour tous les acheteurs. Son propriétaire ne pourra pas l’y remettre ; vous pourrez la rétablir depuis l’onglet « Retirées de l’annuaire »."
          confirmLabel="Retirer"
          type="danger"
          onConfirm={() => suspend(confirmSuspend)}
          onCancel={() => setConfirmSuspend(null)}
        />
      )}
    </div>
  );
}
