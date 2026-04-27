'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  Wrench, User, Phone, FileText, Loader2, AlertCircle, Check,
  ChevronRight, Plus, Minus, X, Clock, Package2, MessageCircle
} from 'lucide-react';
import { getPublicBusinessInfo, type PublicBusinessInfo } from '@services/supabase/business-public';
import { getPublicServiceCatalog, createPublicServiceOrder } from '@services/supabase/services-public';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

export default function PublicServiceOrderPage() {
  const { businessId } = useParams();
  const router = useRouter();
  
  const [info,      setInfo]      = useState<PublicBusinessInfo | null>(null);
  const [catalog,   setCatalog]   = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [loadErr,   setLoadErr]   = useState<string | null>(null);

  // Formulaire
  const [clientName,  setClientName]  = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [subjectRef,  setSubjectRef]  = useState('');
  const [subjectInfo, setSubjectInfo] = useState('');
  const [notes,       setNotes]       = useState('');
  const [cart,        setCart]        = useState<Record<string, { item: any, quantity: number }>>({});
  
  const [submitting,  setSubmitting]  = useState(false);
  const [success,     setSuccess]     = useState(false);
  const [orderId,     setOrderId]     = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    async function load() {
      try {
        const bInfo = await getPublicBusinessInfo(businessId as string);
        if (!bInfo) { setLoadErr("Établissement introuvable."); return; }
        setInfo(bInfo);
        
        const cat = await getPublicServiceCatalog(bInfo.id);
        setCatalog(cat);
      } catch (e) {
        setLoadErr("Erreur lors du chargement des données.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [businessId]);

  const total = Object.values(cart).reduce((s, c) => s + c.item.price * c.quantity, 0);
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
    try {
      const order = await createPublicServiceOrder({
        businessId:   info.id,
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
      alert("Erreur lors de la validation : " + e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <Loader2 className="w-10 h-10 animate-spin text-brand-600" />
    </div>
  );

  if (loadErr) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 text-center">
      <div className="max-w-md space-y-4">
        <AlertCircle className="w-16 h-16 text-status-error mx-auto" />
        <h1 className="text-2xl font-bold">{loadErr}</h1>
        <button onClick={() => window.location.reload()} className="btn-primary px-8 py-3 rounded-xl">Réessayer</button>
      </div>
    </div>
  );

  if (success) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 text-center">
      <div className="max-w-md bg-white rounded-3xl shadow-xl p-8 space-y-6">
        <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto text-green-500 border-4 border-green-100">
          <Check className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">Demande envoyée !</h1>
          <p className="text-slate-500 leading-relaxed">
            Votre ordre de travail a été enregistré. Nous vous contacterons prochainement pour la prise en charge.
          </p>
        </div>
        <div className="pt-4 space-y-4">
          <p className="text-xs text-slate-400">Conservez précieusement ce numéro :</p>
          <div className="bg-slate-50 p-3 rounded-xl font-mono font-bold text-lg tracking-widest text-slate-700">
            {orderId?.slice(0, 8).toUpperCase()}
          </div>
          
          <div className="grid grid-cols-1 gap-3">
             <button onClick={() => {
                const text = encodeURIComponent(`Bonjour, je viens de passer une commande de service sur votre page en ligne. Mon numéro de suivi est : ${orderId?.slice(0, 8).toUpperCase()}`);
                const phone = info?.phone?.replace(/[^\d]/g, '') || '';
                window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
             }} className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold transition-all">
               <MessageCircle className="w-5 h-5" /> Informer par WhatsApp
             </button>

             <button onClick={() => window.location.reload()} className="w-full py-4 rounded-2xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-all">
               Nouvelle demande
             </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {info?.logo_url ? (
              <img src={info.logo_url} className="w-10 h-10 rounded-xl object-contain border border-slate-100 p-1" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-lg shadow-brand-500/20">
                <Wrench className="w-5 h-5" />
              </div>
            )}
            <div>
              <h1 className="text-base font-bold text-slate-900 leading-tight">{info?.name}</h1>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Services & Prestations</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-6 space-y-8">
        {/* Services Selection */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Package2 className="w-5 h-5 text-brand-600" />
            <h2 className="font-bold text-slate-900">Nos prestations</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {catalog.map(item => {
              const inCart = !!cart[item.id];
              return (
                <button key={item.id} onClick={() => toggleCart(item)}
                  className={cn('flex flex-col text-left p-4 rounded-3xl border transition-all duration-300',
                    inCart ? 'bg-brand-500 border-brand-500 text-white shadow-lg shadow-brand-500/20 scale-[1.02]' 
                           : 'bg-white border-slate-200 text-slate-900 hover:border-brand-500/30 hover:bg-slate-50')}>
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-bold text-lg leading-tight">{item.name}</p>
                    {inCart && <Check className="w-5 h-5" />}
                  </div>
                  <div className="mt-auto flex justify-between items-center">
                    <span className={cn('text-sm font-black', inCart ? 'text-white' : 'text-brand-600')}>
                      {formatCurrency(item.price, info?.currency ?? 'XOF')}
                    </span>
                    {item.duration_min && (
                      <span className={cn('text-[10px] flex items-center gap-1', inCart ? 'text-white/70' : 'text-slate-400')}>
                        <Clock className="w-3 h-3" />{item.duration_min} min
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Formulaire Client */}
        <section className="bg-white rounded-[32px] shadow-sm border border-slate-200 p-6 md:p-8 space-y-6">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-brand-600" />
            <h2 className="font-bold text-slate-900 text-xl">Vos informations</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Nom complet *</label>
              <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Votre nom"
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:border-brand-500 outline-none transition-all text-sm font-medium" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Téléphone *</label>
              <input value={clientPhone} onChange={e => setClientPhone(e.target.value)} type="tel" placeholder="Ex: 77 123 45 67"
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:border-brand-500 outline-none transition-all text-sm font-medium" />
            </div>
          </div>

          <div className="space-y-4 pt-2">
             <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-brand-600" />
              <h3 className="font-bold text-slate-900">Objet du service <span className="text-xs font-normal text-slate-400 ml-1">(optionnel)</span></h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input value={subjectRef} onChange={e => setSubjectRef(e.target.value)} placeholder="Référence (ex: Plaque, N° Série...)"
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:border-brand-500 outline-none transition-all text-sm font-medium" />
              <input value={subjectInfo} onChange={e => setSubjectInfo(e.target.value)} placeholder="Description (ex: Toyota Corolla, iPhone...)"
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:border-brand-500 outline-none transition-all text-sm font-medium" />
            </div>
          </div>

          <div className="space-y-1.5 pt-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">Instructions ou besoins spécifiques</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Dites-nous en plus..."
              className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-100 focus:bg-white focus:border-brand-500 outline-none transition-all text-sm font-medium resize-none" />
          </div>
        </section>

        {/* Panier / Résumé flottant en bas pour mobile */}
        {cartItems.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-lg border-t border-slate-200 z-30 animate-in slide-in-from-bottom-full duration-500">
            <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">{cartItems.length} service(s) sélectionné(s)</p>
                <p className="text-2xl font-black text-brand-600">{formatCurrency(total, info?.currency)}</p>
              </div>
              <button onClick={handleSubmit} disabled={submitting || !clientName || !clientPhone}
                className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white px-8 py-4 rounded-2xl font-bold shadow-lg shadow-brand-500/20 transition-all flex items-center gap-2">
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                Valider ma demande
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
