'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Megaphone, Plus, RefreshCw, Link2, AlertTriangle, CheckCircle2,
  Play, Pause, Square, ChevronRight, CreditCard,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useCan } from '@/hooks/usePermission';
import { useConfirm } from '@/components/shared/ConfirmDialog';
import { formatCurrency } from '@/lib/utils';
import { toUserError } from '@/lib/user-error';
import { isWeb } from '@/lib/platform';
import { getPublicSiteUrl } from '@/lib/public-links';
import {
  getAdConnections, getCampaignGroups, startPlatformConnect, selectAdAccount,
  setCampaignAction, refreshCampaignMetrics, minorToMajor,
  type AdConnection, type AdCampaignGroup, type AdPlatform, type AdCampaignStatus,
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

const OBJECTIVE_LABEL = {
  ventes:     'Vendre plus',
  visibilite: 'Se faire connaître',
  messages:   'Recevoir des messages',
} as const;

export default function MarketingPage() {
  const { business } = useAuthStore();
  const can = useCan();
  const router = useRouter();
  const { success, error: notifError } = useNotificationStore();
  const { askConfirm, ConfirmDialog } = useConfirm();

  const [connections, setConnections] = useState<AdConnection[]>([]);
  const [groups, setGroups]           = useState<AdCampaignGroup[]>([]);
  const [loading, setLoading]         = useState(true);
  const [connecting, setConnecting]   = useState<AdPlatform | null>(null);
  const [refreshing, setRefreshing]   = useState(false);

  const businessId = business?.id ?? '';

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      const [conns, camps] = await Promise.all([
        getAdConnections(businessId),
        getCampaignGroups(businessId),
      ]);
      setConnections(conns);
      setGroups(camps);
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setLoading(false);
    }
  }, [businessId, notifError]);

  useEffect(() => { load(); }, [load]);

  // La connexion se termine dans un navigateur externe sur desktop et mobile :
  // au retour dans l'app, l'état affiché doit refléter ce qui vient de s'y
  // passer sans que le commerçant ait à recharger quoi que ce soit.
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  // Lu depuis window plutôt que via useSearchParams : la build Electron et
  // Capacitor est un export statique, où useSearchParams impose une frontière
  // Suspense pour ne pas casser le prerender.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const failure   = params.get('error');

    if (connected) {
      const needsChoice = params.get('status') === 'needs_account_selection';
      if (needsChoice) {
        // Ce statut couvre deux situations distinctes — plusieurs comptes, ou
        // aucun. Le panneau plus bas connaît la liste réelle et le dit
        // précisément ; le toast se garde d'affirmer l'un ou l'autre.
        notifError(`Compte ${PLATFORM_LABEL[connected as AdPlatform] ?? connected} relié — il reste à choisir le compte publicitaire à utiliser.`);
      } else {
        success(`${PLATFORM_LABEL[connected as AdPlatform] ?? connected} connecté`);
      }
    } else if (failure) {
      notifError(
        failure === 'denied'  ? 'Connexion refusée sur la plateforme'
      : failure === 'expired' ? 'Lien de connexion expiré, réessayez'
      :                         'La connexion a échoué',
      );
    }

    if (connected || failure) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [success, notifError]);

  async function handleConnect(platform: AdPlatform) {
    setConnecting(platform);
    try {
      const origin = isWeb ? window.location.origin : getPublicSiteUrl();
      const url = await startPlatformConnect(platform, origin);
      // Hors web, main/index.ts intercepte window.open et bascule vers le
      // navigateur système — indispensable ici, la plateforme refuse de
      // s'authentifier dans une webview embarquée.
      if (isWeb) window.location.href = url;
      else window.open(url, '_blank');
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setConnecting(null);
    }
  }

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

  function handleAction(group: AdCampaignGroup, action: 'pause' | 'resume' | 'stop') {
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

  const connectedPlatforms = connections.filter((c) => c.status === 'connected');
  const canPublish = connectedPlatforms.length > 0 && can('manage_marketing');

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-content-secondary">Chargement…</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-6 border-b border-surface-border">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-content-primary">Publicités</h1>
            <p className="text-xs text-content-secondary mt-0.5">
              Faites connaître votre activité sur Facebook, Instagram et TikTok
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {groups.length > 0 && (
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="btn-secondary flex items-center gap-2 disabled:opacity-50"
                aria-label="Actualiser les résultats"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Actualiser</span>
              </button>
            )}
            {canPublish && (
              <button
                onClick={() => router.push('/marketing/nouvelle')}
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Nouvelle publicité</span>
                <span className="sm:hidden">Créer</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        <ConnectionPanel
          connections={connections}
          connecting={connecting}
          canManage={can('manage_marketing')}
          onConnect={handleConnect}
          onSelected={load}
        />

        {connectedPlatforms.length > 0 && (
          groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center gap-3">
              <Megaphone className="w-12 h-12 text-content-muted opacity-30" />
              <div>
                <p className="font-medium text-content-primary">Aucune publicité pour le moment</p>
                <p className="text-sm text-content-secondary mt-1 max-w-sm">
                  Choisissez un produit, un budget, et nous nous occupons du reste.
                </p>
              </div>
              {canPublish && (
                <button onClick={() => router.push('/marketing/nouvelle')} className="btn-primary mt-1">
                  Créer ma première publicité
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => (
                <CampaignCard
                  key={group.groupId}
                  group={group}
                  canManage={can('manage_marketing')}
                  onOpen={() => router.push(`/marketing/detail?id=${group.groupId}`)}
                  onAction={(a) => handleAction(group, a)}
                />
              ))}
            </div>
          )
        )}
      </div>

      <ConfirmDialog />
    </div>
  );
}

