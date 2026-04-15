'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutGrid, List, ShoppingCart, X } from 'lucide-react';
import type { WholesaleContext } from '@/components/pos/WholesaleSelector';
import type { SelectedClient } from '@/components/pos/OrderPanel';
import { ProductGrid } from '@/components/pos/ProductGrid';
import { OrderPanel } from '@/components/pos/OrderPanel';
import { PaymentModal } from '@/components/pos/PaymentModal';
import { CategoryBar } from '@/components/pos/CategoryBar';
import { BarcodeListener } from '@/components/pos/BarcodeListener';
import { HeldOrdersDrawer } from '@/components/pos/HeldOrdersDrawer';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import { OnboardingChecklist } from '@/components/shared/OnboardingChecklist';
import { useCartStore } from '@/store/cart';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useCustomerDisplay } from '@/hooks/useCustomerDisplay';
import { getProductByBarcode } from '@services/supabase/products';
import type { Product } from '@pos-types';

type ViewMode = 'grid' | 'list';
type MobileTab = 'catalog' | 'cart';

export default function PosPage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery]            = useState('');
  const [paymentOpen, setPaymentOpen]            = useState(false);
  const [view, setView]                          = useState<ViewMode>('list');
  const [heldDrawerOpen, setHeldDrawerOpen]      = useState(false);
  const [wholesaleCtx, setWholesaleCtx]          = useState<WholesaleContext | null>(null);
  const [selectedClient, setSelectedClient]      = useState<SelectedClient | null>(null);
  const [mobileTab, setMobileTab]                = useState<MobileTab>('catalog');

  const searchInputRef = useRef<HTMLInputElement>(null);

  const addItem   = useCartStore((s) => s.addItem);
  const cartItems = useCartStore((s) => s.items);
  const cartCount = cartItems.reduce((n, i) => n + i.quantity, 0);
  const { business } = useAuthStore();
  const router = useRouter();

  // Auto-collapse sidebar on POS page to maximize space
  useEffect(() => {
    const isCollapsed = localStorage.getItem('elm-pos-sidebar-collapsed') === 'true';
    if (!isCollapsed) {
      // Small delay to let the page settle
      const t = setTimeout(() => {
        const btn = document.querySelector('button[title="Réduire"]') as HTMLButtonElement;
        btn?.click();
      }, 500);
      return () => clearTimeout(t);
    }
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F1 or / : Focus search
      if (e.key === 'F1' || (e.key === '/' && document.activeElement?.tagName !== 'INPUT')) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // F12 or Space (if not in input) : Checkout
      if ((e.key === 'F12' || (e.key === ' ' && document.activeElement?.tagName !== 'INPUT')) && cartItems.length > 0 && !paymentOpen) {
        e.preventDefault();
        setPaymentOpen(true);
      }
      // Esc : Clear search or close modals
      if (e.key === 'Escape') {
        if (searchQuery) {
          setSearchQuery('');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cartItems.length, paymentOpen, searchQuery]);

  // Les hôtels sans POS activé sont redirigés vers /hotel
  useEffect(() => {
    if (business?.type === 'hotel' && !(business?.features ?? []).includes('pos')) {
      router.replace('/hotel');
    }
  }, [business, router]);
  const { warning } = useNotificationStore();

  const { sendPaymentConfirm } = useCustomerDisplay({
    businessName: business?.name ?? 'ELM APP',
    logoUrl:      business?.logo_url,
    currency:     business?.currency ?? 'XOF',
    taxRate:      business?.tax_rate ?? 0,
  });

  // ProductGrid.handleSelect already calls addItem internally — no-op here avoids double-add
  const handleProductSelect = useCallback((_product: Product) => {}, []);

  const handleBarcodeScanned = useCallback(
    async (barcode: string) => {
      if (!business) return;
      try {
        const product = await getProductByBarcode(business.id, barcode);
        if (product) {
          addItem(product);
        } else {
          warning(`Aucun produit trouvé pour le code : ${barcode}`);
        }
      } catch {
        warning('Recherche hors ligne — code-barres non trouvé');
      }
    },
    [addItem, business, warning]
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <OfflineBanner />
      <BarcodeListener onScan={handleBarcodeScanned} />

      {/* ── Desktop layout ── */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        {/* Gauche : catalogue */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-surface-border">
          <div className="px-4 pt-3 empty:hidden">
            <OnboardingChecklist />
          </div>
          <div className="px-4 py-3 border-b border-surface-border flex gap-2">
            <div className="relative flex-1 group">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Rechercher (F1) ou scanner un code-barres…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input w-full pr-10"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-500 hover:text-white hover:bg-surface-hover transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 bg-surface-input rounded-xl p-1 shrink-0">
              <button onClick={() => setView('grid')} title="Vue grille"
                className={`p-2 rounded-lg transition-colors ${view === 'grid' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button onClick={() => setView('list')} title="Vue liste"
                className={`p-2 rounded-lg transition-colors ${view === 'list' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
          <CategoryBar businessId={business?.id ?? ''} selected={selectedCategory} onSelect={setSelectedCategory} />
          <div className="flex-1 overflow-y-auto p-4">
            <ProductGrid businessId={business?.id ?? ''} categoryId={selectedCategory} search={searchQuery} view={view} onSelect={handleProductSelect} />
          </div>
        </div>
        {/* Droite : panier */}
        <div className="w-96 flex flex-col bg-surface-card">
          <OrderPanel
            taxRate={business?.tax_rate ?? 0} taxInclusive={business?.tax_inclusive ?? false}
            currency={business?.currency ?? 'XOF'} businessId={business?.id ?? ''}
            onCheckout={() => setPaymentOpen(true)} onShowHeld={() => setHeldDrawerOpen(true)}
            wholesaleCtx={wholesaleCtx} onWholesaleChange={setWholesaleCtx}
            selectedClient={selectedClient} onClientChange={setSelectedClient}
          />
        </div>
      </div>

      {/* ── Mobile layout ── */}
      <div className="flex md:hidden flex-col flex-1 overflow-hidden relative">
        {/* Catalogue (visible quand mobileTab === 'catalog') */}
        <div className={`flex-1 flex flex-col overflow-hidden ${mobileTab === 'catalog' ? '' : 'hidden'}`}>
          <div className="px-3 py-2 border-b border-surface-border flex gap-2">
            <input
              type="text"
              placeholder="Rechercher…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input flex-1 text-sm"
            />
            <div className="flex items-center gap-1 bg-surface-input rounded-xl p-1 shrink-0">
              <button onClick={() => setView('grid')}
                className={`p-1.5 rounded-lg transition-colors ${view === 'grid' ? 'bg-brand-600 text-white' : 'text-slate-400'}`}>
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button onClick={() => setView('list')}
                className={`p-1.5 rounded-lg transition-colors ${view === 'list' ? 'bg-brand-600 text-white' : 'text-slate-400'}`}>
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
          <CategoryBar businessId={business?.id ?? ''} selected={selectedCategory} onSelect={setSelectedCategory} />
          <div className="flex-1 overflow-y-auto p-3 pb-20">
            <ProductGrid businessId={business?.id ?? ''} categoryId={selectedCategory} search={searchQuery} view={view} onSelect={handleProductSelect} />
          </div>
          {/* FAB panier */}
          <button
            onClick={() => setMobileTab('cart')}
            className="absolute bottom-4 right-4 h-14 px-5 bg-brand-600 hover:bg-brand-500 text-white rounded-2xl shadow-lg flex items-center gap-2.5 transition-colors"
          >
            <ShoppingCart className="w-5 h-5" />
            <span className="font-semibold">Panier</span>
            {cartCount > 0 && (
              <span className="bg-white text-brand-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {cartCount}
              </span>
            )}
          </button>
        </div>

        {/* Panier (visible quand mobileTab === 'cart') */}
        <div className={`flex-1 flex flex-col overflow-hidden ${mobileTab === 'cart' ? '' : 'hidden'}`}>
          {/* Back button */}
          <div className="px-3 py-2 border-b border-surface-border flex items-center gap-2">
            <button
              onClick={() => setMobileTab('catalog')}
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
            >
              <ShoppingCart className="w-4 h-4" />
              ← Retour au catalogue
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <OrderPanel
              taxRate={business?.tax_rate ?? 0} taxInclusive={business?.tax_inclusive ?? false}
              currency={business?.currency ?? 'XOF'} businessId={business?.id ?? ''}
              onCheckout={() => setPaymentOpen(true)} onShowHeld={() => setHeldDrawerOpen(true)}
              wholesaleCtx={wholesaleCtx} onWholesaleChange={setWholesaleCtx}
              selectedClient={selectedClient} onClientChange={setSelectedClient}
            />
          </div>
        </div>
      </div>

      {/* Tiroir commandes en attente */}
      {heldDrawerOpen && (
        <HeldOrdersDrawer
          currency={business?.currency ?? 'XOF'}
          taxRate={business?.tax_rate ?? 0}
          onClose={() => setHeldDrawerOpen(false)}
        />
      )}

      {paymentOpen && (
        <PaymentModal
          taxRate={business?.tax_rate ?? 0}
          taxInclusive={business?.tax_inclusive ?? false}
          currency={business?.currency ?? 'XOF'}
          onClose={() => setPaymentOpen(false)}
          onSuccess={() => { setPaymentOpen(false); setSelectedClient(null); }}
          onPaymentConfirm={sendPaymentConfirm}
          wholesaleCtx={wholesaleCtx}
          prefilledCustomer={selectedClient}
        />
      )}
    </div>
  );
}
