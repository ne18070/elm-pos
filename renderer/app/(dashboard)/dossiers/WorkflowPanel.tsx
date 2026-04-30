import { useState, useEffect } from 'react';
import { Loader2, GitBranch, Phone, ChevronDown, ChevronRight } from 'lucide-react';
import { useNotificationStore } from '@/store/notifications';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { WorkflowRunner } from '@/components/workflow/WorkflowRunner';
import { 
  getInstancesByDossier, getWorkflows, createTrackingToken,
} from '@services/supabase/workflows';
import { triggerWorkflow } from '@/lib/workflow-runtime';
import { type Dossier } from '@services/supabase/dossiers';
import type { WorkflowInstance, Workflow } from '@pos-types';

export function WorkflowPanel({ dossier, businessId, userId, onClose, canLaunch }: { dossier: Dossier; businessId: string; userId?: string; onClose: () => void; canLaunch: boolean; }) {
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const { success, error: notifError } = useNotificationStore();

  useEffect(() => {
    Promise.all([getInstancesByDossier(dossier.id), getWorkflows(businessId, true)])
      .then(([inst, wf]) => { setInstances(inst); setWorkflows(wf); })
      .finally(() => setLoading(false));
  }, [dossier.id, businessId]);

  const handleShareTracking = async () => {
    setSharing(true);
    try {
      const instanceId = instances[0]?.id;
      const { token } = await createTrackingToken(dossier.id, instanceId, dossier.client_phone || undefined, dossier.client_email || undefined);
      
      const baseUrl = window.location.origin;
      const trackUrl = `${baseUrl}/track/${token}`;
      const message = `Bonjour ${dossier.client_name}, voici le lien pour suivre l'avancement de votre dossier ${dossier.reference} en temps réel : ${trackUrl}`;
      
      const whatsappUrl = `https://wa.me/${dossier.client_phone?.replace(/\s+/g, '')}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, '_blank');
      success('Lien de suivi généré');
    } catch (e) { 
      notifError("Impossible de générer le lien de suivi.");
    } finally {
      setSharing(false);
    }
  };

  const handleTrigger = async (wf: Workflow) => {
    if (!canLaunch) return;
    setShowPicker(false);
    try {
      const res = await triggerWorkflow({
        workflow_id: wf.id, dossier_id: dossier.id, started_by: userId,
        initial_context: { 
          dossier_id:    dossier.id, 
          reference:     dossier.reference, 
          client_name:   dossier.client_name,
          client_phone:  dossier.client_phone,
          client_email:  dossier.client_email
        }
      });
      if (res.ok) {
        const updated = await getInstancesByDossier(dossier.id);
        setInstances(updated);
        if (updated.length > 0) setExpanded(updated[0].id);
      }
    } catch (e) { console.error(e); }
  };

  return (
    <SideDrawer
      isOpen={true}
      onClose={onClose}
      title={`Processus — ${dossier.reference}`}
      headerActions={
        <div className="flex items-center gap-2">
          <button
            onClick={handleShareTracking}
            disabled={sharing}
            title="Partager le lien de suivi WhatsApp"
            className="p-2 rounded-lg bg-badge-success text-status-success hover:bg-status-success hover:text-white transition-all disabled:opacity-50"
          >
            {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
          </button>
          {canLaunch && (
            <button onClick={() => setShowPicker(!showPicker)} className="bg-brand-600 text-white text-[10px] font-black uppercase tracking-widest py-1 px-3 rounded-lg hover:bg-brand-500 transition-all">
              {showPicker ? 'Fermer' : 'Lancer'}
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        {showPicker && canLaunch && (
          <div className="bg-surface-overlay border border-surface-border rounded-xl overflow-hidden mb-4 shadow-xl animate-in fade-in slide-in-from-top-2">
            {workflows.length === 0 ? (
              <p className="p-4 text-xs text-content-muted italic text-center">Aucun workflow actif</p>
            ) : (
              workflows.map(wf => (
                <button key={wf.id} onClick={() => handleTrigger(wf)} className="w-full text-left px-4 py-3 hover:bg-surface text-sm text-content-primary border-b border-surface-border last:border-0 font-medium transition-colors">{wf.name}</button>
              ))
            )}
          </div>
        )}
        {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div> : instances.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <GitBranch className="w-10 h-10 text-content-muted mx-auto" />
            <p className="text-xs text-content-muted italic font-medium tracking-tight">Aucun processus en cours pour ce dossier.</p>
          </div>
        ) : (
          instances.map(inst => (
            <div key={inst.id} className="card overflow-hidden bg-surface/50 hover:bg-surface transition-colors">
              <button onClick={() => setExpanded(expanded === inst.id ? null : inst.id)} className="w-full flex items-center justify-between px-4 py-3">
                <div className="flex flex-col items-start gap-0.5">
                  <span className="text-[10px] text-content-brand font-black uppercase tracking-widest">{inst.status}</span>
                  <span className="text-[9px] text-content-muted font-mono">ID: {inst.id.slice(0,8)}</span>
                </div>
                {expanded === inst.id ? <ChevronDown className="w-4 h-4 text-content-secondary" /> : <ChevronRight className="w-4 h-4 text-content-secondary" />}
              </button>
              {expanded === inst.id && (
                <div className="p-3 border-t border-surface-border bg-surface/30">
                  <WorkflowRunner instance={inst} currentUserId={userId} onTransition={() => getInstancesByDossier(dossier.id).then(setInstances)} />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </SideDrawer>
  );
}
