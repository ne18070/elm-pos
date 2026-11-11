import { cn } from '@/lib/utils';

/**
 * Blocs de chargement « skeleton » (CLAUDE.md : skeleton states over spinners).
 * Le skeleton reproduit la silhouette du contenu attendu ; réserver le spinner
 * aux actions ponctuelles (bouton en cours d'envoi), pas au chargement de page.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-surface-input', className)} aria-hidden />;
}

/** Quelques lignes de texte fantôme (la dernière plus courte). */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

/** Carte fantôme (liste de cartes, grilles produits, KPI…). */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('card p-4 space-y-3', className)} aria-hidden>
      <Skeleton className="h-4 w-1/3" />
      <SkeletonText lines={2} />
    </div>
  );
}

/** Lignes de tableau fantômes, à placer dans le <tbody>. */
export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-surface-border" aria-hidden>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-4 py-3">
              <Skeleton className={cn('h-3.5', c === 0 ? 'w-3/4' : 'w-1/2')} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
