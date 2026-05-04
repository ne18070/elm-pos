'use client';

import { useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';
import { supabase } from '@/lib/supabase';
import { getMyBusinesses } from '@services/supabase/business';
import { getSubscription, getPlans, getPaymentSettings } from '@services/supabase/subscriptions';
import { getCurrentSession } from '@services/supabase/cash-sessions';
import { getMyPermissions } from '@services/supabase/permissions';
import { useCashSessionStore } from '@/store/cashSession';
import { usePermissionsStore } from '@/store/permissions';
import { setMonitoringUser, trackEvent, trackError } from '@/lib/analytics';

const PUBLIC_PATHS = ['/', '/login', '/signup', '/onboarding', '/reset-password', '/display', '/subscribe', '/privacy', '/c', '/upload', '/boutique', '/payer', '/track', '/reservation', '/location', '/juridique', '/voitures', '/proprietaire', '/services'];
const isPublic = (path: string) => PUBLIC_PATHS.some(p => path === p || path.startsWith(p + '/'));

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setBusiness, setBusinesses, setLoading, clear } = useAuthStore();
  const { setSubscription, setPlans, setPaymentSettings, setLoaded } = useSubscriptionStore();
  const { setOverrides, reset: resetPermissions } = usePermissionsStore();
  const { setSession: setCashSession, setLoaded: setCashLoaded } = useCashSessionStore();
  const router = useRouter();
  const pathname = usePathname();

  const loadAllData = useCallback(async (sessionUser: { id: string }, profile: any) => {
    setUser(profile as never);
    // Alimenter le cache monitoring — élimine les appels getUser() sur chaque log d'erreur
    setMonitoringUser(sessionUser.id, profile.business_id ?? null);

    // Superadmin → uniquement le backoffice
    if (profile.is_superadmin) {
      setLoading(false);
      setLoaded(true);
      if (!pathname.startsWith('/backoffice') && !isPublic(pathname)) router.replace('/backoffice');
      return;
    }

    // Charger l'établissement actif
    const hasTabBusiness = !!sessionStorage.getItem('elm-pos-active-business');
    let activeBizLoaded = false;
    if (!hasTabBusiness && profile.business_id) {
      const { data: biz } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', profile.business_id)
        .single();
      if (biz) { setBusiness(biz as never); activeBizLoaded = true; }
    }

    // Charger tous les établissements
    let fallbackBizId: string | null = null;
    try {
      const memberships = await getMyBusinesses();
      setBusinesses(memberships);
      // Profile had no business_id yet (post-onboarding timing) — use first membership
      if (!hasTabBusiness && !activeBizLoaded && memberships.length > 0) {
        setBusiness(memberships[0].business as never);
        fallbackBizId = memberships[0].business.id;
      }
    } catch { /* non critique */ }

    // Charger abonnement + plans + paramètres paiement + permissions
    const activeBizId = (sessionStorage.getItem('elm-pos-active-business')
      ? JSON.parse(sessionStorage.getItem('elm-pos-active-business')!)?.id
      : null) ?? profile.business_id ?? fallbackBizId;

    if (activeBizId) {
      try {
        const [sub, plans, paySettings, cashSession, overrides] = await Promise.all([
          getSubscription(sessionUser.id, activeBizId),
          getPlans(),
          getPaymentSettings(),
          getCurrentSession(activeBizId),
          getMyPermissions(activeBizId),
        ]);
        setSubscription(sub);
        setPlans(plans);
        setPaymentSettings(paySettings);
        setCashSession(cashSession);
        setOverrides(overrides);
        
        if (sub && window.electronAPI?.invoke) {
          window.electronAPI.invoke('subscription:save', {
            business_id:   activeBizId,
            status:        sub.status,
            expires_at:    sub.expires_at ?? null,
            trial_ends_at: sub.trial_ends_at ?? null,
          }).catch(() => {});
        }
      } catch { /* non critique */ }
    }
    setLoaded(true);
    setCashLoaded(true);
    setLoading(false);
  }, [setUser, setBusiness, setBusinesses, setLoading, setLoaded, setSubscription, setPlans, setPaymentSettings, setCashSession, setOverrides, setCashLoaded, pathname, router]);

  const checkSession = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      setLoaded(true);
      setLoading(false);
      if (!isPublic(pathname)) {
        clear();
        resetPermissions();
        router.replace('/login');
      }
      return;
    }

    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();

    if (!profile) {
      // Trigger may not have fired yet — try RPC fallback
      const { data: rows } = await (supabase as any).rpc('get_or_create_profile');
      const fallbackProfile = rows?.[0] ?? null;
      if (!fallbackProfile) {
        clear();
        setLoading(false);
        if (!isPublic(pathname)) router.replace('/login');
        return;
      }
      await loadAllData(session.user, fallbackProfile);
      return;
    }

    await loadAllData(session.user, profile);
  }, [clear, loadAllData, pathname, resetPermissions, router, setLoaded, setLoading]);

  useEffect(() => {
    checkSession();

    const onFocus = () => {
      checkSession().catch(() => {});
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          trackEvent('user_login', {
            user_agent: navigator.userAgent,
            method:     'password',
          });
        }

        if (event === 'SIGNED_OUT' || (!session && !isPublic(pathname))) {
          trackEvent('user_logout', {
            reason: event === 'SIGNED_OUT' ? 'explicit' : 'session_expired',
          });
        }

        if (event === 'TOKEN_REFRESHED') {
          // Silencieux — normal, pas un événement de sécurité
        }

        if ((event === 'SIGNED_OUT' || !session) && !isPublic(pathname)) {
          clear();
          resetPermissions();
          router.replace('/login');
        }
      }
    );

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
    };
  }, [checkSession, clear, pathname, resetPermissions, router]);

  return <>{children}</>;
}
