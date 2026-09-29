'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Send, Loader2, Store, Check, AlertTriangle, ExternalLink,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useCan } from '@/hooks/usePermission';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toUserError } from '@/lib/user-error';
import { getProducts } from '@services/supabase/products';
import {
  getAdConnections, getSocialPosts, publishSocialPost,
  type AdConnection, type SocialPost, type SocialTarget,
} from '@services/supabase/marketing';
import type { Product } from '@pos-types';

const TARGET_LABEL: Record<SocialTarget, string> = {
  facebook:  'Page Facebook',
  instagram: 'Instagram',
};

export default function PublicationPage() {
  const router = useRouter();
  const { business } = useAuthStore();
  const can = useCan();
  const { success, error: notifError } = useNotificationStore();

  const [connection, setConnection] = useState<AdConnection | null>(null);
  const [products, setProducts]     = useState<Product[]>([]);
  const [posts, setPosts]           = useState<SocialPost[]>([]);
  const [loading, setLoading]       = useState(true);
  const [publishing, setPublishing] = useState(false);

  const [productId, setProductId] = useState<string | null>(null);
  const [message, setMessage]     = useState('');
  const [edited, setEdited]       = useState(false);
  const [targets, setTargets]     = useState<SocialTarget[]>(['facebook']);

  const businessId = business?.id ?? '';
  const product = products.find((p) => p.id === productId) ?? null;
  const imageUrl = product?.image_url ?? business?.logo_url ?? null;

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      const [conns, prods, history] = await Promise.all([
        getAdConnections(businessId),
        getProducts(businessId),
        getSocialPosts(businessId),
      ]);
      setConnection(conns.find((c) => c.platform === 'meta') ?? null);
      setProducts(prods.filter((p) => p.image_url));
      setPosts(history);
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setLoading(false);
    }
  }, [businessId, notifError]);

  useEffect(() => { load(); }, [load]);

  // Texte proposé à partir du catalogue, comme pour les publicités : le
  // commerçant valide au lieu de rédiger devant une page blanche.
  useEffect(() => {
    if (edited) return;
    const shop = business?.name ?? 'notre boutique';
    setMessage(product
      ? `${product.name} — ${formatCurrency(product.price, business?.currency ?? 'XOF')}\n\nDisponible chez ${shop}. Passez nous voir ou écrivez-nous.`
      : `Découvrez nos produits chez ${shop}.`);
  }, [product, edited, business?.name, business?.currency]);

  // Publier dépend de la Page, pas du compte publicitaire : le statut
  // `connected` décrit la capacité à diffuser des annonces et n'a rien à voir
  // ici. S'y fier bloquerait précisément les commerçants visés par cet écran,
  // ceux qui n'ont pas de compte publicitaire.
  const linked    = Boolean(connection) && connection?.status !== 'disconnected';
  const hasPage   = Boolean(connection?.page_id);
  const hasIg     = Boolean(connection?.instagram_actor_id);
  const canPublish = linked && hasPage && can('manage_marketing');

  function toggleTarget(t: SocialTarget) {
    setTargets((cur) => cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]);
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      const { results } = await publishSocialPost({
        targets,
        message,
        image_url:  imageUrl,
        product_id: productId,
      });

      const failures = results.filter((r) => !r.ok);
      if (failures.length === results.length) {
        notifError(failures[0]?.error ?? 'La publication a échoué');
      } else if (failures.length > 0) {
        notifError(`Publié partiellement — ${failures.map((f) => TARGET_LABEL[f.target]).join(', ')} en échec`);
      } else {
        success('Publication envoyée');
      }
      load();
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-content-secondary">Chargement…</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 sm:p-6 border-b border-surface-border">
        <button
          onClick={() => router.push('/marketing')}
          className="text-sm text-content-secondary flex items-center gap-1.5 min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour
        </button>
        <h1 className="text-xl font-bold text-content-primary mt-1">Publier sur vos réseaux</h1>
        <p className="text-xs text-content-secondary mt-0.5">
          Gratuit, sans compte publicitaire — votre publication paraît sur votre Page et votre compte Instagram.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {!linked ? (
          <div className="rounded-xl border border-surface-border bg-surface-card p-6 text-center space-y-3">
            <p className="text-content-primary font-medium">Compte Facebook non connecté</p>
            <button onClick={() => router.push('/marketing')} className="btn-primary">
              Connecter mon compte
            </button>
          </div>
        ) : !hasPage ? (
          <div className="rounded-xl border border-surface-border bg-surface-card p-6 text-center space-y-3">
            <p className="text-content-primary font-medium">Page Facebook non sélectionnée</p>
            <p className="text-sm text-content-secondary">
              Votre compte est relié, il reste à indiquer sous quelle Page publier.
              Aucun compte publicitaire n&apos;est nécessaire pour cela.
            </p>
            <button onClick={() => router.push('/marketing')} className="btn-primary">
              Choisir ma Page
            </button>
          </div>
        ) : (
          <>
            <div className="lg:grid lg:grid-cols-2 lg:gap-6 space-y-6 lg:space-y-0">
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-content-primary mb-2">Quoi publier</p>
                  <button
                    onClick={() => { setProductId(null); setEdited(false); }}
                    className={`w-full rounded-xl border p-3 flex items-center gap-3 text-left ${
                      productId === null ? 'border-brand-600 bg-badge-brand' : 'border-surface-border bg-surface-card'
                    }`}
                  >
                    <Store className="w-5 h-5 text-content-brand shrink-0" />
                    <span className="text-sm text-content-primary">Ma boutique en général</span>
                  </button>

                  {products.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
                      {products.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => { setProductId(p.id); setEdited(false); }}
                          className={`rounded-lg border overflow-hidden ${
                            productId === p.id ? 'border-brand-600 ring-2 ring-brand-600/30' : 'border-surface-border'
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.image_url} alt="" className="w-full aspect-square object-cover" />
                          <p className="text-[10px] text-content-primary truncate px-1 py-1">{p.name}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="post-message" className="block text-sm font-medium text-content-primary mb-1">
                    Texte de la publication
                  </label>
                  <textarea
                    id="post-message"
                    value={message}
                    onChange={(e) => { setMessage(e.target.value); setEdited(true); }}
                    rows={6}
                    maxLength={2200}
                    className="input w-full resize-none"
                  />
                  <p className="text-xs text-content-muted mt-1">{message.length}/2200 caractères</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-content-primary mb-2">Publier sur</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(['facebook', 'instagram'] as SocialTarget[]).map((t) => {
                      const disabled = t === 'instagram' && (!hasIg || !imageUrl);
                      return (
                        <button
                          key={t}
                          onClick={() => !disabled && toggleTarget(t)}
                          disabled={disabled}
                          className={`rounded-lg border min-h-[44px] px-3 py-2 text-sm flex items-center justify-between gap-2 disabled:opacity-50 ${
                            targets.includes(t) ? 'border-brand-600 bg-badge-brand' : 'border-surface-border bg-surface-card'
                          }`}
                        >
                          <span className="text-content-primary font-medium">{TARGET_LABEL[t]}</span>
                          {targets.includes(t) && <Check className="w-4 h-4 text-content-brand" />}
                        </button>
                      );
                    })}
                  </div>

                  {!hasIg && (
                    <p className="text-xs text-content-secondary mt-1">
                      Instagram indisponible : aucun compte professionnel n&apos;est rattaché à votre Page.
                    </p>
                  )}
                  {hasIg && !imageUrl && (
                    <p className="text-xs text-status-warning mt-1 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                      Instagram exige une photo. Choisissez un produit ou ajoutez un logo à votre établissement.
                    </p>
                  )}
                </div>

                <button
                  onClick={handlePublish}
                  disabled={publishing || !canPublish || targets.length === 0 || !message.trim()}
                  className="btn-primary w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {publishing ? 'Publication…' : 'Publier'}
                </button>
              </div>

              <div>
                <p className="text-sm font-medium text-content-primary mb-2">Aperçu</p>
                <div className="rounded-xl border border-surface-border bg-surface-card overflow-hidden max-w-sm">
                  {imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt="" className="w-full aspect-square object-cover" />
                  )}
                  <div className="p-3">
                    <p className="text-sm font-semibold text-content-primary">
                      {connection?.page_name ?? business?.name}
                    </p>
                    <p className="text-sm text-content-secondary mt-1 whitespace-pre-line">{message}</p>
                  </div>
                </div>
              </div>
            </div>

            {posts.length > 0 && (
              <div className="rounded-xl border border-surface-border bg-surface-card p-4">
                <h2 className="font-semibold text-content-primary text-sm mb-3">Publications récentes</h2>
                <div className="space-y-2">
                  {posts.map((p) => (
                    <div key={p.id} className="flex items-start justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="text-content-primary truncate">{p.message.split('\n')[0]}</p>
                        <p className="text-content-muted mt-0.5">
                          {TARGET_LABEL[p.platform]} · {formatDate(p.created_at)}
                        </p>
                        {p.error_message && (
                          <p className="text-status-error mt-0.5">{p.error_message}</p>
                        )}
                      </div>
                      {p.status === 'published' && p.external_post_id && (
                        <a
                          href={`https://www.facebook.com/${p.external_post_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-content-brand flex items-center gap-1"
                        >
                          Voir <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
