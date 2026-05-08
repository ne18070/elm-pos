'use client';

import { useState, useEffect } from 'react';
import { Loader2, Plus, Clock, Play, Square, Save, Trash2, FileText, CheckCircle2 } from 'lucide-react';
import { 
  type Dossier, 
  type DossierTimeEntry, 
  getDossierTimeEntries, 
  createDossierTimeEntry, 
  deleteDossierTimeEntry,
  billTimeEntries
} from '@services/supabase/dossiers';
import { toUserError } from '@/lib/user-error';
import { useNotificationStore } from '@/store/notifications';
import { useCan } from '@/hooks/usePermission';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Props {
  dossier: Dossier;
  businessId: string;
  canEdit: boolean;
  onClose: () => void;
}

export function TimeTrackingPanel({ dossier, businessId, onClose }: { dossier: Dossier; businessId: string; onClose: () => void; }) {
  const { error: notifError, success } = useNotificationStore();
  const can = useCan();
  const canEdit = can('add_fee');
  const [entries, setEntries] = useState<DossierTimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [billing, setBilling] = useState(false);

  // Form
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState<number | ''>('');
  const [rate, setRate] = useState<number>(50000); // Taux horaire par défaut

  // Chrono state (UI only, not persisted for this simple version)
  const [chronoActive, setChronoActive] = useState(false);
  const [chronoStart, setChronoStart] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    loadEntries();
  }, [dossier.id]);

  useEffect(() => {
    let interval: any;
    if (chronoActive && chronoStart) {
      interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - chronoStart) / 60000)); // in minutes
      }, 60000); // update every minute
    }
    return () => clearInterval(interval);
  }, [chronoActive, chronoStart]);

  async function loadEntries() {
    try {
      const data = await getDossierTimeEntries(dossier.id);
      setEntries(data);
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleAddEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !duration || Number(duration) <= 0) return;
    
    setSaving(true);
    try {
      const newEntry = await createDossierTimeEntry(businessId, {
        dossier_id: dossier.id,
        duration_minutes: Number(duration),
        hourly_rate: rate,
        description: description.trim(),
      });
      setEntries([newEntry, ...entries]);
      setDescription('');
      setDuration('');
      if (chronoActive) {
        setChronoActive(false);
        setChronoStart(null);
        setElapsed(0);
      }
      success('Temps enregistré');
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Supprimer cette entrée ?')) return;
    try {
      await deleteDossierTimeEntry(id);
      setEntries(entries.filter(e => e.id !== id));
      success('Entrée supprimée');
    } catch (err) {
      notifError(toUserError(err));
    }
  }

  async function handleBillUnbilled() {
    const unbilledIds = entries.filter(e => !e.is_billed).map(e => e.id);
    if (!unbilledIds.length) return;

    if (!window.confirm(`Générer une facture pour les ${unbilledIds.length} entrée(s) non facturée(s) ?`)) return;

    setBilling(true);
    try {
      await billTimeEntries(businessId, dossier.id, unbilledIds, dossier.client_name);
      success('Facture générée avec succès');
      loadEntries();
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setBilling(false);
    }
  }

  const toggleChrono = () => {
    if (!chronoActive) {
      setChronoActive(true);
      setChronoStart(Date.now());
      setElapsed(0);
    } else {
      setChronoActive(false);
      if (elapsed > 0) {
        setDuration(elapsed);
        success('Chrono arrêté. Saisissez une description pour enregistrer.');
      } else {
        setChronoStart(null);
        success('Chrono annulé (temps < 1 min)');
      }
    }
  };

  const unbilledTotal = entries.filter(e => !e.is_billed).reduce((acc, e) => acc + Number(e.total_amount), 0);
  const unbilledMinutes = entries.filter(e => !e.is_billed).reduce((acc, e) => acc + e.duration_minutes, 0);

  return (
    <div className="fixed inset-y-0 right-0 w-[500px] bg-surface shadow-2xl border-l border-surface-border flex flex-col z-50 animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="p-6 border-b border-surface-border bg-white flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-1 rounded bg-status-purple/10 text-status-purple text-[10px] font-black uppercase tracking-widest">
              Time Tracking
            </span>
            <span className="text-xs font-bold text-content-muted">
              {dossier.reference}
            </span>
          </div>
          <h2 className="text-xl font-black text-content-primary leading-tight">
            Temps passé
          </h2>
          <p className="text-sm text-content-secondary mt-1 line-clamp-1">{dossier.client_name}</p>
        </div>
        <button onClick={onClose} className="p-2 bg-surface-input hover:bg-surface-hover rounded-xl transition-colors">
          <Square size={18} className="text-content-muted hover:text-content-primary" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* KPI */}
        <div className="grid grid-cols-2 gap-4">
           <div className="card p-4 border-status-purple/30 bg-badge-purple">
             <p className="text-[10px] font-black uppercase tracking-widest text-status-purple">À facturer</p>
             <p className="text-2xl font-black text-content-primary mt-1">
               {unbilledTotal.toLocaleString()} <span className="text-sm font-bold text-content-muted">FCFA</span>
             </p>
             <p className="text-xs font-medium text-status-purple mt-1">
               {Math.floor(unbilledMinutes / 60)}h{unbilledMinutes % 60 > 0 ? (unbilledMinutes % 60).toString().padStart(2, '0') : ''} non facturé
             </p>
           </div>
           <button 
             onClick={handleBillUnbilled}
             disabled={unbilledMinutes === 0 || billing}
             className={`card p-4 flex flex-col items-center justify-center gap-2 border-2 transition-all ${unbilledMinutes > 0 ? 'border-status-success hover:bg-status-success/5 cursor-pointer' : 'border-surface-border opacity-50 cursor-not-allowed'}`}
           >
             {billing ? <Loader2 size={24} className="animate-spin text-status-success" /> : <FileText size={24} className="text-status-success" />}
             <span className="text-xs font-black uppercase tracking-widest text-status-success">Générer Facture</span>
           </button>
        </div>

        {/* Add Entry Form */}
        {canEdit && (
          <form onSubmit={handleAddEntry} className="card p-5 border-surface-border space-y-4">
            <h3 className="text-sm font-bold text-content-primary flex items-center gap-2">
              <Clock size={16} className="text-status-purple" /> 
              Saisir du temps
            </h3>
            
            <div className="flex items-center gap-2 mb-4">
              <button 
                type="button" 
                onClick={toggleChrono}
                className={`flex-1 py-2 px-4 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${chronoActive ? 'bg-status-error text-white animate-pulse shadow-lg shadow-red-500/20' : 'bg-surface-input text-content-primary hover:bg-surface-hover'}`}
              >
                {chronoActive ? <Square size={14} /> : <Play size={14} />}
                {chronoActive ? `${elapsed} min en cours...` : 'Lancer Chrono'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Durée (minutes)</label>
                <input 
                  type="number" 
                  required 
                  min={1} 
                  value={duration} 
                  onChange={(e) => setDuration(e.target.value === '' ? '' : Number(e.target.value))}
                  className="input" 
                  placeholder="Ex: 60"
                />
              </div>
              <div>
                <label className="label">Taux horaire (FCFA)</label>
                <input 
                  type="number" 
                  required 
                  min={0} 
                  value={rate} 
                  onChange={(e) => setRate(Number(e.target.value))}
                  className="input" 
                />
              </div>
            </div>
            <div>
              <label className="label">Description (Sera visible sur la facture)</label>
              <textarea 
                required 
                value={description} 
                onChange={(e) => setDescription(e.target.value)}
                className="input resize-none" 
                rows={2} 
                placeholder="Rédaction de conclusions, appel téléphonique..."
              />
            </div>
            <button 
              type="submit" 
              disabled={saving || !duration || !description.trim()}
              className="btn-primary w-full flex justify-center gap-2 font-bold"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Enregistrer {duration ? `(${(Number(duration)/60 * rate).toLocaleString()} FCFA)` : ''}
            </button>
          </form>
        )}

        {/* History */}
        <div className="space-y-3">
          <h3 className="text-xs font-black text-content-muted uppercase tracking-widest border-b border-surface-border pb-2">Historique</h3>
          
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-status-purple" /></div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-sm text-content-muted italic">Aucun temps enregistré</div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <div key={entry.id} className={`card p-4 flex flex-col gap-2 ${entry.is_billed ? 'bg-surface-input border-transparent opacity-75' : 'border-surface-border'}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-bold text-content-primary">{entry.description}</p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-content-muted font-medium">
                        <span>{format(new Date(entry.date_record), 'dd MMM yyyy', { locale: fr })}</span>
                        <span>•</span>
                        <span>{entry.users?.full_name || 'Utilisateur'}</span>
                      </div>
                    </div>
                    {canEdit && !entry.is_billed && (
                      <button onClick={() => handleDelete(entry.id)} className="p-1 text-content-muted hover:text-status-error transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                    {entry.is_billed && (
                       <span title="Facturé">
                         <CheckCircle2 size={16} className="text-status-success" />
                       </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-surface-border">
                    <span className="text-xs font-bold text-status-purple bg-badge-purple px-2 py-0.5 rounded-md">
                      {Math.floor(entry.duration_minutes / 60)}h{entry.duration_minutes % 60 > 0 ? (entry.duration_minutes % 60).toString().padStart(2, '0') : ''}
                    </span>
                    <span className="text-sm font-black text-content-primary">
                      {Number(entry.total_amount).toLocaleString()} FCFA
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
