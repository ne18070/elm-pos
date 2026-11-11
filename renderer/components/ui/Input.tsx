'use client';

import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FieldChrome {
  /** Label toujours visible (CLAUDE.md : jamais de placeholder-comme-label). */
  label?: string;
  /** Message d'erreur : dit QUOI corriger, affiché sous le champ (validation inline). */
  error?: string;
  /** Aide contextuelle discrète, masquée quand une erreur est affichée. */
  hint?: string;
  containerClassName?: string;
}

function Chrome({
  id, label, error, hint, containerClassName, children,
}: FieldChrome & { id: string; children: ReactNode }) {
  return (
    <div className={containerClassName}>
      {label && <label htmlFor={id} className="label">{label}</label>}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-status-error" role="alert">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-content-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const errorRing = 'border-status-error focus:ring-status-error';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldChrome {}

/**
 * Champ de formulaire standard : label visible + `.input` de globals.css
 * (compatible light/dark) + erreur inline. Remplace les <input> stylés à la main.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, containerClassName, className, id: idProp, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <Chrome id={id} label={label} error={error} hint={hint} containerClassName={containerClassName}>
      <input ref={ref} id={id} className={cn('input', error && errorRing, className)} {...rest} />
    </Chrome>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldChrome {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, containerClassName, className, id: idProp, rows = 3, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <Chrome id={id} label={label} error={error} hint={hint} containerClassName={containerClassName}>
      <textarea ref={ref} id={id} rows={rows} className={cn('input resize-y', error && errorRing, className)} {...rest} />
    </Chrome>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, FieldChrome {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, containerClassName, className, id: idProp, children, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <Chrome id={id} label={label} error={error} hint={hint} containerClassName={containerClassName}>
      <select ref={ref} id={id} className={cn('input', error && errorRing, className)} {...rest}>
        {children}
      </select>
    </Chrome>
  );
});
