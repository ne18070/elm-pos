import { useMemo } from 'react';
import { Scale, Calendar, AlertCircle, Banknote, GitBranch, HardDrive } from 'lucide-react';
import { formatBytes, type StorageInfo } from '@services/supabase/dossier-fichiers';
import { type Dossier } from '@services/supabase/dossiers';

export function OperationalKPIs({ 
  dossiers, storageInfo 
}: { 
  dossiers: Dossier[]; storageInfo: StorageInfo | null;
}) {
  const stats = useMemo(() => {
    const now = new Date();
    const open = dossiers.filter(d => d.status !== 'archivé');
    const upcomingHearings = open.filter(d => d.date_audience && new Date(d.date_audience) >= now).length;
    const noAction = open.filter(d => !d.date_audience).length;
    
    // NOTE: For unpaid fees, we would need the honoraires data too, 
    // but we can show a placeholder or pass it if available.
    // For now, let's focus on dossier-based KPIs.

    return [
      { label: 'Dossiers ouverts', value: open.length, icon: Scale, color: 'text-brand-500' },
      { label: 'Audiences à venir', value: upcomingHearings, icon: Calendar, color: 'text-status-info' },
      { label: 'Sans prochaine action', value: noAction, icon: AlertCircle, color: 'text-status-warning' },
      { label: 'Stockage utilisé', value: storageInfo ? `${Math.round(storageInfo.used_pct)}%` : '—', icon: HardDrive, color: storageInfo?.used_pct && storageInfo.used_pct > 90 ? 'text-status-error' : 'text-content-secondary' },
    ];
  }, [dossiers, storageInfo]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-1">
      {stats.map((s) => (
        <div key={s.label} className="card p-4 flex items-center gap-4 bg-surface/30 border-surface-border/50 group hover:border-brand-500/30 transition-all">
          <div className={`p-3 rounded-2xl bg-surface-card ${s.color} group-hover:scale-110 transition-transform`}>
            <s.icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xl font-black text-content-primary leading-tight">{s.value}</p>
            <p className="text-[10px] text-content-muted uppercase font-black tracking-widest mt-0.5">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
