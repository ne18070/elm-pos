import { create } from 'zustand';
import type { CashSession } from '@services/supabase/cash-sessions';

interface CashSessionState {
  session: CashSession | null;
  loaded:  boolean;
  setSession: (s: CashSession | null) => void;
  setLoaded:  (v: boolean) => void;
}

export const useCashSessionStore = create<CashSessionState>()((set) => ({
  session:    null,
  loaded:     false,
  setSession: (session) => set({ session }),
  setLoaded:  (loaded)  => set({ loaded }),
}));
