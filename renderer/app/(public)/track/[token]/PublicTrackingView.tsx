'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  CheckCircle2, Clock, AlertCircle,
  Calendar, User, FileText, Loader2, GitBranch,
  Car, Package2, Bell, BellOff, Plus,
  Play, History, XCircle, CreditCard,
  Volume2, VolumeX, Star, ShoppingBag, ArrowRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn, formatCurrency, displayCurrency } from '@/lib/utils';
import { PublicHeader } from '@/components/shared/PublicHeader';
import { getPublicServiceCatalog } from '@services/supabase/services-public';
import type { WorkflowInstance, WorkflowNode } from '@pos-types';

interface BusinessInfo {
  name:      string;
  logo_url:  string | null;
  phone?:    string | null;
  address?:  string | null;
}

interface ServiceOrderEvent {
  id:         string;
  event_type: string;
  label:      string;
  actor_name: string | null;
  created_at: string;
}

interface LoyaltyData {
  client_name:    string;
  balance:        number;
  total_earned:   number;
  total_redeemed: number;
  config: {
    earn_per:    number;
    point_value: number;
    min_redeem:  number;
  };
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
    id:             string;
    business_id:    string;
    order_number:   number;
    subject_ref:    string | null;
    subject_type:   string | null;
    subject_info:   string | null;
    client_name:    string | null;
    status:           string;
    total:            number;
    paid_amount:      number;
    created_at:       string;
    items:            any[];
    currency?:        string;
    client_rating?:   number | null;
    client_feedback?: string | null;
  };
  instance: WorkflowInstance | null;
  events:   ServiceOrderEvent[];
}

const EVENT_CHIMES: Record<string, number[]> = {
  'Prise en charge':  [523, 659],            // Do–Mi  (départ)
  'Travaux terminés': [523, 659, 784],        // Do–Mi–Sol (succès)
  'Paiement reçu':    [523, 659, 784, 1047],  // Do–Mi–Sol–Do (célébration)
  'Annulé':           [330, 220],             // Mi–La grave (descente)
};

// AudioContext partagé — ne jamais créer hors geste utilisateur
let _audioCtx: AudioContext | null = null;

// À appeler UNIQUEMENT depuis un handler de clic/touch
function unlockAudio(): void {
  if (typeof window === 'undefined') return;
  try {
    if (!_audioCtx) {
      const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!Ctor) return;
      _audioCtx = new Ctor();
    }
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
  } catch {}
}

// Ne crée jamais de contexte — utilise uniquement si déjà running
function playChime(label: string) {
  if (!_audioCtx || _audioCtx.state !== 'running') return;
  try {
    const ctx   = _audioCtx;
    const freqs = EVENT_CHIMES[label] ?? [440];
    const step  = 0.14;
    freqs.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type            = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * step;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + step * 2.2);
      osc.start(t);
      osc.stop(t + step * 2.5);
    });
  } catch {}
}

