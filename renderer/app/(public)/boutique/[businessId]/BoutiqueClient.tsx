'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ShoppingCart, Plus, Minus, X, Package,
  Search, MapPin, Phone, Loader2, AlertCircle,
  ChevronLeft, Store, Truck, CreditCard, Banknote,
  MessageCircle, Check, LayoutGrid, List, ArrowUpDown,
  SlidersHorizontal, Eye, EyeOff,
} from 'lucide-react';
import {
  getBoutiqueInfo, getBoutiqueProducts, createBoutiqueOrder,
  type BoutiqueInfo, type BoutiqueProduct, type BoutiqueVariant, type BoutiqueCartItem,
} from '@services/supabase/boutique';
import { formatCurrency } from '@/lib/utils';

// ------ Types -----------------------------------------------------------------------

type DeliveryType  = 'pickup' | 'delivery';
type PaymentMethod = 'cash' | 'mobile_money' | 'lien_paiement';
type ViewMode      = 'grid' | 'list';
type SortKey       = 'default' | 'price_asc' | 'price_desc' | 'name';

const BOU_PAGE_SIZE = 20;

interface CartEntry extends BoutiqueCartItem {
  key: string;
}

// ------ Helpers ---------------------------------------------------------------------

function cartKey(productId: string, variantId?: string) {
  return variantId ? `${productId}:${variantId}` : productId;
}

function getEffectivePrice(product: BoutiqueProduct, variant?: BoutiqueVariant) {
  return product.price + (variant?.price_modifier ?? 0);
}

// ------ ProductCard (grid) ----------------------------------------------------------

interface ProductCardProps {
  product:  BoutiqueProduct;
  currency: string;
  cartQty:  number;
  onAdd:    (product: BoutiqueProduct, variant?: BoutiqueVariant) => void;
  onRemove: (product: BoutiqueProduct, variant?: BoutiqueVariant) => void;
}

function ProductCard({ product, currency, cartQty, onAdd, onRemove }: ProductCardProps) {
  const [showVariants, setShowVariants] = useState(false);
  const hasVariants = product.variants?.length > 0;
  const outOfStock  = product.track_stock && (product.stock ?? 0) <= 0;

  return (
    <>
      <div
        className={`bg-surface-card rounded-2xl shadow-sm border border-surface-border overflow-hidden flex flex-col transition-all hover:shadow-md hover:border-brand-500/20 ${outOfStock ? 'opacity-60' : ''}`}
        onClick={() => hasVariants && !outOfStock ? setShowVariants(true) : undefined}
      >
        {/* Image */}
        <div className="relative aspect-square bg-surface-input flex items-center justify-center overflow-hidden">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <Package className="w-10 h-10 text-content-muted" />
          )}
          {outOfStock && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="text-[10px] font-bold text-white bg-status-error px-2 py-0.5 rounded-full uppercase tracking-wide">Épuisé</span>
            </div>
          )}
          {cartQty > 0 && (
            <div className="absolute top-2 right-2 w-5 h-5 bg-brand-600 rounded-full flex items-center justify-center">
              <span className="text-[10px] font-black text-white">{cartQty}</span>
            </div>
          )}
        </div>

        {/* Infos */}
        <div className="p-3 flex flex-col gap-2 flex-1">
          <p className="font-semibold text-content-primary text-sm leading-snug line-clamp-2">{product.name}</p>
          {product.description && (
            <p className="text-xs text-content-muted line-clamp-2">{product.description}</p>
          )}

          <div className="flex items-center justify-between mt-auto pt-1">
            <span className="font-bold text-brand-500 text-sm">{formatCurrency(product.price, currency)}</span>

            {!outOfStock && !hasVariants && (
              cartQty > 0 ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemove(product); }}
                    className="w-7 h-7 rounded-full bg-surface-input hover:bg-surface-hover border border-surface-border flex items-center justify-center transition-colors"
                  >
                    <Minus className="w-3 h-3 text-content-primary" />
                  </button>
                  <span className="text-sm font-bold text-content-primary min-w-[16px] text-center">{cartQty}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onAdd(product); }}
                    className="w-7 h-7 rounded-full bg-brand-600 hover:bg-brand-700 flex items-center justify-center transition-colors"
                  >
                    <Plus className="w-3 h-3 text-white" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); onAdd(product); }}
                  className="w-8 h-8 rounded-full bg-brand-600 hover:bg-brand-700 flex items-center justify-center transition-colors shadow-sm"
                >
                  <Plus className="w-4 h-4 text-white" />
                </button>
              )
            )}

            {!outOfStock && hasVariants && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowVariants(true); }}
                className="text-xs font-semibold text-brand-500 bg-brand-500/10 border border-brand-500/20 hover:bg-brand-500/20 px-3 py-1.5 rounded-full transition-colors"
              >
                {cartQty > 0 ? `${cartQty} ajouté${cartQty > 1 ? 's' : ''}` : 'Choisir'}
              </button>
            )}
          </div>
        </div>
      </div>

      {showVariants && (
        <VariantModal product={product} currency={currency} onAdd={onAdd} onClose={() => setShowVariants(false)} />
      )}
    </>
  );
}

