'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';
import { usePermissionsStore } from '@/store/permissions';
import { Sidebar, MobileTopBar, MobileBottomNav, useOpenSidebar } from '@/components/shared/Sidebar';
import { TrialBanner } from '@/components/shared/TrialBanner';
import { InactivityGuard } from '@/components/shared/InactivityGuard';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { Loader2 } from 'lucide-react';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { NAV_ITEMS } from '@/components/shared/Sidebar';
import { checkPermission } from '@/lib/permissions';

function MobileLayout({ children }: { children: React.ReactNode }) {
  const openSidebar = useOpenSidebar();
  return (
    <div className="flex h-screen overflow-hidden">
      <InactivityGuard />
      <CommandPalette />
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <MobileTopBar onMenuOpen={openSidebar} />
        <TrialBanner />
        <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {children}
        </main>
        <MobileBottomNav />
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, business } = useAuthStore();
  const isSuperAdmin = (user as { is_superadmin?: boolean } | null)?.is_superadmin ?? false;
  const { setOverrides, reset: resetPermissions } = usePermissionsStore();
  useRealtimeSync();
  const { effectiveStatus, loaded: subLoaded } = useSubscriptionStore();
  const router   = useRouter();
  const pathname = usePathname();
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const [offlineCheck, setOfflineCheck] = useState<{ allowed: boolean; status: string; reason?: string } | null>(null);

  // Load per-member permission overrides when user + business are known
  useEffect(() => {
    if (!user?.id || !business?.id) { resetPermissions(); return; }
    import('@services/supabase/permissions')
      .then(({ getMyPermissions }) => getMyPermissions(business.id))
      .then(setOverrides)
      .catch(() => { /* permissions stay at role defaults */ });
  }, [user?.id, business?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vérification offline via IPC quand pas de connexion
  useEffect(() => {
    if (isOnline || !business?.id || !window.electronAPI?.invoke) return;
    window.electronAPI.invoke('subscription:check', business.id)
      .then((res: unknown) => {
        const r = res as { success: boolean; data?: { allowed: boolean; status: string; reason?: string } };
        if (r.success && r.data) setOfflineCheck(r.data);
      })
      .catch(() => { /* silencieux */ });
  }, [isOnline, business?.id]);

  useEffect(() => {
    if (isLoading || !subLoaded) return;
    if (!user) { router.replace('/login'); return; }

    // Le superadmin n'a pas accès au dashboard POS
    if (isSuperAdmin) { router.replace('/backoffice'); return; }

    let status: string;

    if (!isOnline && offlineCheck) {
      // Mode offline : utiliser la vérification sécurisée depuis le processus principal
      if (!offlineCheck.allowed) {
        router.replace('/billing');
        return;
      }
      status = offlineCheck.status;
    } else {
      // Mode online : utiliser le store normal
      status = effectiveStatus();
    }

    const needsBilling = (status === 'expired' || status === 'none') && pathname !== '/billing';
    if (needsBilling) {
      router.replace('/billing');
      return;
    }

    // Protection des routes par permission
    const currentNavItem = NAV_ITEMS.find((item) => pathname.startsWith(item.href));
    if (currentNavItem?.permission) {
      const { overrides } = usePermissionsStore.getState();
      const hasAccess = checkPermission(user.role, currentNavItem.permission, overrides);
      if (!hasAccess) {
        // Rediriger vers la page par défaut de l'établissement (probablement /pos ou /hotel)
        router.replace('/pos');
      }
    }
  }, [user, isLoading, isSuperAdmin, subLoaded, pathname, effectiveStatus, router, isOnline, offlineCheck]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <MobileLayout>
      {children}
    </MobileLayout>
  );
}
