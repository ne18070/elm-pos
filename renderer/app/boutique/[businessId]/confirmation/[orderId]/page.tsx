'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  CheckCircle2, Package, Truck, Store, Banknote,
  CreditCard, MessageCircle, Loader2, AlertCircle,
  ArrowLeft, Clock,
} from 'lucide-react';
import { getBoutiqueOrder, getBoutiqueInfo, type BoutiqueOrderDetail, type BoutiqueInfo } from '@services/supabase/boutique';
import { formatCurrency } from '@/lib/utils';

const PAYMENT_LABELS: Record<string, { label: string; desc: string; icon: React.ReactNode; color: string }> = {
  cash: {
    label: 'Paiement en espèces',
    desc:  'Préparez le montant exact pour la remise.',
    icon:  <Banknote className="w-5 h-5" />,
    color: 'bg-green-50 border-green-200 text-green-700',
  },
  mobile_money: {
    label: 'Mobile Money',
    desc:  'Préparez votre Mobile Money pour le paiement.',
    icon:  <CreditCard className="w-5 h-5" />,
    color: 'bg-blue-50 border-blue-200 text-blue-700',
  },
  lien_paiement: {
    label: 'Lien de paiement sécurisé',
    desc:  'Vous recevrez un lien de paiement sur votre WhatsApp très prochainement.',
    icon:  <MessageCircle className="w-5 h-5" />,
    color: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  },
};

