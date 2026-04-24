'use client';

import { useState, useEffect } from 'react';
import { 
  Calendar, Clock, CheckCircle, XCircle, Plus, 
  Settings, Loader2, Filter, Search, User, 
  ChevronRight, CalendarDays, AlertTriangle, Palmtree
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { 
  getLeaveRequests, updateLeaveRequestStatus, getLeaveTypes, 
  getPressureDays, type LeaveRequest, type LeaveType, 
  type PressureDay, type LeaveStatus 
} from '@services/supabase/leave';
import { toUserError } from '@/lib/user-error';
import { cn } from '@/lib/utils';

type LeaveTab = 'requests' | 'settings' | 'overview';

export default function LeaveManagementPage() {
  const { business, user } = useAuthStore();
  const { success: notifSuccess, error: notifError } = useNotificationStore();

  const [tab, setTab] = useState<LeaveTab>('requests');
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [pressureDays, setPressureDays] = useState<PressureDay[]>([]);
  
  const [statusFilter, setStatusFilter] = useState<LeaveStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  async function loadData() {
    if (!business) return;
    setLoading(true);
    try {
      const [r, t, p] = await Promise.all([
        getLeaveRequests(business.id),
        getLeaveTypes(business.id),
        getPressureDays(business.id)
      ]);
      setRequests(r);
      setTypes(t);
      setPressureDays(p);
    } catch (e) {
      notifError(toUserError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [business?.id]);

  async function handleAction(id: string, status: LeaveStatus) {
    try {
      await updateLeaveRequestStatus(id, status, undefined, user?.id);
      notifSuccess(`Demande ${status === 'approved' ? 'approuvée' : 'rejetée'}`);
      loadData();
    } catch (e) {
      notifError(toUserError(e));
    }
  }

  const filteredRequests = requests.filter(r => {
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchSearch = r.staff?.name.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="px-6 py-4 border-b border-surface-border bg-surface-card flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Palmtree className="w-5 h-5 text-content-brand" />
          <h1 className="text-xl font-bold text-white tracking-tight">Congés & Absences</h1>
        </div>
        <div className="flex bg-surface-input p-1 rounded-xl border border-surface-border">
          {[
            { id: 'requests', label: 'Demandes', icon: Clock },
            { id: 'overview', label: 'Planning', icon: CalendarDays },
            { id: 'settings', label: 'Configuration', icon: Settings },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as LeaveTab)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
                tab === t.id ? "bg-brand-600 text-white shadow-lg shadow-brand-500/20" : "text-slate-500 hover:text-slate-300"
              )}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-content-brand" />
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-6">
            
            {tab === 'requests' && (
              <div className="space-y-4">
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type="text" 
                      placeholder="Rechercher un employé..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="input pl-10 h-11 w-full"
                    />
                  </div>
                  <select 
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="input h-11 min-w-[150px]"
                  >
                    <option value="all">Tous les statuts</option>
                    <option value="pending">En attente</option>
                    <option value="approved">Approuvés</option>
                    <option value="rejected">Rejetés</option>
                  </select>
                </div>

                {/* List */}
                <div className="grid gap-3">
                  {filteredRequests.map((req) => (
                    <div key={req.id} className="bg-surface-card border border-surface-border rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4 hover:border-slate-700 transition-all">
                      <div className="w-12 h-12 rounded-2xl bg-brand-500/10 flex items-center justify-center shrink-0">
                        <User className="text-content-brand" size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-white truncate">{req.staff?.name}</h3>
                          <span className={cn(
                            "text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider",
                            req.status === 'pending' ? "bg-amber-500/10 text-status-warning border border-amber-500/20" :
                            req.status === 'approved' ? "bg-green-500/10 text-status-success border border-green-500/20" :
                            "bg-red-500/10 text-status-error border border-red-500/20"
                          )}>
                            {req.status}
                          </span>
                        </div>
                        <p className="text-xs text-content-secondary mt-0.5">
                          {req.leave_type?.name} · {req.total_days} jours
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Du {new Date(req.start_date).toLocaleDateString()} au {new Date(req.end_date).toLocaleDateString()}
                        </p>
                      </div>

                      {req.status === 'pending' && (
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleAction(req.id, 'rejected')}
                            className="p-2.5 rounded-xl bg-red-500/10 text-status-error hover:bg-red-500 hover:text-white transition-all border border-red-500/20"
                          >
                            <XCircle size={18} />
                          </button>
                          <button 
                            onClick={() => handleAction(req.id, 'approved')}
                            className="p-2.5 rounded-xl bg-green-500/10 text-status-success hover:bg-green-500 hover:text-white transition-all border border-green-500/20"
                          >
                            <CheckCircle size={18} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {filteredRequests.length === 0 && (
                    <div className="py-20 text-center">
                      <p className="text-slate-500 italic">Aucune demande trouvée.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === 'overview' && (
              <div className="bg-surface-card border border-surface-border rounded-3xl p-8 text-center space-y-4">
                <Calendar className="w-12 h-12 text-slate-600 mx-auto" />
                <h3 className="text-lg font-bold text-white">Calendrier des congés</h3>
                <p className="text-content-secondary text-sm max-w-sm mx-auto">
                  Visualisez l'absence de votre équipe sur un calendrier interactif pour mieux organiser vos opérations.
                </p>
                <div className="pt-4">
                  <span className="text-xs font-black uppercase tracking-widest text-content-brand bg-brand-500/10 px-3 py-1 rounded-full border border-brand-500/20">
                    Bientôt disponible
                  </span>
                </div>
              </div>
            )}

            {tab === 'settings' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">Types de congés</h2>
                    <button className="text-content-brand hover:text-content-brand transition-colors">
                      <Plus size={18} />
                    </button>
                  </div>
                  <div className="bg-surface-card border border-surface-border rounded-2xl divide-y divide-surface-border overflow-hidden">
                    {types.map(t => (
                      <div key={t.id} className="p-4 flex items-center justify-between hover:bg-surface-hover/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                          <div>
                            <p className="text-sm font-bold text-white">{t.name}</p>
                            <p className="text-[10px] text-slate-500">{t.yearly_days} jours / an</p>
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-slate-600" />
                      </div>
                    ))}
                    {types.length === 0 && (
                      <div className="p-8 text-center text-slate-500 text-sm italic">
                        Configurez vos types de congés (Payés, Maladie, etc.)
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">Jours de pression</h2>
                    <button className="text-content-brand hover:text-content-brand transition-colors">
                      <Plus size={18} />
                    </button>
                  </div>
                  <div className="bg-surface-card border border-surface-border rounded-2xl p-4 space-y-3">
                    <div className="flex items-start gap-3 p-3 bg-brand-500/5 border border-brand-500/10 rounded-xl">
                      <AlertTriangle className="text-content-brand shrink-0" size={18} />
                      <p className="text-[11px] text-content-secondary leading-relaxed">
                        Les jours de pression interdisent toute demande de congé sur ces dates (périodes de forte activité).
                      </p>
                    </div>
                    {pressureDays.map(pd => (
                       <div key={pd.id} className="flex items-center justify-between p-2 border-b border-surface-border last:border-0">
                          <span className="text-xs text-white font-medium">{new Date(pd.date).toLocaleDateString()}</span>
                          <span className="text-[10px] text-slate-500 italic">{pd.reason}</span>
                       </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
