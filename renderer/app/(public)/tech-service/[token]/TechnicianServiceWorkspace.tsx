'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, Clock, Loader2, Play, RefreshCw, Volume2, VolumeX, Wrench } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { PublicHeader } from '@/components/shared/PublicHeader';
import {
  getTechnicianServiceOrders,
  updateTechnicianServiceOrderStatus,
  type TechnicianServiceOrder,
  type TechnicianWorkspaceData,
} from '@services/supabase/service-orders';

const STATUS_LABEL: Record<string, string> = {
  attente: 'En attente',
  en_cours: 'En cours',
  termine: 'Terminé',
  paye: 'Payé',
  annule: 'Annulé',
};

const STATUS_STYLE: Record<string, string> = {
  attente: 'bg-badge-warning text-status-warning border-status-warning/30',
  en_cours: 'bg-badge-info text-status-info border-status-info/30',
  termine: 'bg-badge-success text-status-success border-status-success/30',
  paye: 'bg-badge-success text-status-success border-status-success/30',
  annule: 'bg-badge-error text-status-error border-status-error/30',
};

const STATUS_CHIMES: Record<string, number[]> = {
  attente: [392, 330],
  en_cours: [523, 659],
  termine: [523, 659, 784],
  paye: [523, 659, 784, 1047],
  annule: [330, 220],
};

let audioCtx: AudioContext | null = null;

function unlockAudio(): void {
  if (typeof window === 'undefined') return;
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!Ctor) return;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch {}
}

function playStatusChime(status: string): void {
  if (!audioCtx || audioCtx.state !== 'running') return;
  try {
    const freqs = STATUS_CHIMES[status] ?? [440];
    const step = 0.14;
    freqs.forEach((freq, index) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.connect(gain);
      gain.connect(audioCtx!.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = audioCtx!.currentTime + index * step;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + step * 2.2);
      osc.start(start);
      osc.stop(start + step * 2.5);
    });
  } catch {}
}

function orderRef(orderNumber: number) {
  return `OT-${String(orderNumber).padStart(4, '0')}`;
}

