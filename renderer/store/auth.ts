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
  setPermissionsOverrides: (overrides: Record<string, boolean>) => void;
  clear: () => void;
}

const SESSION_KEY = 'elm-pos-active-business';

function saveBusinessToSession(business: Business | null) {
  if (typeof window === 'undefined') return;
  if (business) sessionStorage.setItem(SESSION_KEY, JSON.stringify(business));
  else          sessionStorage.removeItem(SESSION_KEY);
}

function readBusinessFromSession(): Business | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Business) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user:       null,
      business:   null,
      businesses: [],
      isLoading:  true,

      setUser:       (user)       => set({ user }),
      setBusiness:   (business)   => { saveBusinessToSession(business); set({ business }); },
      setBusinesses: (businesses) => set({ businesses }),
      setLoading:    (isLoading)  => set({ isLoading }),
      setPermissionsOverrides: (permissions_overrides) => set((state) => ({
        user: state.user ? { ...state.user, permissions_overrides } : null
      })),
      clear: () => {
        saveBusinessToSession(null);
        set({ user: null, business: null, businesses: [] });
      },
    }),
    {
      name: 'elm-pos-auth',
      // user + businesses → localStorage (partagé entre onglets, persiste au redémarrage)
      // business actif   → sessionStorage (isolé par onglet)
      partialize: (state) => ({
        user:       state.user,
        businesses: state.businesses,
      }),
      onRehydrateStorage: () => (state) => {
        // Restaurer le business actif depuis sessionStorage après hydratation
        if (state) state.business = readBusinessFromSession();
      },
    }
  )
);
