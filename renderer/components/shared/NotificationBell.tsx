'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Bell, Package, Clock, Vault, X } from 'lucide-react';
import { useSubscriptionStore } from '@/store/subscription';
import { useCashSessionStore } from '@/store/cashSession';
import { useLowStockAlerts } from '@/hooks/useLowStockAlerts';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

interface Alert {
  id: string;
  type: 'warning' | 'danger' | 'info';
  icon: React.ElementType;
  title: string;
  description: string;
  href?: string;
}

export function NotificationBell({ collapsed = false }: { collapsed?: boolean }) {
  const { business } = useAuthStore();
  const { effectiveStatus, trialDaysRemaining, subscription } = useSubscriptionStore();
  const { session } = useCashSessionStore();
  const { lowStock } = useLowStockAlerts(business?.id ?? '');

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const expanded = !collapsed;

  // Fermer en cliquant dehors
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const alerts: Alert[] = [];

  // ── Stock faible ──────────────────────────────────────────────────────────
  if (lowStock.length > 0) {
    alerts.push({
      id: 'low-stock',
      type: 'warning',
      icon: Package,
      title: `${lowStock.length} produit${lowStock.length > 1 ? 's' : ''} en stock faible`,
      description: lowStock.slice(0, 3).map((p) => `${p.name} (${p.stock})`).join(', ')
        + (lowStock.length > 3 ? ` et ${lowStock.length - 3} autre(s)` : ''),
      href: '/products',
    });
  }

  // ── Abonnement ────────────────────────────────────────────────────────────
  const status = effectiveStatus();
  const days   = trialDaysRemaining();

  if (status === 'trial' && days <= 3) {
    alerts.push({
      id: 'trial-ending',
      type: 'danger',
      icon: Clock,
      title: days === 0 ? "Essai expiré aujourd'hui" : `Essai expire dans ${days} jour${days > 1 ? 's' : ''}`,
      description: 'Souscrivez un abonnement pour continuer à utiliser ELM APP.',
      href: '/billing',
    });
  } else if (status === 'trial' && days <= 7) {
    alerts.push({
      id: 'trial-warning',
      type: 'warning',
      icon: Clock,
      title: `${days} jours d'essai restants`,
      description: 'Pensez à vous abonner avant la fin de votre période d\'essai.',
      href: '/billing',
    });
  } else if (status === 'active' && subscription?.expires_at) {
    const daysLeft = Math.ceil(
      (new Date(subscription.expires_at).getTime() - Date.now()) / 86_400_000
    );
    if (daysLeft <= 7) {
      alerts.push({
        id: 'sub-expiring',
        type: daysLeft <= 3 ? 'danger' : 'warning',
        icon: Clock,
        title: `Abonnement expire dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}`,
        description: 'Renouvelez votre abonnement pour ne pas perdre l\'accès.',
        href: '/billing',
      });
    }
  } else if (status === 'expired') {
    alerts.push({
      id: 'expired',
      type: 'danger',
      icon: Clock,
      title: 'Abonnement expiré',
      description: 'Votre accès est limité. Renouvelez maintenant.',
      href: '/billing',
    });
  }

  // ── Caisse non clôturée (session ouverte depuis hier) ─────────────────────
  if (session?.opened_at) {
    const openedDate = new Date(session.opened_at);
    const today = new Date();
    const isYesterday = openedDate.toDateString() !== today.toDateString();
    if (isYesterday) {
      alerts.push({
        id: 'session-old',
        type: 'warning',
        icon: Vault,
        title: 'Caisse non clôturée',
        description: `Session ouverte le ${openedDate.toLocaleDateString('fr-FR')} — pensez à clôturer.`,
        href: '/caisse',
      });
    }
  }

  const count = alerts.length;

  const COLOR: Record<Alert['type'], string> = {
    danger:  'text-status-error bg-badge-error border-status-error',
    warning: 'text-status-warning bg-badge-warning border-status-warning',
    info:    'text-content-brand bg-badge-brand border-brand-800',
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center gap-3 px-2 py-2 rounded-xl transition-colors text-content-secondary hover:text-content-primary hover:bg-surface-hover",
          collapsed ? "justify-center" : ""
        )}
        title={collapsed ? "Notifications" : undefined}
      >
        <div className="relative shrink-0">
          <Bell className="w-4 h-4" />
          {count > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5
                             flex items-center justify-center rounded-full
                             bg-red-500 text-content-primary text-[9px] font-bold leading-none">
              {count}
            </span>
          )}
        </div>
        {expanded && <span className="text-sm flex-1 text-left">Notifications</span>}
        {expanded && count > 0 && (
          <span className="flex items-center justify-center min-w-[20px] h-5 px-1
                           rounded-full bg-red-500 text-content-primary text-xs font-bold">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className={cn(
          "absolute bottom-full left-0 mb-2 w-72 bg-surface-card border border-surface-border rounded-xl shadow-xl z-50 overflow-hidden",
          "md:bottom-0 md:mb-0 md:ml-2 md:left-full"
        )}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
            <p className="text-sm font-semibold text-content-primary">Notifications</p>
            <button onClick={() => setOpen(false)} className="text-content-secondary hover:text-content-primary">
              <X className="w-4 h-4" />
            </button>
          </div>

          {alerts.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Bell className="w-8 h-8 text-content-muted mx-auto mb-2" />
              <p className="text-sm text-content-muted">Aucune notification</p>
            </div>
          ) : (
            <div className="divide-y divide-surface-border max-h-80 overflow-y-auto">
              {alerts.map((alert) => {
                const Icon = alert.icon;
                const content = (
                  <div className={`flex items-start gap-3 px-4 py-3 hover:bg-surface-hover transition-colors ${alert.href ? 'cursor-pointer' : ''}`}>
                    <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${COLOR[alert.type]}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-content-primary leading-tight">{alert.title}</p>
                      <p className="text-xs text-content-secondary mt-0.5 leading-relaxed">{alert.description}</p>
                    </div>
                  </div>
                );
                return alert.href ? (
                  <Link key={alert.id} href={alert.href} onClick={() => setOpen(false)}>
                    {content}
                  </Link>
                ) : (
                  <div key={alert.id}>{content}</div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
