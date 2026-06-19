'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Wrench, Plus, Link2, Check, Package2, History, AlertCircle, Settings2, MessageCircle } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useCan } from '@/hooks/usePermission';
import { useCashSessionStore } from '@/store/cashSession';
import { cn } from '@/lib/utils';
import {
  type ServiceOrder,
  type ServiceOrderStatus,
  getServiceOrderById,
  getStaleOrderCount,
  getUnpaidTerminatedCount,
} from '@services/supabase/service-orders';

import { generateServiceOrderReceipt, printHtml } from '@/lib/invoice-templates';
import { buildPublicBusinessRef } from '@services/supabase/public-business-ref';
import { updateBusiness } from '@services/supabase/business';
import { buildLoyaltyForReceipt } from '@/lib/loyalty-print';

// Components
import { ServiceOrdersTab } from './components/ServiceOrdersTab';
import { CatalogTab } from './components/CatalogTab';
import { SubjectsTab } from './components/SubjectsTab';
import { CampaignsTab } from './components/CampaignsTab';
import { NewServiceOrderModal } from './components/NewServiceOrderModal';
import { OrderDetailPanel } from './components/OrderDetailPanel';

// Hooks
import { useServiceCatalog } from './hooks/useServiceCatalog';

type PageTab = 'orders' | 'catalog' | 'subjects' | 'campagnes';

const VALID_STATUSES = new Set(['attente', 'en_cours', 'termine', 'paye', 'annule']);

