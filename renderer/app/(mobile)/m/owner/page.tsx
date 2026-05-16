'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { useLowStockAlerts } from '@/hooks/useLowStockAlerts';
import { getDailySales } from '@services/supabase/analytics';
import { getOrders } from '@services/supabase/orders';
import { supabase } from '@/lib/supabase';
import {
  TrendingUp, Users, ShoppingBag, AlertCircle, Loader2, ArrowRight, Clock,
  Wrench, Scale, Car, FileSignature, Receipt,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import Link from 'next/link';
import type { Order } from '@pos-types';
import { getBusinessKind } from '@/lib/business-kind';
import { getServiceOrders } from '@services/supabase/service-orders';
import { getDossiers } from '@services/supabase/dossiers';
import { getContracts } from '@services/supabase/contracts';

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color, bg, loading }: {
  label: string; value: string; icon: React.ElementType;
  color: string; bg: string; loading: boolean;
}) {
  return (
    <div className="bg-surface-card p-4 rounded-2xl border border-surface-border shadow-sm space-y-3">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', bg)}>
        <Icon className={cn('w-5 h-5', color)} />
      </div>
      <div className="space-y-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-content-muted">{label}</p>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-content-muted" />
        ) : (
          <p className="text-lg font-black text-content-primary">{value}</p>
        )}
      </div>
    </div>
  );
}

