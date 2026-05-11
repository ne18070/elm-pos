'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  AlertCircle, ArrowLeft, CheckCircle2, ChevronRight,
  Clock, Loader2, Pause, Play, RefreshCw, Volume2, VolumeX, Wrench,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { PublicHeader } from '@/components/shared/PublicHeader';
import { ConfirmModal } from '@/components/ui/Modal';
import {
  getTechnicianServiceOrders,
  updateTechnicianServiceOrderStatus,
  type TechnicianServiceOrder,
  type TechnicianWorkspaceData,
  type ServiceOrderStatus,
} from '@services/supabase/service-orders';

const STATUS_LABEL: Record<string, string> = {
  attente: 'En attente',
  en_cours: 'En cours',
  pause: 'En pause',
  termine: 'Terminé',
  paye: 'Payé',
  annule: 'Annulé',
};

const STATUS_STYLE: Record<string, string> = {
  attente: 'bg-badge-warning text-status-warning border-status-warning/30',
  en_cours: 'bg-badge-info text-status-info border-status-info/30',
  pause: 'bg-badge-orange text-status-orange border-status-orange/30',
  termine: 'bg-badge-success text-status-success border-status-success/30',
  paye: 'bg-badge-success text-status-success border-status-success/30',
  annule: 'bg-badge-error text-status-error border-status-error/30',
};

// Left border accent on list cards
const STATUS_BORDER: Record<string, string> = {
  attente: 'border-l-[3px] border-l-status-warning',
  en_cours: 'border-l-[3px] border-l-status-info',
  pause: 'border-l-[3px] border-l-status-orange',
  termine: 'border-l-[3px] border-l-status-success',
  paye: 'border-l-[3px] border-l-status-success',
  annule: 'border-l-[3px] border-l-status-error',
};

const STATUS_CHIMES: Record<string, number[]> = {
  attente: [392, 330],
  en_cours: [523, 659],
  termine: [523, 659, 784],
  paye: [523, 659, 784, 1047],
  annule: [330, 220],
};