export default function ServicesPage() {
  const { business, setBusiness } = useAuthStore();
  const { session: cashSession } = useCashSessionStore();
  const can = useCan();
  const { success, error: notifError } = useNotificationStore();
  const searchParams = useSearchParams();
  const statusParam = searchParams.get('status');
  const initialStatus: ServiceOrderStatus | 'all' =
    statusParam && VALID_STATUSES.has(statusParam)
      ? (statusParam as ServiceOrderStatus)
      : 'all';
  
  const currency = business?.currency ?? 'XOF';
  const businessId = business?.id ?? '';

  const [tab, setTab] = useState<PageTab>('orders');
  const [showNewOT, setShowNewOT] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [copied, setCopied] = useState(false);
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);
  const [staleCount, setStaleCount] = useState(0);
  const [unpaidTerminatedCount, setUnpaidTerminatedCount] = useState(0);
  const [staleDays, setStaleDays] = useState<number>(() =>
    Math.max(1, business?.brand_config?.stale_ot_days ?? 3),
  );
  const [showStaleCfg, setShowStaleCfg] = useState(false);
  const cfgRef = useRef<HTMLDivElement>(null);

  // Sync when another session updates brand_config via realtime
  useEffect(() => {
    const days = business?.brand_config?.stale_ot_days;
    if (days) setStaleDays(Math.max(1, days));
  }, [business?.brand_config?.stale_ot_days]);

  useEffect(() => {
    if (!businessId) return;
    getStaleOrderCount(businessId, staleDays).then(setStaleCount).catch(() => {});
    getUnpaidTerminatedCount(businessId).then(setUnpaidTerminatedCount).catch(() => {});
  }, [businessId, refreshTrigger, staleDays]);

  useEffect(() => {
    if (!showStaleCfg) return;
    function onOutsideClick(e: MouseEvent) {
      if (cfgRef.current && !cfgRef.current.contains(e.target as Node)) setShowStaleCfg(false);
    }
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, [showStaleCfg]);

  async function handleStaleDaysChange(val: number) {
    const days = Math.max(1, Math.min(30, val || 1));
    setStaleDays(days);
    if (!business || !businessId) return;
    const brand_config = { ...(business.brand_config ?? {}), stale_ot_days: days };
    setBusiness({ ...business, brand_config });
    await updateBusiness(businessId, { brand_config }).catch(() => {});
  }

  // We load catalog here because it's needed by multiple components (New OT, Order Detail)
  const { catalog } = useServiceCatalog(businessId);

  const canShareOrder = can('share_service_order');
  const canCreateOrder = can('create_service_order');

  async function copyPublicLink() {
    if (!business) return;
    const ref = buildPublicBusinessRef(business.name, business.public_slug);
    const url = `${window.location.origin}/services/${ref}`;
    try {
      await navigator.clipboard.writeText(url);
      success('Lien public copié !');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notifError('Impossible de copier le lien public');
    }
  }

  async function handlePrintOrder(o: ServiceOrder, e: React.MouseEvent) {
    e.stopPropagation();
    if (!canShareOrder) return;
    if (!business) return;

    setPrintingOrderId(o.id);
    try {
      const full = await getServiceOrderById(o.id).catch(() => o);
      const order = full ?? o;
      const loyalty = await buildLoyaltyForReceipt(order.business_id, order.client_name, order.total, order.status);
      printHtml(generateServiceOrderReceipt({
        id: order.id, order_number: order.order_number, created_at: order.created_at,
        started_at: order.started_at, finished_at: order.finished_at, paid_at: order.paid_at,
        subject_ref: order.subject_ref,
        subject_info: order.subject_info ?? undefined,
        client_name: order.client_name, client_phone: order.client_phone,
        assigned_name: order.assigned_name,
        status: order.status, notes: order.notes,
        items: (order.items ?? []).map(i => ({ name: i.name, price: i.price, quantity: i.quantity, total: i.total })),
        total: order.total, paid_amount: order.paid_amount, payment_method: order.payment_method,
        payments: order.payments?.map(p => ({ amount: p.amount, method: p.method, paid_at: p.paid_at })),
        loyalty,
      }, business as any));
    } finally {
      setPrintingOrderId(null);
    }
  }

  async function refreshOrdersAndSelection() {
    setRefreshTrigger(prev => prev + 1);
    if (!selectedOrder) return;
    try {
      const fresh = await getServiceOrderById(selectedOrder.id);
      if (fresh) setSelectedOrder(fresh);
    } catch {
      notifError('Impossible de rafraîchir le détail de cet OT');
    }
  }

  if (!can('view_services')) {
    return (
      <div className="flex h-full items-center justify-center bg-surface p-6">
        <div className="max-w-sm text-center">
          <Wrench className="mx-auto mb-3 h-10 w-10 text-content-secondary opacity-40" />
          <h1 className="text-lg font-bold text-content-primary">Accès refusé</h1>
          <p className="mt-1 text-sm text-content-secondary">Vous n'avez pas la permission d'ouvrir les prestations de service.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Header */}
      <div className="flex flex-col gap-2 px-4 py-2 bg-surface-card border-b border-surface-border shrink-0 sm:flex-row sm:items-center sm:justify-between md:px-4">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-brand-500/20 flex items-center justify-center">
            <Wrench className="w-4 h-4 text-content-brand" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-content-primary">Prestations de service</h1>
            <p className="text-xs text-content-secondary">Gérez vos ordres de travail et votre catalogue</p>
          </div>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {canShareOrder && (
            <button onClick={copyPublicLink}
              className={cn('flex flex-1 items-center justify-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors sm:flex-none',
                copied
                  ? 'border-status-success text-status-success bg-badge-success'
                  : 'border-surface-border text-content-secondary hover:bg-surface-hover')}>
              {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
              {copied ? 'Copié !' : 'Partager'}
            </button>
          )}
          {canCreateOrder && (
            <div className="flex items-center gap-1 flex-1 sm:flex-none">
              <button
                onClick={() => { if (!staleCount && !unpaidTerminatedCount) setShowNewOT(true); }}
                disabled={staleCount > 0 || unpaidTerminatedCount > 0}
                title={staleCount > 0 ? `${staleCount} OT en cours depuis +${staleDays} j — clôturez-les avant d'en créer un nouveau` : unpaidTerminatedCount > 0 ? `${unpaidTerminatedCount} OT terminé(s) non encaissé(s) — payez-les avant d'en créer un nouveau` : undefined}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition-colors',
                  staleCount > 0 || unpaidTerminatedCount > 0
                    ? 'bg-status-warning/20 text-status-warning border border-status-warning/40 cursor-not-allowed'
                    : 'bg-brand-500 hover:bg-brand-600 text-white',
                )}
              >
                <Plus className="w-4 h-4" />Nouvel OT
                {(staleCount > 0 || unpaidTerminatedCount > 0) && <span className="ml-1 rounded-full bg-status-warning text-white text-[10px] font-bold px-1.5 py-0.5">{staleCount + unpaidTerminatedCount}</span>}
              </button>
              {/* Gear to configure the stale-days threshold */}
              <div ref={cfgRef} className="relative shrink-0">
                <button
                  onClick={() => setShowStaleCfg(v => !v)}
                  className="p-2 rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-hover"
                  title="Configurer le seuil"
                >
                  <Settings2 className="w-4 h-4" />
                </button>
                {showStaleCfg && (
                  <div className="absolute right-0 top-full mt-1 z-30 w-60 rounded-xl border border-surface-border bg-surface-card shadow-lg p-3">
                    <p className="text-xs font-semibold text-content-primary mb-1">Seuil de blocage</p>
                    <p className="text-xs text-content-muted mb-2">Bloquer si un OT « en cours » n'est pas mis à jour depuis :</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={staleDays}
                        onChange={e => handleStaleDaysChange(parseInt(e.target.value, 10))}
                        className="input w-20 text-center"
                      />
                      <span className="text-sm text-content-secondary">jours</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {!cashSession && (
        <div className="bg-status-error/10 border-b border-status-error/20 px-4 py-2 flex items-center justify-center gap-2 text-status-error text-xs font-medium shrink-0">
          <AlertCircle className="w-4 h-4" />
          Attention : Aucune session de caisse n'est ouverte. L'encaissement sera impossible.
          <Link href="/caisse" className="underline ml-2">Ouvrir la caisse</Link>
        </div>
      )}
      {staleCount > 0 && (
        <div className="bg-status-warning/10 border-b border-status-warning/30 px-4 py-2 flex items-center gap-2 text-status-warning text-xs font-medium shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            <strong>{staleCount} OT « en cours »</strong> n'ont pas été mis à jour depuis plus de {staleDays} jours.
            Clôturez-les avant de créer un nouvel OT.
          </span>
        </div>
      )}
      {unpaidTerminatedCount > 0 && (
        <div className="bg-status-warning/10 border-b border-status-warning/30 px-4 py-2 flex items-center gap-2 text-status-warning text-xs font-medium shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            <strong>{unpaidTerminatedCount} OT « terminé »</strong> non encaissé{unpaidTerminatedCount > 1 ? 's' : ''}.
            Payez-les avant de créer un nouvel OT.
          </span>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-1 overflow-x-auto px-4 py-1 bg-surface-card border-b border-surface-border shrink-0 md:px-4">
        {([
          { key: 'orders',    icon: Wrench,          label: 'Ordres de travail', short: 'OT',         desc: 'Créer & suivre les bons de prestation' },
          { key: 'catalog',  icon: Package2,         label: 'Catalogue',          short: 'Catalogue',  desc: 'Prestations types & tarifs' },
          { key: 'subjects', icon: History,          label: 'Historique',         short: 'Historique', desc: 'Par véhicule, appareil ou client' },
          { key: 'campagnes',icon: MessageCircle,    label: 'Campagnes WA',       short: 'WhatsApp',   desc: 'Composer & envoyer des messages clients' },
        ] as const).map(({ key, icon: Icon, label, short, desc }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('flex items-start gap-2 px-3 py-2 rounded-xl text-left transition-colors min-w-0 flex-shrink-0', tab === key
              ? 'bg-brand-500/20 text-content-brand border border-brand-500/50'
              : 'text-content-secondary hover:text-content-primary hover:bg-surface-hover')}>
            <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold leading-tight">
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{label}</span>
              </p>
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
            onSelectOrder={async (order) => {
              try {
                const full = await getServiceOrderById(order.id);
                setSelectedOrder(full ?? order);
              } catch {
                setSelectedOrder(order);
              }
            }}
            onNewOrder={() => { if (!staleCount && !unpaidTerminatedCount) setShowNewOT(true); }}
            onPrintOrder={handlePrintOrder}
            printingOrderId={printingOrderId}
            refreshTrigger={refreshTrigger}
            initialStatus={initialStatus}
            onStatusChange={() => setRefreshTrigger(prev => prev + 1)}
          />
        )}

        {tab === 'catalog' && (
          <CatalogTab
            businessId={businessId}
            currency={currency}
          />
        )}

        {tab === 'subjects' && (
          <div className="flex-1 overflow-hidden p-4">
             <SubjectsTab businessId={businessId} currency={currency} />
          </div>
        )}

        {tab === 'campagnes' && (
          <CampaignsTab businessId={businessId} />
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
          onRefresh={refreshOrdersAndSelection}
        />
      )}
    </div>
  );
}
