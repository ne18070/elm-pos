import { useState, useMemo } from 'react';
import { 
  Users, Plus, Pencil, Trash2, List, Map as MapIcon, 
  Search as SearchIcon, X, Phone, Mail, Building2, LogIn, Link2, Unlink, Filter
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { initials } from './staff-utils';
import { type Staff, type SalaryType } from '@services/supabase/staff';
import type { User as SystemUser } from '@pos-types';
import { StaffOffices } from '@/components/admin/StaffOffices';

export function EmployeesTab({ 
  staffList, teamMembers, currency, onAdd, onEdit, onDelete, onUpdateStaff, onLinkAccount, onUnlinkAccount 
}: { 
  staffList: Staff[]; 
  teamMembers: SystemUser[];
  currency: string;
  onAdd: () => void;
  onEdit: (s: Staff) => void;
  onDelete: (s: Staff) => void;
  onUpdateStaff: (id: string, form: any) => Promise<void>;
  onLinkAccount: (s: Staff) => void;
  onUnlinkAccount: (s: Staff) => void;
}) {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'offices'>('list');
  const [showFilters, setShowFilters] = useState(false);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [salaryFilter, setSalaryFilter] = useState<SalaryType | 'all'>('all');

  const departments = useMemo(() => 
    Array.from(new Set(staffList.map(s => s.department).filter(Boolean))),
    [staffList]
  );

  const filteredStaff = useMemo(() => {
    return staffList.filter(s => {
      const matchSearch = !search || 
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.position ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (s.department ?? '').toLowerCase().includes(search.toLowerCase());
      
      const matchStatus = statusFilter === 'all' || s.status === statusFilter;
      const matchDept = deptFilter === 'all' || s.department === deptFilter;
      const matchAccount = accountFilter === 'all' || (accountFilter === 'linked' ? !!s.user_id : !s.user_id);
      const matchSalary = salaryFilter === 'all' || s.salary_type === salaryFilter;

      return matchSearch && matchStatus && matchDept && matchAccount && matchSalary;
    });
  }, [staffList, search, statusFilter, deptFilter, accountFilter, salaryFilter]);

  const activeCount = staffList.filter(s => s.status === 'active').length;

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4">
      {/* Search + filter bar */}
      <div className="flex flex-col lg:flex-row gap-3 items-center">
        <div className="relative flex-1 w-full">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher (nom, poste, dépt)..."
            className="input pl-10 text-sm h-11 bg-surface-input focus:bg-surface-input w-full"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-content-muted hover:text-content-primary">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full lg:w-auto">
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all h-11",
              showFilters ? "bg-brand-600 text-content-primary border-brand-500 shadow-lg" : "bg-surface-input border-surface-border text-content-secondary hover:text-content-primary"
            )}
          >
            <Filter size={14} />
            Filtres
          </button>

          <div className="flex bg-surface-input p-1 rounded-xl border border-surface-border h-11">
            <button onClick={() => setView('list')} className={cn("flex items-center gap-2 px-4 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all", view === 'list' ? "bg-brand-600 text-content-primary shadow-lg" : "text-content-muted hover:text-content-primary")}>
              <List size={14} /> Liste
            </button>
            <button onClick={() => setView('offices')} className={cn("flex items-center gap-2 px-4 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all", view === 'offices' ? "bg-brand-600 text-content-primary shadow-lg" : "text-content-muted hover:text-content-primary")}>
              <MapIcon size={14} /> Espaces
            </button>
          </div>
        </div>
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-surface-input/30 border border-surface-border rounded-2xl animate-in slide-in-from-top-2 duration-200">
          <div>
            <label className="text-[9px] font-black uppercase text-content-muted block mb-1.5 ml-1">Statut</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="input h-9 text-xs">
              <option value="all">Tous les statuts</option>
              <option value="active">Actifs</option>
              <option value="inactive">Inactifs</option>
            </select>
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-content-muted block mb-1.5 ml-1">Département</label>
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="input h-9 text-xs">
              <option value="all">Tous les départements</option>
              {departments.map(d => <option key={d} value={d!}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-content-muted block mb-1.5 ml-1">Compte App</label>
            <select value={accountFilter} onChange={e => setAccountFilter(e.target.value as any)} className="input h-9 text-xs">
              <option value="all">Tous</option>
              <option value="linked">Liés</option>
              <option value="unlinked">Non liés</option>
            </select>
          </div>
          <div>
            <label className="text-[9px] font-black uppercase text-content-muted block mb-1.5 ml-1">Type Salaire</label>
            <select value={salaryFilter} onChange={e => setSalaryFilter(e.target.value as any)} className="input h-9 text-xs">
              <option value="all">Tous</option>
              <option value="monthly">Mensuel</option>
              <option value="daily">Journalier</option>
              <option value="hourly">Horaire</option>
            </select>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-2">
        <span className="text-[10px] font-black text-content-muted uppercase tracking-widest">
          {filteredStaff.length} Résultat{filteredStaff.length > 1 ? 's' : ''}
        </span>
        <div className="text-[10px] font-black text-content-muted uppercase tracking-widest">
          <span className="text-status-success">{activeCount}</span> actifs
        </div>
      </div>

      {filteredStaff.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-surface-card/30 rounded-3xl border border-dashed border-surface-border">
          <Users className="w-12 h-12 text-content-muted mb-4 opacity-20" />
          <p className="text-content-primary font-bold">Aucun employé trouvé</p>
          <button onClick={onAdd} className="mt-6 btn-primary px-6 py-2.5 flex items-center gap-2 text-xs font-black uppercase tracking-widest">
            <Plus size={16} /> Ajouter un employé
          </button>
        </div>
      ) : view === 'offices' ? (
        <StaffOffices staffList={filteredStaff} onUpdateStaff={onUpdateStaff} />
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 pb-20 sm:pb-4">
          {filteredStaff.map((s) => (
            <StaffCard key={s.id} staff={s} currency={currency}
              teamMember={teamMembers.find((m) => m.id === s.user_id) ?? null}
              onEdit={() => onEdit(s)}
              onDelete={() => onDelete(s)}
              onLinkAccount={() => onLinkAccount(s)}
              onUnlinkAccount={() => onUnlinkAccount(s)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StaffCard({
  staff: s, currency, teamMember, onEdit, onDelete, onLinkAccount, onUnlinkAccount,
}: {
  staff: Staff;
  currency: string;
  teamMember: SystemUser | null;
  onEdit: () => void;
  onDelete: () => void;
  onLinkAccount: () => void;
  onUnlinkAccount: () => void;
}) {
  const rate = s.salary_type === 'hourly'
    ? `${s.salary_rate.toLocaleString('fr-FR')} /h`
    : s.salary_type === 'daily'
      ? `${s.salary_rate.toLocaleString('fr-FR')} /j`
      : `${s.salary_rate.toLocaleString('fr-FR')} /m`;

  return (
    <div className="bg-surface-card border border-surface-border rounded-2xl p-5 flex flex-col gap-4 relative overflow-hidden transition-all hover:border-brand-500/30 group">
      <div className={`absolute top-0 left-0 w-1.5 h-full ${s.status === 'active' ? 'bg-brand-600' : 'bg-surface-input'}`} />
      
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-surface-input border border-surface-border flex items-center justify-center shrink-0 shadow-inner group-hover:scale-105 transition-transform">
            <span className="text-content-primary font-black text-lg">{initials(s.name)}</span>
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-content-primary text-base truncate tracking-tight">{s.name}</h3>
            <p className="text-[10px] text-content-muted font-black uppercase tracking-widest truncate">{s.position ?? 'Poste non défini'}</p>
          </div>
        </div>
        
        <div className="flex flex-col items-end shrink-0">
          <p className="text-sm font-black text-content-brand tracking-tight">{rate}</p>
          <span className={cn(
            "text-[9px] font-black mt-1.5 px-2 py-0.5 rounded-full border tracking-widest",
            s.status === 'active' ? 'border-green-900/50 text-status-success bg-badge-success' : 'border-surface-border text-content-muted bg-surface/20'
          )}>
            {s.status === 'active' ? 'ACTIF' : 'INACTIF'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 py-4 border-y border-surface-border/50">
        {s.phone && (
          <div className="flex items-center gap-3 text-xs text-content-secondary">
            <Phone size={14} className="text-content-muted" />
            <span className="font-medium">{s.phone}</span>
          </div>
        )}
        {s.email && (
          <div className="flex items-center gap-3 text-xs text-content-secondary">
            <Mail size={14} className="text-content-muted" />
            <span className="truncate font-medium">{s.email}</span>
          </div>
        )}
        {s.department && (
          <div className="flex items-center gap-3 text-xs text-content-secondary">
            <Building2 size={14} className="text-content-muted" />
            <span className="font-medium">Département : {s.department}</span>
          </div>
        )}
      </div>

      <div className="space-y-3 pt-1">
        {teamMember ? (
          <div className="flex items-center justify-between bg-surface-input border border-surface-border rounded-xl px-3 py-2.5 shadow-inner">
            <div className="flex items-center gap-3 min-w-0">
              <LogIn size={16} className="text-status-success" />
              <div className="min-w-0">
                <p className="text-[9px] font-black text-content-muted uppercase tracking-widest">Accès utilisateur</p>
                <p className="text-xs text-content-primary truncate font-bold">{teamMember.email}</p>
              </div>
            </div>
            <button onClick={onUnlinkAccount} 
              className="p-2 text-content-muted hover:text-status-error hover:bg-badge-error rounded-lg transition-all"
              title="Délier le compte">
              <Unlink size={16} />
            </button>
          </div>
        ) : (
          <button onClick={onLinkAccount}
            className="w-full h-11 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-surface-border text-content-muted hover:text-content-brand hover:border-brand-500 hover:bg-brand-500/5 transition-all text-[10px] font-black uppercase tracking-widest">
            <Link2 size={16} /> Activer accès App
          </button>
        )}

        <div className="flex gap-2">
          <button onClick={onEdit}
            className="flex-1 h-10 flex items-center justify-center gap-2 bg-surface-input hover:bg-surface-hover text-content-primary rounded-xl transition-all text-xs font-bold border border-surface-border">
            <Pencil size={14} /> Modifier
          </button>
          <button onClick={onDelete}
            className="w-10 h-10 flex items-center justify-center border border-surface-border hover:border-status-error hover:bg-badge-error text-content-muted hover:text-status-error rounded-xl transition-all">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