export default function TechnicianServiceWorkspace() {
  const { token } = useParams();
  const tokenValue = String(token ?? '');
  const [data, setData] = useState<TechnicianWorkspaceData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(true);
  const orderIdsRef = useRef<Set<string>>(new Set());

  function showNotice(msg: string | null) {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    if (msg) {
      noticeTimer.current = setTimeout(() => setNotice(null), 4000);
    }
  }

  const selected = useMemo(
    () => data?.orders.find((order) => order.id === selectedId) ?? data?.orders[0] ?? null,
    [data?.orders, selectedId],
  );

  async function load() {
    if (!tokenValue) return;
    setError(null);
    try {
      const result = await getTechnicianServiceOrders(tokenValue);
      setData(result);
      orderIdsRef.current = new Set(result.orders.map((order) => order.id));
      setSelectedId((current) => current ?? result.orders[0]?.id ?? null);
    } catch (e: any) {
      setError(e?.message ?? 'Lien invalide ou expiré');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [tokenValue]);

  useEffect(() => {
    const stored = localStorage.getItem('technician_service_sound');
    const enabled = stored !== 'off';
    setSoundEnabled(enabled);
    soundEnabledRef.current = enabled;
  }, []);

  useEffect(() => {
    const handler = () => {
      if (soundEnabledRef.current) unlockAudio();
    };
    window.addEventListener('click', handler, { once: true });
    window.addEventListener('touchstart', handler, { once: true });
    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('touchstart', handler);
    };
  }, []);

  useEffect(() => {
    if (!data?.technician.id) return;
    const channel = supabase
      .channel(`tech-service-orders-${data.technician.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_orders',
          filter: `assigned_to=eq.${data.technician.id}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as Partial<TechnicianServiceOrder> & { id?: string; status?: string };
          if (!row.id) return;

          const knownOrder = orderIdsRef.current.has(row.id);
          void load();

          if (payload.eventType === 'UPDATE' && knownOrder && soundEnabledRef.current && row.status) {
            playStatusChime(row.status);
            showNotice(`${orderRef(Number(row.order_number ?? 0))} mis à jour : ${STATUS_LABEL[row.status] ?? row.status}`);
          }
          if (payload.eventType === 'INSERT' && soundEnabledRef.current) {
            playStatusChime('attente');
            showNotice('Nouvel OT assigné');
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [data?.technician.id, tokenValue]);

  function toggleSound() {
    const next = !soundEnabledRef.current;
    soundEnabledRef.current = next;
    setSoundEnabled(next);
    localStorage.setItem('technician_service_sound', next ? 'on' : 'off');
    if (next) unlockAudio();
  }

  async function transition(order: TechnicianServiceOrder, status: 'en_cours' | 'termine') {
    setBusy(true);
    setError(null);
    showNotice(null);
    try {
      await updateTechnicianServiceOrderStatus(tokenValue, status);
      showNotice(status === 'en_cours' ? 'OT démarré' : 'OT marqué comme terminé');
      await load();
      fetch('/api/client-push/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceOrderId: order.id,
          status,
          orderRef: orderRef(order.order_number),
          businessName: data?.business.name ?? '',
        }),
      }).catch(() => {});
    } catch (e: any) {
      setError(e?.message ?? 'Action refusée');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 animate-spin mx-auto text-content-brand" />
          <p className="text-sm text-content-secondary">Chargement de vos OT...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-surface-card border border-surface-border p-6 text-center space-y-4">
          <AlertCircle className="w-12 h-12 mx-auto text-status-error" />
          <h1 className="text-xl font-bold text-content-primary">Lien indisponible</h1>
          <p className="text-sm text-content-secondary">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface text-content-primary">
      <PublicHeader business={data?.business ?? null} loading={loading} title="Espace Technicien" />

      <div className="bg-surface-card border-b border-surface-border px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-content-primary truncate">{data?.technician.name}</p>
            <p className="text-xs text-content-secondary truncate">Liste des ordres de travail assignés</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={toggleSound}
            title={soundEnabled ? 'Couper le son' : 'Activer le son'}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium',
              soundEnabled
                ? 'border-status-info/30 bg-badge-info text-status-info'
                : 'border-surface-border text-content-secondary hover:bg-surface-hover',
            )}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">{soundEnabled ? 'Son' : 'Muet'}</span>
          </button>
          <button
            onClick={load}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-surface-border px-3 py-2 text-sm text-content-secondary hover:bg-surface-hover disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" />Actualiser
          </button>
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto p-4 grid gap-4 lg:grid-cols-[340px_1fr]">
        <section className="rounded-2xl bg-surface-card border border-surface-border overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-border">
            <p className="text-sm font-semibold">Mes ordres de travail</p>
            <p className="text-xs text-content-secondary">{data?.orders.length ?? 0} OT assigné(s)</p>
          </div>
          <div className="divide-y divide-surface-border">
            {data?.orders.length === 0 && (
              <div className="p-6 text-center text-sm text-content-secondary">
                Aucun OT assigné pour le moment.
              </div>
            )}
            {data?.orders.map((order) => (
              <button
                key={order.id}
                onClick={() => setSelectedId(order.id)}
                className={cn(
                  'w-full p-4 text-left hover:bg-surface-hover transition-colors',
                  selected?.id === order.id && 'bg-brand-500/10',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-bold">{orderRef(order.order_number)}</span>
                  <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', STATUS_STYLE[order.status])}>
                    {STATUS_LABEL[order.status] ?? order.status}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold truncate">
                  {order.subject_ref || order.client_name || 'Prestation'}
                </p>
                {order.subject_info && (
                  <p className="text-xs text-content-secondary truncate">{order.subject_info}</p>
                )}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-surface-card border border-surface-border overflow-hidden">
          {selected ? (
            <>
              <div className="p-5 border-b border-surface-border">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-bold text-content-brand">{orderRef(selected.order_number)}</p>
                    <h2 className="mt-1 text-xl font-bold">{selected.subject_ref || 'Ordre de travail'}</h2>
                    {selected.subject_info && <p className="text-sm text-content-secondary">{selected.subject_info}</p>}
                  </div>
                  <span className={cn('rounded-full border px-3 py-1 text-xs font-semibold', STATUS_STYLE[selected.status])}>
                    {STATUS_LABEL[selected.status] ?? selected.status}
                  </span>
                </div>
              </div>

              <div className="p-5 space-y-5">
                {notice && (
                  <div className="rounded-xl border border-status-success/30 bg-badge-success px-3 py-2 text-sm text-status-success">
                    {notice}
                  </div>
                )}
                {error && (
                  <div className="rounded-xl border border-status-error/30 bg-badge-error px-3 py-2 text-sm text-status-error">
                    {error}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-surface-hover p-4">
                    <p className="text-xs text-content-secondary uppercase font-semibold">Client</p>
                    <p className="mt-1 text-sm font-bold">{selected.client_name || '-'}</p>
                  </div>
                  <div className="rounded-xl bg-surface-hover p-4">
                    <p className="text-xs text-content-secondary uppercase font-semibold">Créé le</p>
                    <p className="mt-1 text-sm font-bold">
                      {new Date(selected.created_at).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                </div>

                {selected.items.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs text-content-secondary uppercase font-semibold">Prestations</p>
                    <div className="rounded-xl border border-surface-border divide-y divide-surface-border overflow-hidden">
                      {selected.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-3 text-sm">
                          <span className="font-medium">{item.name}</span>
                          <span className="text-content-secondary">x{item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selected.notes && (
                  <div>
                    <p className="mb-2 text-xs text-content-secondary uppercase font-semibold">Notes</p>
                    <p className="rounded-xl bg-surface-hover p-4 text-sm whitespace-pre-wrap">{selected.notes}</p>
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row">
                  {selected.status === 'attente' && (
                    <button
                      onClick={() => transition(selected, 'en_cours')}
                      disabled={busy}
                      className="btn-primary flex-1 h-11 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      Démarrer l'OT
                    </button>
                  )}
                  {selected.status === 'en_cours' && (
                    <button
                      onClick={() => transition(selected, 'termine')}
                      disabled={busy}
                      className="flex-1 h-11 rounded-xl bg-status-success text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Marquer terminé
                    </button>
                  )}
                  {selected.status === 'termine' && (
                    <div className="flex-1 h-11 rounded-xl bg-badge-success text-status-success font-semibold flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />Terminé, en attente d'encaissement
                    </div>
                  )}
                  {!['attente', 'en_cours', 'termine'].includes(selected.status) && (
                    <div className="flex-1 h-11 rounded-xl bg-surface-hover text-content-secondary font-semibold flex items-center justify-center gap-2">
                      <Clock className="w-4 h-4" />Aucune action disponible
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-content-secondary">
              <Wrench className="w-10 h-10 mx-auto mb-3 opacity-50" />
              Sélectionnez un OT.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