// ─── Connexion des comptes ────────────────────────────────────────────────────

function ConnectionPanel({
  connections, connecting, canManage, onConnect, onSelected,
}: {
  connections: AdConnection[];
  connecting:  AdPlatform | null;
  canManage:   boolean;
  onConnect:   (p: AdPlatform) => void;
  onSelected:  () => void;
}) {
  const byPlatform = new Map(connections.map((c) => [c.platform, c]));
  const platforms: AdPlatform[] = ['meta', 'tiktok'];
  const noneConnected = !connections.some((c) => c.status === 'connected');

  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-content-primary">Vos comptes publicitaires</h2>
        <p className="text-xs text-content-secondary mt-0.5">
          Vos publicités sont facturées directement par Facebook et TikTok, sur le moyen de
          paiement enregistré dans votre compte.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {platforms.map((platform) => {
          const connection = byPlatform.get(platform);
          return (
            <PlatformRow
              key={platform}
              platform={platform}
              connection={connection}
              busy={connecting === platform}
              canManage={canManage}
              onConnect={() => onConnect(platform)}
            />
          );
        })}
      </div>

      {canManage && connections
        .filter((c) => c.status === 'needs_account_selection')
        .map((c) => (
          <AccountPicker key={c.id} connection={c} onSelected={onSelected} />
        ))}

      {noneConnected && <Prerequisites />}
    </div>
  );
}

/**
 * Plusieurs comptes publicitaires (ou Pages) sont rattachés à l'identité
 * connectée : le choix revient au commerçant, se tromper ici reviendrait à
 * dépenser depuis le mauvais compte.
 */
