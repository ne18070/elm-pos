import { supabase } from '@/lib/supabase';

let cachedUserId: string | null = null;

export async function trackEvent(eventName: string, metadata: Record<string, any> = {}) {
  // Fire and forget
  (async () => {
    try {
      if (!cachedUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        cachedUserId = user?.id || null;
      }
      
      if (!cachedUserId) return;

      await supabase.from('analytics_events').insert({
        user_id: cachedUserId,
        event_name: eventName,
        metadata: {
          ...metadata,
          url: window.location.pathname,
          timestamp: new Date().toISOString()
        }
      });
    } catch (err) {
      // Silent error for analytics to not block UI
      console.warn('[Analytics] Failed:', eventName, err);
    }
  })();
}
