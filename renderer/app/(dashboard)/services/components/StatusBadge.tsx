import React from 'react';
import { cn } from '@/lib/utils';
import { ServiceOrderStatus } from '@services/supabase/service-orders';
import { STATUS_CFG } from '../constants';

export function StatusBadge({ status }: { status: ServiceOrderStatus }) {
  const cfg = STATUS_CFG[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full border', cfg.color)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  );
}

export function OTNumber({ n }: { n: number }) {
  return <span className="font-mono font-bold text-content-primary text-xs">OT-{String(n).padStart(4, '0')}</span>;
}