function AccountPicker({
  connection, onSelected,
}: {
  connection: AdConnection;
  onSelected: () => void;
}) {
  const { success, error: notifError } = useNotificationStore();
  const available = connection.available_accounts ?? {};
  const isMeta = connection.platform === 'meta';

  const accounts = isMeta
    ? (available.accounts ?? []).map((a) => {
        // Un compte suspendu ou partagé en lecture seule se voit dans la liste
        // mais refuserait la création d'annonce : autant le dire ici plutôt
        // que de laisser l'erreur surgir à la publication.
        const canAdvertise = !a.user_tasks
          || a.user_tasks.some((t) => t === 'ADVERTISE' || t === 'MANAGE');
        const reason = a.account_status !== undefined && a.account_status !== 1
          ? 'compte inactif'
          : !canAdvertise ? 'lecture seule' : null;
        return {
          id:       a.account_id,
          label:    `${a.name ?? a.account_id}${a.currency ? ` · ${a.currency}` : ''}`,
          disabled: Boolean(reason),
          reason,
        };
      })
    : (available.advertisers ?? []).map((a) => ({
        id:       a.advertiser_id,
        label:    `${a.advertiser_name ?? a.advertiser_id}${a.currency ? ` · ${a.currency}` : ''}`,
        disabled: false,
        reason:   null as string | null,
      }));
  const pages = available.pages ?? [];

  const [accountId, setAccountId] = useState(accounts.find((a) => !a.disabled)?.id ?? '');
  const [pageId, setPageId]       = useState(pages[0]?.id ?? '');
  const [saving, setSaving]       = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await selectAdAccount(connection.platform, accountId, isMeta ? pageId : undefined);
      success('Compte publicitaire sélectionné');
      onSelected();
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSaving(false);
    }
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-status-warning bg-badge-warning p-3 text-xs text-status-warning space-y-1">
        <p className="font-medium">
          {PLATFORM_LABEL[connection.platform]} n&apos;a renvoyé aucun compte publicitaire.
        </p>
        <p>Deux explications possibles : votre compte n&apos;en possède pas encore
        — créez-le sur la plateforme puis reconnectez-vous — ou l&apos;autorisation
        de gestion des publicités n&apos;a pas été accordée pendant la connexion.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-3 space-y-3">
      <p className="text-sm font-medium text-content-primary">
        Choisissez le compte à utiliser pour {PLATFORM_LABEL[connection.platform]}
      </p>

      <div>
        <label htmlFor={`acc-${connection.id}`} className="block text-xs text-content-secondary mb-1">
          Compte publicitaire
        </label>
        <select
          id={`acc-${connection.id}`}
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="input w-full min-h-[44px]"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id} disabled={a.disabled}>
              {a.label}{a.reason ? ` — ${a.reason}` : ''}
            </option>
          ))}
        </select>
        {accounts.every((a) => a.disabled) && (
          <p className="text-xs text-status-warning mt-1">
            Aucun de ces comptes ne permet de diffuser : il faut un compte actif sur lequel
            vous avez les droits de publicité.
          </p>
        )}
      </div>

      {isMeta && (
        <div>
          <label htmlFor={`page-${connection.id}`} className="block text-xs text-content-secondary mb-1">
            Page Facebook qui publiera l&apos;annonce
          </label>
          <select
            id={`page-${connection.id}`}
            value={pageId}
            onChange={(e) => setPageId(e.target.value)}
            className="input w-full min-h-[44px]"
          >
            {pages.map((p) => (
              <option key={p.id} value={p.id}>{p.name ?? p.id}</option>
            ))}
          </select>
          {pages.length === 0 && (
            <p className="text-xs text-status-warning mt-1">
              Aucune Page Facebook trouvée — créez-en une avant de diffuser.
            </p>
          )}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !accountId || (isMeta && !pageId)}
        className="btn-primary min-h-[44px] w-full sm:w-auto disabled:opacity-50"
      >
        {saving ? 'Enregistrement…' : 'Valider'}
      </button>
    </div>
  );
}

function PlatformRow({
  platform, connection, busy, canManage, onConnect,
}: {
  platform:   AdPlatform;
  connection: AdConnection | undefined;
  busy:       boolean;
  canManage:  boolean;
  onConnect:  () => void;
}) {
  const status = connection?.status;
  const connected = status === 'connected';
  const needsAttention = status === 'token_expired' || status === 'needs_account_selection';

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-medium text-content-primary text-sm">{PLATFORM_LABEL[platform]}</p>
        {connected ? (
          <p className="text-xs text-status-success flex items-center gap-1 mt-0.5">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{connection?.external_account_name ?? 'Compte relié'}</span>
          </p>
        ) : needsAttention ? (
          <p className="text-xs text-status-warning flex items-center gap-1 mt-0.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {status === 'token_expired' ? 'Connexion expirée' : 'Compte à sélectionner'}
          </p>
        ) : (
          <p className="text-xs text-content-muted mt-0.5">Non connecté</p>
        )}
      </div>

      {canManage && (
        <button
          onClick={onConnect}
          disabled={busy}
          className={`${connected ? 'btn-secondary' : 'btn-primary'} text-sm shrink-0 min-h-[44px] px-3 flex items-center gap-1.5 disabled:opacity-50`}
        >
          <Link2 className="w-4 h-4" />
          {busy ? '…' : connected ? 'Changer' : needsAttention ? 'Reconnecter' : 'Connecter'}
        </button>
      )}
    </div>
  );
}

