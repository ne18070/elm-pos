import React from 'react';

interface MetricCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  color?: string;
}

export function MetricCard({
  label, value, icon: Icon, color = 'text-content-primary',
}: MetricCardProps) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-surface-input flex items-center justify-center shrink-0">
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-content-muted truncate">{label}</p>
        <p className={`text-lg font-bold truncate ${color}`}>{value}</p>
      </div>
    </div>
  );
}
