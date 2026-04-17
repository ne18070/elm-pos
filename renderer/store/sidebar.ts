import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarState {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggle: () => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: true, // Default to true for "hover mode"
      setCollapsed: (collapsed) => set({ collapsed }),
      toggle: () => set((state) => ({ collapsed: !state.collapsed })),
    }),
    { name: 'elm-pos-sidebar-collapsed-v2' }
  )
);
