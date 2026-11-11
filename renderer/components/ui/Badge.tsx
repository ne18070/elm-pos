import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone =
  | 'success' | 'warning' | 'error' | 'info'
  | 'brand' | 'teal' | 'purple' | 'orange'
  | 'neutral';

const TONE: Record<BadgeTone, string> = {
  success: 'bg-badge-success text-status-success border-status-success/30',
  warning: 'bg-badge-warning text-status-warning border-status-warning/30',
  error:   'bg-badge-error text-status-error border-status-error/30',
  info:    'bg-badge-info text-status-info border-status-info/30',
  brand:   'bg-badge-brand text-status-brand border-status-brand/30',
  teal:    'bg-badge-teal text-status-teal border-status-teal/30',
  purple:  'bg-badge-purple text-status-purple border-status-purple/30',
  orange:  'bg-badge-orange text-status-orange border-status-orange/30',
  neutral: 'bg-surface-input text-content-secondary border-surface-border',
};

export interface BadgeProps {
  tone?: BadgeTone;
  /** Point coloré devant le libellé (statut « vivant » : en cours, en ligne…). */
  dot?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Pastille de statut conforme au theme-guide : fond `bg-badge-*` + texte
 * `text-status-*`, lisible en light et dark sans override. À utiliser à la
 * place des `bg-green-900/20 text-green-400` écrits à la main.
 */
export function Badge({ tone = 'neutral', dot = false, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap',
        TONE[tone],
        className,
      )}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" aria-hidden />}
      {children}
    </span>
  );
}
