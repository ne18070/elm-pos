'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { Loader2 } from 'lucide-react';

export default function BackofficeLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (!(user as { is_superadmin?: boolean }).is_superadmin) {
      router.replace('/pos');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!user || !(user as { is_superadmin?: boolean }).is_superadmin) return null;

  return (
    <div className="min-h-screen bg-surface-bg">
      <div className="border-b border-surface-border px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold text-sm">E</div>
        <span className="font-bold text-white">Elm POS — Back Office</span>
      </div>
      {children}
    </div>
  );
}