// ------ ProductListItem (list) -------------------------------------------------------

function ProductListItem({ product, currency, cartQty, onAdd, onRemove }: ProductCardProps) {
  const [showVariants, setShowVariants] = useState(false);
  const hasVariants = product.variants?.length > 0;
  const outOfStock  = product.track_stock && (product.stock ?? 0) <= 0;

  return (
    <>
      <div className={`bg-surface-card rounded-2xl border border-surface-border flex items-center gap-3 p-3 transition-all hover:border-brand-500/20 hover:shadow-sm ${outOfStock ? 'opacity-60' : ''}`}>
        {/* Image */}
        <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-surface-input flex items-center justify-center overflow-hidden shrink-0">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <Package className="w-6 h-6 text-content-muted" />
          )}
          {outOfStock && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-xl">
              <span className="text-[9px] font-bold text-white uppercase">Épuisé</span>
            </div>
          )}
        </div>

        {/* Infos */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-content-primary text-sm leading-snug line-clamp-1">{product.name}</p>
          {product.description && (
            <p className="text-xs text-content-muted line-clamp-1 mt-0.5">{product.description}</p>
          )}
          <p className="font-bold text-brand-500 text-sm mt-1">{formatCurrency(product.price, currency)}</p>
        </div>

        {/* Action */}
        <div className="shrink-0">
          {outOfStock ? (
            <span className="text-[10px] text-status-error font-bold bg-badge-error px-2 py-1 rounded-lg">Épuisé</span>
          ) : hasVariants ? (
            <button
              onClick={() => setShowVariants(true)}
              className="text-xs font-semibold text-brand-500 bg-brand-500/10 border border-brand-500/20 hover:bg-brand-500/20 px-3 py-2 rounded-xl transition-colors whitespace-nowrap"
            >
              {cartQty > 0 ? `${cartQty} ✓` : 'Choisir'}
            </button>
          ) : cartQty > 0 ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onRemove(product)}
                className="w-8 h-8 rounded-full bg-surface-input hover:bg-surface-hover border border-surface-border flex items-center justify-center transition-colors"
              >
                <Minus className="w-3.5 h-3.5 text-content-primary" />
              </button>
              <span className="text-sm font-bold text-content-primary w-5 text-center">{cartQty}</span>
              <button
                onClick={() => onAdd(product)}
                className="w-8 h-8 rounded-full bg-brand-600 hover:bg-brand-700 flex items-center justify-center transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => onAdd(product)}
              className="w-9 h-9 rounded-full bg-brand-600 hover:bg-brand-700 flex items-center justify-center transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4 text-white" />
            </button>
          )}
        </div>
      </div>

      {showVariants && (
        <VariantModal product={product} currency={currency} onAdd={onAdd} onClose={() => setShowVariants(false)} />
      )}
    </>
  );
}

// ------ Modal variantes (partagée) --------------------------------------------------

