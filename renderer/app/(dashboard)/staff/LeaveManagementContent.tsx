import { useState, useEffect, useMemo } from 'react';
import { 
  Users, Plus, Pencil, Trash2, X, Loader2, Clock, 
  CheckCircle, CalendarDays, Settings, Search as SearchIcon, 
  AlertTriangle, Palmtree
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { toUserError } from '@/lib/user-error';
import { cn } from '@/lib/utils';
import { 
  getLeaveRequests, updateLeaveRequestStatus, getLeaveTypes, 
  getPressureDays, createLeaveRequest, upsertLeaveType, deletePressureDay, addPressureDay,
  type LeaveRequest, type LeaveType, 
  type PressureDay, type LeaveStatus 
} from '@services/supabase/leave';
import { type Staff } from '@services/supabase/staff';
import { LeaveCalendar } from '@/components/admin/LeaveCalendar';
import { Field, ModalWrapper } from './SharedComponents';

export function LeaveManagementContent({ staffList, askConfirm }: { staffList: Staff[]; askConfirm: (msg: string, onConfirm: () => void) => void; }) {
  const { business, user } = useAuthStore();
  const { success: notifSuccess, error: notifError } = useNotificationStore();

  const [tab, setTab] = useState<'requests' | 'settings' | 'overview'>('requests');
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [pressureDays, setPressureDays] = useState<PressureDay[]>([]);
  
  const now = new Date();
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);
  const [calYear, setCalYear] = useState(now.getFullYear());

  const [statusFilter, setStatusFilter] = useState<LeaveStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  const [typeModal, setTypeModal] = useState<Partial<LeaveType> | null>(null);
  const [pressureModal, setPressureModal] = useState<Partial<PressureDay> | null>(null);
  const [requestModal, setRequestModal] = useState<boolean>(false);

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

  if (loading) return (
    <div className="h-64 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-content-brand" />
    </div>
  );

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="flex bg-surface-input p-1 rounded-xl border border-surface-border w-fit shrink-0">
          {[
            { id: 'requests', label: 'Demandes', icon: Clock },
            { id: 'overview', label: 'Planning', icon: CalendarDays },
            { id: 'settings', label: 'Configuration', icon: Settings },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap",
                tab === t.id ? "bg-brand-600 text-content-primary shadow-lg" : "text-content-muted hover:text-content-primary"
              )}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto">
          <div className="relative flex-1 lg:w-64">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
            <input 
              type="text" 
              placeholder={tab === 'requests' ? "Rechercher un employé..." : "Rechercher un type..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10 h-10 w-full text-xs h-11"
            />
          </div>
          
          {tab === 'requests' && (
            <button 
              onClick={() => setRequestModal(true)}
              className="btn-primary h-11 px-4 flex items-center gap-2 text-xs font-bold shrink-0 shadow-lg shadow-brand-500/20 uppercase tracking-widest"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Nouvelle demande</span>
            </button>
          )}
        </div>
      </div>

      {tab === 'requests' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="input h-9 text-xs min-w-[150px] bg-surface-input"
            >
              <option value="all">Tous les statuts</option>
              <option value="pending">En attente</option>
              <option value="approved">Approuvés</option>
              <option value="rejected">Rejetés</option>
            </select>
          </div>

          <div className="grid gap-3">
            {filteredRequests.map((req) => (
              <div key={req.id} className="bg-surface-card border border-surface-border rounded-2xl p-4 flex items-center gap-4 hover:border-surface-border transition-all">
                <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0">
                  <Users className="text-content-brand" size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-content-primary truncate">{req.staff?.name}</h3>
                    <span className={cn(
                      "text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider border",
                      req.status === 'pending' ? "bg-amber-500/10 text-status-warning border-amber-500/20" :
                      req.status === 'approved' ? "bg-green-500/10 text-status-success border-green-500/20" :
                      "bg-red-500/10 text-status-error border-red-500/20"
                    )}>
                      {req.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-content-secondary">
                    {req.leave_type?.name} · {req.total_days} jours
                  </p>
                  <p className="text-[10px] text-content-muted font-medium italic">
                    Du {new Date(req.start_date).toLocaleDateString()} au {new Date(req.end_date).toLocaleDateString()}
                  </p>
                </div>
                {req.status === 'pending' && (
                  <div className="flex gap-2">
                    <button onClick={() => handleAction(req.id, 'rejected')} className="p-2 rounded-lg bg-red-500/10 text-status-error border border-red-500/20 hover:bg-red-500/20 transition-colors">
                      <X size={16} />
                    </button>
                    <button onClick={() => handleAction(req.id, 'approved')} className="p-2 rounded-lg bg-green-500/10 text-status-success border border-green-500/20 hover:bg-green-500/20 transition-colors">
                      <CheckCircle size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {filteredRequests.length === 0 && (
              <div className="py-20 text-center bg-surface-input/20 rounded-3xl border border-dashed border-surface-border text-content-muted text-sm italic">Aucune demande trouvée.</div>
            )}
          </div>
        </div>
      )}

      {tab === 'overview' && (
        <div className="space-y-6">
          <LeaveCalendar 
            year={calYear}
            month={calMonth}
            requests={requests}
            onPrev={() => {
              if (calMonth === 1) { setCalMonth(12); setCalYear(y => y - 1); }
              else setCalMonth(m => m - 1);
            }}
            onNext={() => {
              if (calMonth === 12) { setCalMonth(1); setCalYear(y => y + 1); }
              else setCalMonth(m => m + 1);
            }}
          />
          
          <div className="flex flex-wrap gap-4 px-2">
            {types.map(t => (
              <div key={t.id} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider">{t.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-12">
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-[10px] font-black text-content-muted uppercase tracking-widest">Types de congés</h2>
              <button 
                onClick={() => setTypeModal({ name: '', yearly_days: 25, is_paid: true, color: '#3b82f6' })}
                className="text-content-brand hover:text-content-brand transition-colors"
              >
                <Plus size={18} />
              </button>
            </div>
            <div className="bg-surface-card border border-surface-border rounded-2xl divide-y divide-surface-border overflow-hidden">
              {types.map(t => (
                <div key={t.id} className="p-4 flex items-center justify-between group hover:bg-surface-hover/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                    <div>
                      <span className="text-sm font-bold text-content-primary block">{t.name}</span>
                      <span className="text-[10px] text-content-muted font-medium">{t.yearly_days} jours / an · {t.is_paid ? 'Payé' : 'Sans solde'}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => setTypeModal(t)}
                    className="p-2 opacity-0 group-hover:opacity-100 text-content-muted hover:text-content-primary transition-all bg-surface-input rounded-lg"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              ))}
              {types.length === 0 && (
                <div className="p-8 text-center text-content-muted text-xs italic">Configurez vos types de congés (Payés, Maladie, etc.)</div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-[10px] font-black text-content-muted uppercase tracking-widest">Jours de pression</h2>
              <button 
                onClick={() => setPressureModal({ date: new Date().toISOString().split('T')[0], reason: '' })}
                className="text-content-brand hover:text-content-brand transition-colors"
              >
                <Plus size={18} />
              </button>
            </div>
            <div className="bg-surface-card border border-surface-border rounded-2xl overflow-hidden divide-y divide-surface-border">
              {pressureDays.map(pd => (
                <div key={pd.id} className="p-4 flex items-center justify-between group hover:bg-surface-hover/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center border border-red-500/20">
                      <AlertTriangle size={14} className="text-status-error" />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-content-primary block">{new Date(pd.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</span>
                      <span className="text-[10px] text-content-muted font-medium italic">{pd.reason}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      askConfirm('Supprimer ce jour de pression ?', async () => {
                        try {
                          await deletePressureDay(pd.id);
                          loadData();
                          notifSuccess('Jour de pression supprimé');
                        } catch (e) { notifError(String(e)); }
                      });
                    }}
                    className="p-2 opacity-0 group-hover:opacity-100 text-content-muted hover:text-status-error transition-all bg-surface-input rounded-lg"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {pressureDays.length === 0 && (
                <div className="p-8 text-center text-content-muted text-xs italic">Bloquez des dates critiques pour interdire les congés.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {typeModal && (
        <LeaveTypeModal 
          type={typeModal} 
          onClose={() => setTypeModal(null)} 
          onSaved={() => { setTypeModal(null); loadData(); }} 
          businessId={business!.id}
          notifError={notifError}
        />
      )}

      {pressureModal && (
        <PressureDayModal 
          day={pressureModal} 
          onClose={() => setPressureModal(null)} 
          onSaved={() => { setPressureModal(null); loadData(); }} 
          businessId={business!.id}
          notifError={notifError}
        />
      )}

      {requestModal && (
        <AdminLeaveRequestModal 
          onClose={() => setRequestModal(false)}
          onSaved={() => { setRequestModal(false); loadData(); }}
          businessId={business!.id}
          staffList={staffList}
          leaveTypes={types}
          pressureDays={pressureDays}
          notifError={notifError}
        />
      )}
    </div>
  );
}

function LeaveTypeModal({ type, businessId, onClose, onSaved, notifError }: { type: Partial<LeaveType>, businessId: string, onClose: () => void, onSaved: () => void, notifError: (m: string) => void }) {
  const [form, setForm] = useState(type);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await upsertLeaveType({ ...form, business_id: businessId } as any);
      onSaved();
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <ModalWrapper title="Type de congé" onClose={onClose}>
      <Field label="Nom" value={form.name || ''} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="ex: Congés Payés" />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Jours / an" type="number" value={String(form.yearly_days || 0)} onChange={v => setForm(f => ({ ...f, yearly_days: parseFloat(v) }))} />
        <div>
          <label className="text-xs text-content-secondary block mb-1">Couleur</label>
          <input type="color" value={form.color || '#3b82f6'} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-full h-11 bg-transparent border-none p-0 cursor-pointer" />
        </div>
      </div>
      <div className="flex items-center gap-2 p-3 bg-surface-input rounded-xl border border-surface-border">
        <input type="checkbox" checked={form.is_paid} onChange={e => setForm(f => ({ ...f, is_paid: e.target.checked }))} className="accent-brand-500" />
        <span className="text-sm text-content-primary font-bold">Congé rémunéré</span>
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={onClose} className="flex-1 h-11 rounded-xl bg-surface-hover text-content-secondary font-bold text-xs uppercase tracking-widest transition-colors hover:text-content-primary">Annuler</button>
        <button onClick={save} disabled={saving} className="flex-1 h-11 rounded-xl btn-primary font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2">
          {saving && <Loader2 size={14} className="animate-spin" />}
          Enregistrer
        </button>
      </div>
    </ModalWrapper>
  );
}

function PressureDayModal({ day, businessId, onClose, onSaved, notifError }: { day: Partial<PressureDay>, businessId: string, onClose: () => void, onSaved: () => void, notifError: (m: string) => void }) {
  const [form, setForm] = useState(day);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await addPressureDay({ business_id: businessId, date: form.date!, reason: form.reason! });
      onSaved();
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <ModalWrapper title="Jour de pression" subtitle="Date critique où les congés sont interdits" onClose={onClose}>
      <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl mb-4">
        <AlertTriangle className="text-status-error shrink-0" size={20} />
        <p className="text-xs text-status-error font-medium leading-relaxed">Les employés ne pourront pas demander de congé incluant cette date.</p>
      </div>
      <Field label="Date" type="date" value={form.date || ''} onChange={v => setForm(f => ({ ...f, date: v }))} />
      <Field label="Raison" value={form.reason || ''} onChange={v => setForm(f => ({ ...f, reason: v }))} placeholder="ex: Inventaire annuel" />
      <div className="flex gap-3 pt-2">
        <button onClick={onClose} className="flex-1 h-11 rounded-xl bg-surface-hover text-content-secondary font-bold text-xs uppercase tracking-widest transition-colors hover:text-content-primary">Annuler</button>
        <button onClick={save} disabled={saving} className="flex-1 h-11 rounded-xl btn-primary font-bold text-xs uppercase tracking-widest">Enregistrer</button>
      </div>
    </ModalWrapper>
  );
}

function AdminLeaveRequestModal({ onClose, onSaved, businessId, staffList = [], leaveTypes = [], pressureDays = [], notifError }: { onClose: () => void, onSaved: () => void, businessId: string, staffList: Staff[], leaveTypes: LeaveType[], pressureDays: PressureDay[], notifError: (m: string) => void }) {
  const [staffSearch, setStaffSearch] = useState('');
  const [typeSearch, setTypeSearch] = useState('');
  
  const activeStaffList = useMemo(() => 
    staffList.filter(s => s.status === 'active' && s.name.toLowerCase().includes(staffSearch.toLowerCase())),
    [staffList, staffSearch]
  );

  const filteredTypes = useMemo(() => 
    leaveTypes.filter(t => t.name.toLowerCase().includes(typeSearch.toLowerCase())),
    [leaveTypes, typeSearch]
  );

  const [staffId, setStaffId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [start, setStart] = useState(new Date().toISOString().split('T')[0]);
  const [end, setEnd] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (activeStaffList.length > 0 && !staffId) setStaffId(activeStaffList[0].id);
    if (filteredTypes.length > 0 && !typeId) setTypeId(filteredTypes[0].id);
  }, [activeStaffList, filteredTypes, staffId, typeId]);

  async function save() {
    if (!staffId || !typeId) return notifError('Sélectionnez un employé et un type de congé');
    const s = new Date(start);
    const e = new Date(end);
    const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 3600 * 24)) + 1;
    if (diff <= 0) return notifError('Dates invalides');

    setSaving(true);
    try {
      await createLeaveRequest({
        business_id: businessId,
        staff_id: staffId,
        leave_type_id: typeId,
        start_date: start,
        end_date: end,
        total_days: diff,
        reason: reason,
        attachments: [],
        admin_notes: null,
        approved_at: null,
        approved_by: null
      });
      onSaved();
    } catch (e) { notifError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <ModalWrapper title="Enregistrer un congé" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-black text-content-muted uppercase tracking-widest block mb-1.5">Employé</label>
          <div className="space-y-2">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-muted" />
              <input 
                type="text" 
                placeholder="Chercher un nom..."
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
                className="input pl-9 h-9 w-full text-xs bg-surface-input"
              />
            </div>
            <select value={staffId} onChange={e => setStaffId(e.target.value)} className="input h-11 w-full text-sm">
              {activeStaffList.length > 0 ? (
                activeStaffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
              ) : (
                <option value="">Aucun résultat</option>
              )}
            </select>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-black text-content-muted uppercase tracking-widest block mb-1.5">Type de congé</label>
          <div className="space-y-2">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-muted" />
              <input 
                type="text" 
                placeholder="Chercher un type..."
                value={typeSearch}
                onChange={(e) => setTypeSearch(e.target.value)}
                className="input pl-9 h-9 w-full text-xs bg-surface-input"
              />
            </div>
            <select value={typeId} onChange={e => setTypeId(e.target.value)} className="input h-11 w-full text-sm">
              {filteredTypes.length > 0 ? (
                filteredTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)
              ) : (
                <option value="">Aucun résultat</option>
              )}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Début" type="date" value={start} onChange={setStart} />
          <Field label="Fin" type="date" value={end} onChange={setEnd} />
        </div>
        
        <Field label="Motif / Notes" value={reason} onChange={setReason} placeholder="ex: Mariage d'un proche" />
        
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 h-11 rounded-xl bg-surface-hover text-content-secondary font-bold text-xs uppercase tracking-widest transition-colors hover:text-content-primary">Annuler</button>
          <button onClick={save} disabled={saving} className="flex-1 h-11 rounded-xl btn-primary font-bold text-xs uppercase tracking-widest shadow-lg shadow-brand-500/20">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Enregistrer'}
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
