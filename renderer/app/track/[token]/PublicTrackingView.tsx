'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { 
  Scale, CheckCircle2, Clock, AlertCircle, 
  Calendar, User, FileText, Loader2, GitBranch
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { WorkflowInstance, WorkflowNode } from '@pos-types';

interface TrackingData {
  dossier: {
    reference:      string;
    client_name:    string;
    type_affaire:   string;
    status:         string;
    date_ouverture: string;
  };
  instance: WorkflowInstance | null;
}

export default function PublicTrackingView() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TrackingData | null>(null);

  useEffect(() => {
    async function load() {
      if (!token) return;
      try {
        // 1. Récupérer le token et les IDs liés
        const { data: tokenData, error: tokenError } = await supabase
          .from('client_tracking_tokens')
          .select('dossier_id, instance_id, expires_at')
          .eq('token', String(token))
          .single();

        if (tokenError || !tokenData) {
          setError("Lien de suivi invalide ou expiré.");
          return;
        }

        if (new Date(tokenData.expires_at) < new Date()) {
          setError("Ce lien de suivi a expiré.");
          return;
        }

        // 2. Récupérer les infos du dossier (vue publique limitée)
        const { data: dossier, error: dossierError } = await supabase
          .from('dossiers' as any)
          .select('reference, client_name, type_affaire, status, date_ouverture')
          .eq('id', tokenData.dossier_id)
          .single();

        if (dossierError) throw dossierError;

        // 3. Récupérer l'instance de workflow si elle existe
        let instance = null;
        if (tokenData.instance_id) {
          const { data: inst } = await supabase
            .from('workflow_instances')
            .select('*')
            .eq('id', tokenData.instance_id)
            .single();
          instance = inst;
        }

        setData({ dossier: dossier as any, instance: instance as any });
        
        // Incrémenter le compteur de vues
        await (supabase as any).rpc('increment_tracking_view', { t: token });

      } catch (e) {
        console.error(e);
        setError("Une erreur est survenue lors de la récupération des données.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-brand-600 mx-auto" />
          <p className="text-content-muted font-medium animate-pulse">Chargement de votre dossier...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto text-status-error">
            <AlertCircle className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Oups !</h1>
          <p className="text-content-muted leading-relaxed">{error}</p>
          <button onClick={() => window.location.reload()} className="btn-primary w-full py-4 rounded-2xl shadow-lg shadow-brand-500/20">Réessayer</button>
        </div>
      </div>
    );
  }

  const { dossier, instance } = data;
  const currentNode = instance?.workflow_snapshot?.nodes.find(n => n.id === instance.current_node_id);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-brand-600 rounded-xl text-content-primary shadow-lg shadow-brand-500/30">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-content-secondary leading-none mb-1">Espace Suivi Client</p>
              <h1 className="text-lg font-bold text-slate-900 leading-none">Cabinet MBAYE</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {/* Infos Dossier */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 bg-surface text-content-primary flex justify-between items-start">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Dossier Référence</p>
              <h2 className="text-2xl font-black font-mono tracking-tight">{dossier.reference}</h2>
            </div>
            <div className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20">
              <span className="text-xs font-bold uppercase tracking-wider">{dossier.status}</span>
            </div>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-content-secondary">
                <User className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-content-secondary uppercase">Client</p>
                <p className="font-bold text-slate-900">{dossier.client_name}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-content-secondary">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-content-secondary uppercase">Ouverture</p>
                <p className="font-bold text-slate-900">{new Date(dossier.date_ouverture).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Status Workflow */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <GitBranch className="w-5 h-5 text-brand-600" />
            <h3 className="font-bold text-slate-900">Étape actuelle du dossier</h3>
          </div>

          <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8 text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {instance ? (
              <>
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-brand-50 border-4 border-brand-100 text-brand-600 mb-2 relative">
                   <Clock className="w-10 h-10" />
                   <div className="absolute -right-1 -top-1 w-6 h-6 bg-brand-500 rounded-full border-4 border-white animate-pulse" />
                </div>
                <div className="space-y-2">
                  <h4 className="text-2xl font-black text-slate-900">{currentNode?.label || "Procédure en cours"}</h4>
                  <p className="text-content-muted leading-relaxed max-w-sm mx-auto">
                    {currentNode?.description || "Nous traitons actuellement cette étape de votre dossier. Vous recevrez une notification dès qu'une action de votre part sera requise."}
                  </p>
                </div>
                <div className="pt-4 flex justify-center gap-4">
                  <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-full border border-slate-100">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-content-muted">Mis à jour aujourd'hui</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-12 space-y-4">
                <CheckCircle2 className="w-16 h-16 text-status-success mx-auto" />
                <div className="space-y-1">
                  <h4 className="text-xl font-bold text-slate-900">Dossier Ouvert</h4>
                  <p className="text-content-muted italic">Le processus de traitement va bientôt démarrer.</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Footer info */}
        <footer className="pt-8 text-center space-y-4">
          <p className="text-xs text-content-secondary font-medium max-w-xs mx-auto">
            Ce lien est personnel et confidentiel. Ne le partagez pas avec des tiers.
          </p>
          <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto" />
          <p className="text-[10px] font-black uppercase tracking-widest text-content-primary">Géré par ELM APP & Workflow</p>
        </footer>
      </main>
    </div>
  );
}
