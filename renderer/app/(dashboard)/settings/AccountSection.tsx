import { useAuthStore } from '@/store/auth';

export function AccountSection() {
  const { user } = useAuthStore();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-content-brand text-2xl font-black">
          {user?.full_name?.charAt(0).toUpperCase() || '?'}
        </div>
        <div>
          <h3 className="font-bold text-content-primary text-lg leading-tight">{user?.full_name}</h3>
          <p className="text-sm text-content-secondary">{user?.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        <div className="p-4 bg-surface-input border border-surface-border rounded-xl">
          <label className="text-[10px] font-black uppercase tracking-widest text-content-muted mb-1 block">Rôle actuel</label>
          <p className="text-sm font-bold text-content-primary capitalize">{user?.role}</p>
        </div>
        <div className="p-4 bg-surface-input border border-surface-border rounded-xl">
          <label className="text-[10px] font-black uppercase tracking-widest text-content-muted mb-1 block">Identifiant</label>
          <p className="text-xs font-mono text-content-secondary truncate">{user?.id}</p>
        </div>
      </div>
      
      <p className="text-[11px] text-content-muted leading-relaxed italic">
        Les informations de compte (nom, email, mot de passe) sont gérées au niveau de l&apos;organisation globale. Contactez votre administrateur pour toute modification.
      </p>
    </div>
  );
}
