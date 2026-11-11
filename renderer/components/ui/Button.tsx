'use client';

import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary:   'btn-primary',
  secondary: 'btn-secondary',
  danger:    'btn-danger',
  ghost:
    'text-sm font-medium rounded-lg px-3 py-1.5 transition-colors ' +
    'text-content-secondary hover:text-content-primary hover:bg-surface-hover ' +
    'disabled:opacity-50 disabled:cursor-not-allowed',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'text-xs px-2.5 py-1',
  md: '',
  lg: 'text-base px-5 py-2.5 min-h-[44px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Spinner + bouton désactivé pendant une action asynchrone. */
  loading?: boolean;
  /** Icône (lucide) affichée avant le libellé. */
  icon?: ReactNode;
}

/**
 * Bouton standard de l'app. Reprend les classes `.btn-*` de globals.css
 * (donc compatibles light/dark d'office) et y ajoute les états manquants :
 * `loading` (spinner + disabled), tailles, variante `ghost` pour les actions
 * tertiaires. `size="lg"` garantit la cible tactile ≥ 44px du CLAUDE.md.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, icon, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(VARIANT[variant], SIZE[size], 'inline-flex items-center justify-center gap-2', className)}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : icon}
      {children}
    </button>
  );
});
