'use client';

import { useNotificationStore } from '@/store/notifications';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const ICONS = {
  success: CheckCircle,
  error:   AlertCircle,
  warning: AlertTriangle,
  info:    Info,
};

const STYLES = {
  success: 'bg-green-900/80 border-green-700 text-green-200',
  error:   'bg-red-900/80 border-red-700 text-red-200',
  warning: 'bg-yellow-900/80 border-yellow-700 text-yellow-200',
  info:    'bg-blue-900/80 border-blue-700 text-blue-200',
};

export function NotificationContainer() {
  const { notifications, remove } = useNotificationStore();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {notifications.map((n) => {
        const Icon = ICONS[n.type];
        return (
          <div
            key={n.id}
            className={cn(
              'flex items-start gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm shadow-lg',
              'animate-in slide-in-from-bottom-2 duration-200',
              STYLES[n.type]
            )}
          >
            <Icon className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="text-sm flex-1">{n.message}</p>
            <button
              onClick={() => remove(n.id)}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
