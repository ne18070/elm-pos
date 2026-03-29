'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';
import { supabase } from '@/lib/supabase';
import { getMyBusinesses } from '@services/supabase/business';
import { getSubscription, getPlans, getPaymentSettings } from '@services/supabase/subscriptions';
import { getCurrentSession } from '@services/supabase/cash-sessions';
import { useCashSessionStore } from '@/store/cashSession';

const PUBLIC_PATHS = ['/login', '/display', '/subscribe'];
const isPublic = (path: string) => PUBLIC_PATHS.some(p => path === p || path.startsWith(p + '/'));

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setBusiness, setBusinesses, setLoading, clear } = useAuthStore();
  const { setSubscription, setPlans, setPaymentSettings, setLoaded } = useSubscriptionStore();
  const { setSession: setCashSession, setLoaded: setCashLoaded } = useCashSessionStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) {
        setLoaded(true); // pas de session → subscription inutile, on marque comme chargé
        setLoading(false);
        if (!isPublic(pathname)) router.replace('/login');
        return;
      }

      // Charger le profil utilisateur
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (!profile) {
        setLoading(false);
        router.replace('/login');
        return;
      }

      setUser(profile as never);

      // Superadmin → uniquement le backoffice
      if ((profile as { is_superadmin?: boolean }).is_superadmin) {
        setLoading(false);
        setLoaded(true);
        if (!pathname.startsWith('/backoffice')) router.replace('/backoffice');
        return;
      }

      // Charger l'établissement actif
      // Si l'onglet a déjà un business sélectionné (sessionStorage), ne pas l'écraser
      const hasTabBusiness = !!sessionStorage.getItem('elm-pos-active-business');
      if (!hasTabBusiness && profile.business_id) {
        const { data: biz } = await supabase
          .from('businesses')
          .select('*')
          .eq('id', profile.business_id)
          .single();
        if (biz) setBusiness(biz as never);
      }

      // Charger tous les établissements de l'utilisateur
      try {
        const memberships = await getMyBusinesses();
        setBusinesses(memberships);
      } catch {
        // Pas critique — la migration n'est peut-être pas encore appliquée
      }

      // Charger abonnement + plans + paramètres paiement
      const activeBizId = (sessionStorage.getItem('elm-pos-active-business')
        ? JSON.parse(sessionStorage.getItem('elm-pos-active-business')!)?.id
        : null) ?? profile.business_id;

      if (activeBizId) {
        try {
          const [sub, plans, paySettings, cashSession] = await Promise.all([
            getSubscription(activeBizId),
            getPlans(),
            getPaymentSettings(),
            getCurrentSession(activeBizId),
          ]);
          setSubscription(sub);
          setPlans(plans);
          setPaymentSettings(paySettings);
          setCashSession(cashSession);
          // Sauvegarder l'abonnement dans le processus principal (sécurité offline)
          if (sub && window.electronAPI?.invoke) {
            window.electronAPI.invoke('subscription:save', {
              business_id:   activeBizId,
              status:        sub.status,
              expires_at:    sub.expires_at ?? null,
              trial_ends_at: sub.trial_ends_at ?? null,
            }).catch(() => { /* non bloquant */ });
          }
        } catch { /* non critique */ }
      }
      setLoaded(true);
      setCashLoaded(true);

      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if ((event === 'SIGNED_OUT' || !session) && !isPublic(pathname)) {
          clear();
          router.replace('/login');
        }
      }
    );

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}