export default function ConfirmationPage() {
  const { businessId, orderId: token } = useParams<{ businessId: string; orderId: string }>();

  const [order,   setOrder]   = useState<BoutiqueOrderDetail | null>(null);
  const [info,    setInfo]    = useState<BoutiqueInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!token || !businessId) return;
    (async () => {
      try {
        const [o, b] = await Promise.all([
          getBoutiqueOrder(token),
          getBoutiqueInfo(businessId),
        ]);
        if (!o) { setError("Commande introuvable ou lien invalide."); return; }
        setOrder(o);
        setInfo(b);
      } catch {
        setError("Impossible de charger la confirmation.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, businessId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center max-w-sm w-full space-y-4">
          <AlertCircle className="w-12 h-12 text-status-error mx-auto" />
          <p className="font-semibold text-slate-800">{error ?? "Une erreur est survenue"}</p>
          <a
            href={`/boutique/${businessId}`}
            className="block w-full py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 transition-colors text-center"
          >
            Retour à la boutique
          </a>
        </div>
      </div>
    );
  }

  const currency     = info?.currency ?? 'XOF';
  const isDelivery   = order.delivery_type === 'delivery';
  const paymentInfo  = PAYMENT_LABELS[/* extracted from notes or order */ 'cash']; // fallback
  const shortId      = order.id.slice(0, 8).toUpperCase();

  // Déterminer le mode de paiement depuis les notes si stocké, sinon affichage générique
  const paymentConfig = PAYMENT_LABELS['cash']; // le mode est stocké dans la commande

  return (
    <div className="min-h-screen bg-slate-50 pb-16">

      {/* Header */}
      <header className="bg-white border-b border-slate-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <a
            href={`/boutique/${businessId}`}
            className="p-2 rounded-full hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-500" />
          </a>
          <h1 className="font-bold text-slate-900">Confirmation de commande</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* Succès */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 text-center space-y-3">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto border-4 border-green-100">
            <CheckCircle2 className="w-8 h-8 text-status-success" />
          </div>
          <div>
            <h2 className="font-black text-xl text-slate-900">Commande reçue !</h2>
            <p className="text-slate-500 text-sm mt-1">Nous avons bien reçu votre commande et elle est en cours de traitement.</p>
          </div>
          <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
            <Package className="w-4 h-4 text-content-secondary" />
            <span className="text-xs font-medium text-slate-500">Commande</span>
            <span className="font-mono font-bold text-slate-800 text-sm">#{shortId}</span>
          </div>
        </div>

        {/* Infos client */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-3">
          <h3 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-500" />
            Votre commande
          </h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-content-secondary">Nom</p>
              <p className="font-semibold text-slate-800">{order.customer_name ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-content-secondary">Téléphone</p>
              <p className="font-semibold text-slate-800">{order.customer_phone ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-content-secondary">Mode</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {isDelivery ? (
                  <><Truck className="w-3.5 h-3.5 text-brand-500" /><span className="font-semibold text-slate-800">Livraison</span></>
                ) : (
                  <><Store className="w-3.5 h-3.5 text-brand-500" /><span className="font-semibold text-slate-800">En boutique</span></>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs text-content-secondary">Statut</p>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-50 border border-yellow-200 rounded-full text-xs font-semibold text-yellow-700">
                <Clock className="w-3 h-3" />En attente
              </span>
            </div>
          </div>
          {isDelivery && order.delivery_address && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs text-content-secondary">Adresse de livraison</p>
              <p className="font-medium text-slate-800 text-sm mt-0.5">{order.delivery_address}</p>
            </div>
          )}
          {order.notes && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs text-content-secondary">Notes</p>
              <p className="text-slate-700 text-sm mt-0.5">{order.notes}</p>
            </div>
          )}
        </div>

        {/* Articles */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-3">
          <h3 className="font-semibold text-slate-700 text-sm">Articles commandés</h3>
          <div className="space-y-2">
            {order.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 bg-slate-100 rounded-full text-xs font-bold text-slate-500 flex items-center justify-center shrink-0">
                    {item.quantity}
                  </span>
                  <span className="text-slate-700 truncate">{item.name}</span>
                </div>
                <span className="font-semibold text-slate-800 shrink-0 ml-2">
                  {formatCurrency(item.total, currency)}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
            <span className="font-bold text-slate-800">Total</span>
            <span className="font-black text-brand-600 text-lg">{formatCurrency(order.total, currency)}</span>
          </div>
        </div>

        {/* Instructions paiement */}
        <div className={`rounded-2xl border p-5 space-y-2 ${
          order.notes?.includes('lien_paiement')
            ? 'bg-emerald-50 border-emerald-200'
            : order.notes?.includes('mobile_money')
            ? 'bg-blue-50 border-blue-200'
            : 'bg-green-50 border-green-200'
        }`}>
          <div className="flex items-center gap-2">
            {order.notes?.includes('lien_paiement') ? (
              <MessageCircle className="w-5 h-5 text-emerald-600" />
            ) : order.notes?.includes('mobile_money') ? (
              <CreditCard className="w-5 h-5 text-blue-600" />
            ) : (
              <Banknote className="w-5 h-5 text-green-600" />
            )}
            <p className="font-semibold text-sm text-slate-800">
              {order.notes?.includes('lien_paiement')
                ? 'Lien de paiement en route'
                : order.notes?.includes('mobile_money')
                ? 'Paiement Mobile Money'
                : isDelivery ? 'Paiement à la livraison' : 'Paiement sur place'}
            </p>
          </div>
          <p className="text-sm text-slate-600">
            {order.notes?.includes('lien_paiement')
              ? 'Vous recevrez un lien de paiement sécurisé sur votre numéro WhatsApp très prochainement.'
              : order.notes?.includes('mobile_money')
              ? isDelivery
                ? 'Préparez votre Mobile Money (Wave, Orange Money…) pour régler à la livraison.'
                : 'Préparez votre Mobile Money (Wave, Orange Money…) pour régler en boutique.'
              : isDelivery
              ? 'Préparez le montant exact en espèces pour régler à la remise de votre commande.'
              : 'Rendez-vous en boutique et réglez en espèces lors du retrait.'}
          </p>
        </div>

        {/* Contact business */}
        {info?.phone && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-slate-800 text-sm">Une question ?</p>
              <p className="text-xs text-content-secondary mt-0.5">Contactez {info.name} directement</p>
            </div>
            <a
              href={`https://wa.me/${info.phone.replace(/[^0-9]/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shrink-0"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </a>
          </div>
        )}

        {/* Retour boutique */}
        <a
          href={`/boutique/${businessId}`}
          className="block w-full text-center py-3.5 rounded-xl border-2 border-slate-200 text-slate-600 font-semibold text-sm hover:border-brand-400 hover:text-brand-600 transition-colors"
        >
          ← Retour à la boutique
        </a>

        <p className="text-center text-xs text-slate-300 pb-4">
          Commande #{shortId} · {new Date(order.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      </main>
    </div>
  );
}

