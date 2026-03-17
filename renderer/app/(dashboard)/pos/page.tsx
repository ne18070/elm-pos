'use client';

import { useState, useCallback } from 'react';
import { ProductGrid } from '@/components/pos/ProductGrid';
import { OrderPanel } from '@/components/pos/OrderPanel';
import { PaymentModal } from '@/components/pos/PaymentModal';
import { CategoryBar } from '@/components/pos/CategoryBar';
import { BarcodeListener } from '@/components/pos/BarcodeListener';
import { OfflineBanner } from '@/components/shared/OfflineBanner';
import { useCartStore } from '@/store/cart';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import type { Product } from '@pos-types';

export default function PosPage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery]            = useState('');
  const [paymentOpen, setPaymentOpen]            = useState(false);

  const { addItem } = useCartStore();
  const { business } = useAuthStore();
  const { warning } = useNotificationStore();

  const handleProductSelect = useCallback(
    (product: Product) => {
      addItem(product);
    },
    [addItem]
  );

  const handleBarcodeScanned = useCallback(
    async (barcode: string) => {
      if (!business) return;
      try {
        const { getProductByBarcode } = await import(
          '../../../../services/supabase/products'
        );
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
      {/* Bandeau hors ligne (safe POS mode) */}
      <OfflineBanner />

      {/* Contenu principal */}
      <div className="flex flex-1 overflow-hidden">
        {/* Listener HID (invisible) */}
        <BarcodeListener onScan={handleBarcodeScanned} />

        {/* Gauche : catalogue */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-surface-border">
          {/* Recherche */}
          <div className="p-4 border-b border-surface-border">
            <input
              type="text"
              placeholder="Rechercher un produit ou scanner un code-barres..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input"
            />
          </div>

          {/* Catégories */}
          <CategoryBar
            businessId={business?.id ?? ''}
            selected={selectedCategory}
            onSelect={setSelectedCategory}
          />

          {/* Grille produits */}
          <div className="flex-1 overflow-y-auto p-4">
            <ProductGrid
              businessId={business?.id ?? ''}
              categoryId={selectedCategory}
              search={searchQuery}
              onSelect={handleProductSelect}
            />
          </div>
        </div>

        {/* Droite : panneau commande */}
        <div className="w-96 flex flex-col bg-surface-card">
          <OrderPanel
            taxRate={business?.tax_rate ?? 0}
            currency={business?.currency ?? 'XOF'}
            businessId={business?.id ?? ''}
            onCheckout={() => setPaymentOpen(true)}
          />
        </div>
      </div>

      {/* Modal paiement */}
      {paymentOpen && (
        <PaymentModal
          taxRate={business?.tax_rate ?? 0}
          currency={business?.currency ?? 'XOF'}
          onClose={() => setPaymentOpen(false)}
          onSuccess={() => setPaymentOpen(false)}
        />
      )}
    </div>
  );
}
