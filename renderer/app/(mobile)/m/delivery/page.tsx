'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { getOrdersForDelivery, confirmOrderDelivery } from '@services/supabase/orders';
import { MapPin, Phone, CheckCircle2, Navigation, Loader2, RefreshCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Order } from '@pos-types';

export default function DeliveryPage() {
  const { business, user } = useAuthStore();
  const [deliveries, setDeliveries] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchDeliveries = async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      const data = await getOrdersForDelivery(business.id);
      setDeliveries(data);
    } catch (err) {
      console.error('Failed to fetch deliveries:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliveries();
  }, [business?.id]);

  const handleValidate = async (orderId: string) => {
    if (!user?.id) return;
    if (!confirm('Voulez-vous confirmer la livraison de cette commande ?')) return;
    
    setProcessing(orderId);
    try {
      await confirmOrderDelivery(orderId, user.id);
      await fetchDeliveries();
    } catch (err) {
      console.error('Failed to confirm delivery:', err);
    } finally {
      setProcessing(null);
    }
  };

  const openInMaps = (address: string) => {
    const encoded = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/search/?api=1&query=${encoded}`, '_blank');
  };

  if (loading && deliveries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
        <p className="text-xs font-bold text-content-muted uppercase tracking-widest">Chargement des courses...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-black text-content-primary">Livraisons</h2>
          <p className="text-xs font-bold text-content-muted uppercase tracking-widest">
            {deliveries.length} courses en attente
          </p>
        </div>
        <button 
          onClick={fetchDeliveries}
          className="p-2 rounded-xl bg-surface-card border border-surface-border text-content-muted active:rotate-180 transition-transform"
        >
          <RefreshCcw className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-4">
        {deliveries.length === 0 ? (
          <div className="py-20 text-center space-y-4 bg-surface-card rounded-3xl border border-dashed border-surface-border">
            <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-content-muted opacity-20" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-content-primary">Tout est livré !</p>
              <p className="text-xs text-content-muted">Aucune course en attente pour le moment.</p>
            </div>
          </div>
        ) : (
          deliveries.map((delivery) => (
            <div key={delivery.id} className="bg-surface-card rounded-2xl border border-surface-border shadow-sm overflow-hidden active:scale-[0.98] transition-transform">
              <div className="p-4 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1 min-w-0">
                    <p className="text-sm font-black text-content-primary truncate">
                      {delivery.customer_name || 'Client Anonyme'}
                    </p>
                    <div className="flex items-start gap-1.5 text-content-muted">
                      <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <p className="text-xs font-medium line-clamp-2 italic">
                        {delivery.notes || 'Adresse non spécifiée'}
                      </p>
                    </div>
                  </div>
                  <div className={cn(
                    "px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border shrink-0 ml-2",
                    delivery.delivery_status === 'picking' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                    "bg-amber-500/10 text-amber-500 border-amber-500/20"
                  )}>
                    {delivery.delivery_status === 'picking' ? 'En picking' : 'À livrer'}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-surface-border/50">
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-content-muted">Montant</p>
                    <p className="text-base font-black text-content-primary">
                      {delivery.total.toLocaleString()} <span className="text-[10px] opacity-60">FCFA</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {delivery.customer_phone && (
                      <a 
                        href={`tel:${delivery.customer_phone}`}
                        className="p-3 rounded-xl bg-surface-hover text-content-secondary active:scale-90 transition-all"
                      >
                        <Phone className="w-4 h-4" />
                      </a>
                    )}
                    {delivery.notes && (
                      <button 
                        onClick={() => openInMaps(delivery.notes!)}
                        className="p-3 rounded-xl bg-surface-hover text-content-secondary active:scale-90 transition-all"
                      >
                        <Navigation className="w-4 h-4" />
                      </button>
                    )}
                    <button 
                      onClick={() => handleValidate(delivery.id)}
                      disabled={processing === delivery.id}
                      className="flex items-center gap-2 px-5 py-3 rounded-xl bg-brand-500 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-brand-500/20 disabled:opacity-50 active:scale-95 transition-all"
                    >
                      {processing === delivery.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      Livré
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
