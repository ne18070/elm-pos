'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  Wrench, User, FileText, Loader2, AlertCircle, Check,
  Clock, Package2, MessageCircle, Plus, Minus,
} from 'lucide-react';
import { getPublicBusinessInfo, type PublicBusinessInfo } from '@services/supabase/business-public';
import { getPublicServiceCatalog, createPublicServiceOrder } from '@services/supabase/services-public';
import { formatCurrency, cn } from '@/lib/utils';

export default function PublicServiceOrderPage() {
  const { businessId } = useParams();

  const [info,    setInfo]    = useState<PublicBusinessInfo | null>(null);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [clientName,  setClientName]  = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [subjectRef,  setSubjectRef]  = useState('');
  const [subjectInfo, setSubjectInfo] = useState('');
  const [notes,       setNotes]       = useState('');
  const [cart,        setCart]        = useState<Record<string, { item: any; quantity: number }>>({});

  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState<string | null>(null);
  const [success,      setSuccess]      = useState(false);
  const [orderId,      setOrderId]      = useState<string | null>(null);

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

  const total     = Object.values(cart).reduce((s, c) => s + c.item.price * c.quantity, 0);
  const cartItems = Object.values(cart);

  function toggleCart(item: any) {
    setCart(prev => {
      const next = { ...prev };
      if (next[item.id]) delete next[item.id];
      else next[item.id] = { item, quantity: 1 };
      return next;
    });
  }

  function updateQty(itemId: string, delta: number) {
    setCart(prev => {
      const next = { ...prev };
      if (!next[itemId]) return prev;
      next[itemId].quantity = Math.max(1, next[itemId].quantity + delta);
      return next;
    });
  }

  async function handleSubmit() {
    if (!info || cartItems.length === 0 || !clientName || !clientPhone) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const order = await createPublicServiceOrder({
        businessId:  info.id,
        clientName,
        clientPhone,
        subjectRef,
        subjectInfo,
        notes,
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
        <button onClick={() => window.location.reload()} className="btn-primary w-full py-4 rounded-2xl shadow-lg shadow-brand-500/20">
          Réessayer
        </button>
      </div>
    </div>
  );

  /* ── Succès ── */
  if (success) return (
    <div className="min-h-screen bg-surface-hover text-content-primary font-sans">
      <Header info={info} />
      <div className="max-w-md mx-auto px-6 py-16 text-center space-y-6">
        <div className="w-20 h-20 bg-badge-success rounded-full flex items-center justify-center mx-auto text-status-success border-4 border-surface-border">
          <Check className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-content-primary">Demande envoyée !</h1>
          <p className="text-content-secondary leading-relaxed">
            Votre ordre de travail a été enregistré. Nous vous contacterons prochainement.
          </p>
        </div>
        <div className="bg-surface-card border border-surface-border rounded-2xl p-4">
          <p className="text-[10px] font-black text-content-secondary uppercase tracking-widest mb-2">Votre référence</p>
          <p className="font-mono font-black text-xl text-content-primary tracking-widest">
            {orderId?.slice(0, 8).toUpperCase()}
          </p>
        </div>
        <div className="space-y-3 pt-2">
          <button onClick={() => {
            const text = encodeURIComponent(`Bonjour, je viens de soumettre une demande de service. Mon numéro : ${orderId?.slice(0, 8).toUpperCase()}`);
            const phone = info?.phone?.replace(/[^\d]/g, '') || '';
            window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
          }} className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-status-success hover:opacity-90 text-white font-bold transition-all">
            <MessageCircle className="w-5 h-5" />Informer par WhatsApp
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
    <div className="min-h-screen bg-surface-hover text-content-primary font-sans pb-28">
      <Header info={info} />

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">

        {/* Catalogue */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Package2 className="w-5 h-5 text-brand-600" />
            <h2 className="font-bold text-content-primary">Nos prestations</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {catalog.map(item => {
              const inCart = !!cart[item.id];
              return (
                <div key={item.id}
                  className={cn('rounded-3xl border transition-all duration-300 overflow-hidden',
                    inCart ? 'border-brand-500 shadow-lg shadow-brand-500/20'
                           : 'bg-surface-card border-surface-border hover:border-brand-500/30')}>
                  <button onClick={() => toggleCart(item)} className={cn('w-full text-left p-4', inCart ? 'bg-brand-500' : '')}>
                    <div className="flex justify-between items-start mb-3">
                      <p className={cn('font-bold text-base leading-tight', inCart ? 'text-white' : 'text-content-primary')}>{item.name}</p>
                      {inCart && <Check className="w-5 h-5 text-white shrink-0" />}
                    </div>
                    {item.description && (
                      <p className={cn('text-xs mb-3 leading-relaxed', inCart ? 'text-white/80' : 'text-content-secondary')}>{item.description}</p>
                    )}
                    <div className="flex justify-between items-center">
                      <span className={cn('text-sm font-black', inCart ? 'text-white' : 'text-content-brand')}>
                        {formatCurrency(item.price, info?.currency ?? 'XOF')}
                      </span>
                      {item.duration_min && (
                        <span className={cn('text-[10px] flex items-center gap-1', inCart ? 'text-white/70' : 'text-content-secondary')}>
                          <Clock className="w-3 h-3" />{item.duration_min} min
                        </span>
                      )}
                    </div>
                  </button>
                  {inCart && (
                    <div className="flex items-center justify-between px-4 py-2 bg-brand-600/80">
                      <p className="text-white/80 text-xs font-medium">Quantité</p>
                      <div className="flex items-center gap-3">
                        <button onClick={() => updateQty(item.id, -1)} className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-white"><Minus className="w-3 h-3" /></button>
                        <span className="text-white font-bold w-4 text-center">{cart[item.id].quantity}</span>
                        <button onClick={() => updateQty(item.id, +1)} className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-white"><Plus className="w-3 h-3" /></button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Formulaire */}
        <section className="bg-surface-card rounded-3xl shadow-sm border border-surface-border overflow-hidden">
          <div className="p-6 border-b border-surface-border flex items-center gap-3">
            <User className="w-5 h-5 text-brand-600" />
            <h2 className="font-bold text-content-primary text-lg">Vos informations</h2>
          </div>
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-content-secondary">Nom complet *</label>
                <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Votre nom"
                  className="w-full px-4 py-3 rounded-2xl bg-surface-input border border-surface-border text-content-primary focus:border-brand-500 outline-none transition-all text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-content-secondary">Téléphone *</label>
                <input value={clientPhone} onChange={e => setClientPhone(e.target.value)} type="tel" placeholder="Ex: 77 123 45 67"
                  className="w-full px-4 py-3 rounded-2xl bg-surface-input border border-surface-border text-content-primary focus:border-brand-500 outline-none transition-all text-sm" />
              </div>
            </div>

            <div className="pt-2 border-t border-surface-border space-y-4">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-brand-600" />
                <h3 className="font-semibold text-content-primary text-sm">
                  Objet du service <span className="text-xs font-normal text-content-secondary ml-1">(optionnel)</span>
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input value={subjectRef} onChange={e => setSubjectRef(e.target.value)} placeholder="Référence (ex: Plaque, N° Série…)"
                  className="w-full px-4 py-3 rounded-2xl bg-surface-input border border-surface-border text-content-primary focus:border-brand-500 outline-none transition-all text-sm" />
                <input value={subjectInfo} onChange={e => setSubjectInfo(e.target.value)} placeholder="Description (ex: Toyota Corolla…)"
                  className="w-full px-4 py-3 rounded-2xl bg-surface-input border border-surface-border text-content-primary focus:border-brand-500 outline-none transition-all text-sm" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-content-secondary flex items-center gap-1">
                <FileText className="w-3 h-3" />Instructions spécifiques
              </label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Dites-nous en plus…"
                className="w-full px-4 py-3 rounded-2xl bg-surface-input border border-surface-border text-content-primary focus:border-brand-500 outline-none transition-all text-sm resize-none" />
            </div>

            {submitError && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-badge-error text-status-error text-sm font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />{submitError}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Barre de validation flottante */}
      {cartItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-surface-card/90 backdrop-blur-lg border-t border-surface-border z-30">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black text-content-secondary uppercase tracking-widest leading-none mb-1">
                {cartItems.length} service{cartItems.length > 1 ? 's' : ''} sélectionné{cartItems.length > 1 ? 's' : ''}
              </p>
              <p className="text-2xl font-black text-content-brand">{formatCurrency(total, info?.currency)}</p>
            </div>
            <button onClick={handleSubmit} disabled={submitting || !clientName || !clientPhone}
              className="btn-primary flex items-center gap-2 px-8 py-4 rounded-2xl disabled:opacity-40">
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              Valider ma demande
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Header({ info }: { info: PublicBusinessInfo | null }) {
  return (
    <header className="bg-surface-card border-b border-surface-border sticky top-0 z-10 shadow-sm">
      <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-xl bg-surface-hover border border-surface-border overflow-hidden shrink-0">
            {info?.logo_url ? (
              <img src={info.logo_url} alt={info.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-brand-600 flex items-center justify-center">
                <span className="text-white font-black text-sm">{info?.name?.slice(0, 2).toUpperCase() ?? 'SV'}</span>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-content-secondary leading-none mb-1">Services & Prestations</p>
            <h1 className="font-bold text-content-primary text-base truncate leading-none">{info?.name ?? '—'}</h1>
          </div>
        </div>
        <img src="/logo.png" alt="ELM APP" className="h-14 w-auto shrink-0 object-contain" />
      </div>
    </header>
  );
}
