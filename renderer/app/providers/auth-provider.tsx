'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { supabase } from '@/lib/supabase';

const PUBLIC_PATHS = ['/login', '/display'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setBusiness, setLoading, clear } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Restore session on mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) {
        setLoading(false);
        if (!PUBLIC_PATHS.includes(pathname)) {
          router.replace('/login');
        }
        return;
      }

      // Load user profile
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

      // Load business if assigned
      if (profile.business_id) {
        const { data: business } = await supabase
          .from('businesses')
          .select('*')
          .eq('id', profile.business_id)
          .single();
        if (business) setBusiness(business as never);
      }

      setLoading(false);
    });

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if ((event === 'SIGNED_OUT' || !session) && !PUBLIC_PATHS.includes(pathname)) {
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
