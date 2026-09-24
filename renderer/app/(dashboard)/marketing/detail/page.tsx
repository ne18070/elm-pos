'use client';

// Route statique + `?id=` plutôt qu'un segment [id] : la build Electron et
// Capacitor est un export statique, qui ne produit un fichier HTML que pour les
// chemins connus à la compilation. Un identifiant de campagne n'existe qu'à
// l'exécution — d'où l'absence de segment dynamique dans tout le dashboard.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Play, Pause, Square, RefreshCw, AlertTriangle, Eye, MousePointerClick, ShoppingCart, Wallet,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useCan } from '@/hooks/usePermission';
import { useConfirm } from '@/components/shared/ConfirmDialog';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toUserError } from '@/lib/user-error';
import {
  getCampaignGroup, setCampaignAction, refreshCampaignMetrics, minorToMajor,
  type AdCampaignGroup, type AdMetricDay, type AdPlatform, type AdCampaignStatus,
} from '@services/supabase/marketing';

const PLATFORM_LABEL: Record<AdPlatform, string> = {
  meta:   'Facebook & Instagram',
  tiktok: 'TikTok',
};

const STATUS_INFO: Record<AdCampaignStatus, { label: string; cls: string }> = {
  active:     { label: 'En diffusion', cls: 'bg-badge-success text-status-success border-status-success' },
  publishing: { label: 'Publication…', cls: 'bg-badge-info text-status-info border-status-info' },
  paused:     { label: 'En pause',     cls: 'bg-badge-warning text-status-warning border-status-warning' },
  ended:      { label: 'Terminée',     cls: 'bg-surface-card text-content-muted border-surface-border' },
  draft:      { label: 'Brouillon',    cls: 'bg-surface-card text-content-muted border-surface-border' },
  failed:     { label: 'Échec',        cls: 'bg-badge-error text-status-error border-status-error' },
  rejected:   { label: 'Refusée',      cls: 'bg-badge-error text-status-error border-status-error' },
};

