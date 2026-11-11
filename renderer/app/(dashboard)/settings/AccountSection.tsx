import Link from 'next/link';
import { UserCog } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { getContextualRoleLabel } from '@/lib/permissions';

/**
 * Résumé du compte. Nom, email et mot de passe se modifient dans « Mon profil »
 * (/admin, onglet par défaut), ouvert à tous depuis la carte en bas du menu.
 */
export function AccountSection() {
  const { user, business } = useAuthStore();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-content-brand text-2xl font-black shrink-0">
          {user?.full_name?.charAt(0).toUpperCase() || '?'}
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-content-primary text-lg leading-tight truncate">{user?.full_name}</h3>
          <p className="text-sm text-content-secondary truncate">{user?.email}</p>
          <p className="text-xs text-content-muted mt-0.5">{getContextualRoleLabel(user?.role, business?.type)}</p>
        </div>
      </div>

      <Link
        href="/admin?tab=profil"
        className="btn-secondary h-11 px-4 inline-flex items-center gap-2 text-content-primary"
      >
        <UserCog className="w-4 h-4" /> Modifier mon profil et mon mot de passe
      </Link>
    </div>
  );
}
