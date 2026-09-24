'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, Store, ShoppingBag, Megaphone, MessageCircle,
  Check, Loader2, Package,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useCan } from '@/hooks/usePermission';
import { formatCurrency } from '@/lib/utils';
import { toUserError } from '@/lib/user-error';
import { getPublicSiteUrl } from '@/lib/public-links';
import { getProducts } from '@services/supabase/products';
import {
  getAdConnections, publishCampaign, minorToMajor, majorToMinor,
  type AdConnection, type AdPlatform, type AdObjective,
} from '@services/supabase/marketing';
import type { Product } from '@pos-types';

const PLATFORM_LABEL: Record<AdPlatform, string> = {
  meta:   'Facebook & Instagram',
  tiktok: 'TikTok',
};

const OBJECTIVES: Array<{
  key: AdObjective; title: string; description: string; icon: typeof ShoppingBag;
}> = [
  { key: 'ventes',     title: 'Vendre plus',          description: 'Amener des clients vers votre boutique en ligne', icon: ShoppingBag },
  { key: 'visibilite', title: 'Me faire connaître',   description: 'Montrer votre activité au plus de monde possible', icon: Megaphone },
  { key: 'messages',   title: 'Recevoir des messages', description: 'Ouvrir une conversation WhatsApp en un clic',      icon: MessageCircle },
];

const DURATIONS = [7, 14, 30];

