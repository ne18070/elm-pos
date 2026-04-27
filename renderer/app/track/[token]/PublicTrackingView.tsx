'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { 
  Scale, CheckCircle2, Clock, AlertCircle, 
  Calendar, User, FileText, Loader2, GitBranch,
  Wrench, Car, Package2
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { WorkflowInstance, WorkflowNode } from '@pos-types';

interface TrackingData {
  type: 'dossier' | 'service';
  dossier?: {
    reference:      string;
    client_name:    string;
    type_affaire:   string;
    status:         string;
    date_ouverture: string;
  };
  service?: {
    order_number:   number;
    subject_ref:    string | null;
    subject_type:   string | null;
    subject_info:   string | null;
    client_name:    string | null;
    status:         string;
    total:          number;
    paid_amount:    number;
    created_at:     string;
    items:          any[];
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
          .select('dossier_id, service_order_id, instance_id, expires_at')
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

        let trackingData: Partial<TrackingData> = {};

        if (tokenData.dossier_id) {
          // Cas Dossier Juridique
          const { data: dossier, error: dossierError } = await supabase
            .from('dossiers' as any)
            .select('reference, client_name, type_affaire, status, date_ouverture')
            .eq('id', tokenData.dossier_id)
            .single();

          if (dossierError) throw dossierError;
          trackingData = { type: 'dossier', dossier: dossier as any };
        } else if (tokenData.service_order_id) {
          // Cas Prestation de service
          const { data: service, error: serviceError } = await supabase
            .from('service_orders' as any)
            .select('*, items:service_order_items(*)')
            .eq('id', tokenData.service_order_id)
            .single();

          if (serviceError) throw serviceError;
          trackingData = { type: 'service', service: service as any };
        } else {
          setError("Aucune donnée associée à ce lien.");
          return;
        }

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

        setData({ ...trackingData, instance: instance as any } as TrackingData);
        
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
          <p className="text-content-muted font-medium animate-pulse">Chargement de votre suivi...</p>
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

  const { dossier, service, instance, type } = data;
  const currentNode = instance?.workflow_snapshot?.nodes.find(n => n.id === instance.current_node_id);

  // Status mapping pour les services
  const SERVICE_STATUS: Record<string, { label: string; color: string; icon: any }> = {
    attente:  { label: 'En attente',  color: 'bg-slate-500', icon: Clock },
    en_cours: { label: 'En cours',   color: 'bg-blue-500',  icon: GitBranch },
    termine:  { label: 'Terminé',    color: 'bg-green-500', icon: CheckCircle2 },
    paye:     { label: 'Payé',       color: 'bg-brand-500', icon: CheckCircle2 },
    annule:   { label: 'Annulé',    color: 'bg-red-500',   icon: AlertCircle },
  };

  const statusInfo = type === 'service' ? SERVICE_STATUS[service!.status] : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-brand-600 rounded-xl text-content-primary shadow-lg shadow-brand-500/30">
              {type === 'dossier' ? <Scale className="w-6 h-6" /> : <Wrench className="w-6 h-6" />}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-content-secondary leading-none mb-1">Espace Suivi Client</p>
              <h1 className="text-lg font-bold text-slate-900 leading-none">ELM Services</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {/* Infos Principales */}
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 bg-brand-600 text-white flex justify-between items-start">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70">
                {type === 'dossier' ? 'Référence Dossier' : 'Ordre de Travail'}
              </p>
              <h2 className="text-2xl font-black font-mono tracking-tight">
                {type === 'dossier' ? dossier!.reference : `OT-${String(service!.order_number).padStart(4, '0')}`}
              </h2>
            </div>
            <div className="bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/30">
              <span className="text-xs font-bold uppercase tracking-wider">
                {type === 'dossier' ? dossier!.status : statusInfo?.label}
              </span>
            </div>
          </div>
          
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                <User className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Client</p>
                <p className="font-bold text-slate-900">{type === 'dossier' ? dossier!.client_name : (service!.client_name || '—')}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</p>
                <p className="font-bold text-slate-900">
                  {new Date(type === 'dossier' ? dossier!.date_ouverture : service!.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>
          </div>

          {type === 'service' && service?.subject_ref && (
            <div className="px-6 pb-6 pt-2 border-t border-slate-100 flex items-center gap-4">
               <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                {service.subject_type === 'vehicule' ? <Car className="w-5 h-5" /> : <Package2 className="w-5 h-5" />}
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Objet du service</p>
                <p className="font-bold text-slate-900">{service.subject_ref} <span className="text-sm font-medium text-slate-500 ml-2">{service.subject_info}</span></p>
              </div>
            </div>
          )}
        </section>

        {/* Détail Prestations (uniquement pour services) */}
        {type === 'service' && service!.items.length > 0 && (
           <section className="space-y-4">
             <div className="flex items-center gap-2 px-1">
               <FileText className="w-5 h-5 text-brand-600" />
               <h3 className="font-bold text-slate-900">Détail des prestations</h3>
             </div>
             <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
               <div className="divide-y divide-slate-100">
                 {service!.items.map((item: any) => (
                   <div key={item.id} className="p-4 flex justify-between items-center">
                     <div>
                       <p className="font-bold text-slate-900 text-sm">{item.name}</p>
                       <p className="text-xs text-slate-500">Quantité : {item.quantity}</p>
                     </div>
                     <p className="font-bold text-slate-900">{item.total.toLocaleString()} XOF</p>
                   </div>
                 ))}
                 <div className="p-4 bg-slate-50 flex justify-between items-center">
                    <p className="font-black text-slate-900">TOTAL</p>
                    <p className="text-xl font-black text-brand-600">{service!.total.toLocaleString()} XOF</p>
                 </div>
               </div>
             </div>
           </section>
        )}

        {/* Status / Workflow */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <GitBranch className="w-5 h-5 text-brand-600" />
            <h3 className="font-bold text-slate-900">État d'avancement</h3>
          </div>

          <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8 text-center space-y-6">
            {instance ? (
              <>
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-brand-50 border-4 border-brand-100 text-brand-600 mb-2 relative">
                   <Clock className="w-10 h-10" />
                   <div className="absolute -right-1 -top-1 w-6 h-6 bg-brand-500 rounded-full border-4 border-white animate-pulse" />
                </div>
                <div className="space-y-2">
                  <h4 className="text-2xl font-black text-slate-900">{currentNode?.label || "Traitement en cours"}</h4>
                  <p className="text-slate-500 leading-relaxed max-w-sm mx-auto">
                    {currentNode?.description || "Nous travaillons sur votre demande. Ce lien sera mis à jour dès qu'une nouvelle étape sera franchie."}
                  </p>
                </div>
              </>
            ) : type === 'service' ? (
              <>
                <div className={cn("inline-flex items-center justify-center w-20 h-20 rounded-full border-4 text-white mb-2", statusInfo?.color)}>
                   {statusInfo && <statusInfo.icon className="w-10 h-10" />}
                </div>
                <div className="space-y-2">
                  <h4 className="text-2xl font-black text-slate-900">{statusInfo?.label}</h4>
                  <p className="text-slate-500 leading-relaxed max-w-sm mx-auto">
                    {service!.status === 'attente' && "Votre ordre de travail est en attente de prise en charge."}
                    {service!.status === 'en_cours' && "Nous effectuons actuellement les travaux demandés."}
                    {service!.status === 'termine' && "Les travaux sont terminés. Vous pouvez passer récupérer votre objet."}
                    {service!.status === 'paye' && "Service terminé et facturé. Merci de votre confiance !"}
                  </p>
                </div>
              </>
            ) : (
              <div className="py-12 space-y-4">
                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
                <div className="space-y-1">
                  <h4 className="text-xl font-bold text-slate-900">Dossier Ouvert</h4>
                  <p className="text-slate-500 italic">Le processus de traitement va bientôt démarrer.</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Footer info */}
        <footer className="pt-8 text-center space-y-4">
          <p className="text-xs text-slate-400 font-medium max-w-xs mx-auto">
            Ce lien est personnel et confidentiel. Ne le partagez pas avec des tiers.
          </p>
          <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Géré par ELM APP</p>
        </footer>
      </main>
    </div>
  );
}

