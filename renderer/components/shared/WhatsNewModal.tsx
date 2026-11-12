'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Sparkles, Check, X } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { usePermissionsStore } from '@/store/permissions';
import { useCan } from '@/hooks/usePermission';
import { Button } from '@/components/ui';
import { getPendingWhatsNew, markSeen, type WhatsNewEntry } from '@/lib/whats-new';

/**
 * Nouveautés (renderer/lib/whats-new.ts) montrées une fois par utilisateur et
 * par appareil, à la connexion. Attend que les permissions soient chargées
 * (sinon les points filtrés par droits seraient faux) et qu'aucune autre
 * fenêtre bloquante (alertes de démarrage) ne soit ouverte, pour ne pas
 * empiler deux modales.
 */
export function WhatsNewModal() {
  const userId      = useAuthStore((s) => s.user?.id);
  const businessId  = useAuthStore((s) => s.business?.id);
  const permsLoaded = usePermissionsStore((s) => s.loaded);
  const can = useCan();

  const [entries, setEntries] = useState<WhatsNewEntry[]>([]);
  const [open, setOpen]       = useState(false);

  useEffect(() => {
    if (!userId || !businessId || !permsLoaded) return;
    const pending = getPendingWhatsNew(userId, can);
    if (pending.length === 0) return;
    setEntries(pending);

    // Laisse la place aux alertes de démarrage, puis s'affiche.
    const iv = setInterval(() => {
      if (!document.querySelector('[data-blocking-modal], [aria-modal="true"]')) {
        clearInterval(iv);
        setOpen(true);
      }
    }, 1000);
    return () => clearInterval(iv);
    // `can` change d'identité à chaque rendu : les droits sont couverts par permsLoaded/businessId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, businessId, permsLoaded]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    if (userId) markSeen(userId, entries.map((e) => e.id));
    setOpen(false);
  }

  if (!open || entries.length === 0 || typeof document === 'undefined') return null;

  const cta = entries.find((e) => e.cta)?.cta;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center bg-black/60 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
      onClick={close}
    >
      <div
        className="bg-surface-card border border-surface-border rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-surface-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-badge-brand flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-content-brand" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-content-brand">Nouveautés</p>
              <h2 id="whats-new-title" className="text-base font-semibold text-content-primary">
                {entries[0].title}
              </h2>
            </div>
          </div>
          <button
            onClick={close}
            className="h-11 w-11 -mr-2 -mt-2 inline-flex items-center justify-center text-content-muted hover:text-content-primary shrink-0"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-5">
          {entries.map((entry, idx) => (
            <section key={entry.id} className="space-y-3">
              {idx > 0 && (
                <h3 className="text-sm font-semibold text-content-primary pt-2 border-t border-surface-border">
                  {entry.title}
                </h3>
              )}
              <ul className="space-y-3">
                {entry.items.map((item) => (
                  <li key={item.title} className="flex gap-3">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-badge-success flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-status-success" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-content-primary">{item.title}</p>
                      <p className="text-sm text-content-secondary mt-0.5">{item.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-5 py-4 border-t border-surface-border pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button variant={cta ? 'secondary' : 'primary'} onClick={close} className="h-11">
            J&apos;ai compris
          </Button>
          {cta && (
            <Link
              href={cta.href}
              onClick={close}
              className="btn-primary h-11 px-4 inline-flex items-center justify-center text-sm"
            >
              {cta.label}
            </Link>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