export default function NouvellePubliciteePage() {
  const router = useRouter();
  const { business } = useAuthStore();
  const can = useCan();
  const { success, error: notifError } = useNotificationStore();

  const [connections, setConnections] = useState<AdConnection[]>([]);
  const [products, setProducts]       = useState<Product[]>([]);
  const [loading, setLoading]         = useState(true);
  const [publishing, setPublishing]   = useState(false);

  const [step, setStep]           = useState(1);
  const [productId, setProductId] = useState<string | null>(null);
  const [objective, setObjective] = useState<AdObjective>('ventes');
  const [platforms, setPlatforms] = useState<AdPlatform[]>([]);
  const [budgetMajor, setBudget]  = useState(0);
  const [days, setDays]           = useState(7);
  const [headline, setHeadline]   = useState('');
  const [body, setBody]           = useState('');
  const [copyEdited, setCopyEdited] = useState(false);

  const businessId = business?.id ?? '';
  const connected  = useMemo(() => connections.filter((c) => c.status === 'connected'), [connections]);
  const currency   = connected[0]?.currency ?? business?.currency ?? 'XOF';
  const product    = products.find((p) => p.id === productId) ?? null;

  useEffect(() => {
    if (!businessId) return;
    (async () => {
      try {
        const [conns, prods] = await Promise.all([
          getAdConnections(businessId),
          getProducts(businessId),
        ]);
        setConnections(conns);
        setProducts(prods.filter((p) => p.image_url));
        setPlatforms(conns.filter((c) => c.status === 'connected').map((c) => c.platform));
      } catch (err) {
        notifError(toUserError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [businessId, notifError]);

  // Paliers de budget exprimés dans la devise du compte connecté. Le plancher
  // vient de la plateforme (il dépend du pays et de la devise) plutôt que d'une
  // valeur inventée ici qui provoquerait un refus à la publication.
  const presets = useMemo(() => {
    const zeroDecimal = minorToMajor(100, currency) === 100;
    const base = zeroDecimal ? [2000, 5000, 10000, 25000] : [5, 10, 25, 50];
    const minMinor = Math.max(...connected.map((c) => c.min_daily_budget_minor ?? 0), 0);
    const minMajor = minMinor ? minorToMajor(minMinor, currency) : 0;
    return base.filter((v) => v >= minMajor).length ? base.filter((v) => v >= minMajor) : [minMajor];
  }, [currency, connected]);

  useEffect(() => {
    if (budgetMajor === 0 && presets.length) setBudget(presets[Math.min(1, presets.length - 1)]);
  }, [presets, budgetMajor]);

  // Le texte est proposé à partir du catalogue : le commerçant valide ou
  // ajuste, il n'a pas à rédiger une annonce depuis une page blanche.
  const suggestCopy = useCallback(() => {
    const shop = business?.name ?? 'notre boutique';
    if (product) {
      const price = formatCurrency(product.price, currency);
      return {
        headline: product.name,
        body: objective === 'messages'
          ? `${product.name} à ${price} chez ${shop}. Écrivez-nous sur WhatsApp pour commander.`
          : `${product.name} disponible à ${price} chez ${shop}. Commandez dès maintenant.`,
      };
    }
    return {
      headline: shop,
      body: objective === 'messages'
        ? `Découvrez ${shop}. Écrivez-nous sur WhatsApp, on vous répond rapidement.`
        : `Découvrez tous nos produits chez ${shop}.`,
    };
  }, [product, objective, business?.name, currency]);

  useEffect(() => {
    if (copyEdited) return;
    const s = suggestCopy();
    setHeadline(s.headline);
    setBody(s.body);
  }, [suggestCopy, copyEdited]);

  const landingUrl = useMemo(() => {
    if (objective === 'messages') {
      const digits = (business?.phone ?? '').replace(/\D/g, '');
      return digits ? `https://wa.me/${digits}` : '';
    }
    return `${getPublicSiteUrl()}/boutique/${businessId}`;
  }, [objective, business?.phone, businessId]);

  const totalMajor = budgetMajor * days;

  function togglePlatform(p: AdPlatform) {
    setPlatforms((current) =>
      current.includes(p) ? current.filter((x) => x !== p) : [...current, p],
    );
  }

  async function handlePublish() {
    if (!landingUrl) {
      notifError('Renseignez le numéro WhatsApp de votre établissement dans les paramètres.');
      return;
    }

    setPublishing(true);
    try {
      const start = new Date();
      const end = new Date(start.getTime() + days * 86400000);
      const iso = (d: Date) => d.toISOString().slice(0, 10);

      const result = await publishCampaign({
        platforms,
        objective,
        name:               product ? `${product.name}` : `${business?.name ?? 'Boutique'}`,
        headline,
        body,
        landing_url:        landingUrl,
        image_url:          product?.image_url ?? business?.logo_url ?? null,
        product_id:         productId,
        daily_budget_minor: majorToMinor(budgetMajor, currency),
        start_date:         iso(start),
        end_date:           iso(end),
      });

      const failures = result.results.filter((r) => !r.ok);
      if (failures.length === result.results.length) {
        notifError(failures[0]?.error ?? 'La publication a échoué');
      } else if (failures.length > 0) {
        success('Publicité lancée — une plateforme a échoué, voir le détail');
        router.push(`/marketing/detail?id=${result.campaign_group_id}`);
      } else {
        success('Votre publicité est en ligne');
        router.push(`/marketing/detail?id=${result.campaign_group_id}`);
      }
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-content-secondary">Chargement…</div>;
  }

  if (!can('manage_marketing')) {
    return (
      <div className="p-6 text-content-secondary">
        Vous n&apos;avez pas l&apos;autorisation de créer des publicités.
      </div>
    );
  }

  if (connected.length === 0) {
    return (
      <div className="p-6 space-y-4">
        <p className="text-content-primary font-medium">Aucun compte publicitaire connecté</p>
        <button onClick={() => router.push('/marketing')} className="btn-primary">
          Connecter un compte
        </button>
      </div>
    );
  }

  const canNext =
    step === 1 ? true
  : step === 2 ? Boolean(objective)
  : step === 3 ? platforms.length > 0 && budgetMajor > 0
  : true;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 sm:p-6 border-b border-surface-border">
        <button
          onClick={() => (step === 1 ? router.push('/marketing') : setStep(step - 1))}
          className="text-sm text-content-secondary flex items-center gap-1.5 min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          {step === 1 ? 'Retour aux publicités' : 'Étape précédente'}
        </button>

        <h1 className="text-xl font-bold text-content-primary mt-1">Nouvelle publicité</h1>

        <div className="flex gap-1.5 mt-3" aria-label={`Étape ${step} sur 4`}>
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-brand-600' : 'bg-surface-border'}`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {step === 1 && (
          <StepProduct
            products={products}
            productId={productId}
            currency={currency}
            onSelect={(id) => { setProductId(id); setCopyEdited(false); }}
          />
        )}

        {step === 2 && (
          <StepObjective
            objective={objective}
            onSelect={(o) => { setObjective(o); setCopyEdited(false); }}
          />
        )}

        {step === 3 && (
          <StepBudget
            presets={presets}
            budgetMajor={budgetMajor}
            days={days}
            currency={currency}
            totalMajor={totalMajor}
            platforms={platforms}
            connected={connected}
            onBudget={setBudget}
            onDays={setDays}
            onTogglePlatform={togglePlatform}
          />
        )}

        {step === 4 && (
          <StepPreview
            headline={headline}
            body={body}
            imageUrl={product?.image_url ?? business?.logo_url ?? null}
            landingUrl={landingUrl}
            budgetMajor={budgetMajor}
            totalMajor={totalMajor}
            days={days}
            currency={currency}
            platforms={platforms}
            onHeadline={(v) => { setHeadline(v); setCopyEdited(true); }}
            onBody={(v) => { setBody(v); setCopyEdited(true); }}
          />
        )}
      </div>

      <div className="p-4 sm:p-6 border-t border-surface-border">
        {step < 4 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canNext}
            className="btn-primary w-full sm:w-auto sm:ml-auto flex items-center justify-center gap-2 min-h-[44px] disabled:opacity-50"
          >
            Continuer
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="btn-primary w-full sm:w-auto sm:ml-auto flex items-center justify-center gap-2 min-h-[44px] disabled:opacity-50"
          >
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {publishing ? 'Publication en cours…' : 'Publier ma publicité'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Étape 1 : quoi promouvoir ────────────────────────────────────────────────

function StepProduct({
  products, productId, currency, onSelect,
}: {
  products:  Product[];
  productId: string | null;
  currency:  string;
  onSelect:  (id: string | null) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-content-primary">Que voulez-vous mettre en avant ?</h2>
        <p className="text-sm text-content-secondary mt-0.5">
          La photo et le prix de votre catalogue serviront directement à l&apos;annonce.
        </p>
      </div>

      <button
        onClick={() => onSelect(null)}
        className={`w-full rounded-xl border p-4 flex items-center gap-3 text-left ${
          productId === null
            ? 'border-brand-600 bg-badge-brand'
            : 'border-surface-border bg-surface-card'
        }`}
      >
        <Store className="w-5 h-5 text-content-brand shrink-0" />
        <div>
          <p className="font-medium text-content-primary text-sm">Ma boutique en général</p>
          <p className="text-xs text-content-secondary">Sans mettre en avant un produit précis</p>
        </div>
      </button>

      {products.length === 0 ? (
        <div className="rounded-xl border border-surface-border bg-surface-card p-6 text-center">
          <Package className="w-10 h-10 mx-auto text-content-muted opacity-30" />
          <p className="text-sm text-content-primary font-medium mt-2">Aucun produit avec photo</p>
          <p className="text-xs text-content-secondary mt-1">
            Ajoutez une photo à vos produits pour les mettre en avant : une annonce sans visuel
            fonctionne mal.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`rounded-xl border overflow-hidden text-left ${
                productId === p.id ? 'border-brand-600 ring-2 ring-brand-600/30' : 'border-surface-border'
              } bg-surface-card`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.image_url} alt="" className="w-full aspect-square object-cover" />
              <div className="p-2">
                <p className="text-xs font-medium text-content-primary truncate">{p.name}</p>
                <p className="text-xs text-content-secondary">{formatCurrency(p.price, currency)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Étape 2 : objectif ───────────────────────────────────────────────────────

function StepObjective({
  objective, onSelect,
}: {
  objective: AdObjective;
  onSelect:  (o: AdObjective) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-content-primary">Qu&apos;attendez-vous de cette publicité ?</h2>
        <p className="text-sm text-content-secondary mt-0.5">
          Nous réglons le ciblage et les placements en fonction de votre réponse.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {OBJECTIVES.map(({ key, title, description, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`rounded-xl border p-4 text-left ${
              objective === key
                ? 'border-brand-600 bg-badge-brand'
                : 'border-surface-border bg-surface-card'
            }`}
          >
            <Icon className="w-6 h-6 text-content-brand" />
            <p className="font-medium text-content-primary mt-2">{title}</p>
            <p className="text-xs text-content-secondary mt-1">{description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Étape 3 : budget & durée ─────────────────────────────────────────────────

function StepBudget({
  presets, budgetMajor, days, currency, totalMajor, platforms, connected,
  onBudget, onDays, onTogglePlatform,
}: {
  presets:     number[];
  budgetMajor: number;
  days:        number;
  currency:    string;
  totalMajor:  number;
  platforms:   AdPlatform[];
  connected:   AdConnection[];
  onBudget:    (v: number) => void;
  onDays:      (v: number) => void;
  onTogglePlatform: (p: AdPlatform) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold text-content-primary">Combien souhaitez-vous investir ?</h2>
        <p className="text-sm text-content-secondary mt-0.5">
          Montant prélevé par jour de diffusion, facturé par la plateforme.
        </p>
      </div>

      <div>
        <p className="text-sm font-medium text-content-primary mb-2">Budget par jour</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {presets.map((v) => (
            <button
              key={v}
              onClick={() => onBudget(v)}
              className={`rounded-lg border min-h-[44px] px-3 text-sm font-medium ${
                budgetMajor === v
                  ? 'border-brand-600 bg-badge-brand text-content-brand'
                  : 'border-surface-border bg-surface-card text-content-primary'
              }`}
            >
              {formatCurrency(v, currency)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-content-primary mb-2">Pendant</p>
        <div className="grid grid-cols-3 gap-2">
          {DURATIONS.map((d) => (
            <button
              key={d}
              onClick={() => onDays(d)}
              className={`rounded-lg border min-h-[44px] px-3 text-sm font-medium ${
                days === d
                  ? 'border-brand-600 bg-badge-brand text-content-brand'
                  : 'border-surface-border bg-surface-card text-content-primary'
              }`}
            >
              {d} jours
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-content-primary mb-2">Diffuser sur</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {connected.map((c) => (
            <button
              key={c.platform}
              onClick={() => onTogglePlatform(c.platform)}
              className={`rounded-lg border min-h-[44px] px-3 py-2 text-sm flex items-center justify-between gap-2 ${
                platforms.includes(c.platform)
                  ? 'border-brand-600 bg-badge-brand'
                  : 'border-surface-border bg-surface-card'
              }`}
            >
              <span className="text-content-primary font-medium">{PLATFORM_LABEL[c.platform]}</span>
              {platforms.includes(c.platform) && <Check className="w-4 h-4 text-content-brand" />}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-surface-border bg-surface-card p-4">
        <p className="text-sm text-content-secondary">Vous dépenserez au maximum</p>
        <p className="text-2xl font-bold text-content-primary mt-1">
          {formatCurrency(totalMajor, currency)}
        </p>
        <p className="text-xs text-content-secondary mt-1">
          soit {formatCurrency(budgetMajor, currency)} par jour pendant {days} jours
          {platforms.length > 1 && ', sur chaque plateforme sélectionnée'}
        </p>
      </div>
    </div>
  );
}

// ─── Étape 4 : aperçu ─────────────────────────────────────────────────────────

function StepPreview({
  headline, body, imageUrl, landingUrl, budgetMajor, totalMajor, days, currency, platforms,
  onHeadline, onBody,
}: {
  headline:    string;
  body:        string;
  imageUrl:    string | null;
  landingUrl:  string;
  budgetMajor: number;
  totalMajor:  number;
  days:        number;
  currency:    string;
  platforms:   AdPlatform[];
  onHeadline:  (v: string) => void;
  onBody:      (v: string) => void;
}) {
  return (
    <div className="space-y-6 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
      <div className="space-y-4">
        <div>
          <h2 className="font-semibold text-content-primary">Vérifiez votre annonce</h2>
          <p className="text-sm text-content-secondary mt-0.5">
            Le texte est proposé automatiquement — modifiez-le si vous le souhaitez.
          </p>
        </div>

        <div>
          <label htmlFor="ad-headline" className="block text-sm font-medium text-content-primary mb-1">
            Titre
          </label>
          <input
            id="ad-headline"
            value={headline}
            onChange={(e) => onHeadline(e.target.value)}
            maxLength={60}
            className="input w-full"
          />
          <p className="text-xs text-content-muted mt-1">{headline.length}/60 caractères</p>
        </div>

        <div>
          <label htmlFor="ad-body" className="block text-sm font-medium text-content-primary mb-1">
            Texte de l&apos;annonce
          </label>
          <textarea
            id="ad-body"
            value={body}
            onChange={(e) => onBody(e.target.value)}
            rows={4}
            maxLength={280}
            className="input w-full resize-none"
          />
          <p className="text-xs text-content-muted mt-1">{body.length}/280 caractères</p>
        </div>

        <div className="rounded-lg border border-surface-border bg-surface p-3 space-y-1 text-xs text-content-secondary">
          <p><span className="text-content-primary font-medium">Destination :</span> {landingUrl || '— à configurer —'}</p>
          <p><span className="text-content-primary font-medium">Budget :</span> {formatCurrency(budgetMajor, currency)} par jour pendant {days} jours ({formatCurrency(totalMajor, currency)} au total)</p>
          <p><span className="text-content-primary font-medium">Diffusion :</span> {platforms.map((p) => PLATFORM_LABEL[p]).join(' + ')}</p>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-content-primary mb-2">Aperçu</p>
        <div className="rounded-xl border border-surface-border bg-surface-card overflow-hidden max-w-sm">
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="w-full aspect-square object-cover" />
          )}
          <div className="p-3">
            <p className="font-semibold text-content-primary text-sm">{headline || 'Titre de l\'annonce'}</p>
            <p className="text-sm text-content-secondary mt-1 whitespace-pre-line">{body}</p>
            <div className="mt-3 rounded-lg bg-surface-input px-3 py-2 text-xs text-content-secondary">
              Sponsorisé
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
