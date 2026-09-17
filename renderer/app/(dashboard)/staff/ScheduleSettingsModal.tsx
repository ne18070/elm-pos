import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, Plus, Trash2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getStaffSchedules, setStaffSchedule, deleteStaffSchedule, upsertTimeSettings,
  DEFAULT_TIME_SETTINGS, WEEKDAY_LABELS,
  type StaffSchedule, type StaffTimeSettings,
} from '@services/supabase/staff-schedules';
import type { Staff } from '@services/supabase/staff';

export function ScheduleSettingsModal({
  businessId, staffList, timeSettings, onClose, onSaved, notifError, notifSuccess,
}: {
  businessId:   string;
  staffList:    Staff[];
  timeSettings: StaffTimeSettings | null;
  onClose:      () => void;
  onSaved:      () => void;
  notifError:   (m: string) => void;
  notifSuccess: (m: string) => void;
}) {
  const [tab, setTab] = useState<'seuils' | 'horaires'>('seuils');
  const [savingSettings, setSavingSettings] = useState(false);
  const [thresholds, setThresholds] = useState({
    weekly_hours_threshold: (timeSettings?.weekly_hours_threshold ?? DEFAULT_TIME_SETTINGS.weekly_hours_threshold).toString(),
    daily_hours_threshold:  (timeSettings?.daily_hours_threshold ?? DEFAULT_TIME_SETTINGS.daily_hours_threshold).toString(),
    overtime_multiplier:    (timeSettings?.overtime_multiplier ?? DEFAULT_TIME_SETTINGS.overtime_multiplier).toString(),
  });

  const [selectedStaffId, setSelectedStaffId] = useState(staffList[0]?.id ?? '');
  const [schedules, setSchedules] = useState<StaffSchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [newDay, setNewDay] = useState({ weekday: '1', start_time: '08:00', end_time: '17:00' });

  const loadSchedules = useCallback(async () => {
    if (!selectedStaffId) { setSchedules([]); return; }
    setLoadingSchedules(true);
    try { setSchedules(await getStaffSchedules(selectedStaffId)); }
    catch (e) { notifError(String(e)); }
    finally { setLoadingSchedules(false); }
  }, [selectedStaffId, notifError]);

  useEffect(() => { if (tab === 'horaires') loadSchedules(); }, [tab, loadSchedules]);

  async function saveThresholds() {
    setSavingSettings(true);
    try {
      await upsertTimeSettings({
        business_id: businessId,
        weekly_hours_threshold: parseFloat(thresholds.weekly_hours_threshold) || 40,
        daily_hours_threshold:  parseFloat(thresholds.daily_hours_threshold) || 8,
        overtime_multiplier:    parseFloat(thresholds.overtime_multiplier) || 1.5,
      });
      notifSuccess('Seuils enregistrés');
      onSaved();
    } catch (e) { notifError(String(e)); }
    finally { setSavingSettings(false); }
  }

  async function addSchedule() {
    try {
      await setStaffSchedule({
        business_id: businessId,
        staff_id:    selectedStaffId,
        weekday:     parseInt(newDay.weekday, 10),
        start_time:  newDay.start_time,
        end_time:    newDay.end_time,
      });
      await loadSchedules();
      onSaved();
    } catch (e) { notifError(String(e)); }
  }

  async function removeSchedule(s: StaffSchedule) {
    try {
      await deleteStaffSchedule(s.id);
      setSchedules((prev) => prev.filter((x) => x.id !== s.id));
      onSaved();
    } catch (e) { notifError(String(e)); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-card border border-surface-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <h2 className="font-bold text-content-primary text-lg">Horaires & heures sup</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-hover text-content-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex px-5 border-b border-surface-border">
          {([{ id: 'seuils', label: 'Seuils' }, { id: 'horaires', label: 'Horaires employés' }] as const).map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn('px-3 py-2.5 text-xs font-bold uppercase tracking-wider transition-all relative',
                tab === t.id ? 'text-content-brand' : 'text-content-muted hover:text-content-primary')}>
              {t.label}
              {tab === t.id && <div className="absolute bottom-0 left-1 right-1 h-0.5 bg-brand-500 rounded-t-full" />}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto scrollbar-thin">
          {tab === 'seuils' ? (
            <>
              <p className="text-xs text-content-muted">
                Ces seuils sont propres à votre entreprise et servent à calculer les heures supplémentaires. Aucune règle légale n'est imposée.
              </p>
              <div>
                <label className="text-xs text-content-secondary block mb-1">Seuil hebdomadaire (heures)</label>
                <input type="number" min="0" className="input w-full text-sm"
                  value={thresholds.weekly_hours_threshold}
                  onChange={(e) => setThresholds((f) => ({ ...f, weekly_hours_threshold: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-content-secondary block mb-1">Seuil journalier (heures)</label>
                <input type="number" min="0" className="input w-full text-sm"
                  value={thresholds.daily_hours_threshold}
                  onChange={(e) => setThresholds((f) => ({ ...f, daily_hours_threshold: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-content-secondary block mb-1">Majoration heures sup (x)</label>
                <input type="number" min="1" step="0.1" className="input w-full text-sm"
                  value={thresholds.overtime_multiplier}
                  onChange={(e) => setThresholds((f) => ({ ...f, overtime_multiplier: e.target.value }))} />
              </div>
              <button onClick={saveThresholds} disabled={savingSettings}
                className="w-full btn-primary flex items-center justify-center gap-2 py-3 text-sm font-medium disabled:opacity-60">
                {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Enregistrer
              </button>
            </>
          ) : (
            <>
              <select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)} className="input w-full text-sm">
                {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>

              {loadingSchedules ? (
                <Loader2 className="w-5 h-5 animate-spin text-content-brand mx-auto" />
              ) : (
                <div className="space-y-1.5">
                  {schedules.length === 0 && <p className="text-xs text-content-muted text-center py-2">Aucun horaire défini</p>}
                  {schedules.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 bg-surface-input/30 border border-surface-border rounded-lg px-3 py-2">
                      <span className="text-xs font-bold text-content-primary w-10">{WEEKDAY_LABELS[s.weekday]}</span>
                      <span className="text-xs text-content-secondary flex-1">{s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}</span>
                      <button onClick={() => removeSchedule(s)} className="p-1 text-content-muted hover:text-status-error"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 border-t border-surface-border/50">
                <select value={newDay.weekday} onChange={(e) => setNewDay((f) => ({ ...f, weekday: e.target.value }))} className="input h-9 text-xs w-20">
                  {WEEKDAY_LABELS.map((label, i) => <option key={i} value={i}>{label}</option>)}
                </select>
                <input type="time" value={newDay.start_time} onChange={(e) => setNewDay((f) => ({ ...f, start_time: e.target.value }))} className="input h-9 text-xs flex-1" />
                <input type="time" value={newDay.end_time} onChange={(e) => setNewDay((f) => ({ ...f, end_time: e.target.value }))} className="input h-9 text-xs flex-1" />
                <button onClick={addSchedule} disabled={!selectedStaffId} className="h-9 w-9 flex items-center justify-center bg-brand-600 text-content-primary rounded-lg disabled:opacity-50">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
