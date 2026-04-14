'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

export default function BackofficeLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, clear } = useAuthStore();
  const { setSubscription, setLoaded } = useSubscriptionStore();
  const router = useRouter();

  const isSuperAdmin = (user as { is_superadmin?: boolean } | null)?.is_superadmin ?? false;

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (!isSuperAdmin) { router.replace('/pos'); }
  }, [user, isLoading, isSuperAdmin, router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    setSubscription(null);
    setLoaded(false);
    clear();
    router.replace('/login');
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!user || !isSuperAdmin) return null;

  return (
    <div className="min-h-screen bg-surface-bg flex flex-col">
      <div className="border-b border-surface-border px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">ELM APP — Back Office</p>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-surface-hover transition-colors text-sm"
        >
          <LogOut className="w-4 h-4" />
          Déconnexion
        </button>
      </div>
      {children}
    </div>
  );
}
