'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Plus, Scale, Loader2, ExternalLink, Activity, 
  GitBranch, BookOpen, Settings2, Archive, ArchiveRestore 
} from 'lucide-react';

import { toUserError } from '@/lib/user-error';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useCan } from '@/hooks/usePermission';
import { buildPublicBusinessRef } from '@services/supabase/public-business-ref';

import { MonitoringDashboard } from '@/components/workflow/MonitoringDashboard';
import { PretentionsLibrary } from '@/components/workflow/PretentionsLibrary';

import { getReferenceData, type RefItem } from '@services/supabase/reference-data';
import { getStorageInfo, type StorageInfo } from '@services/supabase/dossier-fichiers';
import { 
  getDossiers, updateDossierStatus, 
  type Dossier 
} from '@services/supabase/dossiers';

// Internal Components & Utils
import { TABS, type DossierTab } from './dossier-utils';
import { OperationalKPIs } from './OperationalKPIs';
import { DossierTable } from './DossierTable';
import { DossierModal } from './DossierModal';
import { FinancesPanel } from './FinancesPanel';
import { WorkflowPanel } from './WorkflowPanel';
import { FichiersPanel } from './FichiersPanel';
import { ProcessusManager } from './ProcessusManager';
import { ConfigTab } from './ConfigTab';

