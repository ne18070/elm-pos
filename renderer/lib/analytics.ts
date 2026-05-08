import { supabase } from '@/lib/supabase';
import { sanitize, safeUrl } from '@/lib/monitoring-sanitize';

// ─── Context cache ────────────────────────────────────────────────────────────
// Set once by auth-provider after session loads. Avoids a getUser() network
// call on every error or perf log.
let _userId:     string | null = null;
let _businessId: string | null = null;

export function setMonitoringUser(userId: string | null, businessId: string | null) {
  _userId     = userId;
  _businessId = businessId;
}

function getActiveBizId(): string | null {
  if (_businessId) return _businessId;
  try {
    const raw = sessionStorage.getItem('elm-pos-active-business');
    return raw ? JSON.parse(raw).id : null;
  } catch {
    return null;
  }
}

// ─── Analytics events (funnel, onboarding…) ──────────────────────────────────
let cachedUserId: string | null = null;

export async function trackEvent(eventName: string, metadata: Record<string, unknown> = {}) {
  (async () => {
    try {
      if (!cachedUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        cachedUserId = user?.id || null;
      }
      if (!cachedUserId) return;

      await supabase.from('analytics_events').insert({
        user_id:    cachedUserId,
        event_name: eventName,
        metadata: {
          ...metadata,
          url:       typeof window !== 'undefined' ? window.location.pathname : null,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.warn('[Analytics] Failed:', eventName, err);
    }
  })();
}

// ─── Auth event tracking ─────────────────────────────────────────────────────
// Writes to monitoring_vitals (category='auth') so superadmin can read it.
export function trackAuth(
  eventType: 'login' | 'logout' | 'login_failed',
  context:   Record<string, unknown> = {},
) {
  (async () => {
    try {
      if (!_userId) {
        const { data: { user } } = await supabase.auth.getUser();
        _userId = user?.id ?? null;
      }
      // At login time _businessId may not be cached yet — fetch it directly.
      let bizId        = getActiveBizId();
      let isSuperadmin = false;
      if (_userId) {
        const { data } = await (supabase as any)
          .from('users')
          .select('business_id, is_superadmin')
          .eq('id', _userId)
          .maybeSingle();
        if (data?.business_id && !bizId) {
          bizId       = data.business_id;
          _businessId = bizId;
        }
        isSuperadmin = data?.is_superadmin ?? false;
      }
      await (supabase as any).from('monitoring_vitals').insert({
        user_id:     _userId,
        business_id: bizId,
        level:       eventType === 'login_failed' ? 'error' : 'info',
        category:    'auth',
        message:     eventType,
        context:     sanitize({ ...context, is_superadmin: isSuperadmin }),
        url:         typeof window !== 'undefined' ? safeUrl(window.location.href) : null,
      });
    } catch {}
  })();
}

// ─── Error tracking ───────────────────────────────────────────────────────────
// Fire-and-forget. Never blocks the main thread.
// Context is sanitized (RGPD) before insertion.
export function trackError(
  category: 'js' | 'api' | 'auth' | 'sql',
  message:  string,
  context:  Record<string, unknown> = {},
) {
  (async () => {
    try {
      await (supabase as any).from('monitoring_vitals').insert({
        user_id:     _userId,
        business_id: getActiveBizId(),
        level:       'error',
        category,
        message:     message.slice(0, 500),
        context:     sanitize(context),
        user_agent:  typeof navigator !== 'undefined' ? navigator.userAgent : null,
        url:         typeof window    !== 'undefined' ? safeUrl(window.location.href) : null,
      });
    } catch {
      // Never throw from monitoring — would cause infinite loop
    }
  })();
}

// ─── Warning tracking ─────────────────────────────────────────────────────────
// For non-critical UX friction: empty states, slow but not failed, degraded paths.
// Low volume: always sampled at 10%.
export function trackWarn(
  category: 'js' | 'api' | 'ux' | 'auth',
  message:  string,
  context:  Record<string, unknown> = {},
) {
  if (Math.random() > 0.1) return; // 10% sample rate

  (async () => {
    try {
      await (supabase as any).from('monitoring_vitals').insert({
        user_id:     _userId,
        business_id: getActiveBizId(),
        level:       'warn',
        category,
        message:     message.slice(0, 500),
        context:     sanitize(context),
        url:         typeof window !== 'undefined' ? safeUrl(window.location.href) : null,
      });
    } catch {}
  })();
}

// ─── Performance tracking ─────────────────────────────────────────────────────
// Adaptive sampling: 50% for critical paths (pos/auth), 20% for general UX.
// Only logs above threshold to avoid noise.
export function trackPerf(
  category:  'api' | 'ux' | 'pos' | 'auth',
  name:      string,
  latencyMs: number,
  context:   Record<string, unknown> = {},
) {
  const isCritical = category === 'pos' || category === 'auth';
  const threshold  = isCritical ? 1000 : 2000;
  const sampleRate = isCritical ? 0.5  : 0.2;

  if (latencyMs < threshold && Math.random() > sampleRate) return;

  (async () => {
    try {
      await (supabase as any).from('monitoring_vitals').insert({
        user_id:     _userId,
        business_id: getActiveBizId(),
        level:       'perf',
        category,
        message:     name,
        latency_ms:  latencyMs,
        context:     sanitize(context),
        url:         typeof window !== 'undefined' ? window.location.pathname : null,
      });
    } catch {}
  })();
}
