'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';
import { Sidebar } from '@/components/shared/Sidebar';
import { TrialBanner } from '@/components/shared/TrialBanner';
import { InactivityGuard } from '@/components/shared/InactivityGuard';
import { Loader2 } from 'lucide-react';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore();
  const isSuperAdmin = (user as { is_superadmin?: boolean } | null)?.is_superadmin ?? false;
  useRealtimeSync();
  const { effectiveStatus, loaded: subLoaded } = useSubscriptionStore();
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading || !subLoaded) return;
    if (!user) { router.replace('/login'); return; }

    // Le superadmin n'a pas accès au dashboard POS
    if (isSuperAdmin) { router.replace('/backoffice'); return; }

    const status = effectiveStatus();
    const needsBilling = (status === 'expired' || status === 'none') && pathname !== '/billing';
    if (needsBilling) {
      router.replace('/billing');
    }
  }, [user, isLoading, isSuperAdmin, subLoaded, pathname, effectiveStatus, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      <InactivityGuard />
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col">
        <TrialBanner />
        {children}
      </main>
    </div>
  );
}
