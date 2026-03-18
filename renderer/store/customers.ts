import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SavedCustomer {
  id: string;
  name: string;
  phone?: string;
  lastUsed: string; // ISO date — pour trier par récence
}

interface CustomersState {
  customers: SavedCustomer[];

  /** Crée ou met à jour un client (fusion par nom insensible à la casse) */
  addOrUpdate: (name: string, phone?: string) => void;

  /** Recherche par nom ou téléphone, triée par dernière utilisation */
  search: (query: string) => SavedCustomer[];

  /** Supprime un client */
  remove: (id: string) => void;
}

export const useCustomersStore = create<CustomersState>()(
  persist(
    (set, get) => ({
      customers: [],

      addOrUpdate: (name, phone) => {
        const trimName = name.trim();
        if (!trimName) return;
        const trimPhone = phone?.trim() || undefined;

        set((state) => {
          const existing = state.customers.find(
            (c) => c.name.toLowerCase() === trimName.toLowerCase()
          );
          if (existing) {
            return {
              customers: state.customers.map((c) =>
                c.id === existing.id
                  ? { ...c, phone: trimPhone ?? c.phone, lastUsed: new Date().toISOString() }
                  : c
              ),
            };
          }
          return {
            customers: [
              ...state.customers,
              {
                id:       crypto.randomUUID(),
                name:     trimName,
                phone:    trimPhone,
                lastUsed: new Date().toISOString(),
              },
            ],
          };
        });
      },

      search: (query) => {
        const q = query.trim().toLowerCase();
        if (!q) return get().customers
          .slice()
          .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
          .slice(0, 6);

        return get()
          .customers
          .filter(
            (c) =>
              c.name.toLowerCase().includes(q) ||
              (c.phone && c.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')))
          )
          .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
          .slice(0, 6);
      },

      remove: (id) =>
        set((state) => ({ customers: state.customers.filter((c) => c.id !== id) })),
    }),
    { name: 'elm-pos-customers' }
  )
);
