import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Business } from '../../types';

interface AuthState {
  user: User | null;
  business: Business | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setBusiness: (business: Business | null) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      business: null,
      isLoading: true,

      setUser: (user) => set({ user }),
      setBusiness: (business) => set({ business }),
      setLoading: (isLoading) => set({ isLoading }),
      clear: () => set({ user: null, business: null }),
    }),
    {
      name: 'elm-pos-auth',
      partialize: (state) => ({
        user: state.user,
        business: state.business,
      }),
    }
  )
);
