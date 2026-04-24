'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ShoppingCart, Plus, Minus, X, Package,
  Search, MapPin, Phone, Loader2, AlertCircle,
  ChevronLeft, Store, Truck, CreditCard, Banknote,
  MessageCircle, Check,
} from 'lucide-react';
import {
  getBoutiqueInfo, getBoutiqueProducts, createBoutiqueOrder,
  type BoutiqueInfo, type BoutiqueProduct, type BoutiqueVariant, type BoutiqueCartItem,
} from '@services/supabase/boutique';
import { formatCurrency } from '@/lib/utils';

// ─── Types locaux ──────────────────────────────────────────────────────────────

type DeliveryType   = 'pickup' | 'delivery';
type PaymentMethod  = 'cash' | 'mobile_money' | 'lien_paiement';

interface CartEntry extends BoutiqueCartItem {
  key: string; // product_id + variant_id
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cartKey(productId: string, variantId?: string) {
  return variantId ? `${productId}:${variantId}` : productId;
}

function getEffectivePrice(product: BoutiqueProduct, variant?: BoutiqueVariant) {
  return product.price + (variant?.price_modifier ?? 0);
}

// ─── Composant ProductCard ────────────────────────────────────────────────────

interface ProductCardProps {
  product:     BoutiqueProduct;
  currency:    string;
  cartQty:     number;
  onAdd:       (product: BoutiqueProduct, variant?: BoutiqueVariant) => void;
  onRemove:    (product: BoutiqueProduct, variant?: BoutiqueVariant) => void;
}

function ProductCard({ product, currency, cartQty, onAdd, onRemove }: ProductCardProps) {
  const [showVariants, setShowVariants] = useState(false);
  const hasVariants  = product.variants?.length > 0;
  const outOfStock   = product.track_stock && (product.stock ?? 0) <= 0;

  function handleAdd(e: React.MouseEvent) {
    e.stopPropagation();
    if (hasVariants) { setShowVariants(true); return; }
    onAdd(product);
  }

  return (
    <>
      <div
        className={`bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col transition-shadow hover:shadow-md ${outOfStock ? 'opacity-60' : ''}`}
        onClick={() => hasVariants ? setShowVariants(true) : undefined}
      >
        {/* Image */}
        <div className="aspect-square bg-slate-100 flex items-center justify-center overflow-hidden">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <Package className="w-10 h-10 text-slate-300" />
          )}
          {outOfStock && (
            <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
              <span className="text-xs font-bold text-status-error bg-red-50 border border-red-200 px-2 py-1 rounded-full">Épuisé</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3 flex flex-col gap-2 flex-1">
          <p className="font-semibold text-slate-800 text-sm leading-snug line-clamp-2">{product.name}</p>
          {product.description && (
            <p className="text-xs text-content-secondary line-clamp-2">{product.description}</p>
          )}
          <div className="flex items-center justify-between mt-auto pt-1">
            <span className="font-bold text-brand-600 text-sm">
              {formatCurrency(product.price, currency)}
            </span>

            {!outOfStock && !hasVariants && (
              cartQty > 0 ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemove(product); }}
                    className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
                  >
                    <Minus className="w-3 h-3 text-slate-600" />
                  </button>
                  <span className="text-sm font-bold text-slate-800 min-w-[16px] text-center">{cartQty}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onAdd(product); }}
                    className="w-7 h-7 rounded-full bg-brand-600 hover:bg-brand-700 flex items-center justify-center transition-colors"
                  >
                    <Plus className="w-3 h-3 text-white" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleAdd}
                  className="w-8 h-8 rounded-full bg-brand-600 hover:bg-brand-700 flex items-center justify-center transition-colors shadow-sm"
                >
                  <Plus className="w-4 h-4 text-white" />
                </button>
              )
            )}

            {!outOfStock && hasVariants && (
              <button
                onClick={handleAdd}
                className="text-xs font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-full transition-colors"
              >
                {cartQty > 0 ? `${cartQty} ×` : 'Choisir'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal variantes */}
      {showVariants && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => setShowVariants(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900">{product.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">Choisissez une option</p>
              </div>
              <button onClick={() => setShowVariants(false)} className="p-2 rounded-full hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-500" />
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
                    onClick={() => { onAdd(product, variant); setShowVariants(false); }}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-colors ${
                      vOutStock
                        ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                        : 'border-slate-200 hover:border-brand-400 hover:bg-brand-50'
                    }`}
                  >
                    <span className="font-medium text-slate-800">{variant.name}</span>
                    <div className="flex items-center gap-3">
                      {vOutStock && <span className="text-xs text-status-error">Épuisé</span>}
                      <span className="font-bold text-brand-600">{formatCurrency(vPrice, currency)}</span>
                      <Plus className="w-4 h-4 text-brand-600" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function BoutiquePage() {
  const { businessId } = useParams<{ businessId: string }>();
  const router = useRouter();

  // ── Données
  const [info,     setInfo]     = useState<BoutiqueInfo | null>(null);
  const [products, setProducts] = useState<BoutiqueProduct[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [loadErr,  setLoadErr]  = useState<string | null>(null);

  // ── UI state
  const [search,      setSearch]      = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showCart,    setShowCart]    = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);

  // ── Panier
  const [cart, setCart] = useState<CartEntry[]>([]);

  // ── Checkout form
  const [customerName,     setCustomerName]     = useState('');
  const [customerPhone,    setCustomerPhone]    = useState('');
  const [deliveryType,     setDeliveryType]     = useState<DeliveryType>('pickup');
  const [deliveryAddress,  setDeliveryAddress]  = useState('');
  const [paymentMethod,    setPaymentMethod]    = useState<PaymentMethod>('cash');
  const [notes,            setNotes]            = useState('');
  const [submitting,       setSubmitting]       = useState(false);
  const [submitError,      setSubmitError]      = useState<string | null>(null);

  // ── Chargement
  useEffect(() => {
    if (!businessId) return;
    (async () => {
      try {
        const [bInfo, bProducts] = await Promise.all([
          getBoutiqueInfo(businessId),
          getBoutiqueProducts(businessId),
        ]);
        if (!bInfo) { setLoadErr("Cette boutique n'existe pas."); return; }
        setInfo(bInfo);
        setProducts(bProducts);
      } catch {
        setLoadErr("Impossible de charger la boutique. Réessayez.");
      } finally {
        setLoading(false);
      }
    })();
  }, [businessId]);

  // ── Catégories disponibles
  const categories = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; color: string | null }>();
    products.forEach((p) => {
      if (p.category) seen.set(p.category.id, p.category);
    });
    return Array.from(seen.values());
  }, [products]);

  // ── Produits filtrés
  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (activeCategory && p.category_id !== activeCategory) return false;
      if (search) {
        const q = search.toLowerCase();
        return p.name.toLowerCase().includes(q) ||
               p.description?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [products, activeCategory, search]);

  // ── Totaux panier
  const cartTotal  = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const cartCount  = cart.reduce((s, i) => s + i.quantity, 0);

  // ── Actions panier
  const addToCart = useCallback((product: BoutiqueProduct, variant?: BoutiqueVariant) => {
    const key   = cartKey(product.id, variant?.id);
    const price = getEffectivePrice(product, variant);
    const name  = variant ? `${product.name} — ${variant.name}` : product.name;
    setCart((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        return prev.map((i) => i.key === key ? { ...i, quantity: i.quantity + 1 } : i);
      }
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
    const key = cartKey(productId, variantId);
    return cart.find((i) => i.key === key)?.quantity ?? 0;
  }

  // ── Soumission commande
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
        items:            cart.map((i) => ({
          product_id: i.product_id,
          variant_id: i.variant_id,
          name:       i.name,
          price:      i.price,
          quantity:   i.quantity,
        })),
        notes: notes.trim() || undefined,
      });
      clearCart();
      router.push(`/boutique/${businessId}/confirmation/${result.payment_token}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Une erreur est survenue. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 animate-spin text-brand-600 mx-auto" />
          <p className="text-slate-500 text-sm">Chargement de la boutique…</p>
        </div>
      </div>
    );
  }

  if (loadErr || !info) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center max-w-sm w-full space-y-4">
          <AlertCircle className="w-12 h-12 text-status-error mx-auto" />
          <p className="font-semibold text-slate-800">{loadErr ?? "Boutique introuvable"}</p>
          <button onClick={() => window.location.reload()} className="w-full py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 transition-colors">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-32">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {info.logo_url ? (
              <img src={info.logo_url} alt={info.name} className="w-10 h-10 rounded-xl object-cover shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center shrink-0">
                <Store className="w-5 h-5 text-white" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-bold text-slate-900 text-base truncate">{info.name}</h1>
              {info.address && (
                <p className="text-xs text-content-secondary truncate flex items-center gap-1">
                  <MapPin className="w-3 h-3 shrink-0" />{info.address}
                </p>
              )}
            </div>
          </div>

          {/* Bouton panier */}
          <button
            onClick={() => setShowCart(true)}
            className="relative flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl font-semibold text-sm transition-colors shadow-sm shrink-0"
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
        <div className="max-w-2xl mx-auto px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary" />
            <input
              type="text"
              placeholder="Rechercher un produit…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-100 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Filtre catégories */}
        {categories.length > 0 && (
          <div className="max-w-2xl mx-auto px-4 pb-3 flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setActiveCategory(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                !activeCategory ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tout
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id === activeCategory ? null : cat.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeCategory === cat.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* ── Grille produits ──────────────────────────────────────────────────── */}
      <main className="max-w-2xl mx-auto px-4 py-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-content-secondary gap-3">
            <Package className="w-12 h-12 opacity-30" />
            <p className="text-sm">Aucun produit trouvé</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filtered.map((product) => (
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
        )}
      </main>

      {/* ── Bouton panier flottant (mobile) ──────────────────────────────────── */}
      {cartCount > 0 && !showCart && (
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

      {/* ── Tiroir panier ────────────────────────────────────────────────────── */}
      {showCart && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end sm:items-center sm:justify-center bg-black/50" onClick={() => setShowCart(false)}>
          <div
            className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-brand-600" />
                <h2 className="font-bold text-slate-900 text-lg">Mon panier</h2>
              </div>
              <button onClick={() => setShowCart(false)} className="p-2 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Articles */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-content-secondary gap-3">
                  <ShoppingCart className="w-10 h-10 opacity-30" />
                  <p className="text-sm">Votre panier est vide</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.key} className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm leading-snug line-clamp-2">{item.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{formatCurrency(item.price, info.currency)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          const prod = products.find((p) => p.id === item.product_id);
                          if (prod) removeFromCart(prod, prod.variants?.find((v) => v.id === item.variant_id));
                        }}
                        className="w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100"
                      >
                        <Minus className="w-3 h-3 text-slate-600" />
                      </button>
                      <span className="text-sm font-bold text-slate-800 w-5 text-center">{item.quantity}</span>
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
                    <span className="text-sm font-bold text-slate-800 min-w-[64px] text-right">
                      {formatCurrency(item.price * item.quantity, info.currency)}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {cart.length > 0 && (
              <div className="p-4 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Total</span>
                  <span className="font-bold text-lg text-slate-900">{formatCurrency(cartTotal, info.currency)}</span>
                </div>
                <button
                  onClick={() => { setShowCart(false); setShowCheckout(true); }}
                  className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-4 rounded-xl transition-colors"
                >
                  Commander →
                </button>
                <button
                  onClick={clearCart}
                  className="w-full text-sm text-content-secondary hover:text-status-error transition-colors py-1"
                >
                  Vider le panier
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal Checkout ───────────────────────────────────────────────────── */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:p-4">
          <div
            className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl shadow-2xl max-h-[95vh] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-3 p-5 border-b border-slate-100">
              <button
                onClick={() => { setShowCheckout(false); setShowCart(true); }}
                className="p-2 rounded-full hover:bg-slate-100"
              >
                <ChevronLeft className="w-5 h-5 text-slate-500" />
              </button>
              <h2 className="font-bold text-slate-900 text-lg">Finaliser la commande</h2>
            </div>

            {/* Formulaire */}
            <form onSubmit={handlePlaceOrder} className="flex-1 overflow-y-auto p-5 space-y-5">

              {/* Infos client */}
              <section className="space-y-3">
                <h3 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">Vos informations</h3>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Nom complet *</label>
                  <input
                    required
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Ex : Amadou Diallo"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" />Numéro WhatsApp *</span>
                  </label>
                  <input
                    required
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Ex : +221 77 000 00 00"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </section>

              {/* Mode de récupération */}
              <section className="space-y-3">
                <h3 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">Récupération</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDeliveryType('pickup')}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors ${
                      deliveryType === 'pickup' ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <Store className={`w-6 h-6 ${deliveryType === 'pickup' ? 'text-brand-600' : 'text-content-secondary'}`} />
                    <span className={`text-xs font-semibold ${deliveryType === 'pickup' ? 'text-brand-700' : 'text-slate-600'}`}>
                      En boutique
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryType('delivery')}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors ${
                      deliveryType === 'delivery' ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <Truck className={`w-6 h-6 ${deliveryType === 'delivery' ? 'text-brand-600' : 'text-content-secondary'}`} />
                    <span className={`text-xs font-semibold ${deliveryType === 'delivery' ? 'text-brand-700' : 'text-slate-600'}`}>
                      Livraison
                    </span>
                  </button>
                </div>

                {deliveryType === 'delivery' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />Adresse de livraison *</span>
                    </label>
                    <input
                      required
                      type="text"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Ex : Rue 10, Dakar"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                )}
              </section>

              {/* Mode de paiement */}
              <section className="space-y-3">
                <h3 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">Paiement</h3>
                <div className="space-y-2">
                  {[
                    {
                      value: 'cash' as PaymentMethod,
                      icon: <Banknote className="w-5 h-5" />,
                      label: deliveryType === 'delivery' ? 'À la livraison' : 'Sur place',
                      desc:  deliveryType === 'delivery' ? 'Payez en espèces à la réception' : 'Payez en espèces en boutique',
                    },
                    {
                      value: 'mobile_money' as PaymentMethod,
                      icon: <CreditCard className="w-5 h-5" />,
                      label: 'Mobile Money',
                      desc: deliveryType === 'delivery' ? 'Wave, Orange Money… à la livraison' : 'Wave, Orange Money… en boutique',
                    },
                    {
                      value: 'lien_paiement' as PaymentMethod,
                      icon: <MessageCircle className="w-5 h-5" />,
                      label: 'Lien de paiement sécurisé',
                      desc: 'Vous recevrez un lien de paiement sur WhatsApp',
                    },
                  ].map(({ value, icon, label, desc }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPaymentMethod(value)}
                      className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-colors ${
                        paymentMethod === value ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className={`shrink-0 ${paymentMethod === value ? 'text-brand-600' : 'text-content-secondary'}`}>
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${paymentMethod === value ? 'text-brand-700' : 'text-slate-700'}`}>
                          {label}
                        </p>
                        <p className="text-xs text-content-secondary mt-0.5">{desc}</p>
                      </div>
                      {paymentMethod === value && (
                        <Check className="w-4 h-4 text-brand-600 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </section>

              {/* Notes */}
              <section>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes (optionnel)</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Instructions spéciales, allergies, préférences…"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </section>

              {/* Récapitulatif */}
              <section className="bg-slate-50 rounded-xl p-4 space-y-2">
                <h3 className="font-semibold text-slate-700 text-sm">Récapitulatif</h3>
                {cart.map((item) => (
                  <div key={item.key} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 truncate flex-1 mr-2">{item.name} × {item.quantity}</span>
                    <span className="font-medium text-slate-800 shrink-0">{formatCurrency(item.price * item.quantity, info.currency)}</span>
                  </div>
                ))}
                <div className="border-t border-slate-200 pt-2 flex items-center justify-between">
                  <span className="font-bold text-slate-800">Total</span>
                  <span className="font-bold text-brand-600 text-lg">{formatCurrency(cartTotal, info.currency)}</span>
                </div>
              </section>

              {submitError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {submitError}
                </div>
              )}

              {/* Bouton commander */}
              <button
                type="submit"
                disabled={submitting || cart.length === 0}
                className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Envoi de la commande…</>
                ) : (
                  `Confirmer la commande · ${formatCurrency(cartTotal, info.currency)}`
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

