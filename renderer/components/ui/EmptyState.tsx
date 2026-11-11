import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  /** Icône lucide (composant, pas élément) : `icon={Users}`. */
  icon?: ComponentType<{ className?: string }>;
  title: string;
  /** Explique POURQUOI c'est vide et ce que l'utilisateur peut faire — jamais juste « Aucun résultat ». */
  description?: string;
  /** Action principale (en général un <Button>). */
  action?: ReactNode;
  /** `compact` pour les panneaux/colonnes, défaut pour une page entière. */
  compact?: boolean;
  className?: string;
}

/**
 * État vide standard (CLAUDE.md › Trust : « Empty states explain why »).
 * Centré, icône discrète, titre court, description qui explique la cause
 * ou le premier pas, action optionnelle.
 */
export function EmptyState({ icon: Icon, title, description, action, compact = false, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-8 px-4' : 'py-16 px-6',
        className,
      )}
    >
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-surface-input border border-surface-border flex items-center justify-center mb-4">
          <Icon className="w-6 h-6 text-content-muted" />
        </div>
      )}
      <p className="text-content-primary font-semibold">{title}</p>
      {description && (
        <p className="text-content-secondary text-sm mt-1 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
