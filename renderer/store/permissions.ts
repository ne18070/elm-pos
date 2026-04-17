import { create } from 'zustand';

interface PermissionsState {
  overrides: Record<string, boolean>;
  loaded:    boolean;
  setOverrides: (overrides: Record<string, boolean>) => void;
  reset:        () => void;
}

export const usePermissionsStore = create<PermissionsState>()((set) => ({
  overrides: {},
  loaded:    false,

  setOverrides: (overrides) => set({ overrides, loaded: true }),
  reset:        ()          => set({ overrides: {}, loaded: false }),
}));