// Steps shown in progress bar inside detail view
const STEPS = ['attente', 'en_cours', 'termine'] as const;
const STEP_LABEL: Record<string, string> = { attente: 'Reçu', en_cours: 'En cours', termine: 'Terminé' };
function stepIndex(status: string): number {
  if (status === 'pause') return 1; // same position as en_cours
  return STEPS.indexOf(status as any);
}

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
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(true);
  const orderIdsRef = useRef<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState<{
    order: TechnicianServiceOrder;
    status: 'en_cours' | 'pause' | 'termine';
    title: string;
    msg: string;
  } | null>(null);

  function showNotice(msg: string | null) {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    if (msg) noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }

  const selected = useMemo(
    () => data?.orders.find((o) => o.id === selectedId) ?? data?.orders[0] ?? null,
    [data?.orders, selectedId],
  );

  async function load() {
    if (!tokenValue) return;
    setError(null);
    try {
      const result = await getTechnicianServiceOrders(tokenValue);
      setData(result);
      orderIdsRef.current = new Set(result.orders.map((o) => o.id));
      setSelectedId((cur) => cur ?? result.orders[0]?.id ?? null);
    } catch (e: any) {
      setError(e?.message ?? 'Lien invalide ou expiré');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [tokenValue]);

  useEffect(() => {
    const stored = localStorage.getItem('technician_service_sound');
    const enabled = stored !== 'off';
    setSoundEnabled(enabled);
    soundEnabledRef.current = enabled;
  }, []);

  useEffect(() => {
    const handler = () => { if (soundEnabledRef.current) unlockAudio(); };
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
        { event: '*', schema: 'public', table: 'service_orders', filter: `assigned_to=eq.${data.technician.id}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Partial<TechnicianServiceOrder> & { id?: string; status?: string };
          if (!row.id) return;
          const knownOrder = orderIdsRef.current.has(row.id);
          void load();
          if (payload.eventType === 'UPDATE' && knownOrder && soundEnabledRef.current && row.status) {
            playStatusChime(row.status);
            showNotice(`${orderRef(Number(row.order_number ?? 0))} : ${STATUS_LABEL[row.status] ?? row.status}`);
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

  function openOrder(id: string) {
    setSelectedId(id);
    setMobileView('detail');
  }

  async function transition(order: TechnicianServiceOrder, status: 'en_cours' | 'pause' | 'termine') {
    setBusy(true);
    setError(null);
    showNotice(null);
    try {
      await updateTechnicianServiceOrderStatus(tokenValue, order.id, status);
      showNotice(
        status === 'en_cours' ? 'OT démarré' :
        status === 'pause'    ? 'OT mis en pause' :
                                'OT marqué comme terminé',
      );
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

  // ── Loading ──────────────────────────────────────────────────────────────────

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
        <div className="max-w-sm w-full rounded-2xl bg-surface-card border border-surface-border p-8 text-center space-y-4">
          <AlertCircle className="w-12 h-12 mx-auto text-status-error" />
          <h1 className="text-xl font-bold text-content-primary">Lien indisponible</h1>
          <p className="text-sm text-content-secondary">{error}</p>
        </div>
      </div>
    );
  }

  // ── List panel ───────────────────────────────────────────────────────────────

  const listPanel = (
    <section className={cn(
      'flex flex-col bg-surface-card border border-surface-border rounded-2xl overflow-hidden',
      mobileView === 'detail' && 'hidden lg:flex',
    )}>
      {/* List header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-surface-border">
        <div>
          <p className="text-sm font-bold text-content-primary">{data?.technician.name}</p>
          <p className="text-xs text-content-secondary">
            {data?.orders.length ?? 0} ordre{(data?.orders.length ?? 0) !== 1 ? 's' : ''} assigné{(data?.orders.length ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSound}
            title={soundEnabled ? 'Couper le son' : 'Activer le son'}
            className={cn(
              'rounded-xl border p-2',
              soundEnabled
                ? 'border-status-info/30 bg-badge-info text-status-info'
                : 'border-surface-border text-content-secondary hover:bg-surface-hover',
            )}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            onClick={load}
            disabled={busy}
            className="rounded-xl border border-surface-border p-2 text-content-secondary hover:bg-surface-hover disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* OT cards */}
      <div className="divide-y divide-surface-border overflow-y-auto">
        {data?.orders.length === 0 && (
          <div className="p-10 text-center space-y-3">
            <Wrench className="w-10 h-10 mx-auto opacity-30 text-content-secondary" />
            <p className="text-sm text-content-secondary">Aucun OT assigné</p>
          </div>
        )}
        {data?.orders.map((order) => {
          const isActive = selected?.id === order.id;
          return (
            <button
              key={order.id}
              onClick={() => openOrder(order.id)}
              className={cn(
                'w-full text-left flex items-center gap-0 hover:bg-surface-hover transition-colors',
                STATUS_BORDER[order.status],
                isActive && 'bg-brand-500/5',
              )}
            >
              <div className="flex-1 p-4 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-mono text-xs font-bold text-content-brand">{orderRef(order.order_number)}</span>
                  <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide', STATUS_STYLE[order.status])}>
                    {STATUS_LABEL[order.status] ?? order.status}
                  </span>
                </div>
                <p className="text-sm font-semibold truncate">{order.subject_ref || order.client_name || 'Prestation'}</p>
                {(order.subject_info || order.client_name) && (
                  <p className="text-xs text-content-secondary truncate mt-0.5">
                    {order.subject_info ? `${order.subject_info}` : ''}{order.subject_info && order.client_name ? ' · ' : ''}{order.client_name ?? ''}
                  </p>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-content-tertiary mr-3 shrink-0" />
            </button>
          );
        })}
      </div>
    </section>
  );

  // ── Detail panel ─────────────────────────────────────────────────────────────

  const detailPanel = (
    <section className={cn(
      'flex flex-col bg-surface-card border border-surface-border rounded-2xl overflow-hidden',
      mobileView === 'list' && 'hidden lg:flex',
    )}>
      {selected ? (
        <>
          {/* Mobile back button + OT title */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border">
            <button
              onClick={() => setMobileView('list')}
              className="lg:hidden shrink-0 rounded-xl border border-surface-border p-2 text-content-secondary hover:bg-surface-hover"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs font-bold text-content-brand">{orderRef(selected.order_number)}</p>
              <h2 className="text-base font-bold truncate">{selected.subject_ref || 'Ordre de travail'}</h2>
            </div>
            <span className={cn('shrink-0 rounded-full border px-3 py-1 text-xs font-bold', STATUS_STYLE[selected.status])}>
              {STATUS_LABEL[selected.status] ?? selected.status}
            </span>
          </div>

          {/* Progress steps */}
          {['attente', 'en_cours', 'pause', 'termine'].includes(selected.status) && (
            <div className="px-5 pt-4 pb-2">
              <div className="flex items-center gap-0">
                {STEPS.map((step, i) => {
                  const current = stepIndex(selected.status);
                  const done = i < current;
                  const active = i === current;
                  return (
                    <div key={step} className="flex items-center flex-1 last:flex-none">
                      <div className="flex flex-col items-center gap-1">
                        <div className={cn(
                          'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors',
                          done  ? 'bg-status-success border-status-success text-white' :
                          active ? 'bg-content-brand border-content-brand text-white' :
                                   'bg-surface-hover border-surface-border text-content-tertiary',
                        )}>
                          {done ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                        </div>
                        <span className={cn(
                          'text-[10px] font-semibold',
                          active ? 'text-content-brand' : done ? 'text-status-success' : 'text-content-tertiary',
                        )}>
                          {selected.status === 'pause' && step === 'en_cours' ? 'Pause' : STEP_LABEL[step]}
                        </span>
                      </div>
                      {i < STEPS.length - 1 && (
                        <div className={cn(
                          'flex-1 h-0.5 mb-4 mx-1 rounded',
                          i < current ? 'bg-status-success' : 'bg-surface-border',
                        )} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Notices */}
            {notice && (
              <div className="rounded-xl border border-status-success/30 bg-badge-success px-4 py-3 text-sm text-status-success font-medium">
                {notice}
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-status-error/30 bg-badge-error px-4 py-3 text-sm text-status-error font-medium">
                {error}
              </div>
            )}

            {/* Info cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-surface-hover p-3">
                <p className="text-[10px] text-content-secondary uppercase font-bold mb-1">Client</p>
                <p className="text-sm font-bold truncate">{selected.client_name || '—'}</p>
              </div>
              <div className="rounded-xl bg-surface-hover p-3">
                <p className="text-[10px] text-content-secondary uppercase font-bold mb-1">Date</p>
                <p className="text-sm font-bold">{new Date(selected.created_at).toLocaleDateString('fr-FR')}</p>
              </div>
              {selected.subject_info && (
                <div className="col-span-2 rounded-xl bg-surface-hover p-3">
                  <p className="text-[10px] text-content-secondary uppercase font-bold mb-1">Appareil / Sujet</p>
                  <p className="text-sm font-bold">{selected.subject_info}</p>
                </div>
              )}
            </div>

            {/* Items */}
            {selected.items.length > 0 && (
              <div>
                <p className="text-[10px] text-content-secondary uppercase font-bold mb-2">Prestations</p>
                <div className="rounded-xl border border-surface-border divide-y divide-surface-border overflow-hidden">
                  {selected.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between px-4 py-3 text-sm">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-content-secondary text-xs font-bold ml-4 shrink-0">×{item.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {selected.notes && (
              <div>
                <p className="text-[10px] text-content-secondary uppercase font-bold mb-2">Notes</p>
                <p className="rounded-xl bg-surface-hover p-4 text-sm whitespace-pre-wrap">{selected.notes}</p>
              </div>
            )}
          </div>

          {/* Action buttons — stick to bottom */}
          <div className="p-4 border-t border-surface-border space-y-2">
            {(selected.status === 'attente' || selected.status === 'pause') && (
              <button
                onClick={() => transition(selected, 'en_cours')}
                disabled={busy}
                className="btn-primary w-full h-12 flex items-center justify-center gap-2 text-base font-bold disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                {selected.status === 'pause' ? 'Reprendre' : 'Démarrer'}
              </button>
            )}

            {selected.status === 'en_cours' && (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowConfirm({
                    order: selected, status: 'pause',
                    title: 'Mettre en pause',
                    msg: 'Voulez-vous mettre cet OT en pause ?',
                  })}
                  disabled={busy}
                  className="flex-1 h-12 rounded-xl border border-status-orange/30 bg-badge-orange text-status-orange font-bold flex items-center justify-center gap-2 hover:opacity-80 disabled:opacity-50"
                >
                  <Pause className="w-4 h-4" />
                  Pause
                </button>
                <button
                  onClick={() => setShowConfirm({
                    order: selected, status: 'termine',
                    title: 'Terminer l\'OT',
                    msg: 'Voulez-vous marquer cet OT comme terminé ?',
                  })}
                  disabled={busy}
                  className="flex-1 h-12 rounded-xl bg-status-success text-white font-bold flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  Terminer
                </button>
              </div>
            )}

            {selected.status === 'termine' && (
              <div className="space-y-2">
                <div className="h-12 rounded-xl bg-badge-success text-status-success font-bold flex items-center justify-center gap-2 text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  Terminé — en attente d'encaissement
                </div>
                <button
                  onClick={() => setShowConfirm({
                    order: selected, status: 'en_cours',
                    title: 'Ré-ouvrir l\'OT',
                    msg: 'Voulez-vous ré-ouvrir cet OT ?',
                  })}
                  disabled={busy}
                  className="w-full h-11 rounded-xl border border-surface-border text-content-secondary font-semibold flex items-center justify-center gap-2 hover:bg-surface-hover disabled:opacity-50"
                >
                  <Wrench className="w-4 h-4" />
                  Reprendre le travail
                </button>
              </div>
            )}

            {!['attente', 'en_cours', 'pause', 'termine'].includes(selected.status) && (
              <div className="h-12 rounded-xl bg-surface-hover text-content-secondary font-semibold flex items-center justify-center gap-2 text-sm">
                <Clock className="w-4 h-4" />
                Aucune action disponible
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-10 text-content-secondary">
          <Wrench className="w-12 h-12 opacity-20 mb-4" />
          <p className="text-sm">Sélectionnez un OT dans la liste</p>
        </div>
      )}
    </section>
  );

  // ── Page ─────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-surface text-content-primary flex flex-col">
      <PublicHeader business={data?.business ?? null} loading={loading} title="Espace Technicien" />

      <main className="flex-1 max-w-5xl w-full mx-auto p-3 sm:p-4 grid gap-3 sm:gap-4 lg:grid-cols-[320px_1fr] content-start">
        {listPanel}
        {detailPanel}
      </main>

      {showConfirm && (
        <ConfirmModal
          title={showConfirm.title}
          message={showConfirm.msg}
          confirmLabel="Confirmer"
          cancelLabel="Annuler"
          onConfirm={() => {
            const { order, status } = showConfirm;
            setShowConfirm(null);
            transition(order, status);
          }}
          onCancel={() => setShowConfirm(null)}
        />
      )}
    </div>
  );
}
