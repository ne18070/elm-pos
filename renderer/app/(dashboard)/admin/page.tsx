'use client';
import { toUserError } from '@/lib/user-error';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, Save, UserPlus, Shield, UserX, ChevronDown,
  Users, User, Building2, Check, Lock, Ban, RefreshCw, Copy,
  CreditCard, Clock, CheckCircle, XCircle, Zap, ExternalLink,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { displayCurrency } from '@/lib/utils';
import { useNotificationStore } from '@/store/notifications';
import { useTeam } from '@/hooks/useTeam';
import { InviteModal } from '@/components/admin/InviteModal';
import { updateUserRole, removeUserFromBusiness, updateOwnProfile, toggleUserBlock, adminResetUserPassword } from '@services/supabase/users';
import { useSubscriptionStore } from '@/store/subscription';
import { getEffectiveStatus, getTrialDaysRemaining } from '@services/supabase/subscriptions';
import { uploadProductImage } from '@services/supabase/storage';
import { getMyBusinesses, type BusinessMembership } from '@services/supabase/business';
import { getBusinessTypes, type BusinessTypeRow } from '@services/supabase/business-config';
import { supabase } from '@/lib/supabase';
import type { User as UserType, UserRole } from '@pos-types';
import { canManageTeam, hasRole } from '@/lib/permissions';
import { PermissionsPanel } from '@/components/admin/PermissionsPanel';

const ROLE_LABELS: Record<UserRole, { label: string; color: string }> = {
  owner:   { label: 'Propriétaire',   color: 'text-status-orange bg-badge-orange border-status-orange/40' },
  admin:   { label: 'Administrateur', color: 'text-content-brand bg-badge-brand border-status-brand/40' },
  manager: { label: 'Manager',        color: 'text-status-teal bg-badge-teal border-status-teal/40' },
  staff:   { label: 'Caissier',       color: 'text-content-secondary bg-surface-card border-surface-border' },
};

const ROLE_LEGENDS: Record<string, Record<UserRole, string>> = {
  restaurant: {
    owner:   "Accès total : gestion de l'abonnement, suppression et réglages critiques.",
    admin:   "Gestion complète : menu, stocks, personnel, remises et statistiques financières.",
    manager: "Responsable de salle/cuisine : gestion des tables, stocks et clôture de caisse.",
    staff:   "Serveur / Caissier : prise de commande, encaissement et livraisons.",
  },
  retail: {
    owner:   "Accès total : gestion de l'abonnement, suppression et réglages critiques.",
    admin:   "Gestion complète : catalogue produits, prix, fournisseurs et statistiques.",
    manager: "Responsable magasin : approvisionnements, inventaires et clôture de caisse.",
    staff:   "Vendeur / Caissier : ventes, recherche produits et historique client.",
  },
  hotel: {
    owner:   "Accès total : gestion de l'abonnement, suppression et réglages critiques.",
    admin:   "Gestion complète : configuration des chambres, tarifs, équipe et rapports.",
    manager: "Réceptionniste principal : réservations, check-in/out, facturation et maintenance.",
    staff:   "Employé réception / Étage : vue des chambres, réservations simples et services.",
  },
  juridique: {
    owner:   "Accès total : gestion de l'abonnement, suppression et réglages critiques.",
    admin:   "Associé / Administrateur : gestion des dossiers, honoraires, équipe et comptabilité.",
    manager: "Clerc de notaire / Juriste : suivi des procédures, processus et pièces jointes.",
    staff:   "Secrétaire : consultation des dossiers, saisie simple et accueil.",
  },
};

type Tab = 'profil' | 'equipe' | 'permissions' | 'etablissements' | 'facturation';

// --- Aide Rôles Dynamique --------------------------------------------------

