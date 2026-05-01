import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarState {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggle: () => void;
  drawerOpen: boolean;
  setDrawerOpen: (v: boolean) => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      setCollapsed: (collapsed) => set({ collapsed }),
      toggle: () => set((state) => ({ collapsed: !state.collapsed })),
      drawerOpen: false,
      setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
    }),
    { 
      name: 'elm-pos-sidebar-collapsed-v2',
      // Don't persist drawerOpen
      partialize: (state) => ({ collapsed: state.collapsed }),
    }
  )
);
