import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'auto' | 'dark' | 'light';

/** Jour : 7h – 19h */
export function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme !== 'auto') return theme;
  const h = new Date().getHours();
  return h >= 7 && h < 19 ? 'light' : 'dark';
}

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  cycle:    () => void; // auto → light → dark → auto
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme:    'auto',
      setTheme: (theme) => set({ theme }),
      cycle: () => {
        const order: Theme[] = ['auto', 'light', 'dark'];
        const next = order[(order.indexOf(get().theme) + 1) % order.length];
        set({ theme: next });
      },
    }),
    { name: 'elm-pos-theme' }
  )
);