function RoleLegend({ businessType, allTypes }: { businessType?: string; allTypes: BusinessTypeRow[] }) {
  const type = businessType || 'retail';
  const legend = ROLE_LEGENDS[type] || ROLE_LEGENDS.retail;
  const typeLabel = allTypes.find(t => t.id === type)?.label || (type.charAt(0).toUpperCase() + type.slice(1));

  return (
    <div className="card p-5 space-y-4 mt-6 bg-brand-500/5 border-brand-500/20">
      <div className="flex items-center gap-2 text-content-brand">
        <Shield className="w-4 h-4" />
        <p className="text-xs font-black uppercase tracking-[0.2em]">Guide des rôles —{typeLabel}</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(Object.entries(legend) as [UserRole, string][]).map(([role, text]) => {
          const { label, color } = ROLE_LABELS[role];
          const customLabel = getCustomRoleLabel(role, type);
          return (
            <div key={role} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${color}`}>
                  {customLabel}
                </span>
              </div>
              <p className="text-[11px] text-content-secondary leading-relaxed italic">{text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getCustomRoleLabel(role: UserRole, type: string): string {
  if (type === 'juridique') {
    if (role === 'manager') return 'Clerc / Juriste';
    if (role === 'staff') return 'Secrétaire';
  }
  if (type === 'restaurant') {
    if (role === 'manager') return 'Maître d\'hôtel';
    if (role === 'staff') return 'Serveur';
  }
  if (type === 'hotel') {
    if (role === 'manager') return 'Gouvernant';
    if (role === 'staff') return 'Réceptionniste';
  }
  return ROLE_LABELS[role].label;
}

export default function AdminPage() {
  const router = useRouter();
  const { user, business, businesses, setUser, setBusinesses } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const { members, loading: loadingTeam, refetch } = useTeam(business?.id ?? '');
  const [tab, setTab] = useState<Tab>('profil');
  const [showInvite, setShowInvite] = useState(false);

  // Types d'établissement dynamiques pour la légende
  const [allTypes, setAllTypes] = useState<BusinessTypeRow[]>([]);
  useEffect(() => {
    getBusinessTypes().then(setAllTypes).catch(() => {});
  }, []);

  // Liste locale avec fallback : store OU business actif
  const [bizList, setBizList] = useState<BusinessMembership[]>(() =>
    businesses.length > 0
      ? businesses
      : business ? [{ business, role: user?.role ?? 'staff' } as BusinessMembership] : []
  );

  // Rafraîchir quand l'onglet établissements s'ouvre
  useEffect(() => {
    if (tab !== 'etablissements') return;
    getMyBusinesses()
      .then((list) => {
        setBusinesses(list);
        setBizList(list.length > 0
          ? list
          : business ? [{ business, role: user?.role ?? 'staff' } as BusinessMembership] : []
        );
      })
      .catch(() => {
        // RPC indisponible —garder le fallback
        if (bizList.length === 0 && business) {
          setBizList([{ business, role: user?.role ?? 'staff' } as BusinessMembership]);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // -- Profil -------------------------------------------------------------------
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
      notifError(toUserError(err));
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
      notifError(toUserError(err));
    } finally {
      setUploadingAvatar(false);
    }
  }

  const [pwForm,    setPwForm]    = useState({ newPw: '', confirmPw: '' });
  const [savingPw,  setSavingPw]  = useState(false);

  async function handleChangePassword() {
    if (!pwForm.newPw || pwForm.newPw.length < 6) {
      notifError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (pwForm.newPw !== pwForm.confirmPw) {
      notifError('Les mots de passe ne correspondent pas.');
      return;
    }
    setSavingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwForm.newPw });
      if (error) throw error;
      setPwForm({ newPw: '', confirmPw: '' });
      success('Mot de passe mis à jour');
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSavingPw(false);
    }
  }

  // -- Blocage + reset MDP -------------------------------------------------------
  const [blockingId, setBlockingId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<UserType | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [resetCopied, setResetCopied] = useState(false);
  const [savingReset, setSavingReset] = useState(false);

  function openReset(member: UserType) {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
    const pw = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    setResetPw(pw);
    setResetCopied(false);
    setResetTarget(member);
  }

  async function handleCopyReset() {
    await navigator.clipboard.writeText(resetPw);
    setResetCopied(true);
    setTimeout(() => setResetCopied(false), 2000);
  }

  async function handleConfirmReset() {
    if (!resetTarget || !resetPw || !business) return;
    setSavingReset(true);
    try {
      await adminResetUserPassword(business.id, resetTarget.id, resetPw);
      success(`Mot de passe de ${resetTarget.full_name} réinitialisé`);
      setResetTarget(null);
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSavingReset(false);
    }
  }

  async function handleToggleBlock(member: UserType) {
    if (!business) return;
    const action = member.is_blocked ? 'débloquer' : 'bloquer';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${member.full_name} ?`)) return;
    setBlockingId(member.id);
    try {
      await toggleUserBlock(business.id, member.id, !member.is_blocked);
      success(`${member.full_name} ${member.is_blocked ? 'débloqué' : 'bloqué'}`);
      refetch();
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setBlockingId(null);
    }
  }

  // -- Équipe --------------------------------------------------------------------
  async function handleRoleChange(member: UserType, newRole: UserRole) {
    if (member.role === 'owner') return;
    try {
      await updateUserRole(member.id, newRole, business?.id);
      success(`Rôle de ${member.full_name} mis à jour`);
      refetch();
    } catch (err) {
      notifError(toUserError(err));
    }
  }

  async function handleRemove(member: UserType) {
    if (!confirm(`Retirer ${member.full_name} de l'équipe ?`)) return;
    try {
      await removeUserFromBusiness(member.id, business?.id);
      success(`${member.full_name} retiré de l'équipe`);
      refetch();
    } catch (err) {
      notifError(toUserError(err));
    }
  }

  const { subscription, plans } = useSubscriptionStore();
  const subStatus  = getEffectiveStatus(subscription);
  const trialDays  = getTrialDaysRemaining(subscription);
  const activePlan = plans.find((p) => p.id === subscription?.plan_id);

  const isOwnerOrAdmin = canManageTeam(user?.role);
  const isOwner        = hasRole(user?.role, 'owner');

  const TABS: { id: Tab; icon: typeof User; label: string; navigate?: string }[] = [
    { id: 'profil',         icon: User,       label: 'Mon profil' },
    { id: 'equipe',         icon: Users,      label: 'Équipe' },
    ...(canManageTeam(user?.role) ? [{ id: 'permissions' as Tab, icon: Shield, label: 'Permissions' }] : []),
    ...(isOwner ? [{ id: 'etablissements' as Tab, icon: Building2,  label: 'Établissements' }] : []),
    ...(isOwner ? [{ id: 'facturation'    as Tab, icon: CreditCard, label: 'Facturation', navigate: '/billing' }] : []),
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-surface-border md:px-6 md:pt-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-bold text-content-primary md:text-xl">Administration</h1>
            {business && (
              <p className="text-xs text-content-muted mt-0.5 flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {business.name}
              </p>
            )}
          </div>
        </div>

        {/* Tabs — scrollable on mobile */}
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex gap-1 bg-surface-input rounded-xl p-1 w-fit">
            {TABS.map(({ id, icon: Icon, label, navigate }) => (
              <button
                key={id}
                onClick={() => navigate ? router.push(navigate) : setTab(id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap shrink-0
                  ${tab === id ? 'bg-brand-600 text-white' : 'text-content-secondary hover:text-content-primary'}`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
                {navigate && <ExternalLink className="w-3 h-3 opacity-50" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">

        {/* -- Onglet Profil -------------------------------------------------- */}
        {tab === 'profil' && (
          <div className="max-w-lg space-y-6">
            <div className="card p-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="w-16 h-16 rounded-2xl bg-surface-input border border-surface-border overflow-hidden flex items-center justify-center shrink-0 sm:w-20 sm:h-20">
                  {uploadingAvatar ? (
                    <Loader2 className="w-6 h-6 animate-spin text-content-secondary" />
                  ) : user?.avatar_url ? (
                    <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl font-bold text-content-brand">
                      {user?.full_name?.charAt(0).toUpperCase() ?? '?'}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-content-primary truncate">{user?.full_name}</p>
                  <p className="text-sm text-content-secondary truncate">{user?.email}</p>
                  <div className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium border
                    ${ROLE_LABELS[user?.role ?? 'staff'].color}`}>
                    <Shield className="w-3 h-3" />
                    {ROLE_LABELS[user?.role ?? 'staff'].label}
                  </div>
                </div>
              </div>
              <label className="btn-secondary text-sm cursor-pointer self-start sm:self-auto shrink-0">
                {uploadingAvatar ? 'Upload...' : 'Changer'}
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </label>
            </div>

            <div className="card p-5 space-y-4">
              <h2 className="font-semibold text-content-primary">Informations personnelles</h2>
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
                <p className="text-xs text-content-muted mt-1">L'e-mail ne peut pas être modifié ici.</p>
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

            <div className="card p-5 space-y-4">
              <h2 className="font-semibold text-content-primary">Changer le mot de passe</h2>
              <div>
                <label className="label">Nouveau mot de passe</label>
                <input
                  type="password"
                  value={pwForm.newPw}
                  onChange={(e) => setPwForm((f) => ({ ...f, newPw: e.target.value }))}
                  className="input"
                  placeholder="Min. 6 caractères"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="label">Confirmer le mot de passe</label>
                <input
                  type="password"
                  value={pwForm.confirmPw}
                  onChange={(e) => setPwForm((f) => ({ ...f, confirmPw: e.target.value }))}
                  className="input"
                  placeholder="Répéter le mot de passe"
                  autoComplete="new-password"
                />
              </div>
              <button
                onClick={handleChangePassword}
                disabled={savingPw || !pwForm.newPw}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                {savingPw ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Mettre à jour le mot de passe
              </button>
            </div>

            {/* -- Abonnement --------------------------------------------------- */}
            <div className={`card p-5 space-y-3 border-l-4
              ${subStatus === 'active'  ? 'border-l-status-success'
              : subStatus === 'trial'   ? 'border-l-status-warning'
              : subStatus === 'expired' ? 'border-l-status-error'
              : 'border-l-surface-border'}`}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-content-primary flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-content-secondary" />
                  Abonnement
                </h2>
                <button
                  onClick={() => router.push('/billing')}
                  className="flex items-center gap-1.5 text-xs text-content-brand hover:text-content-brand transition-colors"
                >
                  {subStatus === 'active'
                    ? <><ExternalLink className="w-3 h-3" /> Gérer</>
                    : <><Zap className="w-3 h-3" /> S'abonner</>}
                </button>
              </div>

              <div className="flex items-center gap-3">
                {subStatus === 'active'  && <CheckCircle className="w-5 h-5 text-status-success shrink-0" />}
                {subStatus === 'trial'   && <Clock       className="w-5 h-5 text-status-warning shrink-0" />}
                {(subStatus === 'expired' || subStatus === 'none') && <XCircle className="w-5 h-5 text-status-error shrink-0" />}

                <div>
                  {subStatus === 'active' && (
                    <>
                      <p className="text-sm font-medium text-status-success">
                        Actif {activePlan ? `—${activePlan.label}` : ''}
                      </p>
                      {subscription?.expires_at && (
                        <p className="text-xs text-content-muted">
                          Valide jusqu'au {new Date(subscription.expires_at).toLocaleDateString('fr-FR')}
                        </p>
                      )}
                    </>
                  )}
                  {subStatus === 'trial' && (
                    <>
                      <p className="text-sm font-medium text-status-warning">Période d'essai gratuite</p>
                      <p className="text-xs text-content-muted">
                        {trialDays === 0 ? 'Expire aujourd\'hui' : `${trialDays} jour${trialDays > 1 ? 's' : ''} restant${trialDays > 1 ? 's' : ''}`}
                      </p>
                    </>
                  )}
                  {subStatus === 'expired' && (
                    <p className="text-sm font-medium text-status-error">Accès expiré</p>
                  )}
                  {subStatus === 'none' && (
                    <p className="text-sm font-medium text-content-secondary">—</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* -- Onglet Équipe --------------------------------------------------- */}
        {tab === 'equipe' && (
          <div className="max-w-2xl space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-content-primary font-medium">
                  {members.length} agent{members.length !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-content-muted">{business?.name}</p>
              </div>
              {isOwnerOrAdmin && (
                <button
                  onClick={() => setShowInvite(true)}
                  className="btn-primary flex items-center gap-2 text-sm shrink-0"
                >
                  <UserPlus className="w-4 h-4" />
                  Inviter
                </button>
              )}
            </div>

            {/* Role Counts */}
            {!loadingTeam && (
              <div className="flex flex-wrap gap-2">
                {(['owner', 'admin', 'manager', 'staff'] as UserRole[]).map((role) => {
                  const count = members.filter((m) => m.role === role).length;
                  if (count === 0 && role !== 'staff') return null;
                  const label = ROLE_LABELS[role];
                  const customLabel = getCustomRoleLabel(role, business?.type || 'retail');
                  return (
                    <div
                      key={role}
                      className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold uppercase tracking-wider flex items-center gap-2 ${label.color}`}
                    >
                      <span>{customLabel}s</span>
                      <span className="bg-black/20 px-1.5 py-0.5 rounded-lg min-w-[20px] text-center">{count}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {loadingTeam ? (
              <div className="text-content-secondary text-center py-12">Chargement…</div>
            ) : (
              <div className="space-y-2">
                {members.map((member) => {
                  const badge = ROLE_LABELS[member.role] || ROLE_LABELS.staff;
                  const isSelf    = member.id === user?.id;
                  const canManage = isOwnerOrAdmin && !isSelf && member.role !== 'owner';
                  const canOwnerAct = isOwner && !isSelf && member.role !== 'owner';
                  const customLabel = getCustomRoleLabel(member.role, business?.type || 'retail');

                  return (
                    <div key={member.id} className="card p-4 space-y-3">
                      {/* Row 1: avatar + info + badge/select */}
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-surface-input border border-surface-border
                                        flex items-center justify-center text-base font-bold text-content-brand shrink-0 overflow-hidden">
                          {member.avatar_url
                            ? <img src={member.avatar_url} alt="" className="w-full h-full object-cover" />
                            : member.full_name.charAt(0).toUpperCase()}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`font-medium text-sm truncate ${member.is_blocked ? 'text-content-muted line-through' : 'text-content-primary'}`}>
                              {member.full_name}
                            </p>
                            {isSelf && <span className="text-xs text-content-muted shrink-0">(vous)</span>}
                            {member.is_blocked && (
                              <span className="shrink-0 text-xs text-status-error bg-badge-error border border-status-error px-1.5 py-0.5 rounded-full">
                                Bloqué
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-content-muted truncate">{member.email}</p>
                        </div>

                        {canManage ? (
                          <div className="relative shrink-0">
                            <select
                              value={member.role}
                              onChange={(e) => handleRoleChange(member, e.target.value as UserRole)}
                              className={`appearance-none pl-2.5 pr-7 py-1 rounded-full text-xs font-medium border cursor-pointer ${badge.color}`}
                              style={{ background: 'rgb(var(--surface-card))', color: 'rgb(var(--text-base))' }}
                            >
                              <option value="staff">{getCustomRoleLabel('staff', business?.type || 'retail')}</option>
                              <option value="manager">{getCustomRoleLabel('manager', business?.type || 'retail')}</option>
                              <option value="admin">Administrateur</option>
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 opacity-60" />
                          </div>
                        ) : (
                          <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium border ${badge.color}`}>
                            {customLabel}
                          </span>
                        )}
                      </div>

                      {/* Row 2: action buttons (only when there are actions) */}
                      {(canOwnerAct || canManage) && (
                        <div className="flex items-center justify-end gap-1 pt-2 border-t border-surface-border">
                          {canOwnerAct && (
                            <button
                              onClick={() => openReset(member)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-content-muted hover:text-content-brand hover:bg-badge-brand transition-colors"
                            >
                              <Lock className="w-3.5 h-3.5" /> MDP
                            </button>
                          )}
                          {canOwnerAct && (
                            <button
                              onClick={() => handleToggleBlock(member)}
                              disabled={blockingId === member.id}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors
                                ${member.is_blocked
                                  ? 'text-status-error bg-badge-error'
                                  : 'text-content-muted hover:text-status-error hover:bg-badge-error'}`}
                            >
                              {blockingId === member.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Ban className="w-3.5 h-3.5" />}
                              {member.is_blocked ? 'Débloquer' : 'Bloquer'}
                            </button>
                          )}
                          {canManage && (
                            <button
                              onClick={() => handleRemove(member)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-content-muted hover:text-status-error hover:bg-badge-error transition-colors"
                            >
                              <UserX className="w-3.5 h-3.5" /> Retirer
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Légende Rôles */}
            {(() => {
              const businessType = business?.types?.[0] || business?.type || 'retail';
              return <RoleLegend businessType={businessType} allTypes={allTypes} />;
            })()}
          </div>
        )}

        {/* -- Onglet Permissions (admin only) ------------------------------ */}
        {tab === 'permissions' && business && (
          <div className="max-w-4xl">
            <PermissionsPanel
              businessId={business.id}
              members={members.map(m => ({
                user_id: m.id,
                user_name: m.full_name,
                role: m.role
              }))}
            />
          </div>
        )}

        {/* -- Onglet Établissements (owner only) ------------------------------ */}
        {tab === 'etablissements' && isOwner && (
          <div className="max-w-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-content-primary font-medium">
                  {bizList.length} établissement{bizList.length !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-content-muted">Vous êtes propriétaire ou membre</p>
              </div>
            </div>

            <div className="space-y-2">
              {bizList.map(({ business: biz, role }) => {
                const isActive = biz.id === business?.id;
                return (
                  <div
                    key={biz.id}
                    className={`card p-4 flex items-center gap-4
                      ${isActive ? 'border-brand-700 bg-badge-brand' : ''}`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold shrink-0
                      ${isActive ? 'bg-brand-600 text-white' : 'bg-surface-input text-content-brand'}`}>
                      {biz.name.charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-content-primary text-sm truncate">{biz.name}</p>
                        {isActive && (
                          <span className="shrink-0 flex items-center gap-1 text-xs text-content-brand">
                            <Check className="w-3 h-3" /> Actif
                          </span>
                        )}
                      </div>
                      {biz.organization_name && biz.organization_name !== biz.name && (
                        <p className="text-[10px] text-content-brand/70 font-medium truncate">
                          {biz.organization_name}
                        </p>
                      )}
                      <p className="text-xs text-content-muted">
                        {displayCurrency(biz.currency ?? 'XOF')} · {biz.type}
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

              {bizList.length === 0 && (
                <div className="text-center py-12 text-content-muted">
                  <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>Aucun établissement trouvé</p>
                  <p className="text-xs mt-1">Utilisez le sélecteur dans la barre latérale pour en créer un.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="card p-6 w-full max-w-sm space-y-4">
            <h2 className="font-semibold text-content-primary">Réinitialiser le mot de passe</h2>
            <p className="text-sm text-content-secondary">
              Nouveau mot de passe pour <span className="text-content-primary font-medium">{resetTarget.full_name}</span>
            </p>
            <div>
              <label className="label">Nouveau mot de passe</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={resetPw}
                  onChange={(e) => setResetPw(e.target.value)}
                  className="input font-mono flex-1"
                />
                <button
                  onClick={() => {
                    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
                    setResetPw(Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''));
                  }}
                  className="btn-secondary px-3"
                  title="Régénérer"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button onClick={handleCopyReset} className="btn-secondary px-3" title="Copier">
                  {resetCopied ? <Check className="w-4 h-4 text-status-success" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setResetTarget(null)} className="btn-secondary px-5">Annuler</button>
              <button
                onClick={handleConfirmReset}
                disabled={savingReset || !resetPw}
                className="btn-primary px-5 flex items-center gap-2"
              >
                {savingReset && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

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

