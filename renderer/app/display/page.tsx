'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle, ShoppingCart, X } from 'lucide-react';
import type { DisplayState, DisplayItem } from '@/hooks/useCustomerDisplay';

function useClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    function update() {
      setTime(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function fmt(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount.toLocaleString('fr-FR')} ${currency}`;
  }
}

// ─── Écran inactif ────────────────────────────────────────────────────────────

function IdleScreen({ state }: { state: DisplayState }) {
  const time = useClock();
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 select-none">
      {state.logoUrl ? (
        <img src={state.logoUrl} alt={state.businessName} className="h-24 w-auto object-contain" />
      ) : (
        <div className="w-24 h-24 bg-brand-600 rounded-3xl flex items-center justify-center">
          <ShoppingCart className="w-12 h-12 text-content-primary" />
        </div>
      )}
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold text-content-primary">{state.businessName ?? 'Bienvenue'}</h1>
        <p className="text-xl text-content-secondary">Votre satisfaction, notre priorité</p>
      </div>
      <p className="text-6xl font-light text-content-brand tabular-nums">{time}</p>
    </div>
  );
}

// ─── Écran panier ─────────────────────────────────────────────────────────────

function CartScreen({ state }: { state: DisplayState }) {
  const currency = state.currency ?? 'XOF';
  const items    = state.items ?? [];

  return (
    <div className="flex flex-col h-full p-8 gap-6">
      <div className="flex items-center gap-3">
        {state.logoUrl ? (
          <img src={state.logoUrl} alt={state.businessName} className="h-10 w-auto object-contain" />
        ) : (
          <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-content-primary" />
          </div>
        )}
        <h1 className="text-2xl font-bold text-content-primary">{state.businessName}</h1>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 text-xs text-content-muted uppercase tracking-wider px-3 pb-1 border-b border-surface-border">
          <span>Article</span>
          <span className="text-right">P.U.</span>
          <span className="text-right">Qté</span>
          <span className="text-right">Total</span>
        </div>

        {items.map((item: DisplayItem, i: number) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-3 py-2.5 rounded-xl bg-surface-card/50"
          >
            <span className="text-content-primary font-medium truncate">{item.name}</span>
            <span className="text-content-secondary text-sm text-right tabular-nums">{fmt(item.price, currency)}</span>
            <span className="text-content-secondary text-sm text-right tabular-nums">×{item.quantity}</span>
            <span className="text-content-brand font-semibold text-right tabular-nums">{fmt(item.total, currency)}</span>
          </div>
        ))}
      </div>

      <div className="bg-surface-card/60 rounded-2xl p-5 space-y-2 border border-surface-border">
        {(state.discount ?? 0) > 0 && (
          <div className="flex justify-between text-status-success text-lg">
            <span>Remise</span>
            <span>-{fmt(state.discount!, currency)}</span>
          </div>
        )}
        {(state.tax ?? 0) > 0 && (
          <div className="flex justify-between text-content-secondary text-lg">
            <span>TVA</span>
            <span>{fmt(state.tax!, currency)}</span>
          </div>
        )}
        <div className="flex justify-between items-center pt-2 border-t border-surface-border">
          <span className="text-2xl font-bold text-content-primary">Total</span>
          <span className="text-4xl font-black text-content-brand tabular-nums">{fmt(state.total ?? 0, currency)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Écran confirmation facture (le client valide) ────────────────────────────

function ConfirmScreen({ state, onConfirm }: { state: DisplayState; onConfirm: () => void }) {
  const currency  = state.currency ?? 'XOF';
  const items     = state.items ?? [];
  const total     = state.total ?? 0;
  const acompte   = state.amountPaid;
  const isPartial = acompte !== undefined && acompte < total - 0.01;

  return (
    <div className="flex flex-col h-full p-8 gap-5 select-none">
      {/* En-tête */}
      <div className="text-center">
        {state.logoUrl && (
          <img src={state.logoUrl} alt={state.businessName} className="h-12 w-auto object-contain mx-auto mb-3" />
        )}
        <h1 className="text-3xl font-bold text-content-primary">Votre facture</h1>
        <p className="text-content-secondary mt-1">Vérifiez et appuyez sur <strong className="text-content-brand">OK</strong> pour valider</p>
      </div>

      {/* Liste articles */}
      <div className="flex-1 overflow-y-auto space-y-2">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 text-xs text-content-muted uppercase tracking-wider px-3 pb-1 border-b border-surface-border">
          <span>Article</span>
          <span className="text-right">P.U.</span>
          <span className="text-right">Qté</span>
          <span className="text-right">Total</span>
        </div>
        {items.map((item: DisplayItem, i: number) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-3 py-2.5 rounded-xl bg-surface-card/50"
          >
            <span className="text-content-primary font-medium truncate">{item.name}</span>
            <span className="text-content-secondary text-sm text-right tabular-nums">{fmt(item.price, currency)}</span>
            <span className="text-content-secondary text-sm text-right tabular-nums">×{item.quantity}</span>
            <span className="text-content-brand font-semibold text-right tabular-nums">{fmt(item.total, currency)}</span>
          </div>
        ))}
      </div>

      {/* Totaux */}
      <div className="bg-surface-card/60 rounded-2xl p-5 space-y-2 border border-surface-border">
        {(state.discount ?? 0) > 0 && (
          <div className="flex justify-between text-status-success text-lg">
            <span>Remise</span>
            <span>-{fmt(state.discount!, currency)}</span>
          </div>
        )}
        {(state.tax ?? 0) > 0 && (
          <div className="flex justify-between text-content-secondary text-lg">
            <span>TVA</span>
            <span>{fmt(state.tax!, currency)}</span>
          </div>
        )}
        <div className="flex justify-between items-center pt-2 border-t border-surface-border">
          <span className="text-2xl font-bold text-content-primary">Total</span>
          <span className="text-4xl font-black text-content-brand tabular-nums">{fmt(total, currency)}</span>
        </div>

        {isPartial && (
          <>
            <div className="flex justify-between text-content-brand pt-2 border-t border-surface-border text-lg">
              <span>Acompte versé</span>
              <span className="font-bold tabular-nums">{fmt(acompte!, currency)}</span>
            </div>
            <div className="flex justify-between text-status-warning text-xl font-bold">
              <span>Reste à régler</span>
              <span className="tabular-nums">{fmt(total - acompte!, currency)}</span>
            </div>
          </>
        )}
      </div>

      {/* Bouton OK client */}
      <button
        onClick={onConfirm}
        className="w-full py-7 bg-brand-600 hover:bg-brand-500 active:bg-brand-700 text-content-primary text-4xl font-black rounded-2xl transition-colors flex items-center justify-center gap-4"
      >
        <CheckCircle className="w-10 h-10" />
        OK — Valider
      </button>
    </div>
  );
}

// ─── Écran paiement ───────────────────────────────────────────────────────────

function PaymentScreen({ state }: { state: DisplayState }) {
  const currency = state.currency ?? 'XOF';
  const change   = state.change ?? 0;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-10 select-none">
      <div className="relative">
        <div className="w-40 h-40 bg-badge-success rounded-full flex items-center justify-center animate-pulse">
          <CheckCircle className="w-24 h-24 text-status-success" strokeWidth={1.5} />
        </div>
      </div>

      <div className="text-center space-y-3">
        <h1 className="text-5xl font-black text-content-primary">Merci !</h1>
        <p className="text-2xl text-content-secondary">Paiement accepté</p>
      </div>

      <div className="bg-surface-card/60 rounded-3xl px-12 py-6 border border-surface-border text-center space-y-1">
        <p className="text-content-secondary text-lg">Total</p>
        <p className="text-4xl font-bold text-content-brand tabular-nums">{fmt(state.total ?? 0, currency)}</p>
      </div>

      {change > 0 && (
        <div className="bg-badge-success rounded-3xl px-12 py-6 border border-status-success text-center space-y-1">
          <p className="text-content-secondary text-lg">Monnaie à rendre</p>
          <p className="text-5xl font-black text-status-success tabular-nums">{fmt(change, currency)}</p>
        </div>
      )}

      {state.businessName && (
        <p className="text-content-muted text-lg mt-4">{state.businessName}</p>
      )}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function DisplayPage() {
  const [displayState, setDisplayState] = useState<DisplayState>({
    screen: 'idle',
    businessName: '',
  });

  // Ref vers le canal BroadcastChannel actif pour renvoyer des messages au caissier
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    function applyState(state: unknown) {
      if (state && typeof state === 'object') {
        setDisplayState(state as DisplayState);
      }
    }

    // Mécanisme 1 : CustomEvent injecté par executeJavaScript depuis main
    function onCustomEvent(e: Event) {
      applyState((e as CustomEvent).detail);
    }
    window.addEventListener('elm-display-update', onCustomEvent);

    const injected = (window as { __ELM_DISPLAY_STATE?: unknown }).__ELM_DISPLAY_STATE;
    if (injected) applyState(injected);

    // Mécanisme 2 : IPC classique via preload
    const unsubscribeIpc = window.electronAPI?.display?.onData(applyState);

    // Mécanisme 3 : pull initial depuis main
    window.electronAPI?.display?.getState?.().then(applyState);

    // Mécanisme 4 : BroadcastChannel
    const channel = new BroadcastChannel('elm-pos-display');
    channelRef.current = channel;

    channel.onmessage = (e: MessageEvent) => {
      // Filtrer les messages string (ex: 'ready', 'customer-confirmed')
      if (typeof e.data === 'string') return;
      applyState(e.data);
    };
    channel.postMessage('ready');

    return () => {
      window.removeEventListener('elm-display-update', onCustomEvent);
      if (typeof unsubscribeIpc === 'function') unsubscribeIpc();
      channel.close();
      channelRef.current = null;
    };
  }, []);

  // Le client appuie sur OK → envoyer la confirmation au caissier + passer à l'écran payment
  function handleCustomerConfirm() {
    channelRef.current?.postMessage('customer-confirmed');
    // Basculer vers l'écran de succès côté client
    setDisplayState((prev) => ({
      ...prev,
      screen: 'payment',
      // Pour acompte : afficher le montant versé comme "total affiché"
      ...(prev.amountPaid !== undefined && prev.amountPaid < (prev.total ?? 0)
        ? { change: 0 }
        : {}),
    }));
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0f172a] relative">
      {/* Bouton fermer — visible au survol */}
      <button
        onClick={() => window.electronAPI?.invoke('display:close')}
        className="absolute top-3 right-3 z-50 p-1.5 rounded-lg bg-surface-card/60 hover:bg-surface-input text-content-muted hover:text-content-primary opacity-0 hover:opacity-100 focus:opacity-100 transition-all"
        title="Fermer l'écran client"
      >
        <X className="w-4 h-4" />
      </button>

      {displayState.screen === 'idle'    && <IdleScreen    state={displayState} />}
      {displayState.screen === 'cart'    && <CartScreen    state={displayState} />}
      {displayState.screen === 'confirm' && <ConfirmScreen state={displayState} onConfirm={handleCustomerConfirm} />}
      {displayState.screen === 'payment' && <PaymentScreen state={displayState} />}
    </div>
  );
}
