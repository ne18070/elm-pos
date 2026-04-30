'use client';

import React, { useState } from 'react';
import { Wrench, Plus, Share2, Package2, History } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useCan } from '@/hooks/usePermission';
import { cn } from '@/lib/utils';
import { 
  type ServiceOrder, 
  type ServiceCatalogItem,
} from '@services/supabase/service-orders';
import { generateServiceOrderReceipt, printHtml } from '@/lib/invoice-templates';
import { buildPublicBusinessRef } from '@services/supabase/public-business-ref';

// Components
import { ServiceOrdersTab } from './components/ServiceOrdersTab';
import { CatalogTab } from './components/CatalogTab';
import { SubjectsTab } from './components/SubjectsTab';
import { NewServiceOrderModal } from './components/NewServiceOrderModal';
import { OrderDetailPanel } from './components/OrderDetailPanel';

// Hooks
import { useServiceCatalog } from './hooks/useServiceCatalog';

type PageTab = 'orders' | 'catalog' | 'subjects';

export default function ServicesPage() {
  const { business } = useAuthStore();
  const can = useCan();
  const { success } = useNotificationStore();
  
  const currency = business?.currency ?? 'XOF';
  const businessId = business?.id ?? '';

  const [tab, setTab] = useState<PageTab>('orders');
  const [showNewOT, setShowNewOT] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // We load catalog here because it's needed by multiple components (New OT, Order Detail)
  const { catalog, refresh: refreshCatalog } = useServiceCatalog(businessId);

  const canViewServices = can('view_services');
  const canCreateOrder = can('create_service_order');
  const canShareOrder = can('share_service_order');
  const canManageCatalog = can('manage_service_catalog');

  function copyPublicLink() {
    if (!business) return;
    const ref = buildPublicBusinessRef(business.name, business.public_slug);
    const url = `${window.location.origin}/services/${ref}`;
    navigator.clipboard.writeText(url);
    success('Lien public copié !');
  }

  function handlePrintOrder(o: ServiceOrder, e: React.MouseEvent) {
    e.stopPropagation();
    if (!canShareOrder) return;
    if (!business) return;
    printHtml(generateServiceOrderReceipt({
      id: o.id, order_number: o.order_number, created_at: o.created_at,
      started_at: o.started_at, finished_at: o.finished_at, paid_at: o.paid_at,
      subject_ref: o.subject_ref,
      subject_info: o.subject_info ?? undefined,
      client_name: o.client_name, client_phone: o.client_phone,
      assigned_name: o.assigned_name,
      status: o.status, notes: o.notes,
      items: (o.items ?? []).map(i => ({ name: i.name, price: i.price, quantity: i.quantity, total: i.total })),
      total: o.total, paid_amount: o.paid_amount, payment_method: o.payment_method,
    }, business as any));
  }

  if (!canViewServices) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-base p-6">
        <div className="max-w-sm text-center">
          <Wrench className="mx-auto mb-3 h-10 w-10 text-content-secondary opacity-40" />
          <h1 className="text-lg font-bold text-content-primary">Accès refusé</h1>
          <p className="mt-1 text-sm text-content-secondary">Vous n'avez pas la permission d'ouvrir les prestations de service.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface-base">
      {/* Header */}
      <div className="flex flex-col gap-3 px-4 py-4 bg-surface-card border-b border-surface-border shrink-0 sm:flex-row sm:items-center sm:justify-between md:px-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-content-brand" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-content-primary">Prestations de service</h1>
            <p className="text-xs text-content-secondary">Gérez vos ordres de travail et votre catalogue</p>
          </div>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {canShareOrder && (
            <button onClick={copyPublicLink}
              className="flex flex-1 items-center justify-center gap-2 px-3 py-2 rounded-xl border border-surface-border text-content-secondary text-sm font-medium hover:bg-surface-hover sm:flex-none">
              <Share2 className="w-4 h-4" />Partager
            </button>
          )}
          {canCreateOrder && (
            <button onClick={() => setShowNewOT(true)}
              className="flex flex-1 items-center justify-center gap-2 px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold shadow-sm sm:flex-none">
              <Plus className="w-4 h-4" />Nouvel OT
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 overflow-x-auto px-4 py-2 bg-surface-card border-b border-surface-border shrink-0 md:px-6">
        {([
          { key: 'orders',   icon: Wrench,     label: 'Ordres de travail', desc: 'Créer & suivre les bons de prestation' },
          { key: 'catalog',  icon: Package2,   label: 'Catalogue',         desc: 'Prestations types & tarifs' },
          { key: 'subjects', icon: History,    label: 'Historique',        desc: 'Par véhicule, appareil ou client' },
        ] as const).map(({ key, icon: Icon, label, desc }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('flex items-start gap-2.5 px-4 py-2.5 rounded-xl text-left transition-colors min-w-0 flex-shrink-0', tab === key
              ? 'bg-brand-500/15 text-content-brand border border-brand-500/30'
              : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover')}>
            <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold leading-tight">{label}</p>
              <p className="text-xs opacity-70 leading-tight mt-0.5 hidden sm:block">{desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === 'orders' && (
          <ServiceOrdersTab
            businessId={businessId}
            currency={currency}
            canCreateOrder={canCreateOrder}
            canUpdateStatus={can('update_service_status')}
            canCollectPayment={can('collect_service_payment')}
            canShareOrder={canShareOrder}
            onSelectOrder={setSelectedOrder}
            onNewOrder={() => setShowNewOT(true)}
            onPrintOrder={handlePrintOrder}
            refreshTrigger={refreshTrigger}
          />
        )}

        {tab === 'catalog' && (
          <CatalogTab
            businessId={businessId}
            canManageCatalog={canManageCatalog}
            currency={currency}
          />
        )}

        {tab === 'subjects' && (
          <div className="flex-1 overflow-hidden p-6">
             <SubjectsTab businessId={businessId} currency={currency} />
          </div>
        )}
      </div>

      {/* Modals & Panels */}
      {showNewOT && (
        <NewServiceOrderModal
          businessId={businessId}
          catalog={catalog}
          onClose={() => setShowNewOT(false)}
          onCreated={(order) => {
            setShowNewOT(false);
            setRefreshTrigger(prev => prev + 1);
            setSelectedOrder(order);
          }}
        />
      )}

      {selectedOrder && (
        <OrderDetailPanel
          order={selectedOrder}
          currency={currency}
          catalog={catalog}
          businessId={businessId}
          onClose={() => setSelectedOrder(null)}
          onRefresh={() => setRefreshTrigger(prev => prev + 1)}
        />
      )}
    </div>
  );
}
