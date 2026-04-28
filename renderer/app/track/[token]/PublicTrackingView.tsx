'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  CheckCircle2, Clock, AlertCircle,
  Calendar, User, FileText, Loader2, GitBranch,
  Car, Package2, Bell, BellOff
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn, formatCurrency } from '@/lib/utils';
import type { WorkflowInstance, WorkflowNode } from '@pos-types';

interface BusinessInfo {
  name:      string;
  logo_url:  string | null;
  phone?:    string | null;
  address?:  string | null;
}

interface TrackingData {
  type: 'dossier' | 'service';
  business: BusinessInfo | null;
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
    currency?:      string;
  };
  instance: WorkflowInstance | null;
}

const SERVICE_STATUS: Record<string, { label: string; bg: string; icon: any }> = {
  attente:  { label: 'En attente', bg: 'bg-badge-warning  text-status-warning',  icon: Clock        },
  en_cours: { label: 'En cours',   bg: 'bg-badge-info     text-status-info',     icon: GitBranch    },
  termine:  { label: 'Terminé',   bg: 'bg-badge-success  text-status-success',  icon: CheckCircle2 },
  paye:     { label: 'Payé',      bg: 'bg-badge-success  text-status-success',  icon: CheckCircle2 },
  annule:   { label: 'Annulé',   bg: 'bg-badge-error    text-status-error',    icon: AlertCircle  },
};

function base64UrlToUint8Array(base64Url: string): ArrayBuffer {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer as ArrayBuffer;
}

