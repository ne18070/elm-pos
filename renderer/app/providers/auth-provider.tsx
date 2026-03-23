'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { supabase } from '@/lib/supabase';
import { getMyBusinesses } from '@services/supabase/business';

const PUBLIC_PATHS = ['/login', '/display'];
const isPublic = (path: string) => PUBLIC_PATHS.some(p => path === p || path.startsWith(p + '/'));

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setBusiness, setBusinesses, setLoading, clear } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) {
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

      // Charger l'établissement actif
      if (profile.business_id) {
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
