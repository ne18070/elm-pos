'use client';

import { useState, useEffect } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { subscribeToPush, unsubscribeFromPush, isPushSubscribed, isPushSupported } from '@services/supabase/push-notifications';
import { useAuthStore } from '@/store/auth';

export function NotificationBanner() {
  const { user, business } = useAuthStore();
  const [state, setState] = useState<'loading' | 'unsupported' | 'subscribed' | 'unsubscribed' | 'dismissed'>('loading');

  useEffect(() => {
    if (!isPushSupported()) { setState('unsupported'); return; }
    if (typeof window !== 'undefined' && localStorage.getItem('push-banner-dismissed')) { setState('dismissed'); return; }
    isPushSubscribed().then((yes) => setState(yes ? 'subscribed' : 'unsubscribed'));
  }, []);

  if (!user?.id || !business?.id) return null;
  if (state === 'loading' || state === 'unsupported' || state === 'subscribed' || state === 'dismissed') return null;

  async function enable() {
    setState('loading');
    const ok = await subscribeToPush(user!.id, business!.id);
    setState(ok ? 'subscribed' : 'unsubscribed');
  }

  function dismiss() {
    localStorage.setItem('push-banner-dismissed', '1');
    setState('dismissed');
  }

  return (
    <div className="bg-brand-50 border-b border-brand-100 px-4 py-2.5 flex items-center gap-3 text-sm">
      <Bell className="w-4 h-4 text-brand-600 shrink-0" />
      <p className="flex-1 text-brand-800 font-medium">
        Recevez une alerte quand un client réserve ou commande en ligne
      </p>
      <button
        onClick={enable}
        className="bg-brand-600 text-content-primary px-3 py-1.5 rounded-lg font-semibold text-xs hover:bg-brand-700 transition-colors shrink-0"
      >
        Activer
      </button>
      <button onClick={dismiss} className="text-content-brand hover:text-brand-600 transition-colors shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function NotificationToggle() {
  const { user, business } = useAuthStore();
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isPushSupported()) isPushSubscribed().then(setSubscribed);
  }, []);

  if (!isPushSupported() || !user?.id || !business?.id) return null;

  async function toggle() {
    setLoading(true);
    if (subscribed) {
      await unsubscribeFromPush(user!.id);
      setSubscribed(false);
    } else {
      const ok = await subscribeToPush(user!.id, business!.id);
      if (ok) setSubscribed(true);
    }
    setLoading(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={subscribed ? 'Désactiver les notifications' : 'Activer les notifications'}
      className={`p-2 rounded-full transition-colors ${subscribed ? 'text-brand-600 hover:bg-brand-50' : 'text-content-secondary hover:bg-slate-100'}`}
    >
      {subscribed ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
    </button>
  );
}
