import { useState, useMemo } from 'react';
import { 
  Phone, Mail, Receipt, GitBranch, Paperclip, Pencil, 
  Archive, ArchiveRestore, Filter, X, Search, Clock
} from 'lucide-react';
import { type Dossier } from '@services/supabase/dossiers';
import { type RefItem } from '@services/supabase/reference-data';
import { getStatusCls, getStatusLabel } from './dossier-utils';

function StatusBadge({ status, statuts }: { status: string; statuts: RefItem[] }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${getStatusCls(status, statuts)}`}>
      {getStatusLabel(status, statuts)}
    </span>
  );
}

export function DossierTable({ 
  dossiers, statuts, typesAffaire, 
  canEdit, canArchive, showArchived,
  onEdit, onArchive, onFinances, onWorkflow, onFiles, onTime
}: { 
  dossiers: Dossier[]; 
  statuts: RefItem[]; 
  typesAffaire: RefItem[];
  canEdit: boolean;
  canArchive: boolean;
  showArchived: boolean;
  onEdit: (d: Dossier) => void;
  onArchive: (d: Dossier, archive: boolean) => void;
  onFinances: (d: Dossier) => void;
  onWorkflow: (d: Dossier) => void;
  onFiles: (d: Dossier) => void;
  onTime: (d: Dossier) => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    return dossiers.filter(d => {
      const matchesSearch = !search || 
        d.reference.toLowerCase().includes(search.toLowerCase()) || 
        d.client_name.toLowerCase().includes(search.toLowerCase()) ||
        (d.adversaire || '').toLowerCase().includes(search.toLowerCase());
      
      const isArchived = d.status === 'archivé';
      const matchesArchive = isArchived === showArchived;
      const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
      const matchesType = typeFilter === 'all' || d.type_affaire === typeFilter;

      return matchesSearch && matchesArchive && matchesStatus && matchesType;
    });
  }, [dossiers, search, showArchived, statusFilter, typeFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative group flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted group-focus-within:text-content-brand transition-colors" />
          <input
            className="input w-full pl-11"
            placeholder="Référence, client, adversaire..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
          />
        </div>
        <button 
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-bold text-xs uppercase tracking-widest transition-all ${showFilters ? 'bg-brand-500/10 border-brand-500 text-content-brand' : 'bg-surface border-surface-border text-content-secondary hover:text-content-primary'}`}
        >
          <Filter className="w-4 h-4" />
          Filtres
        </button>
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-2 p-3 bg-surface/50 border border-surface-border rounded-xl animate-in slide-in-from-top-2 duration-200">
          <div className="flex-1 min-w-[150px]">
            <label className="text-[10px] font-black uppercase text-content-muted mb-1 block">Statut</label>
            <select 
              className="input h-9 text-xs bg-surface-input" 
              value={statusFilter} 
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">Tous les statuts</option>
              {statuts.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="text-[10px] font-black uppercase text-content-muted mb-1 block">Type d'affaire</label>
            <select 
              className="input h-9 text-xs bg-surface-input" 
              value={typeFilter} 
              onChange={e => setTypeFilter(e.target.value)}
            >
              <option value="all">Tous les types</option>
              {typesAffaire.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button 
              onClick={() => { setStatusFilter('all'); setTypeFilter('all'); setSearch(''); }}
              className="h-9 px-3 text-[10px] font-black uppercase text-content-muted hover:text-content-primary transition-colors"
            >
              Réinitialiser
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card p-16 text-center text-content-muted italic border-dashed bg-transparent border-surface-border">
          Aucun dossier trouvé.
        </div>
      ) : (
        <>
          {/* Table view (desktop) */}
          <div className="hidden lg:block card overflow-hidden bg-surface/20 border-surface-border shadow-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface/50 border-b border-surface-border text-content-muted uppercase text-[9px] font-black tracking-[0.2em]">
                <tr className="text-left">
                  <th className="px-6 py-4 sticky left-0 bg-surface/50 z-10">Référence</th>
                  <th className="px-6 py-4">Client</th>
                  <th className="px-6 py-4">Contact</th>
                  <th className="px-6 py-4">Type d&apos;affaire</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right sticky right-0 bg-surface/50 z-10">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/50">
                {filtered.map(d => (
                  <tr key={d.id} className="hover:bg-surface/40 transition-colors group">
                    <td className="px-6 py-4 font-mono text-status-purple font-bold sticky left-0 bg-surface/10 backdrop-blur-sm group-hover:bg-surface/50 transition-colors">{d.reference}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-content-primary font-bold tracking-tight">{d.client_name}</span>
                        <span className="text-[10px] text-content-muted uppercase font-medium">{d.adversaire ? `vs ${d.adversaire}` : ''}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-0.5">
                        {d.client_phone && <span className="text-content-primary text-xs flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-content-brand" /> {d.client_phone}</span>}
                        {d.client_email && <span className="text-content-muted text-[11px] flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {d.client_email}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-content-secondary font-medium">{d.type_affaire}</td>
                    <td className="px-6 py-4 text-center"><StatusBadge status={d.status} statuts={statuts} /></td>
                    <td className="px-6 py-4 text-right sticky right-0 bg-surface/10 backdrop-blur-sm group-hover:bg-surface/50 transition-colors">
                      <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => onTime(d)} className="p-2 rounded-lg hover:bg-surface-card text-content-secondary hover:text-status-info transition-all" title="Saisir du temps (Chronos)"><Clock className="w-4 h-4" /></button>
                        <button onClick={() => onFinances(d)} className="p-2 rounded-lg hover:bg-surface-card text-content-secondary hover:text-status-success transition-all" title="Honoraires & Finances"><Receipt className="w-4 h-4" /></button>
                        <button onClick={() => onWorkflow(d)} className="p-2 rounded-lg hover:bg-surface-card text-content-secondary hover:text-content-brand transition-all" title="Suivi Processus"><GitBranch className="w-4 h-4" /></button>
                        <button onClick={() => onFiles(d)} className="p-2 rounded-lg hover:bg-surface-card text-content-secondary hover:text-status-purple transition-all" title="Pièces Jointes"><Paperclip className="w-4 h-4" /></button>
                        {canEdit && (
                          <button onClick={() => onEdit(d)} className="p-2 rounded-lg hover:bg-surface-card text-content-secondary hover:text-content-primary transition-all" title="Modifier Dossier"><Pencil className="w-4 h-4" /></button>
                        )}
                        {canArchive && (
                          <button 
                            onClick={() => onArchive(d, !showArchived)} 
                            className={`p-2 rounded-lg hover:bg-surface-card transition-all ${showArchived ? 'text-status-warning hover:text-status-warning' : 'text-content-secondary hover:text-status-warning'}`}
                            title={showArchived ? 'Désarchiver' : 'Archiver'}
                          >
                            {showArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Card layout (mobile/tablet) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:hidden">
            {filtered.map(d => (
              <div key={d.id} className="card p-4 space-y-4 bg-surface/30 border-surface-border group transition-all hover:border-brand-500/30">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-mono text-status-purple font-black text-sm tracking-tight">{d.reference}</p>
                    <p className="font-bold text-content-primary mt-1">{d.client_name}</p>
                    {d.adversaire && <p className="text-[10px] text-content-muted uppercase font-bold">vs {d.adversaire}</p>}
                  </div>
                  <StatusBadge status={d.status} statuts={statuts} />
                </div>
                
                <div className="space-y-1.5 pt-3 border-t border-surface-border/50">
                  {d.client_phone && <p className="text-xs text-content-secondary flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-content-brand" /> {d.client_phone}</p>}
                  {d.client_email && <p className="text-xs text-content-secondary flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-content-brand" /> {d.client_email}</p>}
                  <p className="text-xs text-content-muted flex items-center gap-2 font-medium tracking-tight mt-1 capitalize"><Receipt className="w-3.5 h-3.5" /> {d.type_affaire}</p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-surface-border/50">
                  <div className="flex items-center gap-1">
                    <button onClick={() => onTime(d)} className="p-2.5 rounded-xl bg-surface-card text-content-secondary hover:text-status-info transition-all"><Clock className="w-4 h-4" /></button>
                    <button onClick={() => onFinances(d)} className="p-2.5 rounded-xl bg-surface-card text-content-secondary hover:text-status-success transition-all"><Receipt className="w-4 h-4" /></button>
                    <button onClick={() => onWorkflow(d)} className="p-2.5 rounded-xl bg-surface-card text-content-secondary hover:text-content-brand transition-all"><GitBranch className="w-4 h-4" /></button>
                    <button onClick={() => onFiles(d)} className="p-2.5 rounded-xl bg-surface-card text-content-secondary hover:text-status-purple transition-all"><Paperclip className="w-4 h-4" /></button>
                  </div>
                  <div className="flex items-center gap-1">
                    {canEdit && (
                      <button onClick={() => onEdit(d)} className="p-2.5 rounded-xl bg-surface-card text-content-secondary hover:text-content-primary transition-all"><Pencil className="w-4 h-4" /></button>
                    )}
                    {canArchive && (
                      <button 
                        onClick={() => onArchive(d, !showArchived)} 
                        className={`p-2.5 rounded-xl bg-surface-card transition-all ${showArchived ? 'text-status-warning' : 'text-content-secondary'}`}
                      >
                        {showArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
