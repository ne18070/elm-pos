'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { useProducts } from '@/hooks/useProducts';
import { getStockEntries } from '@services/supabase/stock';
import { Scan, Search, Package, ArrowRight, History, Loader2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StockEntry } from '@services/supabase/stock';
import type { Product } from '@pos-types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function InventoryPage() {
  const { business } = useAuthStore();
  const { products, loading: loadingProducts } = useProducts(business?.id ?? '');
  const [entries, setEntries] = useState<StockEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [search, setSearch] = useState('');
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    if (!business?.id) return;
    getStockEntries(business.id)
      .then(setEntries)
      .finally(() => setLoadingEntries(false));
  }, [business?.id]);

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.barcode?.includes(search)
  ).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-black text-content-primary">Stock & Inventaire</h2>
        <p className="text-xs font-bold text-content-muted uppercase tracking-widest">
          {products.length} produits référencés
        </p>
      </div>

      <div className="relative group">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <Search className="w-4 h-4 text-content-muted" />
        </div>
        <input 
          type="text" 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un produit ou scanner..."
          className="w-full bg-surface-card border border-surface-border rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all"
        />
        {search && (
          <button 
            onClick={() => setSearch('')}
            className="absolute inset-y-0 right-4 flex items-center"
          >
            <X className="w-4 h-4 text-content-muted" />
          </button>
        )}
      </div>

      {search && filteredProducts.length > 0 && (
        <div className="bg-surface-card rounded-2xl border border-surface-border overflow-hidden shadow-lg animate-in fade-in slide-in-from-top-2">
          {filteredProducts.map((p) => (
            <button 
              key={p.id}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-hover transition-colors border-b border-surface-border last:border-b-0"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface-hover flex items-center justify-center">
                  {p.image_url ? <img src={p.image_url} alt="" className="w-full h-full object-cover rounded-lg" /> : <Package className="w-5 h-5 text-content-muted" />}
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold truncate">{p.name}</p>
                  <p className="text-[10px] text-content-muted font-bold uppercase">{p.stock} {p.unit || 'unité'}(s) en stock</p>
                </div>
              </div>
              <Plus className="w-4 h-4 text-brand-500" />
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        <button 
          onClick={() => setIsScanning(true)}
          className="relative overflow-hidden bg-brand-500 text-white rounded-3xl p-8 flex flex-col items-center gap-4 shadow-xl shadow-brand-500/20 active:scale-95 transition-all"
        >
          <div className="w-20 h-20 rounded-2xl bg-white/20 flex items-center justify-center animate-pulse">
            <Scan className="w-10 h-10" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-lg font-black uppercase tracking-widest">Scanner un produit</p>
            <p className="text-xs font-medium opacity-80">Identification rapide par code-barres</p>
          </div>
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-widest text-content-muted">Historique des entrées</h3>
          <History className="w-4 h-4 text-content-muted" />
        </div>
        
        <div className="space-y-2">
          {loadingEntries ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
            </div>
          ) : entries.length === 0 ? (
            <p className="text-center py-10 text-xs font-bold text-content-muted uppercase">Aucun mouvement récent</p>
          ) : (
            entries.slice(0, 10).map((entry) => (
              <div key={entry.id} className="bg-surface-card p-4 rounded-2xl border border-surface-border flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-surface-hover flex items-center justify-center text-brand-500 font-black">
                  +{entry.quantity}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{entry.product?.name || 'Produit inconnu'}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-content-muted uppercase">
                      {entry.supplier || 'Sans fournisseur'}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-content-muted">
                    {format(new Date(entry.created_at), 'dd/MM HH:mm', { locale: fr })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {isScanning && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-6 text-white text-center space-y-8">
          <div className="w-64 h-64 border-2 border-brand-500 rounded-3xl relative overflow-hidden flex items-center justify-center">
             <div className="absolute inset-x-8 top-1/2 h-0.5 bg-brand-500 shadow-[0_0_15px_rgba(34,197,94,1)] animate-scan" />
             <p className="text-xs font-bold uppercase tracking-widest opacity-40 italic">Camera Engine Ready</p>
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-black">Scan en attente</h3>
            <p className="text-sm opacity-60">L'intégration native Capacitor sera active sur votre téléphone</p>
          </div>
          <button 
            onClick={() => setIsScanning(false)}
            className="px-8 py-4 rounded-2xl bg-white/10 text-white text-sm font-black uppercase tracking-widest border border-white/10"
          >
            Fermer le scanner
          </button>
        </div>
      )}
    </div>
  );
}