export default function DossiersPage() {
  const { business, user } = useAuthStore();
  const { error: notifError, success } = useNotificationStore();
  const can = useCan();

  const [tab, setTab] = useState<DossierTab>('dossiers');
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [typesAffaire, setTypesAffaire] = useState<RefItem[]>([]);
  const [tribunaux, setTribunaux] = useState<RefItem[]>([]);
  const [statuts, setStatuts] = useState<RefItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal/Panel states
  const [modal, setModal] = useState<'new' | Dossier | null>(null);
  const [workflowPanel, setWorkflowPanel] = useState<Dossier | null>(null);
  const [fichiersPanel, setFichiersPanel] = useState<Dossier | null>(null);
  const [financesPanel, setFinancesPanel] = useState<Dossier | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    try {
      const [d, ta, tr, st] = await Promise.all([
        getDossiers(business.id),
        getReferenceData('type_affaire',   business.id),
        getReferenceData('tribunal',       business.id),
        getReferenceData('statut_dossier', business.id),
      ]);
      setDossiers(d);
      setTypesAffaire(ta); 
      setTribunaux(tr); 
      setStatuts(st);
    } catch (e) { notifError(toUserError(e)); }
    finally { setLoading(false); }
  }, [business, notifError]);

  const loadStorage = useCallback(async () => {
    if (business) getStorageInfo(business.id).then(setStorageInfo).catch(() => {});
  }, [business]);

  useEffect(() => { load(); loadStorage(); }, [load, loadStorage]);

  // Handle URL param 'ref' for deep linking (e.g. from finance dashboard)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && dossiers.length > 0) {
      const found = dossiers.find(d => d.reference === ref);
      if (found) {
        setFinancesPanel(found);
      }
    }
  }, [dossiers]);

  const handleArchive = async (dossier: Dossier, archive: boolean) => {
    try {
      await updateDossierStatus(business!.id, dossier.id, dossier.reference, archive ? 'archivé' : 'ouvert');
      success(archive ? 'Dossier archivé' : 'Dossier désarchivé');
      load();
    } catch (e) { notifError(toUserError(e)); }
  };

  if (!business) return null;

  return (
    <div className="h-full overflow-y-auto bg-surface/20">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-status-purple shadow-glow">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-content-primary tracking-tight">Gestion des Dossiers</h1>
              <p className="text-content-secondary text-xs mt-0.5">Suivez vos dossiers juridiques, procédures et rendez-vous clients</p>
            </div>
          </div>
          {tab === 'dossiers' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.open(`/juridique/${buildPublicBusinessRef(business.name, business.public_slug)}`, '_blank')}
                className="bg-surface border border-surface-border text-content-secondary hover:text-content-primary font-black py-3 px-4 rounded-2xl flex items-center gap-2 shadow-xl transition-all active:scale-95 text-xs uppercase tracking-widest"
                title="Page publique de rendez-vous"
              >
                <ExternalLink className="w-4 h-4" /> Page Publique
              </button>
              {can('create_dossier') && (
                <button onClick={() => setModal('new')} className="bg-brand-500 hover:bg-brand-600 text-content-primary font-black py-3 px-6 rounded-2xl flex items-center gap-2 shadow-xl shadow-brand-500/20 transition-all active:scale-95 text-xs uppercase tracking-widest">
                  <Plus className="w-5 h-5" /> Nouveau Dossier
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 p-1 bg-surface border border-surface-border rounded-2xl w-fit shadow-xl">
          {TABS.filter(t => t.id !== 'config' || can('manage_legal_config')).map(t => {
            const icons: Record<string, any> = { Scale, Activity, GitBranch, BookOpen, Settings2 };
            const Icon = icons[t.icon];
            return (
              <button 
                key={t.id} 
                onClick={() => setTab(t.id)} 
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${tab === t.id ? 'bg-brand-600 text-content-primary shadow-lg shadow-brand-500/20' : 'text-content-muted hover:text-content-primary hover:bg-surface-card/50'}`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {tab === 'dossiers' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            
            <OperationalKPIs dossiers={dossiers} storageInfo={storageInfo} />

            <div className="flex justify-end">
              <button 
                onClick={() => setShowArchived(!showArchived)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-bold text-[10px] uppercase tracking-widest transition-all ${showArchived ? 'bg-amber-500/10 border-amber-500/50 text-status-warning' : 'bg-surface border-surface-border text-content-secondary hover:text-content-primary'}`}
              >
                {showArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                {showArchived ? 'Voir Dossiers Actifs' : 'Voir l\'Archive'}
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-status-purple" /></div>
            ) : (
              <DossierTable 
                dossiers={dossiers}
                statuts={statuts}
                typesAffaire={typesAffaire}
                canEdit={can('edit_dossier')}
                canArchive={can('archive_dossier')}
                showArchived={showArchived}
                onEdit={setModal}
                onArchive={handleArchive}
                onFinances={setFinancesPanel}
                onWorkflow={setWorkflowPanel}
                onFiles={setFichiersPanel}
              />
            )}
          </div>
        )}

        {tab === 'monitoring' && <MonitoringDashboard businessId={business.id} />}
        {tab === 'workflows' && <ProcessusManager businessId={business.id} isOwnerOrAdmin={can('manage_workflows')} userId={user?.id} />}
        {tab === 'pretentions' && <PretentionsLibrary businessId={business.id} />}
        {tab === 'config' && <ConfigTab businessId={business.id} onRefresh={load} />}
      </div>

      {/* Modals & Panels */}
      {modal && (
        <DossierModal 
          initial={modal === 'new' ? null : modal} 
          businessId={business.id} 
          typesAffaire={typesAffaire} 
          tribunaux={tribunaux} 
          statuts={statuts} 
          onClose={() => setModal(null)} 
          onSaved={() => { setModal(null); load(); }} 
        />
      )}
      
      {workflowPanel && (
        <WorkflowPanel 
          dossier={workflowPanel} 
          businessId={business.id} 
          userId={user?.id} 
          canLaunch={can('launch_workflow')} 
          onClose={() => setWorkflowPanel(null)} 
        />
      )}
      
      {fichiersPanel && (
        <FichiersPanel 
          dossier={fichiersPanel} 
          businessId={business.id} 
          storageInfo={storageInfo} 
          onClose={() => setFichiersPanel(null)} 
          onStorageChange={loadStorage} 
        />
      )}
      
      {financesPanel && (
        <FinancesPanel 
          dossier={financesPanel} 
          businessId={business.id} 
          canEdit={can('add_fee')} 
          onClose={() => setFinancesPanel(null)} 
        />
      )}
    </div>
  );
}
