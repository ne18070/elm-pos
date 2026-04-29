'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  Wrench, User, FileText, Loader2, AlertCircle, Check,
  Clock, Package2, MessageCircle, Plus, Minus, ShoppingCart,
  ChevronRight, Trash2, X,
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

  const cartItems  = Object.values(cart);
  const cartCount  = cartItems.reduce((s, c) => s + c.quantity, 0);
  const total      = cartItems.reduce((s, c) => s + c.item.price * c.quantity, 0);

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
        businessId:  info.id,
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

  /* ── Loading ── */
  if (loading) return (
    <div className="min-h-screen bg-surface-hover flex items-center justify-center p-6">
      <div className="text-center space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-brand-600 mx-auto" />
        <p className="text-content-secondary font-medium animate-pulse">Chargement…</p>
      </div>
    </div>
  );

  /* ── Erreur ── */
  if (loadErr) return (
    <div className="min-h-screen bg-surface-hover flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-surface-card rounded-3xl shadow-xl border border-surface-border p-8 text-center space-y-6">
        <div className="w-20 h-20 bg-badge-error rounded-full flex items-center justify-center mx-auto text-status-error">
          <AlertCircle className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-bold text-content-primary">Oups !</h1>
        <p className="text-content-secondary leading-relaxed">{loadErr}</p>
        <button onClick={() => window.location.reload()} className="w-full py-4 rounded-2xl bg-brand-600 text-white font-bold">
          Réessayer
        </button>
      </div>
    </div>
  );

  /* ── Succès ── */
  if (success) return (
    <div className="min-h-screen bg-surface-hover text-content-primary font-sans">
      <PublicHeader business={info} loading={false} title="Services & Prestations" />
      <div className="max-w-md mx-auto px-6 py-16 text-center space-y-6">
        <div className="w-24 h-24 bg-badge-success rounded-full flex items-center justify-center mx-auto text-status-success border-4 border-status-success/20">
          <Check className="w-12 h-12" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-content-primary">Demande envoyée !</h1>
          <p className="text-content-secondary leading-relaxed">
            Votre ordre de travail a été enregistré. Nous vous contacterons prochainement.
          </p>
        </div>
        <div className="bg-surface-card border border-surface-border rounded-2xl p-5 space-y-3">
          <p className="text-[10px] font-black text-content-secondary uppercase tracking-widest">Votre référence</p>
          <p className="font-mono font-black text-2xl text-content-primary tracking-widest">
            {orderId?.slice(0, 8).toUpperCase()}
          </p>
          <div className="pt-2 border-t border-surface-border space-y-1">
            {cartItems.map(c => (
              <div key={c.item.id} className="flex justify-between text-sm text-content-secondary">
                <span>{c.item.name} × {c.quantity}</span>
                <span>{formatCurrency(c.item.price * c.quantity, info?.currency)}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold text-content-primary pt-1 border-t border-surface-border">
              <span>Total</span>
              <span>{formatCurrency(total, info?.currency)}</span>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <button onClick={() => {
            const text = encodeURIComponent(`Bonjour, je viens de soumettre une demande de service. Référence : ${orderId?.slice(0, 8).toUpperCase()}`);
            const phone = info?.phone?.replace(/[^\d]/g, '') || '';
            window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
          }} className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-green-600 hover:opacity-90 text-white font-bold transition-all">
            <MessageCircle className="w-5 h-5" /> Confirmer par WhatsApp
          </button>
          <button onClick={() => window.location.reload()}
            className="w-full py-4 rounded-2xl border border-surface-border text-content-secondary font-semibold hover:bg-surface-hover transition-all">
            Nouvelle demande
          </button>
        </div>
      </div>
    </div>
  );

  /* ── Page principale ── */
  return (
    <div className="min-h-screen bg-surface-hover text-content-primary font-sans pb-32">
      <PublicHeader business={info} loading={false} title="Services & Prestations" />

      {/* Steps indicator */}
      <div className="bg-surface-card border-b border-surface-border sticky top-[65px] z-20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          <button onClick={() => setStep('catalog')}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all',
              step === 'catalog' ? 'bg-brand-600 text-white' : 'text-content-secondary hover:text-content-primary')}>
            <Package2 className="w-4 h-4" />
            <span>1. Choisir</span>
          </button>
          <ChevronRight className="w-4 h-4 text-content-muted shrink-0" />
          <button
            onClick={() => cartItems.length > 0 && setStep('form')}
            disabled={cartItems.length === 0}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all',
              step === 'form' ? 'bg-brand-600 text-white'
              : cartItems.length > 0 ? 'text-content-secondary hover:text-content-primary'
              : 'text-content-muted opacity-40 cursor-not-allowed')}>
            <User className="w-4 h-4" />
            <span>2. Mes infos</span>
          </button>
          {cartCount > 0 && (
            <button onClick={() => setShowCart(true)}
              className="ml-auto flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-500/10 text-content-brand border border-brand-500/20 text-sm font-bold">
              <ShoppingCart className="w-4 h-4" />
              <span>{cartCount}</span>
            </button>
          )}
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* ── ÉTAPE 1 : Catalogue ── */}
        {step === 'catalog' && (
          <>
            {/* Filtres catégories */}
            {categories.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setActiveCat(null)}
                  className={cn('px-4 py-2 rounded-full text-sm font-semibold border transition-all',
                    activeCat === null
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-surface-card text-content-secondary border-surface-border hover:border-brand-500/40')}>
                  Toutes
                </button>
                {categories.map(cat => (
                  <button key={cat.id}
                    onClick={() => setActiveCat(activeCat === cat.id ? null : cat.id)}
                    className={cn('flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all',
                      activeCat === cat.id
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-surface-card text-content-secondary border-surface-border hover:border-brand-500/40')}>
                    {cat.color && (
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    )}
                    {cat.name}
                  </button>
                ))}
              </div>
            )}

            {/* Grille de prestations */}
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-content-muted">
                <Package2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>Aucune prestation dans cette catégorie</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filtered.map(item => {
                  const qty = cart[item.id]?.quantity ?? 0;
                  return (
                    <div key={item.id}
                      className={cn('bg-surface-card rounded-2xl border transition-all overflow-hidden',
                        qty > 0 ? 'border-brand-500 shadow-md shadow-brand-500/10' : 'border-surface-border hover:border-brand-500/30')}>
                      {/* Bandeau catégorie */}
                      {item.category && (
                        <div className="px-4 pt-3 pb-0">
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-content-secondary">
                            {item.category.color && (
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.category.color }} />
                            )}
                            {item.category.name}
                          </span>
                        </div>
                      )}

                      <div className="p-4 space-y-3">
                        <div>
                          <p className="font-bold text-content-primary leading-snug">{item.name}</p>
                          {item.description && (
                            <p className="text-xs text-content-secondary mt-1 leading-relaxed">{item.description}</p>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-lg font-black text-content-brand">
                              {formatCurrency(item.price, info?.currency ?? 'XOF')}
                            </span>
                            {item.duration_min && (
                              <span className="ml-2 text-[10px] text-content-secondary inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" />{item.duration_min} min
                              </span>
                            )}
                          </div>

                          {qty === 0 ? (
                            <button onClick={() => addToCart(item)}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 transition-all">
                              <Plus className="w-3.5 h-3.5" /> Ajouter
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button onClick={() => removeOne(item)}
                                className="w-8 h-8 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-content-brand hover:bg-brand-500/20 transition-all">
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="font-black text-content-primary w-5 text-center">{qty}</span>
                              <button onClick={() => addToCart(item)}
                                className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white hover:bg-brand-700 transition-all">
                                <Plus className="w-3.5 h-3.5" />
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
          </>
        )}

        {/* ── ÉTAPE 2 : Formulaire ── */}
        {step === 'form' && (
          <div className="space-y-5">
            {/* Récap panier */}
            <div className="bg-surface-card rounded-2xl border border-surface-border overflow-hidden">
              <div className="px-5 py-3 border-b border-surface-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-content-brand" />
                  <span className="font-bold text-content-primary text-sm">Votre sélection</span>
                </div>
                <button onClick={() => setStep('catalog')} className="text-xs text-content-brand font-semibold hover:underline">
                  Modifier
                </button>
              </div>
              <div className="divide-y divide-surface-border">
                {cartItems.map(c => (
                  <div key={c.item.id} className="flex items-center justify-between px-5 py-3 gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-content-primary truncate">{c.item.name}</p>
                      {c.item.category && (
                        <p className="text-[10px] text-content-muted">{c.item.category.name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-2">
                        <button onClick={() => removeOne(c.item)}
                          className="w-6 h-6 rounded-full bg-surface-input border border-surface-border flex items-center justify-center text-content-secondary hover:bg-surface-hover">
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-sm font-bold text-content-primary w-4 text-center">{c.quantity}</span>
                        <button onClick={() => addToCart(c.item)}
                          className="w-6 h-6 rounded-full bg-surface-input border border-surface-border flex items-center justify-center text-content-secondary hover:bg-surface-hover">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="text-sm font-bold text-content-brand w-20 text-right">
                        {formatCurrency(c.item.price * c.quantity, info?.currency)}
                      </span>
                      <button onClick={() => removeFromCart(c.item.id)}
                        className="p-1 rounded-lg text-content-muted hover:text-status-error hover:bg-badge-error transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-3 bg-surface-input flex justify-between items-center">
                <span className="text-sm font-black text-content-secondary uppercase tracking-widest">Total</span>
                <span className="text-xl font-black text-content-brand">{formatCurrency(total, info?.currency)}</span>
              </div>
            </div>

            {/* Infos client */}
            <div className="bg-surface-card rounded-2xl border border-surface-border overflow-hidden">
              <div className="px-5 py-4 border-b border-surface-border flex items-center gap-2">
                <User className="w-4 h-4 text-content-brand" />
                <h2 className="font-bold text-content-primary">Vos informations</h2>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-content-secondary">Nom complet *</label>
                    <input value={clientName} onChange={e => setClientName(e.target.value)}
                      placeholder="Votre nom"
                      className="w-full px-4 py-3 rounded-xl bg-surface-input border border-surface-border text-content-primary focus:border-brand-500 outline-none transition-all text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-content-secondary">Téléphone *</label>
                    <input value={clientPhone} onChange={e => setClientPhone(e.target.value)}
                      type="tel" placeholder="Ex: 77 123 45 67"
                      className="w-full px-4 py-3 rounded-xl bg-surface-input border border-surface-border text-content-primary focus:border-brand-500 outline-none transition-all text-sm" />
                  </div>
                </div>

                <div className="pt-1 border-t border-surface-border space-y-3">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-content-brand" />
                    <span className="text-sm font-semibold text-content-primary">
                      Objet <span className="text-xs font-normal text-content-muted">(optionnel)</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input value={subjectRef} onChange={e => setSubjectRef(e.target.value)}
                      placeholder="Référence (ex: immatriculation…)"
                      className="w-full px-4 py-3 rounded-xl bg-surface-input border border-surface-border text-content-primary focus:border-brand-500 outline-none transition-all text-sm" />
                    <input value={subjectInfo} onChange={e => setSubjectInfo(e.target.value)}
                      placeholder="Description (ex: Toyota Corolla…)"
                      className="w-full px-4 py-3 rounded-xl bg-surface-input border border-surface-border text-content-primary focus:border-brand-500 outline-none transition-all text-sm" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-content-secondary flex items-center gap-1">
                    <FileText className="w-3 h-3" /> Instructions spécifiques
                  </label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                    placeholder="Précisez votre demande…"
                    className="w-full px-4 py-3 rounded-xl bg-surface-input border border-surface-border text-content-primary focus:border-brand-500 outline-none transition-all text-sm resize-none" />
                </div>

                {submitError && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-badge-error text-status-error text-sm font-medium">
                    <AlertCircle className="w-4 h-4 shrink-0" />{submitError}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Barre flottante ── */}
      {step === 'catalog' && cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-surface-card/95 backdrop-blur-lg border-t border-surface-border z-30">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <button onClick={() => setShowCart(true)}
              className="flex items-center gap-3 flex-1 bg-surface-input border border-surface-border rounded-2xl px-4 py-3 hover:border-brand-500/40 transition-all">
              <div className="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center text-white font-black text-sm shrink-0">
                {cartCount}
              </div>
              <div className="flex-1 text-left">
                <p className="text-xs text-content-secondary">{cartCount} service{cartCount > 1 ? 's' : ''}</p>
                <p className="font-black text-content-brand">{formatCurrency(total, info?.currency)}</p>
              </div>
            </button>
            <button onClick={() => setStep('form')}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-bold transition-all shrink-0">
              Continuer <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {step === 'form' && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-surface-card/95 backdrop-blur-lg border-t border-surface-border z-30">
          <div className="max-w-3xl mx-auto">
            <button onClick={handleSubmit}
              disabled={submitting || !clientName.trim() || !clientPhone.trim()}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-bold transition-all disabled:opacity-40">
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              Valider ma demande — {formatCurrency(total, info?.currency)}
            </button>
          </div>
        </div>
      )}

      {/* ── Drawer panier ── */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCart(false)} />
          <div className="relative bg-surface-card rounded-t-3xl sm:rounded-3xl border border-surface-border w-full sm:max-w-md max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-content-brand" />
                <h3 className="font-bold text-content-primary">Panier ({cartCount})</h3>
              </div>
              <button onClick={() => setShowCart(false)} className="p-2 rounded-xl hover:bg-surface-hover text-content-secondary">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-surface-border">
              {cartItems.map(c => (
                <div key={c.item.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-content-primary truncate">{c.item.name}</p>
                    <p className="text-xs text-content-brand font-bold">{formatCurrency(c.item.price, info?.currency)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => removeOne(c.item)}
                      className="w-7 h-7 rounded-full bg-surface-input border border-surface-border flex items-center justify-center text-content-secondary hover:bg-surface-hover">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-sm font-bold text-content-primary w-4 text-center">{c.quantity}</span>
                    <button onClick={() => addToCart(c.item)}
                      className="w-7 h-7 rounded-full bg-surface-input border border-surface-border flex items-center justify-center text-content-secondary hover:bg-surface-hover">
                      <Plus className="w-3 h-3" />
                    </button>
                    <button onClick={() => removeFromCart(c.item.id)}
                      className="p-1.5 rounded-lg text-content-muted hover:text-status-error hover:bg-badge-error ml-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-surface-border space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-black text-content-secondary text-sm uppercase tracking-widest">Total</span>
                <span className="text-xl font-black text-content-brand">{formatCurrency(total, info?.currency)}</span>
              </div>
              <button onClick={() => { setShowCart(false); setStep('form'); }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white font-bold transition-all">
                Continuer <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
