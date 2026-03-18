'use client';

import { useState, useCallback } from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { ProductGrid } from '@/components/pos/ProductGrid';
import { OrderPanel } from '@/components/pos/OrderPanel';
import { PaymentModal } from '@/components/pos/PaymentModal';
import { CategoryBar } from '@/components/pos/CategoryBar';
import { BarcodeListener } from '@/components/pos/BarcodeListener';
import { HeldOrdersDrawer } from '@/components/pos/HeldOrdersDrawer';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import { useCartStore } from '@/store/cart';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useCustomerDisplay } from '@/hooks/useCustomerDisplay';
import { getProductByBarcode } from '@services/supabase/products';
import type { Product } from '@pos-types';

type ViewMode = 'grid' | 'list';

export default function PosPage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery]            = useState('');
  const [paymentOpen, setPaymentOpen]            = useState(false);
  const [view, setView]                          = useState<ViewMode>('grid');
  const [heldDrawerOpen, setHeldDrawerOpen]      = useState(false);

  const addItem = useCartStore((s) => s.addItem);
  const { business } = useAuthStore();
  const { warning } = useNotificationStore();

  const { sendPaymentConfirm } = useCustomerDisplay({
    businessName: business?.name ?? 'Elm POS',
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

      <div className="flex flex-1 overflow-hidden">
        <BarcodeListener onScan={handleBarcodeScanned} />

        {/* Gauche : catalogue */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-surface-border">
          {/* Barre recherche + toggle vue */}
          <div className="px-4 py-3 border-b border-surface-border flex gap-2">
            <input
              type="text"
              placeholder="Rechercher un produit ou scanner un code-barres…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input flex-1"
            />
            <div className="flex items-center gap-1 bg-surface-input rounded-xl p-1 shrink-0">
              <button
                onClick={() => setView('grid')}
                title="Vue grille"
                className={`p-2 rounded-lg transition-colors ${
                  view === 'grid' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setView('list')}
                title="Vue liste"
                className={`p-2 rounded-lg transition-colors ${
                  view === 'list' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Catégories */}
          <CategoryBar
            businessId={business?.id ?? ''}
            selected={selectedCategory}
            onSelect={setSelectedCategory}
          />

          {/* Produits */}
          <div className="flex-1 overflow-y-auto p-4">
            <ProductGrid
              businessId={business?.id ?? ''}
              categoryId={selectedCategory}
              search={searchQuery}
              view={view}
              onSelect={handleProductSelect}
            />
          </div>
        </div>

        {/* Droite : panier */}
        <div className="w-96 flex flex-col bg-surface-card">
          <OrderPanel
            taxRate={business?.tax_rate ?? 0}
            currency={business?.currency ?? 'XOF'}
            businessId={business?.id ?? ''}
            onCheckout={() => setPaymentOpen(true)}
            onShowHeld={() => setHeldDrawerOpen(true)}
          />
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
          currency={business?.currency ?? 'XOF'}
          onClose={() => setPaymentOpen(false)}
          onSuccess={() => setPaymentOpen(false)}
          onPaymentConfirm={sendPaymentConfirm}
        />
      )}
    </div>
  );
}
