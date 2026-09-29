'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, Store, ShoppingBag, Megaphone, MessageCircle,
  Check, Loader2, Package, AlertTriangle,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useCan } from '@/hooks/usePermission';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toUserError } from '@/lib/user-error';
import { getPublicSiteUrl } from '@/lib/public-links';
import { getProducts } from '@services/supabase/products';
import { buildPublicBusinessRef } from '@services/supabase/public-business-ref';
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

/** Date du jour dans le fuseau de l'utilisateur — `toISOString()` renverrait la
 *  veille pour tout fuseau à l'ouest de Greenwich. */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Ajoute des jours à une date ISO sans repasser par un fuseau horaire. */
function addDaysISO(startISO: string, days: number): string {
  const [y, m, d] = startISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

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
  const [startDate, setStartDate] = useState(todayISO());
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
  const { presets, minMajor } = useMemo(() => {
    const zeroDecimal = minorToMajor(100, currency) === 100;
    const base = zeroDecimal ? [2000, 5000, 10000, 25000] : [5, 10, 25, 50];
    const minMinor = Math.max(...connected.map((c) => c.min_daily_budget_minor ?? 0), 0);
    const floor = minMinor ? minorToMajor(minMinor, currency) : 0;
    const usable = base.filter((v) => v >= floor);
    return { presets: usable.length ? usable : [floor], minMajor: floor };
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
    // Le slug plutôt que l'UUID : la route boutique résout les deux, mais
    // l'adresse est visible dans l'annonce et un identifiant technique
    // n'inspire pas confiance au moment de cliquer.
    const ref = buildPublicBusinessRef(business?.name ?? '', business?.public_slug);
    return `${getPublicSiteUrl()}/boutique/${ref}`;
  }, [objective, business?.phone, business?.name, business?.public_slug]);

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
        start_date:         startDate,
        end_date:           addDaysISO(startDate, days),
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
  : step === 3 ? platforms.length > 0 && budgetMajor > 0 && days >= 1
                 && (minMajor === 0 || budgetMajor >= minMajor)
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
            minMajor={minMajor}
            budgetMajor={budgetMajor}
            days={days}
            startDate={startDate}
            onStartDate={setStartDate}
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
            startDate={startDate}
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
  presets, minMajor, budgetMajor, days, startDate, currency, totalMajor, platforms, connected,
  onBudget, onDays, onStartDate, onTogglePlatform,
}: {
  presets:     number[];
  minMajor:    number;
  budgetMajor: number;
  days:        number;
  startDate:   string;
  onStartDate: (v: string) => void;
  currency:    string;
  totalMajor:  number;
  platforms:   AdPlatform[];
  connected:   AdConnection[];
  onBudget:    (v: number) => void;
  onDays:      (v: number) => void;
  onTogglePlatform: (p: AdPlatform) => void;
}) {
  // Le mode libre se déduit de la valeur courante : en revenant sur cette
  // étape, un montant personnalisé reste affiché comme tel sans état à porter.
  const [customBudget, setCustomBudget] = useState(!presets.includes(budgetMajor));
  const [customDays, setCustomDays]     = useState(!DURATIONS.includes(days));
  const scheduled = startDate !== todayISO();

  const belowMin = minMajor > 0 && budgetMajor > 0 && budgetMajor < minMajor;

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
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {presets.map((v) => (
            <button
              key={v}
              onClick={() => { setCustomBudget(false); onBudget(v); }}
              className={`rounded-lg border min-h-[44px] px-3 text-sm font-medium ${
                !customBudget && budgetMajor === v
                  ? 'border-brand-600 bg-badge-brand text-content-brand'
                  : 'border-surface-border bg-surface-card text-content-primary'
              }`}
            >
              {formatCurrency(v, currency)}
            </button>
          ))}
          <button
            onClick={() => setCustomBudget(true)}
            className={`rounded-lg border min-h-[44px] px-3 text-sm font-medium ${
              customBudget
                ? 'border-brand-600 bg-badge-brand text-content-brand'
                : 'border-surface-border bg-surface-card text-content-primary'
            }`}
          >
            Autre
          </button>
        </div>

        {customBudget && (
          <div className="mt-2">
            <label htmlFor="budget-libre" className="block text-xs text-content-secondary mb-1">
              Montant par jour, en {currency}
            </label>
            <input
              id="budget-libre"
              type="number"
              inputMode="numeric"
              min={minMajor || undefined}
              value={budgetMajor || ''}
              onChange={(e) => onBudget(Number(e.target.value))}
              className="input w-full sm:w-48 min-h-[44px]"
            />
            {belowMin && (
              <p className="text-xs text-status-error mt-1">
                Minimum imposé par la plateforme : {formatCurrency(minMajor, currency)} par jour.
              </p>
            )}
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-content-primary mb-2">Pendant</p>
        <div className="grid grid-cols-4 gap-2">
          {DURATIONS.map((d) => (
            <button
              key={d}
              onClick={() => { setCustomDays(false); onDays(d); }}
              className={`rounded-lg border min-h-[44px] px-3 text-sm font-medium ${
                !customDays && days === d
                  ? 'border-brand-600 bg-badge-brand text-content-brand'
                  : 'border-surface-border bg-surface-card text-content-primary'
              }`}
            >
              {d} jours
            </button>
          ))}
          <button
            onClick={() => setCustomDays(true)}
            className={`rounded-lg border min-h-[44px] px-3 text-sm font-medium ${
              customDays
                ? 'border-brand-600 bg-badge-brand text-content-brand'
                : 'border-surface-border bg-surface-card text-content-primary'
            }`}
          >
            Autre
          </button>
        </div>

        {customDays && (
          <div className="mt-2">
            <label htmlFor="duree-libre" className="block text-xs text-content-secondary mb-1">
              Nombre de jours (1 à 90)
            </label>
            <input
              id="duree-libre"
              type="number"
              inputMode="numeric"
              min={1}
              max={90}
              value={days || ''}
              onChange={(e) => onDays(Math.min(90, Math.max(1, Number(e.target.value))))}
              className="input w-full sm:w-48 min-h-[44px]"
            />
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-content-primary mb-2">Démarrage</p>
        <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
          <button
            onClick={() => onStartDate(todayISO())}
            className={`rounded-lg border min-h-[44px] px-3 text-sm font-medium ${
              !scheduled
                ? 'border-brand-600 bg-badge-brand text-content-brand'
                : 'border-surface-border bg-surface-card text-content-primary'
            }`}
          >
            Dès maintenant
          </button>
          <button
            onClick={() => onStartDate(addDaysISO(todayISO(), 1))}
            className={`rounded-lg border min-h-[44px] px-3 text-sm font-medium ${
              scheduled
                ? 'border-brand-600 bg-badge-brand text-content-brand'
                : 'border-surface-border bg-surface-card text-content-primary'
            }`}
          >
            Programmer
          </button>
        </div>

        {scheduled && (
          <div className="mt-2">
            <label htmlFor="date-debut" className="block text-xs text-content-secondary mb-1">
              Date de début
            </label>
            <input
              id="date-debut"
              type="date"
              min={todayISO()}
              value={startDate}
              onChange={(e) => onStartDate(e.target.value || todayISO())}
              className="input w-full sm:w-48 min-h-[44px]"
            />
            <p className="text-xs text-content-secondary mt-1">
              La publicité est créée tout de suite et reste en attente jusqu&apos;à cette date.
            </p>
          </div>
        )}
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
          {scheduled && `, à partir du ${formatDate(startDate)}`}
          {platforms.length > 1 && ', sur chaque plateforme sélectionnée'}
        </p>
      </div>
    </div>
  );
}

// ─── Étape 4 : aperçu ─────────────────────────────────────────────────────────

function StepPreview({
  headline, body, imageUrl, landingUrl, budgetMajor, totalMajor, days, startDate, currency, platforms,
  onHeadline, onBody,
}: {
  headline:    string;
  body:        string;
  imageUrl:    string | null;
  landingUrl:  string;
  budgetMajor: number;
  totalMajor:  number;
  days:        number;
  startDate:   string;
  currency:    string;
  platforms:   AdPlatform[];
  onHeadline:  (v: string) => void;
  onBody:      (v: string) => void;
}) {
  // Les plateformes acceptent les petites images mais les affichent floues, et
  // une créa floue est la première cause d'annonce ignorée. On mesure le
  // fichier réel plutôt que de faire confiance au rendu miniature.
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!imageUrl) { setDims(null); return; }
    const img = new window.Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = imageUrl;
  }, [imageUrl]);

  const imageWarning =
    !imageUrl                      ? "Aucune photo : une annonce sans visuel est très peu vue. Ajoutez une photo au produit."
  : dims && (dims.w < 600 || dims.h < 600)
                                   ? `Photo de ${dims.w}×${dims.h} pixels, un peu petite. En dessous de 600 pixels de côté, l'annonce paraît floue.`
  : null;

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
          <p>
            <span className="text-content-primary font-medium">Période :</span>{' '}
            {startDate === todayISO() ? 'dès la validation' : `à partir du ${formatDate(startDate)}`}
            {' '}jusqu&apos;au {formatDate(addDaysISO(startDate, days))}
          </p>
          <p><span className="text-content-primary font-medium">Diffusion :</span> {platforms.map((p) => PLATFORM_LABEL[p]).join(' + ')}</p>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-content-primary">Aperçu</p>

        {imageWarning && (
          <p className="text-xs text-status-warning flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>{imageWarning}</span>
          </p>
        )}

        <div className="flex flex-wrap gap-4">
          {platforms.includes('meta') && (
            <div className="w-full max-w-[18rem]">
              <p className="text-xs text-content-secondary mb-1.5">Facebook & Instagram</p>
              <div className="rounded-xl border border-surface-border bg-surface-card overflow-hidden">
                {imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="" className="w-full aspect-square object-cover" />
                )}
                <div className="p-3">
                  <p className="font-semibold text-content-primary text-sm">{headline || "Titre de l'annonce"}</p>
                  <p className="text-sm text-content-secondary mt-1 whitespace-pre-line">{body}</p>
                  <div className="mt-3 rounded-lg bg-surface-input px-3 py-2 text-xs text-content-secondary">
                    Sponsorisé
                  </div>
                </div>
              </div>
            </div>
          )}

          {platforms.includes('tiktok') && (
            // TikTok diffuse en plein écran vertical : montrer le même cadre
            // carré que Facebook donnerait une fausse idée du rendu.
            <div className="w-full max-w-[13rem]">
              <p className="text-xs text-content-secondary mb-1.5">TikTok</p>
              <div className="relative rounded-xl border border-surface-border bg-black overflow-hidden aspect-[9/16]">
                {imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" />
                )}
                <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                  <p className="text-white text-xs font-semibold">{headline || "Titre de l'annonce"}</p>
                  <p className="text-white/80 text-xs mt-1 line-clamp-3">{body}</p>
                  <span className="inline-block mt-2 text-[10px] text-white/70">Sponsorisé</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
