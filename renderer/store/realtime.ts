import { create } from 'zustand';

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';

export interface TerminalInfo {
  terminal_id: string;
  user_name:   string;
  pathname:    string;
  joined_at:   string;
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

  setStatus:    (status)    => set({ status }),
  setTerminals: (terminals) => set({ terminals }),
  addEvent:     (e)         => set((s) => ({
    lastEvents: [e, ...s.lastEvents].slice(0, 30),
  })),
}));
