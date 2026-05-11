export const isElectron = typeof window !== 'undefined' && 'electronAPI' in window;

export const isCapacitor = typeof window !== 'undefined' && (window as any).Capacitor !== undefined;

export const isWeb = !isElectron && !isCapacitor;

export const getPlatform = () => {
  if (isElectron) return 'electron';
  if (isCapacitor) return 'capacitor';
  return 'web';
};
