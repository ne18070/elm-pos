'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerActions?: React.ReactNode;
  maxWidth?: string;
  closeOnBackdrop?: boolean;
}

export function SideDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  headerActions,
  maxWidth = "max-w-xl",
  closeOnBackdrop = true,
}: SideDrawerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={closeOnBackdrop ? onClose : undefined}
      />

      {/* Drawer */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-full bg-surface-card border-l border-surface-border z-[101] shadow-2xl transition-transform duration-500 transform flex flex-col",
          maxWidth,
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-surface-border flex items-center justify-between bg-surface-hover shrink-0 sticky top-0 z-20">
          <div className="min-w-0 flex-1 pr-4">
            <h3 className="text-base sm:text-xl font-black text-content-primary tracking-tight uppercase truncate">{title}</h3>
            {subtitle && <p className="text-[9px] sm:text-[10px] font-black text-content-primary uppercase tracking-widest mt-0.5 truncate">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {headerActions}
            <button
              onClick={onClose}
              className="p-3 bg-surface-input/50 sm:bg-transparent hover:bg-surface-input rounded-xl text-content-secondary hover:text-content-primary transition-all"
              aria-label="Fermer"
            >
              <X size={20} className="sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 no-scrollbar">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="p-6 pb-10 bg-surface-hover border-t border-surface-border shrink-0">
            {footer}
          </div>
        )}
      </div>
    </>,
    document.body
  );
}


