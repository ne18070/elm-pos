'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';
import { Sidebar } from '@/components/shared/Sidebar';
import { TrialBanner } from '@/components/shared/TrialBanner';
import { Loader2 } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore();
  const { effectiveStatus, loaded: subLoaded } = useSubscriptionStore();
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading || !subLoaded) return;
    if (!user) { router.replace('/login'); return; }

    const status = effectiveStatus();
    if (status === 'expired' && pathname !== '/billing') {
      router.replace('/billing');
    }
  }, [user, isLoading, subLoaded, pathname, effectiveStatus, router]);

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
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col">
        <TrialBanner />
        {children}
      </main>
    </div>
  );
}
