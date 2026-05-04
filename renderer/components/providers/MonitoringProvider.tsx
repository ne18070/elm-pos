'use client';

import { useEffect } from 'react';
import { trackError, trackPerf, trackWarn } from '@/lib/analytics';
import { safeUrl } from '@/lib/monitoring-sanitize';

/**
 * Global error capture + Web Vitals + Rage click detection + Fetch interceptor.
 * Must be mounted after AuthProvider (which feeds setMonitoringUser).
 * All tracking is fire-and-forget — never blocks render.
 */
export function MonitoringProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // ── JS errors ─────────────────────────────────────────────────────────────
    const onError = (e: ErrorEvent) => {
      if (e.filename && !e.filename.includes(window.location.origin)) return;
      trackError('js', e.message || 'JS Error', {
        filename: e.filename,
        line:     e.lineno,
        col:      e.colno,
        stack:    e.error?.stack?.slice(0, 1000),
      });
    };

    // ── Unhandled promise rejections ─────────────────────────────────────────
    const onUnhandledRejection = (e: PromiseRejectionEvent) => {
      const reason  = e.reason;
      const message = reason?.message || String(reason) || 'Unhandled Promise Rejection';
      if (message.includes('Failed to fetch') || message.includes('NetworkError')) return;
      trackError('js', message, {
        type:  'unhandled_rejection',
        stack: reason?.stack?.slice(0, 1000),
      });
    };

    window.addEventListener('error',              onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    // ── Rage click detection ──────────────────────────────────────────────────
    // 5+ rapid clicks on the same element within 2 seconds = user frustration.
    const clickCounts = new Map<string, { count: number; ts: number }>();
    const RAGE_THRESHOLD = 5;
    const RAGE_WINDOW_MS = 2000;

    const onDocumentClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;

      // Key: tag + first class + trimmed text (max 30 chars)
      const key = `${target.tagName}.${(target.className || '').toString().split(' ')[0]}.${target.textContent?.trim().slice(0, 30)}`;
      const now = Date.now();
      const entry = clickCounts.get(key);

      if (!entry || now - entry.ts > RAGE_WINDOW_MS) {
        clickCounts.set(key, { count: 1, ts: now });
      } else {
        entry.count++;
        if (entry.count === RAGE_THRESHOLD) {
          trackWarn('ux', 'rage_click', {
            element:  key,
            page:     window.location.pathname,
            x:        e.clientX,
            y:        e.clientY,
          });
        }
      }

      // Prune stale keys periodically (every 50 clicks)
      if (clickCounts.size > 50) {
        for (const [k, v] of clickCounts) {
          if (now - v.ts > RAGE_WINDOW_MS * 2) clickCounts.delete(k);
        }
      }
    };

    document.addEventListener('click', onDocumentClick, { passive: true });

    // ── Fetch interceptor: track failed API requests ──────────────────────────
    // Wraps window.fetch to log 4xx/5xx responses.
    // Excludes: Supabase auth endpoints (noise), monitoring_vitals inserts (loop).
    const originalFetch = window.fetch.bind(window);

    window.fetch = async function patchedFetch(input, init) {
      const url = typeof input === 'string' ? input : (input as Request).url;
      const startMs = Date.now();

      let response: Response;
      try {
        response = await originalFetch(input, init);
      } catch (err) {
        // Network-level failure (offline, DNS, CORS)
        if (url && !url.includes('/auth/v1/') && !url.includes('monitoring_vitals')) {
          trackError('api', 'Network failure', { url: safeUrl(url) });
        }
        throw err;
      }

      const latencyMs = Date.now() - startMs;

      // Skip: auth internals, monitoring self-inserts, realtime
      const isInternal = url.includes('/auth/v1/')
        || url.includes('monitoring_vitals')
        || url.includes('/realtime/v1/');

      if (!isInternal) {
        const isApiError = response.status >= 500
          || (response.status >= 400 && response.status !== 401 && response.status !== 404);

        if (isApiError) {
          // Read body once (clone so the caller still gets the original response)
          let bodyDetail: Record<string, unknown> | null = null;
          try {
            bodyDetail = await response.clone().json();
          } catch { /* not JSON — ignore */ }

          trackError('api', `HTTP ${response.status}`, {
            url:        safeUrl(url),
            status:     response.status,
            latency_ms: latencyMs,
            // Supabase error fields
            error:      (bodyDetail as any)?.message ?? (bodyDetail as any)?.error ?? null,
            code:       (bodyDetail as any)?.code    ?? null,
            hint:       (bodyDetail as any)?.hint    ?? null,
            detail:     (bodyDetail as any)?.details ?? null,
          });
        } else if (latencyMs > 3000) {
          trackPerf('api', 'slow_request', latencyMs, { url: safeUrl(url) });
        }
      }

      return response;
    };

    // ── Web Vitals via PerformanceObserver ────────────────────────────────────
    const observers: PerformanceObserver[] = [];

    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const lcpObs = new PerformanceObserver((list) => {
          const last = list.getEntries().at(-1);
          if (last) trackPerf('ux', 'LCP', Math.round(last.startTime));
        });
        lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });
        observers.push(lcpObs);
      } catch {}

      try {
        const navObs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const nav  = entry as PerformanceNavigationTiming;
            const ttfb = Math.round(nav.responseStart - nav.requestStart);
            const load = Math.round(nav.loadEventEnd  - nav.startTime);
            if (ttfb > 0) trackPerf('ux', 'TTFB',     ttfb, { page: window.location.pathname });
            if (load  > 0) trackPerf('ux', 'PageLoad', load, { page: window.location.pathname });
          }
        });
        navObs.observe({ type: 'navigation', buffered: true });
        observers.push(navObs);
      } catch {}

      try {
        const longTaskObs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 200) {
              trackPerf('ux', 'LongTask', Math.round(entry.duration), {
                page: window.location.pathname,
              });
            }
          }
        });
        longTaskObs.observe({ type: 'longtask', buffered: false });
        observers.push(longTaskObs);
      } catch {}
    }

    return () => {
      window.removeEventListener('error',              onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      document.removeEventListener('click', onDocumentClick);
      window.fetch = originalFetch;
      observers.forEach(o => { try { o.disconnect(); } catch {} });
    };
  }, []);

  return <>{children}</>;
}
