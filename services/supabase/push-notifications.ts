import { supabase as _supabase } from './client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export async function subscribeToPush(userId: string, businessId: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  const existingSub = await registration.pushManager.getSubscription();
  const sub = existingSub ?? await registration.pushManager.subscribe({
    userVisibleOnly:      true,
    applicationServerKey: VAPID_PUBLIC_KEY,
  });

  const json    = sub.toJSON();
  const keys    = json.keys as { p256dh: string; auth: string };
  const endpoint = sub.endpoint;

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id:     userId,
      business_id: businessId,
      endpoint,
      p256dh: keys.p256dh,
      auth:   keys.auth,
    }, { onConflict: 'user_id,endpoint' });

  return !error;
}

export async function unsubscribeFromPush(userId: string): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  if (registration) {
    const sub = await registration.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', sub.endpoint);
    }
  }
}

export async function isPushSubscribed(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!registration) return false;
  const sub = await registration.pushManager.getSubscription();
  return !!sub;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}