function getEventIcon(evt: ServiceOrderEvent): { Icon: any; cls: string } {
  if (evt.event_type === 'created') return { Icon: FileText, cls: 'text-content-muted' };
  switch (evt.label) {
    case 'Prise en charge':  return { Icon: Play,         cls: 'text-status-info'    };
    case 'Travaux terminés': return { Icon: CheckCircle2, cls: 'text-status-success'  };
    case 'Paiement reçu':    return { Icon: CreditCard,   cls: 'text-status-success'  };
    case 'Annulé':           return { Icon: XCircle,      cls: 'text-status-error'    };
    default:                 return { Icon: GitBranch,    cls: 'text-content-secondary' };
  }
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
  const [loyalty, setLoyalty] = useState<LoyaltyData | null>(null);
  const eventsEndRef            = useRef<HTMLDivElement>(null);

  const [pushState, setPushState] = useState<'idle' | 'subscribing' | 'subscribed' | 'denied' | 'unsupported'>('idle');
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(true);

  const [promoItems, setPromoItems] = useState<{ name: string; price: number }[]>([]);

  const [rating, setRating]           = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);

  // --- Realtime: service_orders status/total ---
  useEffect(() => {
    if (!data?.service?.id) return;

    const channel = supabase
      .channel(`public-tracking-${data.service.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'service_orders',
          filter: `id=eq.${data.service.id}`,
        },
        (payload) => {
          setData((prev) => {
            if (!prev || !prev.service) return prev;
            return {
              ...prev,
              service: {
                ...prev.service,
                status: payload.new.status,
                total: payload.new.total,
                paid_amount: payload.new.paid_amount,
              },
            };
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [data?.service?.id]);

  // --- Realtime: nouveaux événements timeline ---
  useEffect(() => {
    if (!data?.service?.id) return;

    const channel = supabase
      .channel(`public-tracking-events-${data.service.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'service_order_events',
          filter: `service_order_id=eq.${data.service.id}`,
        },
        (payload) => {
          const evt = payload.new as ServiceOrderEvent;
          setData((prev) => {
            if (!prev) return prev;
            return { ...prev, events: [...prev.events, evt] };
          });
          if (soundEnabledRef.current) playChime(evt.label);
          setTimeout(() => eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [data?.service?.id]);

  useEffect(() => {
    const stored = localStorage.getItem('tracking_sound');
    const enabled = stored !== 'off';
    setSoundEnabled(enabled);
    soundEnabledRef.current = enabled;
  }, []);

  // Déverrouille l'AudioContext dès le premier geste utilisateur sur la page
  useEffect(() => {
    const handler = () => { if (soundEnabledRef.current) unlockAudio(); };
    window.addEventListener('click',      handler, { once: true });
    window.addEventListener('touchstart', handler, { once: true });
    return () => {
      window.removeEventListener('click',      handler);
      window.removeEventListener('touchstart', handler);
    };
  }, []);

  function toggleSound() {
    const next = !soundEnabledRef.current;
    soundEnabledRef.current = next;
    setSoundEnabled(next);
    localStorage.setItem('tracking_sound', next ? 'on' : 'off');
    if (next) unlockAudio();
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    setIsIOS(isApple);
    setIsStandalone(!!standalone);

    if (!('Notification' in window)) {
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

  async function submitFeedback() {
    if (!token || rating === 0 || feedbackBusy) return;
    setFeedbackBusy(true);
    try {
      const { error } = await (supabase as any).rpc('submit_service_order_feedback', {
        p_token:    String(token),
        p_rating:   rating,
        p_feedback: feedbackText.trim() || null,
      });
      if (error) throw error;
      setFeedbackDone(true);
      setData(prev => {
        if (!prev?.service) return prev;
        return {
          ...prev,
          service: { ...prev.service, client_rating: rating, client_feedback: feedbackText.trim() || null },
        };
      });
    } catch (e) {
      console.error(e);
    } finally {
      setFeedbackBusy(false);
    }
  }

  useEffect(() => {
    async function load() {
      if (!token) return;
      try {
        const { data: result, error: rpcErr } = await (supabase as any)
          .rpc('get_public_tracking', { p_token: String(token) });

        if (rpcErr) throw rpcErr;
        if (!result || result.error) {
          if (result?.error === 'expired_token') setError("Ce lien de suivi a expiré.");
          else if (result?.error === 'no_data')  setError("Aucune donnée associée à ce lien.");
          else                                   setError("Lien de suivi invalide ou expiré.");
          return;
        }

        setData({
          type:     result.type,
          business: result.business ?? null,
          service:  result.service  ?? undefined,
          dossier:  result.dossier  ?? undefined,
          instance: result.instance ?? null,
          events:   result.events   ?? [],
        } as TrackingData);

        void (supabase as any).rpc('increment_tracking_view', { t: token });

        // Charger la carte fidélité en parallèle (silencieux si non disponible)
        (supabase as any).rpc('get_public_loyalty', { p_token: String(token) })
          .then(({ data: ldata }: any) => {
            if (ldata?.success) setLoyalty(ldata as LoyaltyData);
          })
          .catch(() => {});

        // Charger quelques produits/services pour la bande promo (silencieux)
        const bid = result.service?.business_id;
        if (bid) {
          getPublicServiceCatalog(bid)
            .then(items => setPromoItems(
              items.slice(0, 10).map((i: any) => ({ name: i.name, price: i.price }))
            ))
            .catch(() => {});
        }
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

      <PublicHeader business={business} loading={loading} title="Espace Suivi Client" />

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

        {/* Carte fidélité */}
        {type === 'service' && loyalty && (
          <section>
            <div className="relative overflow-hidden rounded-2xl shadow-lg"
              style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)' }}>
              <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/5" />
              <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-white/5" />

              <div className="relative p-4 space-y-3">
                {/* Header : nom + étoiles niveau */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-300">Carte fidélité</p>
                    <p className="text-sm font-black text-white leading-tight">{loyalty.client_name}</p>
                  </div>
                  <div className="flex gap-0.5">
                    {[1,2,3].map(i => (
                      <Star key={i} className={cn('w-3.5 h-3.5', i <= (loyalty.total_earned >= 1500 ? 3 : loyalty.total_earned >= 500 ? 2 : 1) ? 'fill-yellow-400 text-yellow-400' : 'text-indigo-600 fill-indigo-600')} />
                    ))}
                  </div>
                </div>

                {/* Solde + valeur sur une ligne */}
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-white tabular-nums">{loyalty.balance}</span>
                  <span className="text-sm font-bold text-indigo-300">pts</span>
                  <span className="text-xs text-indigo-300 ml-1">
                    ≈ <span className="font-bold text-white">{(loyalty.balance * loyalty.config.point_value).toLocaleString('fr-FR')} {displayCurrency(cur)}</span>
                  </span>
                  {service!.status === 'paye' && loyalty.config.earn_per && (
                    <span className="ml-auto text-[10px] font-bold text-yellow-300 bg-yellow-400/15 rounded-full px-2 py-0.5 shrink-0">
                      +{Math.floor(service!.total / loyalty.config.earn_per)} pts cette visite
                    </span>
                  )}
                </div>

                {/* Barre de progression */}
                <div className="space-y-1">
                  <div className="h-1.5 bg-indigo-900/50 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-yellow-400 to-yellow-300 transition-all duration-700"
                      style={{ width: `${Math.min(100, loyalty.balance / loyalty.config.min_redeem * 100)}%` }}
                    />
                  </div>
                  {loyalty.balance >= loyalty.config.min_redeem ? (
                    <p className="text-[10px] font-bold text-yellow-300">✓ Remise disponible — présentez ce lien à l'atelier</p>
                  ) : (
                    <p className="text-[10px] text-indigo-400">
                      {loyalty.balance} / {loyalty.config.min_redeem} pts · encore {loyalty.config.min_redeem - loyalty.balance} pts
                    </p>
                  )}
                </div>

                {/* Stats footer */}
                <div className="flex justify-between pt-2 border-t border-indigo-700/50 text-[10px]">
                  {[
                    { label: 'Cumulé',  value: loyalty.total_earned,   unit: 'pts' },
                    { label: 'Échangé', value: loyalty.total_redeemed, unit: 'pts' },
                    { label: '1 pt',    value: loyalty.config.point_value, unit: displayCurrency(cur) },
                    { label: 'Expire',  value: `31/12/${new Date().getFullYear() + 1}`, unit: '' },
                  ].map(({ label, value, unit }) => (
                    <div key={label} className="text-center">
                      <p className="text-indigo-400 uppercase tracking-wide">{label}</p>
                      <p className="text-white font-black text-sm leading-tight">{value}</p>
                      {unit && <p className="text-indigo-400">{unit}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Bande promo boutique */}
        {type === 'service' && service?.business_id && promoItems.length > 0 && (
          <div className="bg-surface-card border border-surface-border rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-brand-600" />
                <span className="text-xs font-bold text-content-primary">Nos services &amp; prestations</span>
              </div>
              <a
                href={`/services/${service.business_id}`}
                target='_blank'
                className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:gap-2 transition-all"
              >
                Voir tout <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Marquee */}
            <div className="overflow-hidden pb-3">
              <div className="flex animate-marquee w-max gap-2 px-4">
                {[...promoItems, ...promoItems].map((item, i) => (
                  <span key={i} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1 bg-surface-hover border border-surface-border rounded-full text-[11px] whitespace-nowrap">
                    <span className="text-content-secondary font-medium">{item.name}</span>
                    <span className="font-bold text-brand-600">{formatCurrency(item.price, cur)}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

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

        {/* Timeline historique */}
        {type === 'service' && data.events.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-brand-600" />
                <h3 className="font-bold text-content-primary">Historique</h3>
              </div>
              <button
                onClick={toggleSound}
                title={soundEnabled ? 'Couper le son' : 'Activer le son'}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors',
                  soundEnabled
                    ? 'bg-badge-info border-status-info/30 text-status-info'
                    : 'bg-surface-hover border-surface-border text-content-muted',
                )}
              >
                {soundEnabled
                  ? <><Volume2 className="w-3.5 h-3.5" />Son activé</>
                  : <><VolumeX className="w-3.5 h-3.5" />Son coupé</>}
              </button>
            </div>
            <div className="bg-surface-card rounded-3xl border border-surface-border p-6">
              <div className="relative">
                <div className="absolute left-3.5 top-5 bottom-5 w-px bg-surface-border" />
                <div className="space-y-6">
                  {data.events.map((evt, idx) => {
                    const isLast = idx === data.events.length - 1;
                    const { Icon, cls } = getEventIcon(evt);
                    return (
                      <div key={evt.id} className="flex items-start gap-4">
                        <div className={cn(
                          'w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 relative bg-surface-card',
                          isLast ? `border-brand-500 ${cls}` : 'border-surface-border text-content-muted',
                        )}>
                          <Icon className="w-3.5 h-3.5" />
                          {isLast && (
                            <span className="absolute -right-0.5 -top-0.5 w-2.5 h-2.5 bg-brand-500 rounded-full border-2 border-surface-card animate-pulse" />
                          )}
                        </div>
                        <div className="flex-1 pt-0.5">
                          <p className={cn('font-bold text-sm', isLast ? 'text-content-primary' : 'text-content-secondary')}>
                            {evt.label}
                          </p>
                          <p className="text-xs text-content-muted mt-0.5">
                            {new Date(evt.created_at).toLocaleDateString('fr-FR', {
                              day: 'numeric', month: 'long', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div ref={eventsEndRef} />
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

        {/* Feedback client */}
        {type === 'service' && (service!.status === 'paye' || service!.status === 'termine') && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Star className="w-5 h-5 text-brand-600" />
              <h3 className="font-bold text-content-primary">Votre avis</h3>
            </div>
            <div className="bg-surface-card rounded-3xl border border-surface-border p-6">
              {(service!.client_rating || feedbackDone) ? (
                <div className="text-center space-y-3 py-2">
                  <div className="flex justify-center gap-1">
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} className={cn('w-7 h-7', s <= (service!.client_rating ?? rating) ? 'text-yellow-400 fill-yellow-400' : 'text-content-muted')} />
                    ))}
                  </div>
                  <p className="font-bold text-content-primary">Merci pour votre avis !</p>
                  {service!.client_feedback && (
                    <p className="text-sm text-content-secondary italic">"{service!.client_feedback}"</p>
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  <p className="text-sm font-semibold text-content-primary text-center">
                    Comment s'est passée votre prestation ?
                  </p>
                  <div className="flex justify-center gap-1.5">
                    {[1,2,3,4,5].map(s => (
                      <button key={s} onClick={() => setRating(s)}
                        onMouseEnter={() => setHoverRating(s)} onMouseLeave={() => setHoverRating(0)}
                        className="p-1 transition-transform active:scale-90 hover:scale-110">
                        <Star className={cn('w-10 h-10 transition-colors', s <= (hoverRating || rating) ? 'text-yellow-400 fill-yellow-400' : 'text-surface-border')} />
                      </button>
                    ))}
                  </div>
                  {rating > 0 && (
                    <>
                      <textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)}
                        placeholder="Un commentaire ? (optionnel)" rows={3}
                        className="w-full px-4 py-3 rounded-2xl bg-surface-input border border-surface-border text-content-primary text-sm resize-none placeholder:text-content-muted" />
                      <button onClick={submitFeedback} disabled={feedbackBusy}
                        className="w-full py-3.5 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center">
                        {feedbackBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Envoyer mon avis'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Notifications push client */}
        {type === 'service' && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Bell className="w-5 h-5 text-brand-600" />
              <h3 className="font-bold text-content-primary">Notifications</h3>
            </div>
            
            <div className="bg-surface-card rounded-3xl border border-surface-border p-6">
              {pushState === 'subscribed' ? (
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-badge-success flex items-center justify-center text-status-success shrink-0">
                    <Bell className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-bold text-content-primary text-sm">Notifications activées</p>
                    <p className="text-xs text-content-secondary mt-0.5">Vous serez alerté à chaque avancement.</p>
                  </div>
                </div>
              ) : pushState === 'unsupported' && isIOS && !isStandalone ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 text-brand-600">
                    <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center shrink-0">
                      <Plus className="w-6 h-6" />
                    </div>
                    <p className="font-bold text-sm">Activez les notifications</p>
                  </div>
                  <div className="bg-surface-hover rounded-2xl p-4 text-xs text-content-secondary leading-relaxed space-y-2">
                    <p>Pour recevoir des alertes sur votre iPhone :</p>
                    <ol className="list-decimal list-inside space-y-1 ml-1">
                      <li>Cliquez sur le bouton <span className="font-bold underline">Partager</span> (icône <span className="inline-block border rounded px-1">↑</span>)</li>
                      <li>Choisissez <span className="font-bold underline">"Sur l'écran d'accueil"</span></li>
                      <li>Ouvrez l'application depuis votre accueil</li>
                    </ol>
                  </div>
                </div>
              ) : pushState === 'denied' ? (
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-badge-error flex items-center justify-center text-status-error shrink-0">
                    <BellOff className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-bold text-content-primary text-sm">Notifications bloquées</p>
                    <p className="text-xs text-content-secondary mt-0.5">Autorisez les notifications dans les paramètres de votre navigateur.</p>
                  </div>
                </div>
              ) : pushState === 'unsupported' ? (
                <div className="flex items-center gap-4 text-content-muted">
                   <BellOff className="w-6 h-6" />
                   <p className="text-sm">Notifications non supportées sur ce navigateur.</p>
                </div>
              ) : (
                <div className="flex items-center gap-4">
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
                </div>
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