function VariantModal({
  product, currency, onAdd, onClose,
}: { product: BoutiqueProduct; currency: string; onAdd: (p: BoutiqueProduct, v: BoutiqueVariant) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-surface-card rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-surface-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <div>
            <h3 className="font-bold text-content-primary">{product.name}</h3>
            <p className="text-xs text-content-muted mt-0.5">Choisissez une option</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-hover">
            <X className="w-4 h-4 text-content-muted" />
          </button>
        </div>
        <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
          {product.variants.map((variant) => {
            const vPrice    = getEffectivePrice(product, variant);
            const vOutStock = product.track_stock && (variant.stock ?? (product.stock ?? 0)) <= 0;
            return (
              <button
                key={variant.id}
                disabled={vOutStock}
                onClick={() => { onAdd(product, variant); onClose(); }}
                className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-colors ${
                  vOutStock
                    ? 'border-surface-border bg-surface-input opacity-50 cursor-not-allowed'
                    : 'border-surface-border hover:border-brand-500 hover:bg-surface-hover'
                }`}
              >
                <span className="font-medium text-content-primary">{variant.name}</span>
                <div className="flex items-center gap-3">
                  {vOutStock && <span className="text-xs text-status-error">Épuisé</span>}
                  <span className="font-bold text-brand-500">{formatCurrency(vPrice, currency)}</span>
                  {!vOutStock && <Plus className="w-4 h-4 text-brand-500" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ------ Page principale -------------------------------------------------------------

export default function BoutiquePage() {
  const { businessId } = useParams<{ businessId: string }>();
  const router = useRouter();

  // ---- Données
  const [info,     setInfo]     = useState<BoutiqueInfo | null>(null);
  const [products, setProducts] = useState<BoutiqueProduct[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [loadErr,  setLoadErr]  = useState<string | null>(null);

  // ---- UI
  const [search,         setSearch]         = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [viewMode,       setViewMode]       = useState<ViewMode>('grid');
  const [sortBy,         setSortBy]         = useState<SortKey>('default');
  const [showOutOfStock, setShowOutOfStock] = useState(false);
  const [showFilters,    setShowFilters]    = useState(false);
  const [bouPage,        setBouPage]        = useState(1);
  const [showCart,       setShowCart]       = useState(false);
  const [showCheckout,   setShowCheckout]   = useState(false);

  // ---- Panier
  const [cart, setCart] = useState<CartEntry[]>([]);

  // ---- Checkout
  const [customerName,    setCustomerName]    = useState('');
  const [customerPhone,   setCustomerPhone]   = useState('');
  const [deliveryType,    setDeliveryType]    = useState<DeliveryType>('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [paymentMethod,   setPaymentMethod]   = useState<PaymentMethod>('cash');
  const [notes,           setNotes]           = useState('');
  const [submitting,      setSubmitting]      = useState(false);
  const [submitError,     setSubmitError]     = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    (async () => {
      try {
        const bInfo = await getBoutiqueInfo(businessId);
        if (!bInfo) { setLoadErr("Cette boutique n'existe pas."); return; }
        setInfo(bInfo);
        setProducts(await getBoutiqueProducts(bInfo.id));
      } catch {
        setLoadErr("Impossible de charger la boutique. Réessayez.");
      } finally {
        setLoading(false);
      }
    })();
  }, [businessId]);

  const categories = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; color: string | null }>();
    products.forEach((p) => { if (p.category) seen.set(p.category.id, p.category); });
    return Array.from(seen.values());
  }, [products]);

  const filtered = useMemo(() => {
    let result = products.filter((p) => {
      if (!showOutOfStock && p.track_stock && (p.stock ?? 0) <= 0) return false;
      if (activeCategory && p.category_id !== activeCategory) return false;
      if (search) {
        const q = search.toLowerCase();
        return p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q);
      }
      return true;
    });
    if (sortBy === 'price_asc')  return [...result].sort((a, b) => a.price - b.price);
    if (sortBy === 'price_desc') return [...result].sort((a, b) => b.price - a.price);
    if (sortBy === 'name')       return [...result].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return result;
  }, [products, activeCategory, search, sortBy, showOutOfStock]);

  useEffect(() => { setBouPage(1); }, [activeCategory, search, sortBy, showOutOfStock]);

  const bouTotalPages = Math.max(1, Math.ceil(filtered.length / BOU_PAGE_SIZE));
  const safeBouPage   = Math.min(bouPage, bouTotalPages);
  const pagedProducts = filtered.slice((safeBouPage - 1) * BOU_PAGE_SIZE, safeBouPage * BOU_PAGE_SIZE);

  const cartTotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const addToCart = useCallback((product: BoutiqueProduct, variant?: BoutiqueVariant) => {
    const key   = cartKey(product.id, variant?.id);
    const price = getEffectivePrice(product, variant);
    const name  = variant ? `${product.name} — ${variant.name}` : product.name;
    setCart((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) return prev.map((i) => i.key === key ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { key, product_id: product.id, variant_id: variant?.id, name, price, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((product: BoutiqueProduct, variant?: BoutiqueVariant) => {
    const key = cartKey(product.id, variant?.id);
    setCart((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (!existing) return prev;
      if (existing.quantity === 1) return prev.filter((i) => i.key !== key);
      return prev.map((i) => i.key === key ? { ...i, quantity: i.quantity - 1 } : i);
    });
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  function getCartQty(productId: string, variantId?: string) {
    return cart.find((i) => i.key === cartKey(productId, variantId))?.quantity ?? 0;
  }

  async function handlePlaceOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!info || cart.length === 0) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await createBoutiqueOrder({
        business_id:      info.id,
        customer_name:    customerName.trim(),
        customer_phone:   customerPhone.trim(),
        delivery_address: deliveryType === 'delivery' ? deliveryAddress.trim() : undefined,
        delivery_type:    deliveryType,
        payment_method:   paymentMethod,
        items:            cart.map((i) => ({ product_id: i.product_id, variant_id: i.variant_id, name: i.name, price: i.price, quantity: i.quantity })),
        notes:            notes.trim() || undefined,
      });
      clearCart();
      router.push(`/boutique/${businessId}/confirmation/${result.payment_token}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Une erreur est survenue. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  const activeFilterCount = (activeCategory ? 1 : 0) + (sortBy !== 'default' ? 1 : 0) + (showOutOfStock ? 1 : 0);

  // ------ States de chargement / erreur -------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 animate-spin text-brand-600 mx-auto" />
          <p className="text-content-muted text-sm">Chargement de la boutique...</p>
        </div>
      </div>
    );
  }

  if (loadErr || !info) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-border p-8 text-center max-w-sm w-full space-y-4">
          <AlertCircle className="w-12 h-12 text-status-error mx-auto" />
          <p className="font-semibold text-content-primary">{loadErr ?? "Boutique introuvable"}</p>
          <button onClick={() => window.location.reload()} className="w-full py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 transition-colors">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface pb-32">

      {/* ---- Header ------------------------------------------------------------ */}
      <header className="sticky top-0 z-30 bg-surface-card border-b border-surface-border shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">

          {/* Logo + nom */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl border border-surface-border overflow-hidden shrink-0 bg-white">
              {info.logo_url ? (
                <img src={info.logo_url} alt={info.name} className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full bg-brand-600 flex items-center justify-center">
                  <Store className="w-5 h-5 text-white" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-content-primary text-sm sm:text-base truncate">{info.name}</h1>
              <div className="flex items-center gap-2 flex-wrap">
                {info.address && (
                  <p className="text-xs text-content-muted truncate flex items-center gap-1">
                    <MapPin className="w-3 h-3 shrink-0" />{info.address}
                  </p>
                )}
                {info.phone && (
                  <a href={`tel:${info.phone}`} className="text-xs text-content-muted flex items-center gap-1 hover:text-brand-500 transition-colors shrink-0">
                    <Phone className="w-3 h-3 shrink-0" />{info.phone}
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* ELM logo */}
          <img src="/logo.png" alt="ELM" className="h-8 w-auto shrink-0 object-contain hidden sm:block" />

          {/* Panier */}
          <button
            onClick={() => setShowCart(true)}
            className="relative flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-3 sm:px-4 py-2 rounded-xl font-semibold text-sm transition-colors shadow-sm shrink-0"
          >
            <ShoppingCart className="w-4 h-4" />
            <span className="hidden sm:inline">Panier</span>
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </button>
        </div>

        {/* Barre de recherche */}
        <div className="max-w-4xl mx-auto px-4 pb-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
              <input
                type="text"
                placeholder="Rechercher un produit..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-surface-input border border-surface-border rounded-xl text-sm text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-primary">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filtres */}
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`relative flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors shrink-0 ${
                showFilters || activeFilterCount > 0
                  ? 'border-brand-500 bg-brand-500/10 text-brand-500'
                  : 'border-surface-border bg-surface-input text-content-secondary hover:border-surface-border'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">Filtres</span>
              {activeFilterCount > 0 && (
                <span className="w-4 h-4 bg-brand-600 text-white text-[10px] font-black rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Vue grid / list */}
            <div className="flex items-center gap-0.5 p-1 bg-surface-input border border-surface-border rounded-xl shrink-0">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-surface-card text-content-primary shadow-sm' : 'text-content-muted hover:text-content-secondary'}`}
                title="Vue grille"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-surface-card text-content-primary shadow-sm' : 'text-content-muted hover:text-content-secondary'}`}
                title="Vue liste"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Panneau filtres avancés */}
        {showFilters && (
          <div className="max-w-4xl mx-auto px-4 pb-3 space-y-3 border-t border-surface-border pt-3">
            {/* Tri */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-content-muted flex items-center gap-1 shrink-0">
                <ArrowUpDown className="w-3 h-3" /> Trier :
              </span>
              {([
                { key: 'default',    label: 'Par défaut' },
                { key: 'price_asc',  label: 'Prix ↑' },
                { key: 'price_desc', label: 'Prix ↓' },
                { key: 'name',       label: 'A → Z' },
              ] as { key: SortKey; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  className={`px-3 py-1 rounded-full border text-xs font-semibold whitespace-nowrap transition-colors ${
                    sortBy === key
                      ? 'bg-brand-600 border-brand-600 text-white'
                      : 'bg-surface-card border-surface-border text-content-secondary hover:border-brand-500/30'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Épuisés */}
            <button
              onClick={() => setShowOutOfStock((v) => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                showOutOfStock
                  ? 'bg-brand-600 border-brand-600 text-white'
                  : 'bg-surface-card border-surface-border text-content-secondary hover:border-brand-500/30'
              }`}
            >
              {showOutOfStock ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {showOutOfStock ? 'Épuisés visibles' : 'Masquer épuisés'}
            </button>
          </div>
        )}

        {/* Catégories */}
        {categories.length > 0 && (
          <div className="max-w-4xl mx-auto px-4 pb-3 flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setActiveCategory(null)}
              className={`px-3 py-1.5 rounded-full border text-xs font-semibold whitespace-nowrap transition-colors shrink-0 ${
                !activeCategory ? 'bg-brand-600 border-brand-600 text-white' : 'bg-surface-card border-surface-border text-content-secondary hover:bg-surface-hover'
              }`}
            >
              Tout ({products.length})
            </button>
            {categories.map((cat) => {
              const count = products.filter((p) => p.category_id === cat.id).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id === activeCategory ? null : cat.id)}
                  className={`px-3 py-1.5 rounded-full border text-xs font-semibold whitespace-nowrap transition-colors shrink-0 ${
                    activeCategory === cat.id ? 'bg-brand-600 border-brand-600 text-white' : 'bg-surface-card border-surface-border text-content-secondary hover:bg-surface-hover'
                  }`}
                >
                  {cat.name} ({count})
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* ---- Produits ---------------------------------------------------------- */}
      <main className="max-w-4xl mx-auto px-4 py-4">

        {/* Compteur */}
        {(search || activeCategory || activeFilterCount > 0) && (
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-content-muted">
              <span className="font-semibold text-content-primary">{filtered.length}</span> produit{filtered.length !== 1 ? 's' : ''} trouvé{filtered.length !== 1 ? 's' : ''}
              {bouTotalPages > 1 && <span> · page {safeBouPage}/{bouTotalPages}</span>}
            </p>
            {activeFilterCount > 0 && (
              <button
                onClick={() => { setActiveCategory(null); setSortBy('default'); setShowOutOfStock(false); setSearch(''); }}
                className="text-xs text-brand-500 hover:underline font-medium"
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
        )}

        {/* Pagination — haut */}
        {bouTotalPages > 1 && (
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-surface-border">
            <p className="text-xs text-content-muted">
              {(safeBouPage - 1) * BOU_PAGE_SIZE + 1}–{Math.min(safeBouPage * BOU_PAGE_SIZE, filtered.length)} sur {filtered.length} produits
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setBouPage(p => Math.max(1, p - 1))}
                disabled={safeBouPage <= 1}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-surface-border bg-surface-card text-content-secondary hover:border-brand-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ← Préc.
              </button>
              {Array.from({ length: bouTotalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === bouTotalPages || Math.abs(p - safeBouPage) <= 1)
                .reduce<(number | '...')[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '...'
                    ? <span key={`ell-top-${i}`} className="px-1 text-xs text-content-muted">…</span>
                    : <button
                        key={`top-${p}`}
                        onClick={() => setBouPage(p as number)}
                        className={`w-8 h-8 text-xs font-semibold rounded-xl border transition-colors ${
                          safeBouPage === p
                            ? 'bg-brand-600 border-brand-600 text-white'
                            : 'border-surface-border bg-surface-card text-content-secondary hover:border-brand-500/30'
                        }`}
                      >
                        {p}
                      </button>
                )
              }
              <button
                onClick={() => setBouPage(p => Math.min(bouTotalPages, p + 1))}
                disabled={safeBouPage >= bouTotalPages}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-surface-border bg-surface-card text-content-secondary hover:border-brand-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Suiv. →
              </button>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-content-muted gap-4">
            <Package className="w-14 h-14 opacity-20" />
            <div className="text-center">
              <p className="text-sm font-semibold text-content-secondary">Aucun produit trouvé</p>
              {(search || activeCategory) && (
                <button
                  onClick={() => { setSearch(''); setActiveCategory(null); }}
                  className="text-xs text-brand-500 hover:underline mt-2 block"
                >
                  Effacer les filtres
                </button>
              )}
            </div>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {pagedProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                currency={info.currency}
                cartQty={getCartQty(product.id)}
                onAdd={addToCart}
                onRemove={removeFromCart}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {pagedProducts.map((product) => (
              <ProductListItem
                key={product.id}
                product={product}
                currency={info.currency}
                cartQty={getCartQty(product.id)}
                onAdd={addToCart}
                onRemove={removeFromCart}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {bouTotalPages > 1 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-surface-border">
            <p className="text-xs text-content-muted">
              {(safeBouPage - 1) * BOU_PAGE_SIZE + 1}–{Math.min(safeBouPage * BOU_PAGE_SIZE, filtered.length)} sur {filtered.length} produits
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setBouPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                disabled={safeBouPage <= 1}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-surface-border bg-surface-card text-content-secondary hover:border-brand-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ← Préc.
              </button>
              {Array.from({ length: bouTotalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === bouTotalPages || Math.abs(p - safeBouPage) <= 1)
                .reduce<(number | '...')[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '...'
                    ? <span key={`ell-${i}`} className="px-1 text-xs text-content-muted">…</span>
                    : <button
                        key={p}
                        onClick={() => { setBouPage(p as number); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        className={`w-8 h-8 text-xs font-semibold rounded-xl border transition-colors ${
                          safeBouPage === p
                            ? 'bg-brand-600 border-brand-600 text-white'
                            : 'border-surface-border bg-surface-card text-content-secondary hover:border-brand-500/30'
                        }`}
                      >
                        {p}
                      </button>
                )
              }
              <button
                onClick={() => { setBouPage(p => Math.min(bouTotalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                disabled={safeBouPage >= bouTotalPages}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-surface-border bg-surface-card text-content-secondary hover:border-brand-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Suiv. →
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ---- Bouton panier flottant -------------------------------------------- */}
      {cartCount > 0 && !showCart && !showCheckout && (
        <div className="fixed bottom-6 inset-x-0 z-30 flex justify-center px-4">
          <button
            onClick={() => setShowCart(true)}
            className="flex items-center gap-3 bg-brand-600 hover:bg-brand-700 text-white px-6 py-4 rounded-2xl shadow-xl shadow-brand-600/30 font-semibold transition-all max-w-sm w-full"
          >
            <div className="flex items-center gap-2 flex-1">
              <ShoppingCart className="w-5 h-5" />
              <span>{cartCount} article{cartCount > 1 ? 's' : ''}</span>
            </div>
            <span className="font-bold">{formatCurrency(cartTotal, info.currency)}</span>
          </button>
        </div>
      )}

      {/* ---- Tiroir panier ----------------------------------------------------- */}
      {showCart && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end sm:items-center sm:justify-center bg-black/50" onClick={() => setShowCart(false)}>
          <div
            className="bg-surface-card border border-surface-border w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-surface-border">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-brand-600" />
                <h2 className="font-bold text-content-primary text-lg">Mon panier</h2>
                {cartCount > 0 && (
                  <span className="text-xs font-bold text-brand-500 bg-brand-500/10 px-2 py-0.5 rounded-full">{cartCount} article{cartCount > 1 ? 's' : ''}</span>
                )}
              </div>
              <button onClick={() => setShowCart(false)} className="p-2 rounded-full hover:bg-surface-hover">
                <X className="w-5 h-5 text-content-muted" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-content-muted gap-3">
                  <ShoppingCart className="w-10 h-10 opacity-30" />
                  <p className="text-sm">Votre panier est vide</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.key} className="flex items-center gap-3 bg-surface-input rounded-xl p-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-content-primary text-sm leading-snug line-clamp-1">{item.name}</p>
                      <p className="text-xs text-content-muted mt-0.5">{formatCurrency(item.price, info.currency)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          const prod = products.find((p) => p.id === item.product_id);
                          if (prod) removeFromCart(prod, prod.variants?.find((v) => v.id === item.variant_id));
                        }}
                        className="w-7 h-7 rounded-full bg-surface-card border border-surface-border flex items-center justify-center hover:bg-surface-hover"
                      >
                        <Minus className="w-3 h-3 text-content-primary" />
                      </button>
                      <span className="text-sm font-bold text-content-primary w-5 text-center">{item.quantity}</span>
                      <button
                        onClick={() => {
                          const prod = products.find((p) => p.id === item.product_id);
                          if (prod) addToCart(prod, prod.variants?.find((v) => v.id === item.variant_id));
                        }}
                        className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center hover:bg-brand-700"
                      >
                        <Plus className="w-3 h-3 text-white" />
                      </button>
                    </div>
                    <span className="text-sm font-bold text-content-primary min-w-[64px] text-right">
                      {formatCurrency(item.price * item.quantity, info.currency)}
                    </span>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && (
              <div className="p-4 border-t border-surface-border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-content-muted">Total</span>
                  <span className="font-bold text-xl text-content-primary">{formatCurrency(cartTotal, info.currency)}</span>
                </div>
                <button
                  onClick={() => { setShowCart(false); setShowCheckout(true); }}
                  className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-4 rounded-xl transition-colors"
                >
                  Commander
                </button>
                <button onClick={clearCart} className="w-full text-sm text-content-muted hover:text-status-error transition-colors py-1">
                  Vider le panier
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- Modal Checkout ---------------------------------------------------- */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:p-4">
          <div className="bg-surface-card border border-surface-border w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl shadow-2xl max-h-[95vh] flex flex-col overflow-hidden">
            <div className="flex items-center gap-3 p-5 border-b border-surface-border">
              <button onClick={() => { setShowCheckout(false); setShowCart(true); }} className="p-2 rounded-full hover:bg-surface-hover">
                <ChevronLeft className="w-5 h-5 text-content-muted" />
              </button>
              <h2 className="font-bold text-content-primary text-lg">Finaliser la commande</h2>
            </div>

            <form onSubmit={handlePlaceOrder} className="flex-1 overflow-y-auto p-5 space-y-5">

              <section className="space-y-3">
                <h3 className="font-semibold text-content-muted text-xs uppercase tracking-wider">Vos informations</h3>
                <div>
                  <label className="block text-xs font-medium text-content-muted mb-1.5">Nom complet *</label>
                  <input required type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Ex : Amadou Diallo"
                    className="w-full px-4 py-3 bg-surface-input border border-surface-border rounded-xl text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-content-muted mb-1.5 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> Numéro WhatsApp *
                  </label>
                  <input required type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Ex : +221 77 000 00 00"
                    className="w-full px-4 py-3 bg-surface-input border border-surface-border rounded-xl text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="font-semibold text-content-muted text-xs uppercase tracking-wider">Récupération</h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'pickup',   icon: Store, label: 'En boutique' },
                    { value: 'delivery', icon: Truck, label: 'Livraison' },
                  ].map(({ value, icon: Icon, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDeliveryType(value as DeliveryType)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors ${
                        deliveryType === value ? 'border-brand-500 bg-brand-500/10' : 'border-surface-border hover:border-brand-500/30'
                      }`}
                    >
                      <Icon className={`w-6 h-6 ${deliveryType === value ? 'text-brand-500' : 'text-content-muted'}`} />
                      <span className={`text-xs font-semibold ${deliveryType === value ? 'text-brand-500' : 'text-content-secondary'}`}>{label}</span>
                    </button>
                  ))}
                </div>
                {deliveryType === 'delivery' && (
                  <div>
                    <label className="block text-xs font-medium text-content-muted mb-1.5 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Adresse de livraison *
                    </label>
                    <input required type="text" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Ex : Rue 10, Dakar"
                      className="w-full px-4 py-3 bg-surface-input border border-surface-border rounded-xl text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="font-semibold text-content-muted text-xs uppercase tracking-wider">Paiement</h3>
                <div className="space-y-2">
                  {[
                    { value: 'cash' as PaymentMethod,           icon: <Banknote className="w-5 h-5" />,    label: deliveryType === 'delivery' ? 'À la livraison' : 'Sur place',       desc: deliveryType === 'delivery' ? 'Payez en espèces à la réception' : 'Payez en espèces en boutique' },
                    { value: 'mobile_money' as PaymentMethod,   icon: <CreditCard className="w-5 h-5" />,  label: 'Mobile Money',                                                      desc: 'Wave, Orange Money...' },
                    { value: 'lien_paiement' as PaymentMethod,  icon: <MessageCircle className="w-5 h-5" />, label: 'Lien de paiement sécurisé',                                      desc: 'Lien envoyé sur WhatsApp' },
                  ].map(({ value, icon, label, desc }) => (
                    <button key={value} type="button" onClick={() => setPaymentMethod(value)}
                      className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-colors ${
                        paymentMethod === value ? 'border-brand-500 bg-brand-500/10' : 'border-surface-border hover:border-brand-500/30'
                      }`}
                    >
                      <div className={`shrink-0 ${paymentMethod === value ? 'text-brand-500' : 'text-content-muted'}`}>{icon}</div>
                      <div className="flex-1">
                        <p className={`text-sm font-semibold ${paymentMethod === value ? 'text-content-primary' : 'text-content-primary'}`}>{label}</p>
                        <p className="text-xs text-content-muted mt-0.5">{desc}</p>
                      </div>
                      {paymentMethod === value && <Check className="w-4 h-4 text-brand-500 shrink-0" />}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <label className="block text-xs font-medium text-content-muted mb-1.5">Notes (optionnel)</label>
                <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Instructions spéciales, allergies..."
                  className="w-full px-4 py-3 bg-surface-input border border-surface-border rounded-xl text-sm text-content-primary resize-none focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </section>

              <section className="bg-surface-input rounded-xl p-4 space-y-2">
                <h3 className="font-semibold text-content-secondary text-sm">Récapitulatif</h3>
                {cart.map((item) => (
                  <div key={item.key} className="flex items-center justify-between text-sm">
                    <span className="text-content-muted truncate flex-1 mr-2">{item.name} × {item.quantity}</span>
                    <span className="font-medium text-content-primary shrink-0">{formatCurrency(item.price * item.quantity, info.currency)}</span>
                  </div>
                ))}
                <div className="border-t border-surface-border pt-2 flex items-center justify-between">
                  <span className="font-bold text-content-primary">Total</span>
                  <span className="font-bold text-brand-500 text-lg">{formatCurrency(cartTotal, info.currency)}</span>
                </div>
              </section>

              {submitError && (
                <div className="flex items-center gap-2 p-3 bg-badge-error border border-status-error/30 rounded-xl text-sm text-status-error">
                  <AlertCircle className="w-4 h-4 shrink-0" />{submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || cart.length === 0}
                className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {submitting
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> Envoi en cours…</>
                  : `Confirmer · ${formatCurrency(cartTotal, info.currency)}`
                }
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
