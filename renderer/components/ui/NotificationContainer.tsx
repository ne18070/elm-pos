'use client';

import { useEffect, useState } from 'react';
import { useNotificationStore } from '@/store/notifications';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Notification } from '@pos-types';

const CONFIG = {
  success: { icon: CheckCircle, bg: 'bg-badge-success', border: 'border-status-success/40', icon_color: 'text-status-success', bar: 'bg-status-success' },
  error:   { icon: AlertCircle,  bg: 'bg-badge-error',   border: 'border-status-error/40',   icon_color: 'text-status-error',   bar: 'bg-status-error'   },
  warning: { icon: AlertTriangle,bg: 'bg-badge-warning', border: 'border-status-warning/40', icon_color: 'text-status-warning', bar: 'bg-status-warning' },
  info:    { icon: Info,         bg: 'bg-badge-info',    border: 'border-status-info/40',    icon_color: 'text-status-info',    bar: 'bg-status-info'    },
} as const;

function Toast({ n, onRemove }: { n: Notification; onRemove: () => void }) {
  const [progress, setProgress] = useState(100);
  const duration = n.duration ?? 4000;
  const cfg = CONFIG[n.type];
  const Icon = cfg.icon;

  useEffect(() => {
    if (!duration) return;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining > 0) requestAnimationFrame(tick);
    };
    const raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration]);

  return (
    <div className={cn(
      'relative flex items-start gap-3 pl-4 pr-3 py-3 rounded-xl border shadow-lg overflow-hidden',
      'bg-surface-card',
      cfg.border,
      'animate-in slide-in-from-bottom-2 fade-in duration-200',
    )}>
      {/* Colored left accent */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-1 rounded-l-xl', cfg.bar)} />

      {/* Icon */}
      <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', cfg.bg)}>
        <Icon className={cn('w-4 h-4', cfg.icon_color)} />
      </div>

      {/* Message */}
      <p className="text-sm text-content-primary flex-1 pt-0.5 leading-snug">{n.message}</p>

      {/* Close */}
      <button
        onClick={onRemove}
        className="shrink-0 text-content-muted hover:text-content-primary transition-colors mt-0.5"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {/* Progress bar */}
      {duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-surface-border">
          <div
            className={cn('h-full transition-none', cfg.bar, 'opacity-50')}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function NotificationContainer() {
  const { notifications, remove } = useNotificationStore();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      {notifications.map((n) => (
        <Toast key={n.id} n={n} onRemove={() => remove(n.id)} />
      ))}
    </div>
  );
}