export default function MarketingDetailPage() {
  const router = useRouter();
  const { business } = useAuthStore();
  const can = useCan();
  const { success, error: notifError } = useNotificationStore();
  const { askConfirm, ConfirmDialog } = useConfirm();

  const [groupId, setGroupId]   = useState<string | null>(null);
  const [group, setGroup]       = useState<AdCampaignGroup | null>(null);
  const [daily, setDaily]       = useState<AdMetricDay[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const businessId = business?.id ?? '';

  useEffect(() => {
    setGroupId(new URLSearchParams(window.location.search).get('id'));
  }, []);

  const load = useCallback(async () => {
    if (!businessId || !groupId) return;
    try {
      const result = await getCampaignGroup(businessId, groupId);
      setGroup(result?.group ?? null);
      setDaily(result?.daily ?? []);
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setLoading(false);
    }
  }, [businessId, groupId, notifError]);

  useEffect(() => {
    if (groupId === null) return;
    load();
  }, [groupId, load]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refreshCampaignMetrics();
      await load();
      success('Résultats actualisés');
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setRefreshing(false);
    }
  }

  function handleAction(action: 'pause' | 'resume' | 'stop') {
    if (!group) return;
    const run = async () => {
      try {
        await setCampaignAction(group.groupId, action);
        success(action === 'pause' ? 'Publicité mise en pause'
              : action === 'resume' ? 'Publicité relancée'
              : 'Publicité arrêtée');
        load();
      } catch (err) {
        notifError(toUserError(err));
      }
    };

    if (action === 'stop') {
      askConfirm(
        `Arrêter définitivement « ${group.name} » ? La diffusion cesse et la publicité ne pourra pas être relancée.`,
        run,
        { confirmLabel: 'Arrêter', danger: true },
      );
    } else {
      run();
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-content-secondary">Chargement…</div>;
  }

  if (!group) {
    return (
      <div className="p-6 space-y-4">
        <p className="text-content-primary font-medium">Publicité introuvable</p>
        <button onClick={() => router.push('/marketing')} className="btn-primary">
          Retour aux publicités
        </button>
      </div>
    );
  }

  const info = STATUS_INFO[group.status];
  const currency = group.currency;
  const spend = minorToMajor(group.totals.spendMinor, currency);
  const costPerClick = group.totals.clicks > 0 ? spend / group.totals.clicks : 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 sm:p-6 border-b border-surface-border">
        <button
          onClick={() => router.push('/marketing')}
          className="text-sm text-content-secondary flex items-center gap-1.5 min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour aux publicités
        </button>

        <div className="flex items-start justify-between gap-3 mt-1">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-content-primary truncate">{group.name}</h1>
            <p className="text-xs text-content-secondary mt-0.5">
              {group.platforms.map((p) => PLATFORM_LABEL[p]).join(' + ')} ·
              {' '}du {formatDate(group.startDate)}{group.endDate ? ` au ${formatDate(group.endDate)}` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${info.cls}`}>
              {info.label}
            </span>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="btn-secondary min-h-[44px] px-3 flex items-center gap-2 disabled:opacity-50"
              aria-label="Actualiser les résultats"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat icon={Wallet}              label="Dépensé"     value={formatCurrency(spend, currency)} />
          <Stat icon={Eye}                 label="Vues"        value={group.totals.impressions.toLocaleString('fr-FR')} />
          <Stat icon={MousePointerClick}   label="Clics"       value={group.totals.clicks.toLocaleString('fr-FR')}
                hint={costPerClick > 0 ? `${formatCurrency(costPerClick, currency)} par clic` : undefined} />
          <Stat icon={ShoppingCart}        label="Conversions" value={group.totals.conversions.toLocaleString('fr-FR')} />
        </div>

        <DailyChart daily={daily} currency={currency} />

        <div className="rounded-xl border border-surface-border bg-surface-card p-4 space-y-3">
          <h2 className="font-semibold text-content-primary text-sm">Par plateforme</h2>
          {group.campaigns.map((campaign) => (
            <div key={campaign.id} className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="text-content-primary">{PLATFORM_LABEL[campaign.platform]}</p>
                {campaign.error_message && (
                  <p className="text-xs text-status-error flex items-start gap-1 mt-0.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                    {campaign.error_message}
                  </p>
                )}
                {campaign.last_synced_at && !campaign.error_message && (
                  <p className="text-xs text-content-muted mt-0.5">
                    Actualisé le {formatDate(campaign.last_synced_at)}
                  </p>
                )}
              </div>
              <span className={`shrink-0 inline-flex px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${STATUS_INFO[campaign.status].cls}`}>
                {STATUS_INFO[campaign.status].label}
              </span>
            </div>
          ))}
        </div>

        {can('manage_marketing') && group.status !== 'ended' && (
          <div className="flex flex-col sm:flex-row gap-2">
            {group.status === 'paused' ? (
              <button onClick={() => handleAction('resume')} className="btn-primary min-h-[44px] flex items-center justify-center gap-2">
                <Play className="w-4 h-4" /> Relancer la diffusion
              </button>
            ) : (
              <button onClick={() => handleAction('pause')} className="btn-secondary min-h-[44px] flex items-center justify-center gap-2">
                <Pause className="w-4 h-4" /> Mettre en pause
              </button>
            )}
            <button
              onClick={() => handleAction('stop')}
              className="btn-secondary min-h-[44px] flex items-center justify-center gap-2 text-status-error"
            >
              <Square className="w-4 h-4" /> Arrêter définitivement
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog />
    </div>
  );
}

function Stat({
  icon: Icon, label, value, hint,
}: {
  icon:  typeof Eye;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4">
      <div className="flex items-center gap-1.5 text-content-secondary">
        <Icon className="w-4 h-4" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-2xl font-bold text-content-primary mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-content-muted mt-0.5">{hint}</p>}
    </div>
  );
}

/**
 * Histogramme en CSS pur : les volumes affichés ici sont faibles (une barre par
 * jour de diffusion), ça ne justifie pas d'embarquer une librairie de graphiques.
 */
function DailyChart({ daily, currency }: { daily: AdMetricDay[]; currency: string }) {
  if (daily.length === 0) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card p-6 text-center">
        <p className="text-sm text-content-primary font-medium">Pas encore de résultats</p>
        <p className="text-xs text-content-secondary mt-1">
          Les plateformes transmettent les premiers chiffres quelques heures après le lancement.
        </p>
      </div>
    );
  }

  const max = Math.max(...daily.map((d) => d.spendMinor), 1);

  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4">
      <h2 className="font-semibold text-content-primary text-sm">Dépense par jour</h2>
      <div className="flex items-end gap-1.5 h-32 mt-4">
        {daily.map((d) => (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div
              className="w-full bg-brand-600 rounded-t"
              style={{ height: `${Math.max((d.spendMinor / max) * 100, 2)}%` }}
              title={`${d.date} — ${formatCurrency(minorToMajor(d.spendMinor, currency), currency)}`}
            />
            <span className="text-[10px] text-content-muted truncate w-full text-center">
              {d.date.slice(8, 10)}/{d.date.slice(5, 7)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