// ─── Quick action link ────────────────────────────────────────────────────────

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex items-center justify-between p-4 bg-surface-card rounded-2xl border border-surface-border group active:scale-95 transition-all">
      <span className="text-xs font-bold">{label}</span>
      <ArrowRight className="w-4 h-4 text-content-muted group-hover:text-brand-500 transition-colors" />
    </Link>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function OwnerDashboard() {
  const { business, user } = useAuthStore();
  const kind = getBusinessKind(business);
  const { count: lowStockCount, loading: loadingStock } = useLowStockAlerts(business?.id ?? '');

  // Retail / commun
  const [dailySales, setDailySales]     = useState({ total: 0, count: 0 });
  const [clientCount, setClientCount]   = useState<number | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loadingSales, setLoadingSales]   = useState(true);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingOrders, setLoadingOrders]   = useState(true);

  // Service
  const [serviceActive, setServiceActive]   = useState<number | null>(null);
  const [loadingService, setLoadingService] = useState(false);

  // Juridique
  const [dossierCount, setDossierCount]   = useState<number | null>(null);
  const [loadingDossier, setLoadingDossier] = useState(false);

  // Location
  const [contratsCount, setContratsCount]   = useState<number | null>(null);
  const [loadingContrats, setLoadingContrats] = useState(false);

  useEffect(() => {
    if (!business?.id) return;
    const today = format(new Date(), 'yyyy-MM-dd');

    // Always load sales + clients
    getDailySales(business.id, today)
      .then(setDailySales)
      .finally(() => setLoadingSales(false));

    (supabase as any)
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', business.id)
      .then(({ count }: { count: number }) => setClientCount(count))
      .finally(() => setLoadingClients(false));

    // Recent orders for boutique/restaurant/autre
    if (kind === 'boutique' || kind === 'restaurant' || kind === 'autre') {
      getOrders(business.id, { limit: 5 })
        .then(({ orders }) => setRecentOrders(orders))
        .finally(() => setLoadingOrders(false));
    } else {
      setLoadingOrders(false);
    }

    // Service: orders actifs
    if (kind === 'service') {
      setLoadingService(true);
      getServiceOrders(business.id, { pageSize: 200 })
        .then(({ data }) => setServiceActive(
          data.filter(o => o.status === 'attente' || o.status === 'en_cours' || o.status === 'pause').length
        ))
        .finally(() => setLoadingService(false));
    }

    // Juridique: dossiers actifs
    if (kind === 'juridique') {
      setLoadingDossier(true);
      getDossiers(business.id)
        .then(d => setDossierCount(d.filter(x => x.status !== 'clos').length))
        .finally(() => setLoadingDossier(false));
    }

    // Location: contrats actifs
    if (kind === 'location') {
      setLoadingContrats(true);
      getContracts(business.id)
        .then(c => setContratsCount(c.filter(x => x.status === 'active' || x.status === 'signed').length))
        .finally(() => setLoadingContrats(false));
    }
  }, [business?.id, kind]);

  // ── KPI cards per type ────────────────────────────────────────────────────

  const stats = (() => {
    switch (kind) {
      case 'restaurant':
        return [
          { label: 'CA du jour',   value: `${dailySales.total.toLocaleString()} FCFA`, icon: TrendingUp,  color: 'text-green-500', bg: 'bg-green-500/10',  loading: loadingSales },
          { label: 'Commandes',    value: dailySales.count.toString(),                  icon: ShoppingBag, color: 'text-brand-500', bg: 'bg-brand-500/10',  loading: loadingSales },
          { label: 'Base Clients', value: clientCount?.toString() ?? '0',              icon: Users,       color: 'text-blue-500',  bg: 'bg-blue-500/10',   loading: loadingClients },
          { label: 'Ruptures',     value: lowStockCount.toString(),                    icon: AlertCircle, color: 'text-red-500',   bg: 'bg-red-500/10',    loading: loadingStock },
        ];

      case 'service':
        return [
          { label: 'CA du jour',        value: `${dailySales.total.toLocaleString()} FCFA`, icon: TrendingUp,  color: 'text-green-500',  bg: 'bg-green-500/10',  loading: loadingSales },
          { label: 'Ordres actifs',     value: serviceActive?.toString() ?? '—',            icon: Wrench,      color: 'text-brand-500',  bg: 'bg-brand-500/10',  loading: loadingService },
          { label: 'Base Clients',      value: clientCount?.toString() ?? '0',             icon: Users,       color: 'text-blue-500',   bg: 'bg-blue-500/10',   loading: loadingClients },
          { label: 'Commandes du jour', value: dailySales.count.toString(),                icon: ShoppingBag, color: 'text-purple-500', bg: 'bg-purple-500/10', loading: loadingSales },
        ];

      case 'juridique':
        return [
          { label: 'CA du mois',       value: `${dailySales.total.toLocaleString()} FCFA`, icon: Receipt,     color: 'text-green-500',  bg: 'bg-green-500/10',  loading: loadingSales },
          { label: 'Dossiers actifs',  value: dossierCount?.toString() ?? '—',             icon: Scale,       color: 'text-brand-500',  bg: 'bg-brand-500/10',  loading: loadingDossier },
          { label: 'Base Clients',     value: clientCount?.toString() ?? '0',              icon: Users,       color: 'text-blue-500',   bg: 'bg-blue-500/10',   loading: loadingClients },
          { label: 'Factures du jour', value: dailySales.count.toString(),                 icon: ShoppingBag, color: 'text-purple-500', bg: 'bg-purple-500/10', loading: loadingSales },
        ];

      case 'location':
        return [
          { label: 'CA du jour',        value: `${dailySales.total.toLocaleString()} FCFA`, icon: TrendingUp,    color: 'text-green-500',  bg: 'bg-green-500/10',  loading: loadingSales },
          { label: 'Contrats actifs',   value: contratsCount?.toString() ?? '—',            icon: FileSignature, color: 'text-brand-500',  bg: 'bg-brand-500/10',  loading: loadingContrats },
          { label: 'Base Clients',      value: clientCount?.toString() ?? '0',              icon: Users,         color: 'text-blue-500',   bg: 'bg-blue-500/10',   loading: loadingClients },
          { label: 'Locations du jour', value: dailySales.count.toString(),                 icon: Car,           color: 'text-orange-500', bg: 'bg-orange-500/10', loading: loadingSales },
        ];

      default: // boutique + autre
        return [
          { label: 'Ventes du jour', value: `${dailySales.total.toLocaleString()} FCFA`, icon: TrendingUp,  color: 'text-green-500', bg: 'bg-green-500/10', loading: loadingSales },
          { label: 'Commandes',      value: dailySales.count.toString(),                  icon: ShoppingBag, color: 'text-brand-500', bg: 'bg-brand-500/10', loading: loadingSales },
          { label: 'Base Clients',   value: clientCount?.toString() ?? '0',               icon: Users,       color: 'text-blue-500',  bg: 'bg-blue-500/10',  loading: loadingClients },
          { label: 'Ruptures stock', value: lowStockCount.toString(),                     icon: AlertCircle, color: 'text-red-500',   bg: 'bg-red-500/10',   loading: loadingStock },
        ];
    }
  })();

  // ── Quick actions per type ────────────────────────────────────────────────

  const quickLinks = (() => {
    switch (kind) {
      case 'boutique':   return [{ href: '/m/delivery', label: 'Livraisons' }, { href: '/m/inventory', label: 'Inventaire' }];
      case 'restaurant': return [{ href: '/m/orders',   label: 'Commandes'  }, { href: '/m/delivery',  label: 'Livraisons'  }];
      case 'location':   return [{ href: '/m/contrats', label: 'Contrats'   }, { href: '/m/vehicles',  label: 'Véhicules'   }];
      case 'service':    return [{ href: '/m/services', label: 'Prestations'}, { href: '/m/clients',   label: 'Clients'     }];
      case 'juridique':  return [{ href: '/m/dossiers', label: 'Dossiers'   }, { href: '/m/clients',   label: 'Clients'     }];
      case 'autre':      return [{ href: '/m/orders',   label: 'Commandes'  }, { href: '/m/clients',   label: 'Clients'     }];
    }
  })();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-black text-content-primary">
          Bonjour, {user?.full_name?.split(' ')[0]} 👋
        </h2>
        <p className="text-xs font-bold text-content-muted uppercase tracking-widest">
          {format(new Date(), 'eeee d MMMM yyyy', { locale: fr })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {stats.map(s => <StatCard key={s.label} {...s} />)}
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-content-muted">Actions rapides</h3>
        <div className="grid grid-cols-2 gap-3">
          {quickLinks.map(l => <QuickLink key={l.href} {...l} />)}
        </div>
      </div>

      {/* Recent orders — boutique / restaurant / autre */}
      {(kind === 'boutique' || kind === 'restaurant' || kind === 'autre') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-widest text-content-muted">Dernières commandes</h3>
            <Clock className="w-4 h-4 text-content-muted" />
          </div>
          <div className="space-y-2">
            {loadingOrders ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
              </div>
            ) : recentOrders.length === 0 ? (
              <p className="text-center py-6 text-xs font-bold text-content-muted uppercase">Aucune commande récente</p>
            ) : (
              recentOrders.map(order => (
                <div key={order.id} className="bg-surface-card p-3 rounded-xl border border-surface-border flex items-center gap-3 active:bg-surface-hover transition-colors">
                  <div className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center text-xs font-black text-brand-500">
                    {order.customer_name?.charAt(0) || '#'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">#{order.id.slice(0, 8)}</p>
                    <p className="text-[10px] text-content-muted font-medium">
                      {formatDistanceToNow(new Date(order.created_at), { addSuffix: true, locale: fr })}
                    </p>
                  </div>
                  <p className="text-sm font-black text-content-primary">
                    {order.total.toLocaleString()} <span className="text-[9px] opacity-50">FCFA</span>
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
