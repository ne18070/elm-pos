import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Business } from '@pos-types';
import type { BusinessMembership } from '@services/supabase/business';

interface AuthState {
  user:         User | null;
  business:     Business | null;
  businesses:   BusinessMembership[];   // tous les établissements de l'utilisateur
  isLoading:    boolean;

  setUser:        (user: User | null) => void;
  setBusiness:    (business: Business | null) => void;
  setBusinesses:  (list: BusinessMembership[]) => void;
  setLoading:     (loading: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user:       null,
      business:   null,
      businesses: [],
      isLoading:  true,

      setUser:       (user)       => set({ user }),
      setBusiness:   (business)   => set({ business }),
      setBusinesses: (businesses) => set({ businesses }),
      setLoading:    (isLoading)  => set({ isLoading }),
      clear: () => set({ user: null, business: null, businesses: [] }),
    }),
    {
      name: 'elm-pos-auth',
      partialize: (state) => ({
        user:       state.user,
        business:   state.business,
        businesses: state.businesses,
      }),
    }
  )
);