export default function PublicTrackingView() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [data, setData]       = useState<TrackingData | null>(null);

  const [pushState, setPushState] = useState<'idle' | 'subscribing' | 'subscribed' | 'denied' | 'unsupported'>('idle');

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPushState('unsupported');
    } else if (Notification.permission === 'denied') {
      setPushState('denied');
    } else if (Notification.permission === 'granted') {
      navigator.serviceWorker?.ready.then(reg =>
        reg.pushManager.getSubscription().then(sub => { if (sub) setPushState('subscribed'); })
      );
    }
  }, []);

  async function subscribePush() {
    if (!token || pushState === 'subscribed') return;
    setPushState('subscribing');
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setPushState('denied'); return; }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: base64UrlToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });
      await fetch('/api/client-push/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token: String(token), subscription: sub.toJSON() }),
      });
      setPushState('subscribed');
    } catch {
      setPushState('idle');
    }
  }

  useEffect(() => {
    async function load() {
      if (!token) return;
      try {
        const { data: tokenData, error: tokenError } = await (supabase
          .from('client_tracking_tokens')
          .select('dossier_id, service_order_id, instance_id, expires_at') as any)
          .eq('token', String(token))
          .single();

        if (tokenError || !tokenData) { setError("Lien de suivi invalide ou expiré."); return; }
        if (new Date(tokenData.expires_at) < new Date()) { setError("Ce lien de suivi a expiré."); return; }

        let trackingData: Partial<TrackingData> = {};

        if (tokenData.dossier_id) {
          const { data: dossier, error: dossierError } = await supabase
            .from('dossiers' as any)
            .select('reference, client_name, type_affaire, status, date_ouverture, businesses(name, logo_url, phone, address)')
            .eq('id', tokenData.dossier_id)
            .single();
          if (dossierError) throw dossierError;
          const biz = (dossier as any)?.businesses ?? null;
          trackingData = { type: 'dossier', dossier: dossier as any, business: biz };
        } else if (tokenData.service_order_id) {
          const { data: service, error: serviceError } = await supabase
            .from('service_orders' as any)
            .select('*, items:service_order_items(*), businesses(name, logo_url, phone, address)')
            .eq('id', tokenData.service_order_id)
            .single();
          if (serviceError) throw serviceError;
          const biz = (service as any)?.businesses ?? null;
          trackingData = { type: 'service', service: service as any, business: biz };
        } else {
          setError("Aucune donnée associée à ce lien."); return;
        }

        let instance = null;
        if (tokenData.instance_id) {
          const { data: inst } = await supabase
            .from('workflow_instances').select('*').eq('id', tokenData.instance_id).single();
          instance = inst;
        }

        setData({ ...trackingData, instance: instance as any, business: trackingData.business ?? null } as TrackingData);
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
      <div className="min-h-screen bg-surface-hover flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-brand-600 mx-auto" />
          <p className="text-content-muted font-medium animate-pulse">Chargement de votre suivi...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-surface-hover flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-surface-card rounded-3xl shadow-xl border border-surface-border p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-badge-error rounded-full flex items-center justify-center mx-auto text-status-error">
            <AlertCircle className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold text-content-primary">Oups !</h1>
          <p className="text-content-muted leading-relaxed">{error}</p>
          <button onClick={() => window.location.reload()} className="btn-primary w-full py-4 rounded-2xl shadow-lg shadow-brand-500/20">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  const { dossier, service, instance, type, business } = data;
  const currentNode  = instance?.workflow_snapshot?.nodes.find((n: WorkflowNode) => n.id === instance.current_node_id);
  const statusInfo   = type === 'service' ? SERVICE_STATUS[service!.status] : null;
  const cur          = service?.currency ?? 'XOF';

  return (
    <div className="min-h-screen bg-surface-hover text-content-primary font-sans pb-20">

      {/* Header */}
      <header className="bg-surface-card border-b border-surface-border sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-surface-hover border border-surface-border overflow-hidden shrink-0">
              {business?.logo_url ? (
                <img src={business.logo_url} alt={business.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-brand-600 flex items-center justify-center">
                  <span className="text-white font-black text-sm">{business?.name?.slice(0, 2).toUpperCase() ?? 'EL'}</span>
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-content-muted leading-none mb-1">Espace Suivi Client</p>
              <h1 className="font-bold text-content-primary text-base truncate leading-none">{business?.name ?? 'ELM Services'}</h1>
            </div>
          </div>
          <img src="/logo.png" alt="ELM APP" className="h-14 w-auto shrink-0 object-contain" />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">

        {/* Infos principales */}
        <section className="bg-surface-card rounded-3xl shadow-sm border border-surface-border overflow-hidden">
          <div className="p-6 bg-brand-600 text-white flex justify-between items-start">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70">
                {type === 'dossier' ? 'Référence Dossier' : 'Ordre de Travail'}
              </p>
              <h2 className="text-2xl font-black font-mono tracking-tight">
                {type === 'dossier' ? dossier!.reference : `OT-${String(service!.order_number).padStart(4, '0')}`}
              </h2>
            </div>
            {statusInfo && (
              <span className={cn('text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border', statusInfo.bg)}>
                {statusInfo.label}
              </span>
            )}
            {type === 'dossier' && (
              <span className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-white/20 border border-white/30 text-white">
                {dossier!.status}
              </span>
            )}
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-surface-input border border-surface-border flex items-center justify-center text-content-muted">
                <User className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Client</p>
                <p className="font-bold text-content-primary">{type === 'dossier' ? dossier!.client_name : (service!.client_name || '—')}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-surface-input border border-surface-border flex items-center justify-center text-content-muted">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Date</p>
                <p className="font-bold text-content-primary">
                  {new Date(type === 'dossier' ? dossier!.date_ouverture : service!.created_at)
                    .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>
          </div>

          {type === 'service' && service?.subject_ref && (
            <div className="px-6 pb-6 pt-2 border-t border-surface-border flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-surface-input border border-surface-border flex items-center justify-center text-content-muted">
                {service.subject_type === 'vehicule' ? <Car className="w-5 h-5" /> : <Package2 className="w-5 h-5" />}
              </div>
              <div>
                <p className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Objet du service</p>
                <p className="font-bold text-content-primary">
                  {service.subject_ref}
                  {service.subject_info && <span className="text-sm font-medium text-content-secondary ml-2">{service.subject_info}</span>}
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Détail prestations */}
        {type === 'service' && service!.items.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <FileText className="w-5 h-5 text-brand-600" />
              <h3 className="font-bold text-content-primary">Détail des prestations</h3>
            </div>
            <div className="bg-surface-card rounded-3xl shadow-sm border border-surface-border overflow-hidden">
              <div className="divide-y divide-surface-border">
                {service!.items.map((item: any) => (
                  <div key={item.id} className="p-4 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-content-primary text-sm">{item.name}</p>
                      <p className="text-xs text-content-muted">Quantité : {item.quantity}</p>
                    </div>
                    <p className="font-bold text-content-primary">{formatCurrency(item.total, cur)}</p>
                  </div>
                ))}
                <div className="p-4 bg-surface-hover flex justify-between items-center">
                  <p className="font-black text-content-primary">TOTAL</p>
                  <p className="text-xl font-black text-brand-600">{formatCurrency(service!.total, cur)}</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* État d'avancement */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <GitBranch className="w-5 h-5 text-brand-600" />
            <h3 className="font-bold text-content-primary">État d'avancement</h3>
          </div>

          <div className="bg-surface-card rounded-3xl shadow-xl border border-surface-border p-8 text-center space-y-6">
            {instance ? (
              <>
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-badge-info border-4 border-surface-border text-status-info mb-2 relative">
                  <Clock className="w-10 h-10" />
                  <div className="absolute -right-1 -top-1 w-6 h-6 bg-brand-500 rounded-full border-4 border-surface-card animate-pulse" />
                </div>
                <div className="space-y-2">
                  <h4 className="text-2xl font-black text-content-primary">{currentNode?.label || "Traitement en cours"}</h4>
                  <p className="text-content-secondary leading-relaxed max-w-sm mx-auto">
                    {currentNode?.description || "Nous travaillons sur votre demande. Ce lien sera mis à jour dès qu'une nouvelle étape sera franchie."}
                  </p>
                </div>
              </>
            ) : type === 'service' ? (
              <>
                <div className={cn("inline-flex items-center justify-center w-20 h-20 rounded-full border-4 border-surface-border mb-2", statusInfo?.bg)}>
                  {statusInfo && <statusInfo.icon className="w-10 h-10" />}
                </div>
                <div className="space-y-2">
                  <h4 className="text-2xl font-black text-content-primary">{statusInfo?.label}</h4>
                  <p className="text-content-secondary leading-relaxed max-w-sm mx-auto">
                    {service!.status === 'attente'  && "Votre ordre de travail est en attente de prise en charge."}
                    {service!.status === 'en_cours' && "Nous effectuons actuellement les travaux demandés."}
                    {service!.status === 'termine'  && "Les travaux sont terminés. Vous pouvez passer récupérer votre bien."}
                    {service!.status === 'paye'     && "Service terminé et facturé. Merci de votre confiance !"}
                  </p>
                </div>
              </>
            ) : (
              <div className="py-12 space-y-4">
                <CheckCircle2 className="w-16 h-16 text-status-success mx-auto" />
                <div className="space-y-1">
                  <h4 className="text-xl font-bold text-content-primary">Dossier Ouvert</h4>
                  <p className="text-content-secondary italic">Le processus de traitement va bientôt démarrer.</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Notifications push client */}
        {pushState !== 'unsupported' && type === 'service' && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Bell className="w-5 h-5 text-brand-600" />
              <h3 className="font-bold text-content-primary">Notifications</h3>
            </div>
            <div className="bg-surface-card rounded-3xl border border-surface-border p-6 flex items-center gap-4">
              {pushState === 'subscribed' ? (
                <>
                  <div className="w-12 h-12 rounded-2xl bg-badge-success flex items-center justify-center text-status-success shrink-0">
                    <Bell className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-bold text-content-primary text-sm">Notifications activées</p>
                    <p className="text-xs text-content-secondary mt-0.5">Vous serez alerté à chaque avancement de votre dossier.</p>
                  </div>
                </>
              ) : pushState === 'denied' ? (
                <>
                  <div className="w-12 h-12 rounded-2xl bg-badge-error flex items-center justify-center text-status-error shrink-0">
                    <BellOff className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-bold text-content-primary text-sm">Notifications bloquées</p>
                    <p className="text-xs text-content-secondary mt-0.5">Autorisez les notifications dans les paramètres de votre navigateur.</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-2xl bg-badge-info flex items-center justify-center text-status-info shrink-0">
                    <Bell className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-content-primary text-sm">Restez informé</p>
                    <p className="text-xs text-content-secondary mt-0.5">Recevez une notification quand votre prestation avance.</p>
                  </div>
                  <button onClick={subscribePush} disabled={pushState === 'subscribing'}
                    className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-bold transition-colors disabled:opacity-60">
                    {pushState === 'subscribing'
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Bell className="w-4 h-4" />}
                    Activer
                  </button>
                </>
              )}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="pt-8 text-center space-y-4">
          <p className="text-xs text-content-secondary font-medium max-w-xs mx-auto">
            Ce lien est personnel et confidentiel. Ne le partagez pas avec des tiers.
          </p>
          <div className="w-12 h-1 bg-surface-border rounded-full mx-auto" />
          <p className="text-[10px] font-black uppercase tracking-widest text-content-secondary">Géré par ELM APP</p>
        </footer>
      </main>
    </div>
  );
}