/**
 * Ces prérequis relèvent des plateformes, pas de l'application : les annoncer
 * franchement évite au commerçant de découvrir le blocage au milieu du parcours
 * de connexion, là où il ne peut plus rien faire.
 */
function Prerequisites() {
  return (
    <div className="rounded-lg border border-surface-border bg-surface p-3">
      <p className="text-xs font-medium text-content-primary flex items-center gap-1.5">
        <CreditCard className="w-3.5 h-3.5" />
        À prévoir avant de connecter
      </p>
      <ul className="mt-2 space-y-1 text-xs text-content-secondary list-disc list-inside">
        <li>Une Page Facebook pour votre activité (et un compte Instagram professionnel si vous en avez un)</li>
        <li>Un compte publicitaire avec un moyen de paiement valide</li>
        <li>Pour TikTok : un compte TikTok for Business approvisionné</li>
      </ul>
    </div>
  );
}

// ─── Carte de publicité ───────────────────────────────────────────────────────

function CampaignCard({
  group, canManage, onOpen, onAction,
}: {
  group:     AdCampaignGroup;
  canManage: boolean;
  onOpen:    () => void;
  onAction:  (a: 'pause' | 'resume' | 'stop') => void;
}) {
  const info = STATUS_INFO[group.status];
  const image = group.creative?.image_url;
  const failed = group.campaigns.filter((c) => c.status === 'failed');

  return (
    <div className="rounded-xl border border-surface-border bg-surface-card overflow-hidden">
      <button onClick={onOpen} className="w-full text-left p-4 flex items-start gap-3 hover:bg-surface/50">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium text-content-primary truncate">{group.name}</p>
            <span className={`shrink-0 inline-flex px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${info.cls}`}>
              {info.label}
            </span>
          </div>

          <p className="text-xs text-content-secondary mt-0.5">
            {OBJECTIVE_LABEL[group.objective]} · {group.platforms.map((p) => PLATFORM_LABEL[p]).join(' + ')}
          </p>

          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2 text-xs text-content-secondary">
            <span>
              <span className="text-content-primary font-medium">
                {formatCurrency(minorToMajor(group.totals.spendMinor, group.currency), group.currency)}
              </span> dépensés
            </span>
            <span>{group.totals.impressions.toLocaleString('fr-FR')} vues</span>
            <span>{group.totals.clicks.toLocaleString('fr-FR')} clics</span>
          </div>
        </div>

        <ChevronRight className="w-4 h-4 text-content-muted shrink-0 mt-1" />
      </button>

      {failed.length > 0 && (
        <p className="px-4 pb-3 text-xs text-status-error">
          {failed.map((c) => `${PLATFORM_LABEL[c.platform]} : ${c.error_message ?? 'échec de publication'}`).join(' · ')}
        </p>
      )}

      {canManage && group.status !== 'ended' && group.status !== 'failed' && (
        <div className="flex border-t border-surface-border">
          {group.status === 'paused' ? (
            <button onClick={() => onAction('resume')} className="flex-1 min-h-[44px] text-sm text-content-primary flex items-center justify-center gap-1.5 hover:bg-surface">
              <Play className="w-4 h-4" /> Relancer
            </button>
          ) : (
            <button onClick={() => onAction('pause')} className="flex-1 min-h-[44px] text-sm text-content-primary flex items-center justify-center gap-1.5 hover:bg-surface">
              <Pause className="w-4 h-4" /> Mettre en pause
            </button>
          )}
          <button onClick={() => onAction('stop')} className="flex-1 min-h-[44px] text-sm text-status-error flex items-center justify-center gap-1.5 border-l border-surface-border hover:bg-surface">
            <Square className="w-4 h-4" /> Arrêter
          </button>
        </div>
      )}
    </div>
  );
}
