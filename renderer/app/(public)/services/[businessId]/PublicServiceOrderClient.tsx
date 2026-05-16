'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  Wrench, User, FileText, Loader2, AlertCircle, Check,
  Clock, Package2, MessageCircle, Plus, Minus, ShoppingCart,
  ChevronRight, Trash2, X, Star, Phone, ArrowLeft,
} from 'lucide-react';
import { getPublicBusinessInfo, type PublicBusinessInfo } from '@services/supabase/business-public';
import { getPublicServiceCatalog, createPublicServiceOrder } from '@services/supabase/services-public';
import { formatCurrency, cn } from '@/lib/utils';
import { PublicHeader } from '@/components/shared/PublicHeader';

type CatalogItem = {
  id: string; name: string; description?: string; price: number;
  duration_min?: number; category_id?: string | null;
  category?: { id: string; name: string; color?: string } | null;
};
type CartEntry = { item: CatalogItem; quantity: number };

export default function PublicServiceOrderPage() {
  const { businessId } = useParams();

  const [info,    setInfo]    = useState<PublicBusinessInfo | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [page,      setPage]      = useState(0);
  const PAGE_SIZE = 8;
  const [cart,      setCart]      = useState<Record<string, CartEntry>>({});
  const [step,      setStep]      = useState<'catalog' | 'form'>('catalog');
  const [showCart,  setShowCart]  = useState(false);

  const [clientName,  setClientName]  = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [subjectRef,  setSubjectRef]  = useState('');
  const [subjectInfo, setSubjectInfo] = useState('');
  const [notes,       setNotes]       = useState('');

  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success,     setSuccess]     = useState(false);
  const [orderId,     setOrderId]     = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    async function load() {
      try {
        const bInfo = await getPublicBusinessInfo(businessId as string);
        if (!bInfo) { setLoadErr('Établissement introuvable.'); return; }
        setInfo(bInfo);
        setCatalog(await getPublicServiceCatalog(bInfo.id));
      } catch {
        setLoadErr('Erreur lors du chargement des données.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [businessId]);

  const categories = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; color?: string }>();
    catalog.forEach(item => {
      if (item.category) seen.set(item.category.id, item.category);
    });
    return Array.from(seen.values());
  }, [catalog]);

  const filtered = useMemo(() =>
    activeCat ? catalog.filter(i => i.category_id === activeCat) : catalog,
    [catalog, activeCat]
  );

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const cartItems = Object.values(cart);
  const cartCount = cartItems.reduce((s, c) => s + c.quantity, 0);
  const total     = cartItems.reduce((s, c) => s + c.item.price * c.quantity, 0);

  function addToCart(item: CatalogItem) {
    setCart(prev => {
      const next = { ...prev };
      if (next[item.id]) next[item.id] = { ...next[item.id], quantity: next[item.id].quantity + 1 };
      else next[item.id] = { item, quantity: 1 };
      return next;
    });
  }

  function removeOne(item: CatalogItem) {
    setCart(prev => {
      const next = { ...prev };
      if (!next[item.id]) return prev;
      if (next[item.id].quantity <= 1) delete next[item.id];
      else next[item.id] = { ...next[item.id], quantity: next[item.id].quantity - 1 };
      return next;
    });
  }

  function removeFromCart(itemId: string) {
    setCart(prev => { const next = { ...prev }; delete next[itemId]; return next; });
  }

  async function handleSubmit() {
    if (!info || cartItems.length === 0 || !clientName.trim() || !clientPhone.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const order = await createPublicServiceOrder({
        businessId: info.id,
        clientName, clientPhone, subjectRef, subjectInfo, notes,
        items: cartItems.map(c => ({
          service_id: c.item.id,
          name:       c.item.name,
          price:      c.item.price,
          quantity:   c.quantity,
        })),
      });
      setOrderId(order.id);
      setSuccess(true);
    } catch (e: any) {
      setSubmitError(e.message ?? 'Erreur lors de la validation.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-surface-hover flex items-center justify-center p-6">
      <div className="text-center space-y-4">
        <div className="relative mx-auto w-16 h-16">
          <div className="absolute inset-0 rounded-full bg-brand-500/20 animate-ping" />
          <div className="relative w-16 h-16 rounded-full bg-brand-600 flex items-center justify-center">
            <Wrench className="w-7 h-7 text-white" />
          </div>
        </div>
        <p className="text-content-secondary font-medium">Chargement du catalogue…</p>
      </div>
    </div>
  );

  // ── Erreur ───────────────────────────────────────────────────────────────────
  if (loadErr) return (
    <div className="min-h-screen bg-surface-hover flex items-center justify-center p-6">
      <div className="max-w-sm w-full bg-surface-card rounded-3xl shadow-xl border border-surface-border p-8 text-center space-y-6">
        <div className="w-20 h-20 bg-badge-error rounded-full flex items-center justify-center mx-auto text-status-error">
          <AlertCircle className="w-10 h-10" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-content-primary">Oups !</h1>
          <p className="text-content-secondary mt-2 text-sm leading-relaxed">{loadErr}</p>
        </div>
        <button onClick={() => window.location.reload()}
          className="w-full py-4 rounded-2xl bg-brand-600 text-white font-bold">
          Réessayer
        </button>
      </div>
    </div>
  );

  // ── Succès ────────────────────────────────────────────────────────────────────
  if (success) return (
    <div className="min-h-screen bg-surface-hover text-content-primary font-sans">
      <PublicHeader business={info} loading={false} title="Services & Prestations" />
      <div className="max-w-md mx-auto px-4 py-12 space-y-6">

        {/* Checkmark animé */}
        <div className="text-center space-y-4">
          <div className="relative inline-flex">
            <div className="w-24 h-24 rounded-full bg-status-success/10 border-4 border-status-success/30 flex items-center justify-center">
              <Check className="w-12 h-12 text-status-success" strokeWidth={3} />
            </div>
            {/* Points déco */}
            {[0, 60, 120, 180, 240, 300].map(deg => (
              <span key={deg} className="absolute w-2 h-2 rounded-full bg-status-success/40"
                style={{ top: '50%', left: '50%', transform: `rotate(${deg}deg) translateY(-44px) translateX(-4px)` }} />
            ))}
          </div>
          <div>
            <h1 className="text-2xl font-black text-content-primary">Demande envoyée !</h1>
            <p className="text-content-secondary text-sm mt-1 leading-relaxed">
              Nous vous contacterons très prochainement.
            </p>
          </div>
        </div>

        {/* Numéro de référence */}
        <div className="bg-surface-card border border-surface-border rounded-2xl p-5 text-center space-y-1">
          <p className="text-[10px] font-black text-content-muted uppercase tracking-widest">Votre référence</p>
          <p className="font-mono font-black text-3xl text-content-primary tracking-[0.15em]">
            {orderId?.slice(0, 8).toUpperCase()}
          </p>
          <p className="text-xs text-content-muted">Conservez ce code pour le suivi</p>
        </div>

        {/* Récap commande */}
        <div className="bg-surface-card border border-surface-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-border">
            <p className="text-xs font-black text-content-muted uppercase tracking-widest">Récapitulatif</p>
          </div>
          <div className="divide-y divide-surface-border">
            {cartItems.map(c => (
              <div key={c.item.id} className="flex justify-between items-center px-4 py-3 text-sm">
                <span className="text-content-secondary">{c.item.name}{c.quantity > 1 ? ` × ${c.quantity}` : ''}</span>
                <span className="font-bold text-content-primary">{formatCurrency(c.item.price * c.quantity, info?.currency)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-center px-4 py-3 bg-surface-hover">
            <span className="font-black text-content-primary text-sm">Total</span>
            <span className="font-black text-brand-600 text-lg">{formatCurrency(total, info?.currency)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {info?.phone && (
            <a
              href={`https://wa.me/${info.phone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(`Bonjour, je viens de soumettre une demande de service. Référence : ${orderId?.slice(0, 8).toUpperCase()}`)}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2.5 w-full py-4 rounded-2xl bg-[#25D366] text-white font-bold text-sm shadow-lg shadow-[#25D366]/20">
              <MessageCircle className="w-5 h-5" /> Confirmer sur WhatsApp
            </a>
          )}
          <button onClick={() => window.location.reload()}
            className="w-full py-4 rounded-2xl border-2 border-surface-border text-content-secondary font-semibold text-sm hover:border-brand-500/40 transition-all">
            Nouvelle demande
          </button>
        </div>
      </div>
    </div>
  );

  // ── Page principale ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface-hover text-content-primary font-sans pb-32">
      <PublicHeader business={info} loading={false} title="Services & Prestations" />

      {/* ── Hero ── */}
      <div className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #0ea5e9 100%)' }}>
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, #fff 1px, transparent 1px), radial-gradient(circle at 80% 20%, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="relative max-w-3xl mx-auto px-4 py-8">
          <div className="flex items-center gap-4">
            {info?.logo_url ? (
              <img src={info.logo_url} alt={info?.name}
                className="w-14 h-14 rounded-2xl object-contain bg-white/10 p-1 border border-white/20 shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
                <Wrench className="w-7 h-7 text-white/70" />
              </div>
            )}
            <div>
              <p className="text-white/60 text-[10px] font-black uppercase tracking-widest">Catalogue de services</p>
              <h1 className="text-white font-black text-xl leading-tight">{info?.name}</h1>
              {info?.phone && (
                <a href={`tel:${info.phone}`}
                  className="flex items-center gap-1 text-sky-300 text-xs mt-0.5 hover:text-white transition-colors">
                  <Phone className="w-3 h-3" /> {info.phone}
                </a>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-4 mt-5">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-xl border border-white/10">
              <Package2 className="w-3.5 h-3.5 text-sky-300" />
              <span className="text-white text-xs font-bold">{catalog.length} service{catalog.length > 1 ? 's' : ''}</span>
            </div>
            {categories.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-xl border border-white/10">
                <Star className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-white text-xs font-bold">{categories.length} catégorie{categories.length > 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Steps ── */}
      <div className="bg-surface-card border-b border-surface-border sticky top-[65px] z-20">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2">
            {/* Step 1 */}
            <button onClick={() => setStep('catalog')}
              className={cn('flex items-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all',
                step === 'catalog' ? 'bg-brand-600 text-white' : 'text-content-muted hover:text-content-secondary')}>
              <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0',
                step === 'catalog' ? 'bg-white/20' : step === 'form' ? 'bg-status-success text-white' : 'bg-surface-hover text-content-muted')}>
                {step === 'form' ? <Check className="w-3 h-3" /> : '1'}
              </span>
              Choisir
            </button>

            {/* Connecteur */}
            <div className="flex-1 h-px bg-surface-border relative">
              <div className={cn('absolute inset-y-0 left-0 bg-brand-600 transition-all duration-500', step === 'form' ? 'w-full' : 'w-0')} />
            </div>

            {/* Step 2 */}
            <button
              onClick={() => cartItems.length > 0 && setStep('form')}
              disabled={cartItems.length === 0}
              className={cn('flex items-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all',
                step === 'form' ? 'bg-brand-600 text-white'
                : cartItems.length > 0 ? 'text-content-secondary hover:text-content-primary'
                : 'text-content-muted opacity-40 cursor-not-allowed')}>
              <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0',
                step === 'form' ? 'bg-white/20' : 'bg-surface-hover text-content-muted')}>
                2
              </span>
              Mes infos
            </button>

            {/* Bouton panier compact */}
            {cartCount > 0 && step === 'catalog' && (
              <button onClick={() => setShowCart(true)}
                className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-50 dark:bg-brand-500/10 text-brand-600 border border-brand-200 dark:border-brand-500/20 text-xs font-black">
                <ShoppingCart className="w-3.5 h-3.5" />
                {cartCount}
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-4">

        {/* ══ ÉTAPE 1 : Catalogue ══ */}
        {step === 'catalog' && (
          <>
            {/* Filtres catégories — scroll horizontal */}
            {categories.length > 0 && (
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-4 px-4">
                <button
                  onClick={() => { setActiveCat(null); setPage(0); }}
                  className={cn('shrink-0 px-4 py-2 rounded-full text-xs font-bold border transition-all',
                    activeCat === null
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-surface-card text-content-secondary border-surface-border hover:border-brand-400')}>
                  Tous ({catalog.length})
                </button>
                {categories.map(cat => (
                  <button key={cat.id}
                    onClick={() => { setActiveCat(activeCat === cat.id ? null : cat.id); setPage(0); }}
                    className={cn('shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border transition-all',
                      activeCat === cat.id
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-surface-card text-content-secondary border-surface-border hover:border-brand-400')}>
                    {cat.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />}
                    {cat.name}
                  </button>
                ))}
              </div>
            )}

            {/* Liste des prestations */}
            {filtered.length === 0 ? (
              <div className="text-center py-20 text-content-muted space-y-3">
                <Package2 className="w-12 h-12 mx-auto opacity-20" />
                <p className="font-medium">Aucune prestation dans cette catégorie</p>
              </div>
            ) : (
              <div className="space-y-3">
                {paginated.map(item => {
                  const qty = cart[item.id]?.quantity ?? 0;
                  const inCart = qty > 0;
                  return (
                    <div key={item.id}
                      className={cn(
                        'bg-surface-card rounded-2xl border overflow-hidden transition-all',
                        inCart
                          ? 'border-brand-500 shadow-md shadow-brand-500/10'
                          : 'border-surface-border active:scale-[0.99]'
                      )}>
                      <div className="p-4">
                        {/* Header ligne */}
                        <div className="flex items-start gap-3">
                          {/* Icône couleur catégorie */}
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 bg-surface-hover"
                            style={{ backgroundColor: item.category?.color ? item.category.color + '22' : undefined }}>
                            <Wrench className="w-5 h-5"
                              style={{ color: item.category?.color ?? 'var(--brand-600)' }} />
                          </div>

                          {/* Nom + description */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-content-primary leading-snug">{item.name}</p>
                              {inCart && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-600 text-[10px] font-black">
                                  <Check className="w-2.5 h-2.5" /> Sélectionné
                                </span>
                              )}
                            </div>
                            {item.category && (
                              <p className="text-[10px] font-semibold text-content-muted uppercase tracking-wide mt-0.5"
                                style={{ color: item.category.color ?? undefined }}>
                                {item.category.name}
                              </p>
                            )}
                            {item.description && (
                              <p className="text-xs text-content-secondary mt-1 leading-relaxed line-clamp-2">
                                {item.description}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Prix + durée + bouton */}
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-border">
                          <div className="flex items-center gap-3">
                            <span className="text-base font-black text-brand-600">
                              {formatCurrency(item.price, info?.currency ?? 'XOF')}
                            </span>
                            {item.duration_min && (
                              <span className="flex items-center gap-1 px-2 py-0.5 bg-surface-hover rounded-full text-[10px] text-content-muted font-semibold">
                                <Clock className="w-3 h-3" /> {item.duration_min} min
                              </span>
                            )}
                          </div>

                          {qty === 0 ? (
                            <button onClick={() => addToCart(item)}
                              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-xs font-black hover:bg-brand-700 active:scale-95 transition-all shadow-sm shadow-brand-600/20">
                              <Plus className="w-3.5 h-3.5" /> Ajouter
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => removeOne(item)}
                                className="w-9 h-9 rounded-xl bg-surface-hover border border-surface-border flex items-center justify-center text-content-primary hover:bg-brand-500/10 active:scale-95 transition-all">
                                <Minus className="w-4 h-4" />
                              </button>
                              <span className="font-black text-content-primary w-6 text-center text-base">{qty}</span>
                              <button onClick={() => addToCart(item)}
                                className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-white hover:bg-brand-700 active:scale-95 transition-all">
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => { setPage(p => p - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  disabled={page === 0}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-surface-border bg-surface-card text-sm font-bold text-content-secondary disabled:opacity-30 disabled:cursor-not-allowed hover:border-brand-400 hover:text-content-primary transition-all">
                  <ChevronRight className="w-4 h-4 rotate-180" /> Préc.
                </button>

                <div className="flex items-center gap-1.5">
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => { setPage(i); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                      className={cn(
                        'rounded-full transition-all',
                        i === page
                          ? 'w-6 h-2.5 bg-brand-600'
                          : 'w-2.5 h-2.5 bg-surface-border hover:bg-brand-300'
                      )}
                    />
                  ))}
                </div>

                <button
                  onClick={() => { setPage(p => p + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  disabled={page === totalPages - 1}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-surface-border bg-surface-card text-sm font-bold text-content-secondary disabled:opacity-30 disabled:cursor-not-allowed hover:border-brand-400 hover:text-content-primary transition-all">
                  Suiv. <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}

        {/* ══ ÉTAPE 2 : Formulaire ══ */}
        {step === 'form' && (
          <div className="space-y-4">

            {/* Récap panier */}
            <div className="bg-surface-card rounded-2xl border border-surface-border overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-brand-600" />
                  <span className="font-bold text-content-primary text-sm">Votre sélection</span>
                  <span className="text-xs text-content-muted">({cartCount} service{cartCount > 1 ? 's' : ''})</span>
                </div>
                <button onClick={() => setStep('catalog')}
                  className="flex items-center gap-1 text-xs text-brand-600 font-bold hover:underline">
                  <ArrowLeft className="w-3 h-3" /> Modifier
                </button>
              </div>
              <div className="divide-y divide-surface-border">
                {cartItems.map(c => (
                  <div key={c.item.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-content-primary truncate">{c.item.name}</p>
                      {c.item.category && (
                        <p className="text-[10px] text-content-muted">{c.item.category.name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => removeOne(c.item)}
                        className="w-7 h-7 rounded-full bg-surface-hover border border-surface-border flex items-center justify-center text-content-secondary hover:bg-surface-card">
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-sm font-black text-content-primary w-4 text-center">{c.quantity}</span>
                      <button onClick={() => addToCart(c.item)}
                        className="w-7 h-7 rounded-full bg-surface-hover border border-surface-border flex items-center justify-center text-content-secondary hover:bg-surface-card">
                        <Plus className="w-3 h-3" />
                      </button>
                      <span className="text-sm font-bold text-brand-600 w-20 text-right">
                        {formatCurrency(c.item.price * c.quantity, info?.currency)}
                      </span>
                      <button onClick={() => removeFromCart(c.item.id)}
                        className="p-1.5 rounded-lg text-content-muted hover:text-status-error hover:bg-badge-error transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 bg-surface-hover flex justify-between items-center">
                <span className="text-xs font-black text-content-muted uppercase tracking-widest">Total estimé</span>
                <span className="text-xl font-black text-brand-600">{formatCurrency(total, info?.currency)}</span>
              </div>
            </div>

            {/* Infos client */}
            <div className="bg-surface-card rounded-2xl border border-surface-border overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-border flex items-center gap-2">
                <User className="w-4 h-4 text-brand-600" />
                <h2 className="font-bold text-content-primary text-sm">Vos coordonnées</h2>
                <span className="text-[10px] text-content-muted">* requis</span>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-content-muted mb-1.5">
                    Nom complet *
                  </label>
                  <input value={clientName} onChange={e => setClientName(e.target.value)}
                    placeholder="Votre prénom et nom"
                    className="w-full px-4 py-3.5 rounded-xl bg-surface-input border border-surface-border text-content-primary placeholder:text-content-muted focus:border-brand-500 outline-none transition-all text-sm" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-content-muted mb-1.5">
                    Téléphone *
                  </label>
                  <input value={clientPhone} onChange={e => setClientPhone(e.target.value)}
                    type="tel" placeholder="Ex: 77 123 45 67"
                    className="w-full px-4 py-3.5 rounded-xl bg-surface-input border border-surface-border text-content-primary placeholder:text-content-muted focus:border-brand-500 outline-none transition-all text-sm" />
                </div>
              </div>
            </div>

            {/* Objet du service */}
            <div className="bg-surface-card rounded-2xl border border-surface-border overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-border flex items-center gap-2">
                <Wrench className="w-4 h-4 text-brand-600" />
                <h2 className="font-bold text-content-primary text-sm">Objet du service</h2>
                <span className="text-[10px] text-content-muted">(optionnel)</span>
              </div>
              <div className="p-4 space-y-3">
                <input value={subjectRef} onChange={e => setSubjectRef(e.target.value)}
                  placeholder="Référence — ex: AK-247-DK (immatriculation…)"
                  className="w-full px-4 py-3.5 rounded-xl bg-surface-input border border-surface-border text-content-primary placeholder:text-content-muted focus:border-brand-500 outline-none transition-all text-sm" />
                <input value={subjectInfo} onChange={e => setSubjectInfo(e.target.value)}
                  placeholder="Description — ex: Toyota Corolla blanche 2018"
                  className="w-full px-4 py-3.5 rounded-xl bg-surface-input border border-surface-border text-content-primary placeholder:text-content-muted focus:border-brand-500 outline-none transition-all text-sm" />
              </div>
            </div>

            {/* Notes */}
            <div className="bg-surface-card rounded-2xl border border-surface-border overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-border flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand-600" />
                <h2 className="font-bold text-content-primary text-sm">Instructions</h2>
                <span className="text-[10px] text-content-muted">(optionnel)</span>
              </div>
              <div className="p-4">
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                  placeholder="Précisez votre demande, le problème constaté, une préférence d'horaire…"
                  className="w-full px-4 py-3.5 rounded-xl bg-surface-input border border-surface-border text-content-primary placeholder:text-content-muted focus:border-brand-500 outline-none transition-all text-sm resize-none" />
              </div>
            </div>

            {submitError && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-badge-error text-status-error text-sm font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" /> {submitError}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ══ Barre flottante step 1 ══ */}
      {step === 'catalog' && cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30">
          <div className="bg-surface-card/95 backdrop-blur-lg border-t border-surface-border px-4 py-3">
            <div className="max-w-3xl mx-auto flex items-center gap-3">
              <button onClick={() => setShowCart(true)}
                className="flex items-center gap-3 flex-1 bg-surface-input border border-surface-border rounded-2xl px-4 py-3 hover:border-brand-500/40 transition-all">
                <div className="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center text-white font-black text-sm shrink-0">
                  {cartCount}
                </div>
                <div className="text-left">
                  <p className="text-[10px] text-content-muted">{cartCount} service{cartCount > 1 ? 's' : ''} sélectionné{cartCount > 1 ? 's' : ''}</p>
                  <p className="font-black text-brand-600 text-sm">{formatCurrency(total, info?.currency)}</p>
                </div>
              </button>
              <button onClick={() => setStep('form')}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm transition-all active:scale-95 shrink-0 shadow-lg shadow-brand-600/20">
                Continuer <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Barre flottante step 2 ══ */}
      {step === 'form' && (
        <div className="fixed bottom-0 left-0 right-0 z-30">
          <div className="bg-surface-card/95 backdrop-blur-lg border-t border-surface-border px-4 py-3">
            <div className="max-w-3xl mx-auto">
              <button onClick={handleSubmit}
                disabled={submitting || !clientName.trim() || !clientPhone.trim()}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-bold transition-all disabled:opacity-40 active:scale-[0.98] shadow-lg shadow-brand-600/20">
                {submitting
                  ? <Loader2 className="w-5 h-5 animate-spin" />
                  : <Check className="w-5 h-5" />}
                {submitting ? 'Envoi en cours…' : `Valider — ${formatCurrency(total, info?.currency)}`}
              </button>
              {(!clientName.trim() || !clientPhone.trim()) && (
                <p className="text-center text-[10px] text-content-muted mt-1.5">
                  Nom et téléphone requis pour continuer
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ Drawer panier ══ */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCart(false)} />
          <div className="relative bg-surface-card rounded-t-3xl sm:rounded-3xl border border-surface-border w-full sm:max-w-md max-h-[85vh] flex flex-col shadow-2xl">
            {/* Handle mobile */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-surface-border" />
            </div>
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-brand-600" />
                <h3 className="font-bold text-content-primary">Panier</h3>
                <span className="text-xs text-content-muted">({cartCount})</span>
              </div>
              <button onClick={() => setShowCart(false)}
                className="w-8 h-8 rounded-xl hover:bg-surface-hover flex items-center justify-center text-content-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-surface-border">
              {cartItems.map(c => (
                <div key={c.item.id} className="flex items-center gap-3 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-content-primary truncate">{c.item.name}</p>
                    <p className="text-xs font-bold text-brand-600 mt-0.5">{formatCurrency(c.item.price, info?.currency)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => removeOne(c.item)}
                      className="w-8 h-8 rounded-full bg-surface-hover border border-surface-border flex items-center justify-center text-content-secondary">
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-sm font-black text-content-primary w-5 text-center">{c.quantity}</span>
                    <button onClick={() => addToCart(c.item)}
                      className="w-8 h-8 rounded-full bg-surface-hover border border-surface-border flex items-center justify-center text-content-secondary">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => removeFromCart(c.item.id)}
                      className="w-8 h-8 rounded-xl text-content-muted hover:text-status-error hover:bg-badge-error flex items-center justify-center transition-all ml-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-surface-border space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-black text-content-muted text-xs uppercase tracking-widest">Total estimé</span>
                <span className="text-xl font-black text-brand-600">{formatCurrency(total, info?.currency)}</span>
              </div>
              <button onClick={() => { setShowCart(false); setStep('form'); }}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-bold transition-all active:scale-[0.98]">
                Continuer <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
