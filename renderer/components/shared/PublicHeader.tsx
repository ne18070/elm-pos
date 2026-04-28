'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PublicHeaderProps {
  business: {
    name: string;
    logo_url?: string | null;
  } | null;
  loading?: boolean;
  title?: string;
}

export function PublicHeader({ business, loading, title = "Espace Client" }: PublicHeaderProps) {
  return (
    <header className="bg-surface-card border-b border-surface-border sticky top-0 z-10 shadow-sm">
      <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-xl bg-surface-hover border border-surface-border overflow-hidden shrink-0">
            {business?.logo_url ? (
              <img src={business.logo_url} alt={business.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-brand-600 flex items-center justify-center">
                <span className="text-white font-black text-sm">
                  {business?.name?.slice(0, 2).toUpperCase() ?? 'EL'}
                </span>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-content-muted leading-none mb-1">
              {title}
            </p>
            <h1 className="font-bold text-content-primary text-base truncate leading-none">
              {business?.name ?? 'Chargement...'}
            </h1>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => window.location.reload()} 
            className="p-2 rounded-xl bg-surface-hover text-content-secondary hover:text-brand-600 transition-colors"
            title="Actualiser"
          >
            <Loader2 className={cn("w-5 h-5", loading && "animate-spin")} />
          </button>
          <img src="/logo.png" alt="ELM APP" className="h-10 w-auto shrink-0 object-contain" />
        </div>
      </div>
    </header>
  );
}
