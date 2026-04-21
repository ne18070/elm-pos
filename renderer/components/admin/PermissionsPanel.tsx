'use client';

import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Loader2, RotateCcw, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import {
  PERMISSIONS, PERMISSION_GROUPS, IMMUTABLE_OWNER_PERMISSIONS,
  type PermissionKey, type PermissionGroup,
} from '@/lib/permissions-map';
import { checkPermission, hasFeature } from '@/lib/permissions';
import type { UserRole } from '@pos-types';

interface Member {
  user_id:   string;
  user_name: string;
  role:      UserRole;
}

interface Props {
  businessId: string;
  members:    Member[];
}

type OverrideMap = Record<string, boolean>;

// Groups order
const GROUP_ORDER: PermissionGroup[] = ['navigation', 'gestion', 'finance', 'admin'];

export function PermissionsPanel({ businessId, members }: Props) {
  const { business } = useAuthStore();
  const [selectedUserId, setSelectedUserId] = useState<string>(members[0]?.user_id ?? '');
  const [overrides, setOverrides]           = useState<OverrideMap>({});
  const [loading, setLoading]               = useState(false);
  const [saving, setSaving]                 = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<PermissionGroup, boolean>>({
    navigation: true, gestion: true, finance: true, admin: true,
  });

  const selectedMember = members.find((m) => m.user_id === selectedUserId);

  const loadOverrides = useCallback(async (userId: string) => {
    if (!userId) return;
    setLoading(true);
    try {
      const { getMemberPermissions } = await import('@services/supabase/permissions');
      const map = await getMemberPermissions(businessId, userId);
      setOverrides(map);
    } catch {
      setOverrides({});
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { loadOverrides(selectedUserId); }, [selectedUserId, loadOverrides]);

  async function handleToggle(permission: PermissionKey, currentEffective: boolean) {
    if (!selectedMember) return;
    const role = selectedMember.role;

    // Cannot override immutable owner permissions
    if (role === 'owner' && (IMMUTABLE_OWNER_PERMISSIONS as readonly string[]).includes(permission)) return;

    const roleDefault = checkPermission(role, permission, {}, business);
    setSaving(permission);

    try {
      const { setMemberPermissionOverride, deleteMemberPermissionOverride } = await import('@services/supabase/permissions');
      const newGranted = !currentEffective;

      if (newGranted === roleDefault) {
        // Remove override — fall back to role default
        await deleteMemberPermissionOverride(businessId, selectedUserId, permission);
        setOverrides((prev) => { const next = { ...prev }; delete next[permission]; return next; });
      } else {
        await setMemberPermissionOverride(businessId, selectedUserId, permission, newGranted);
        setOverrides((prev) => ({ ...prev, [permission]: newGranted }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(null);
    }
  }

  async function handleResetAll() {
    if (!selectedMember) return;
    setLoading(true);
    try {
      const { deleteMemberPermissionOverride } = await import('@services/supabase/permissions');
      await Promise.all(
        Object.keys(overrides).map((p) =>
          deleteMemberPermissionOverride(businessId, selectedUserId, p as PermissionKey)
        )
      );
      setOverrides({});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const permsByGroup = GROUP_ORDER.map((group) => ({
    group,
    label: PERMISSION_GROUPS[group],
    items: (Object.entries(PERMISSIONS) as [PermissionKey, typeof PERMISSIONS[PermissionKey]][])
      .filter(([, meta]) => {
        if (meta.group !== group) return false;
        // Si la permission requiert une feature que l'établissement n'a pas, on la cache
        if (meta.feature && !hasFeature(business, meta.feature)) return false;
        return true;
      }),
  })).filter(g => g.items.length > 0);

  const overrideCount = Object.keys(overrides).length;

  return (
    <div className="space-y-6">
      {/* Member selector */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
            Membre
          </label>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="w-full bg-surface-input border border-surface-border text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            style={{ colorScheme: 'dark' }}
          >
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id} style={{ background: '#111827', color: '#fff' }}>
                {m.user_name} — {m.role}
              </option>
            ))}
          </select>
        </div>

        {overrideCount > 0 && (
          <button
            onClick={handleResetAll}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-amber-400 border border-amber-500/30 rounded-xl hover:bg-amber-500/10 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Réinitialiser ({overrideCount})
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
        </div>
      ) : selectedMember ? (
        <div className="space-y-4">
          {permsByGroup.map(({ group, label, items }) => (
            <div key={group} className="bg-surface-card border border-surface-border rounded-2xl overflow-hidden">
              <button
                onClick={() => setCollapsed((p) => ({ ...p, [group]: !p[group] }))}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-hover/30 transition-colors"
              >
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{label}</span>
                {collapsed[group] ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronUp className="w-4 h-4 text-slate-500" />}
              </button>

              {!collapsed[group] && (
                <div className="divide-y divide-surface-border">
                  {items.map(([key, meta]) => {
                    const isImmutable = selectedMember.role === 'owner' &&
                      (IMMUTABLE_OWNER_PERMISSIONS as readonly string[]).includes(key);
                    const effective   = checkPermission(selectedMember.role, key, overrides, business);
                    const hasOverride = key in overrides;
                    const isSavingThis = saving === key;

                    return (
                      <div
                        key={key}
                        className={cn(
                          'flex items-center justify-between px-4 py-3',
                          isImmutable ? 'opacity-50' : 'hover:bg-surface-hover/20 transition-colors'
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white">{meta.label}</p>
                          {hasOverride && !isImmutable && (
                            <p className="text-xs text-amber-400 mt-0.5">
                              Remplacé (défaut rôle: {checkPermission(selectedMember.role, key, {}, business) ? 'Oui' : 'Non'})
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-3 ml-4 shrink-0">
                          {isSavingThis && <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" />}

                          <button
                            onClick={() => handleToggle(key, effective)}
                            disabled={isImmutable || isSavingThis}
                            className={cn(
                              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
                              effective ? 'bg-brand-600' : 'bg-surface-input border border-surface-border',
                              (isImmutable || isSavingThis) ? 'cursor-not-allowed' : 'cursor-pointer'
                            )}
                            title={isImmutable ? 'Permission non modifiable pour le propriétaire' : undefined}
                          >
                            <span
                              className={cn(
                                'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                                effective ? 'translate-x-6' : 'translate-x-1'
                              )}
                            />
                          </button>

                          <span className={cn(
                            'text-xs font-medium w-8 text-right',
                            effective ? 'text-green-400' : 'text-slate-500'
                          )}>
                            {effective ? 'Oui' : 'Non'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShieldCheck className="w-10 h-10 text-slate-700 mb-4" />
          <p className="text-slate-500 text-sm">Sélectionnez un membre pour voir ses permissions.</p>
        </div>
      )}
    </div>
  );
}
