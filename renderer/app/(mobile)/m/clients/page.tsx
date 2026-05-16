'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { getClients, searchClients } from '@services/supabase/clients';
import type { Client } from '@services/supabase/clients';
import { Users, Search, X, Phone, Loader2 } from 'lucide-react';

export default function MobileClientsPage() {
  const { business } = useAuthStore();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!business?.id) return;
    setLoading(true);
    getClients(business.id)
      .then(data => setClients(data))
      .finally(() => setLoading(false));
  }, [business?.id]);

  useEffect(() => {
    if (!business?.id) return;
    if (!search.trim()) {
      // Reset to all when cleared
      if (!loading) {
        getClients(business.id).then(data => setClients(data));
      }
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchClients(business.id, search.trim());
        setClients(data);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, business?.id]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-black text-content-primary">Clients</h2>
        <p className="text-xs font-bold text-content-muted uppercase tracking-widest">
          {clients.length} client{clients.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          {searching ? <Loader2 className="w-4 h-4 text-content-muted animate-spin" /> : <Search className="w-4 h-4 text-content-muted" />}
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un client..."
          className="w-full bg-surface-card border border-surface-border rounded-2xl py-4 pl-12 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-all"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute inset-y-0 right-4 flex items-center">
            <X className="w-4 h-4 text-content-muted" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
        </div>
      ) : clients.length === 0 ? (
        <div className="py-20 text-center space-y-4 bg-surface-card rounded-3xl border border-dashed border-surface-border">
          <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mx-auto">
            <Users className="w-8 h-8 text-content-muted opacity-20" />
          </div>
          <p className="text-sm font-bold text-content-primary">
            {search ? 'Aucun résultat' : 'Aucun client'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {clients.slice(0, 50).map(client => (
            <div key={client.id} className="bg-surface-card rounded-xl border border-surface-border p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-brand-500/10 flex items-center justify-center text-sm font-black text-brand-500 shrink-0">
                {client.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-content-primary truncate">{client.name}</p>
                {client.phone && (
                  <p className="text-[10px] text-content-muted font-medium">{client.phone}</p>
                )}
              </div>
              {client.phone && (
                <a
                  href={`tel:${client.phone}`}
                  className="p-2 rounded-xl bg-surface-hover text-content-secondary active:scale-90 transition-all shrink-0"
                >
                  <Phone className="w-4 h-4" />
                </a>
              )}
            </div>
          ))}
          {clients.length > 50 && (
            <p className="text-center text-[10px] font-bold text-content-muted uppercase py-2">
              + {clients.length - 50} autres — affinez la recherche
            </p>
          )}
        </div>
      )}
    </div>
  );
}
