import { create } from 'zustand';

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';

export interface TerminalInfo {
  terminal_id: string;
  user_name:   string;
  pathname:    string;
  joined_at:   string;
  is_tracking?: boolean;
  location?:    { lat: number; lng: number; accuracy?: number };
}

export interface RealtimeEvent {
  table:     string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  at:        Date;
}

interface RealtimeState {
  status:      RealtimeStatus;
  terminalId:  string;
  terminals:   TerminalInfo[];
  lastEvents:  RealtimeEvent[];
  setStatus:   (s: RealtimeStatus) => void;
  setTerminals:(t: TerminalInfo[]) => void;
  addEvent:    (e: RealtimeEvent) => void;
  // Local state for the current terminal's tracking
  isTracking:  boolean;
  location:    { lat: number; lng: number; accuracy?: number } | null;
  setTracking: (active: boolean) => void;
  setLocation: (loc: { lat: number; lng: number; accuracy?: number } | null) => void;
}

function getOrCreateTerminalId(): string {
  if (typeof window === 'undefined') return '';
  const key = 'elm-pos-terminal-id';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  status:     'disconnected',
  terminalId: getOrCreateTerminalId(),
  terminals:  [],
  lastEvents: [],
  isTracking: false,
  location:   null,

  setStatus:    (status)    => set({ status }),
  setTerminals: (terminals) => set({ terminals }),
  addEvent:     (e)         => set((s) => ({
    lastEvents: [e, ...s.lastEvents].slice(0, 30),
  })),
  setTracking:  (isTracking) => set({ isTracking }),
  setLocation:  (location)   => set({ location }),
}));
