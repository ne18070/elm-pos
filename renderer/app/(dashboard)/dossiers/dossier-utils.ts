import { type RefItem } from '@services/supabase/reference-data';

export function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtLongDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { 
    day: '2-digit', 
    month: 'long', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export const TABS = [
  { id: 'dossiers'    as const, label: 'Dossiers',          icon: 'Scale' },
  { id: 'monitoring'  as const, label: 'Suivi',             icon: 'Activity' },
  { id: 'workflows'   as const, label: 'Processus',         icon: 'GitBranch' },
  { id: 'pretentions' as const, label: 'Modèles juridiques', icon: 'BookOpen' },
  { id: 'config'      as const, label: 'Paramètres',        icon: 'Settings2' },
];

export type DossierTab = 'dossiers' | 'monitoring' | 'workflows' | 'pretentions' | 'config';

export function getStatusCls(status: string, statuts: RefItem[]) {
  const s = statuts.find((x) => x.value === status);
  return (s?.metadata?.cls as string) ?? 'bg-surface-card text-content-secondary border-surface-border';
}

export function getStatusLabel(status: string, statuts: RefItem[]) {
  const s = statuts.find((x) => x.value === status);
  return s?.label ?? status;
}
