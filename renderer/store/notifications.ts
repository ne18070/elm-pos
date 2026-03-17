import { create } from 'zustand';
import type { Notification } from '../../types';
import { generateId } from '../lib/utils';

interface NotificationState {
  notifications: Notification[];
  add: (notification: Omit<Notification, 'id'>) => void;
  remove: (id: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],

  add: (notification) => {
    const id = generateId();
    const n: Notification = { id, duration: 4000, ...notification };
    set((state) => ({ notifications: [...state.notifications, n] }));
    // Auto-remove
    if (n.duration && n.duration > 0) {
      setTimeout(() => get().remove(id), n.duration);
    }
  },

  remove: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  success: (message) => get().add({ type: 'success', message }),
  error:   (message) => get().add({ type: 'error', message, duration: 6000 }),
  warning: (message) => get().add({ type: 'warning', message }),
  info:    (message) => get().add({ type: 'info', message }),
}));
