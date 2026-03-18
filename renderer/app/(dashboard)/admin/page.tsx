'use client';

import { useState } from 'react';
import {
  Loader2, Save, UserPlus, Shield, UserX, ChevronDown,
  Users, User, Building2, Check,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useTeam } from '@/hooks/useTeam';
import { InviteModal } from '@/components/admin/InviteModal';
import { updateUserRole, removeUserFromBusiness, updateOwnProfile } from '@services/supabase/users';
import { uploadProductImage } from '@services/supabase/storage';
import { supabase } from '@/lib/supabase';
import type { User as UserType, UserRole } from '@pos-types';

const ROLE_LABELS: Record<UserRole, { label: string; color: string }> = {
  owner: { label: 'Propriétaire', color: 'text-yellow-400 bg-yellow-900/20 border-yellow-800' },
  admin: { label: 'Administrateur', color: 'text-brand-400 bg-brand-900/20 border-brand-800' },
  staff: { label: 'Caissier',       color: 'text-slate-300 bg-slate-800 border-slate-700' },
};

type Tab = 'profil' | 'equipe' | 'etablissements';

export default function AdminPage() {
  const { user, business, businesses, setUser } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const { members, loading: loadingTeam, refetch } = useTeam(business?.id ?? '');
  const [tab, setTab] = useState<Tab>('profil');
  const [showInvite, setShowInvite] = useState(false);

  // ── Profil ───────────────────────────────────────────────────────────────────
  const [profileForm, setProfileForm] = useState({ full_name: user?.full_name ?? '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  async function handleSaveProfile() {
    if (!user) return;
    setSavingProfile(true);
    try {
      const updated = await updateOwnProfile(user.id, { full_name: profileForm.full_name });
      setUser(updated);
      success('Profil mis à jour');
    } catch (err) {
      notifError(String(err));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingAvatar(true);
    try {
      const url = await uploadProductImage(user.id, file);
      const updated = await updateOwnProfile(user.id, { avatar_url: url });
      setUser(updated);
      success('Avatar mis à jour');
    } catch (err) {
      notifError(String(err));
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleChangePassword() {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email);
    if (error) notifError(error.message);
    else success('E-mail de réinitialisation envoyé');
  }

  // ── Équipe ────────────────────────────────────────────────────────────────────
  async function handleRoleChange(member: UserType, newRole: UserRole) {
    if (member.role === 'owner') return;
    try {
      await updateUserRole(member.id, newRole, business?.id);
      success(`Rôle de ${member.full_name} mis à jour`);
      refetch();
    } catch (err) {
      notifError(String(err));
    }
  }

  async function handleRemove(member: UserType) {
    if (!confirm(`Retirer ${member.full_name} de l'équipe ?`)) return;
    try {
      await removeUserFromBusiness(member.id, business?.id);
      success(`${member.full_name} retiré de l'équipe`);
      refetch();
    } catch (err) {
      notifError(String(err));
    }
  }

  const isOwnerOrAdmin = user?.role === 'owner' || user?.role === 'admin';
  const isOwner        = user?.role === 'owner';

  const TABS: { id: Tab; icon: typeof User; label: string }[] = [
    { id: 'profil',         icon: User,      label: 'Mon profil' },
    { id: 'equipe',         icon: Users,     label: 'Équipe' },
    ...(isOwner ? [{ id: 'etablissements' as Tab, icon: Building2, label: 'Établissements' }] : []),
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-surface-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-white">Administration</h1>
            {business && (
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {business.name}
              </p>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-surface-input rounded-xl p-1 w-fit">
          {TABS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${tab === id ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">

        {/* ── Onglet Profil ────────────────────────────────────────────────── */}
        {tab === 'profil' && (
          <div className="max-w-lg space-y-6">
            <div className="card p-5 flex items-center gap-5">
              <div className="relative shrink-0">
                <div className="w-20 h-20 rounded-2xl bg-surface-input border border-surface-border overflow-hidden flex items-center justify-center">
                  {uploadingAvatar ? (
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                  ) : user?.avatar_url ? (
                    <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl font-bold text-brand-400">
                      {user?.full_name?.charAt(0).toUpperCase() ?? '?'}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white truncate">{user?.full_name}</p>
                <p className="text-sm text-slate-400 truncate">{user?.email}</p>
                <div className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium border
                  ${ROLE_LABELS[user?.role ?? 'staff'].color}`}>
                  <Shield className="w-3 h-3" />
                  {ROLE_LABELS[user?.role ?? 'staff'].label}
                </div>
              </div>

              <label className="btn-secondary text-sm cursor-pointer shrink-0">
                {uploadingAvatar ? 'Upload...' : 'Changer'}
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </label>
            </div>

            <div className="card p-5 space-y-4">
              <h2 className="font-semibold text-white">Informations personnelles</h2>
              <div>
                <label className="label">Nom complet</label>
                <input
                  type="text"
                  value={profileForm.full_name}
                  onChange={(e) => setProfileForm({ full_name: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">E-mail</label>
                <input type="email" value={user?.email ?? ''} className="input opacity-50" disabled />
                <p className="text-xs text-slate-500 mt-1">L'e-mail ne peut pas être modifié ici.</p>
              </div>
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="btn-primary flex items-center gap-2"
              >
                {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Enregistrer
              </button>
            </div>

            <div className="card p-5 space-y-3">
              <h2 className="font-semibold text-white">Sécurité</h2>
              <p className="text-sm text-slate-400">
                Un lien de réinitialisation sera envoyé à votre adresse e-mail.
              </p>
              <button onClick={handleChangePassword} className="btn-secondary text-sm">
                Réinitialiser le mot de passe
              </button>
            </div>
          </div>
        )}

        {/* ── Onglet Équipe ─────────────────────────────────────────────────── */}
        {tab === 'equipe' && (
          <div className="max-w-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white font-medium">
                  {members.length} agent{members.length !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-slate-500">{business?.name}</p>
              </div>
              {isOwnerOrAdmin && (
                <button
                  onClick={() => setShowInvite(true)}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  <UserPlus className="w-4 h-4" />
                  Inviter un agent
                </button>
              )}
            </div>

            {loadingTeam ? (
              <div className="text-slate-400 text-center py-12">Chargement…</div>
            ) : (
              <div className="space-y-2">
                {members.map((member) => {
                  const badge = ROLE_LABELS[member.role];
                  const isSelf    = member.id === user?.id;
                  const canManage = isOwnerOrAdmin && !isSelf && member.role !== 'owner';

                  return (
                    <div key={member.id} className="card p-4 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-surface-input border border-surface-border
                                      flex items-center justify-center text-base font-bold text-brand-400 shrink-0 overflow-hidden">
                        {member.avatar_url
                          ? <img src={member.avatar_url} alt="" className="w-full h-full object-cover" />
                          : member.full_name.charAt(0).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="font-medium text-white text-sm truncate">{member.full_name}</p>
                          {isSelf && <span className="text-xs text-slate-500 shrink-0">(vous)</span>}
                        </div>
                        <p className="text-xs text-slate-500 truncate">{member.email}</p>
                      </div>

                      {canManage ? (
                        <div className="relative shrink-0">
                          <select
                            value={member.role}
                            onChange={(e) => handleRoleChange(member, e.target.value as UserRole)}
                            className={`appearance-none pl-2.5 pr-7 py-1 rounded-full text-xs font-medium border cursor-pointer
                              bg-transparent ${badge.color}`}
                          >
                            <option value="staff">Caissier</option>
                            <option value="admin">Administrateur</option>
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 opacity-60" />
                        </div>
                      ) : (
                        <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium border ${badge.color}`}>
                          {badge.label}
                        </span>
                      )}

                      {canManage && (
                        <button
                          onClick={() => handleRemove(member)}
                          className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                          title="Retirer de l'équipe"
                        >
                          <UserX className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Légende rôles */}
            <div className="card p-4 space-y-2 mt-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Rôles</p>
              <div className="space-y-1.5 text-xs text-slate-400">
                <p><span className="text-yellow-400 font-medium">Propriétaire</span> — Accès total, gestion des établissements et de l'équipe</p>
                <p><span className="text-brand-400 font-medium">Administrateur</span> — Produits, commandes, coupons, statistiques</p>
                <p><span className="text-slate-300 font-medium">Caissier</span> — Caisse et historique de ses commandes uniquement</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Onglet Établissements (owner only) ────────────────────────────── */}
        {tab === 'etablissements' && isOwner && (
          <div className="max-w-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white font-medium">
                  {businesses.length} établissement{businesses.length !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-slate-500">Vous êtes propriétaire ou membre</p>
              </div>
            </div>

            <div className="space-y-2">
              {businesses.map(({ business: biz, role }) => {
                const isActive = biz.id === business?.id;
                return (
                  <div
                    key={biz.id}
                    className={`card p-4 flex items-center gap-4
                      ${isActive ? 'border-brand-700 bg-brand-900/10' : ''}`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold shrink-0
                      ${isActive ? 'bg-brand-600 text-white' : 'bg-surface-input text-brand-400'}`}>
                      {biz.name.charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-white text-sm truncate">{biz.name}</p>
                        {isActive && (
                          <span className="shrink-0 flex items-center gap-1 text-xs text-brand-400">
                            <Check className="w-3 h-3" /> Actif
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {biz.currency} · {biz.type}
                        {biz.address ? ` · ${biz.address}` : ''}
                      </p>
                    </div>

                    <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium border
                      ${ROLE_LABELS[role].color}`}>
                      {ROLE_LABELS[role].label}
                    </span>
                  </div>
                );
              })}

              {businesses.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>Aucun établissement trouvé</p>
                  <p className="text-xs mt-1">Utilisez le sélecteur dans la barre latérale pour en créer un.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showInvite && (
        <InviteModal
          businessId={business?.id ?? ''}
          onClose={() => setShowInvite(false)}
          onInvited={() => { setShowInvite(false); refetch(); }}
        />
      )}
    </div>
  );
}
