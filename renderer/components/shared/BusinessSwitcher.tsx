'use client';
import { toUserError } from '@/lib/user-error';
import { cn } from '@/lib/utils';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Check, Plus, Building2, Loader2 } from 'lucide-react';

// Affiche le logo d'un établissement — fallback initiale → icône si URL cassée.
// object-cover remplit le carré quel que soit le ratio.
// Fond blanc quand logo présent pour éviter le brand-600 derrière les PNG transparents.
function BusinessLogo({ name, logoUrl, size = 8 }: { name: string; logoUrl: string | null; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const showImg = !!logoUrl && !imgError;
  const letter  = name?.charAt(0)?.toUpperCase() || null;

  return (
    <div className={`w-${size} h-${size} rounded-lg flex items-center justify-center shrink-0 overflow-hidden shadow-sm
      ${showImg ? 'bg-white' : 'bg-brand-600'}`}
    >
      {showImg ? (
        <img
          src={logoUrl!}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : letter ? (
        <span className="text-xs font-bold text-content-primary">{letter}</span>
      ) : (
        <Building2 className="w-4 h-4 text-content-primary" />
      )}
    </div>
  );
}
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { useCartStore } from '@/store/cart';
import { switchBusiness, getMyBusinesses } from '@services/supabase/business';
import { getSubscription } from '@services/supabase/subscriptions';
import { useSubscriptionStore } from '@/store/subscription';
import { useCashSessionStore } from '@/store/cashSession';
import { getCurrentSession } from '@services/supabase/cash-sessions';
import { supabase } from '@/lib/supabase';
import { CreateBusinessModal } from './CreateBusinessModal';
import { hasRole, getRoleLabel } from '@/lib/permissions';
import { getDefaultRoute } from '@/lib/getDefaultRoute';
import type { Business, UserRole } from '@pos-types';
import type { BusinessMembership } from '@services/supabase/business';

export function BusinessSwitcher({ 
  collapsed = false,
  isHovering = false 
}: { 
  collapsed?: boolean;
  isHovering?: boolean;
}) {
  const { user, business, businesses, setBusiness, setBusinesses, setUser } = useAuthStore();
  const { setSubscription, subscription, plans } = useSubscriptionStore();
  const { setSession: setCashSession, setLoaded: setCashLoaded } = useCashSessionStore();
  const { success, error: notifError } = useNotificationStore();
  const clear = useCartStore((s) => s.clear);
  const router = useRouter();

  const [open, setOpen]             = useState(false);
  const [switching, setSwitching]   = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const expanded = !collapsed || isHovering;

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  // Fallback : si la migration 017 n'est pas encore appliquée,
  // on affiche au moins l'établissement actif depuis le store.
  const displayList: BusinessMembership[] = businesses.length > 0
    ? businesses
    : business
      ? [{ business, role: (user?.role ?? 'staff') as UserRole }]
      : [];

  const isOwner = hasRole(user?.role, 'owner');

  // Le plan Pro autorise les multi-établissements (feature contenant "multi")
  const currentPlan   = plans.find(p => p.id === subscription?.plan_id);
  const canMultiBiz   = currentPlan?.features?.some(f => /multi/i.test(f)) ?? false;
  const canCreateBiz  = isOwner && (canMultiBiz || businesses.length === 0);

  async function handleSwitch(businessId: string) {
    if (businessId === business?.id) { setOpen(false); return; }
    if (!user) return;
    setSwitching(businessId);
    try {
      await switchBusiness(businessId);

      const { data: profile } = await supabase
        .from('users').select('*').eq('id', user.id).single();
      if (profile) setUser(profile as never);

      const { data: biz } = await supabase
        .from('businesses').select('*').eq('id', businessId).single();
      if (biz) setBusiness(biz as never);

      // Recharger l'abonnement (owner_id en priorité, fallback par business_id pour les non-owners)
      try {
        const sub = await getSubscription(user!.id, businessId);
        setSubscription(sub);
      } catch { /* non critique */ }

      // Recharger la session de caisse pour le nouvel établissement
      try {
        const cashSession = await getCurrentSession(businessId);
        setCashSession(cashSession);
      } catch { setCashSession(null); }
      setCashLoaded(true);

      clear();
      setOpen(false);
      success(`Basculé vers ${biz?.name ?? '…'}`);
      router.replace(getDefaultRoute(profile?.role as any, biz as any));
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSwitching(null);
    }
  }

  async function handleCreated(newBiz: Business) {
    if (!user) return;
    setShowCreate(false);
    setBusiness(newBiz);

    let profile: { role?: string } | null = null;
    try {
      const { data } = await supabase
        .from('users').select('*').eq('id', user.id).single();
      profile = data;
      if (profile) setUser(profile as never);
    } catch { /* non critique, on continue avec le rôle actuel */ }

    try {
      const memberships = await getMyBusinesses();
      setBusinesses(memberships);
    } catch { /* migration pas encore appliquée */ }

    try {
      const sub = await getSubscription(user.id, newBiz.id);
      setSubscription(sub);
      if (sub?.status === 'trial') {
        success(`"${newBiz.name}" créé — essai gratuit de 7 jours activé !`);
      } else {
        success(`"${newBiz.name}" créé !`);
      }
    } catch {
      success(`"${newBiz.name}" créé !`);
    }

    setCashSession(null);
    setCashLoaded(true);
    clear();
    router.replace(getDefaultRoute((profile?.role ?? user.role) as any, newBiz));
  }

  return (
    <>
      <div ref={ref} className="relative">

        {/* -- Bouton déclencheur -- */}
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "w-full flex items-center gap-3 px-2 py-2 rounded-xl transition-all duration-300 group",
            open ? "bg-surface-hover" : "hover:bg-surface-hover"
          )}
          title={collapsed ? business?.name : undefined}
        >
          {/* Icône établissement - Fixed width to keep it centered when collapsed */}
          <div className="w-10 h-10 flex items-center justify-center shrink-0 transition-all duration-300">
            <BusinessLogo name={business?.name ?? ''} logoUrl={business?.logo_url ?? null} size={8} />
          </div>

          {/* Nom + chevron */}
          <div className={cn(
            "flex flex-1 items-center justify-between min-w-0 transition-all duration-300 ease-in-out",
            expanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4 pointer-events-none w-0 overflow-hidden"
          )}>
            <div className="min-w-0 text-left">
              {business ? (
                <p className="text-sm font-semibold text-content-primary truncate leading-tight">
                  {business.name}
                </p>
              ) : (
                <div className="h-3.5 w-28 rounded bg-surface-hover animate-pulse" />
              )}
              {business?.organization_name && business.organization_name !== business.name && (
                <p className="text-[10px] text-content-brand/70 truncate leading-tight font-medium">
                  {business.organization_name}
                </p>
              )}
              <p className="text-xs text-content-muted truncate leading-tight">
                {getRoleLabel(user?.role)}
              </p>
            </div>
            <ChevronDown className={cn(
              "w-4 h-4 text-content-secondary shrink-0 transition-transform duration-200",
              open ? 'rotate-180' : ''
            )} />
          </div>
        </button>

        {/* -- Dropdown -- */}
        {open && (
          <div className={cn(
            "absolute left-0 top-full mt-1.5 z-50 bg-surface-card border border-surface-border rounded-xl shadow-2xl overflow-hidden w-72",
            expanded ? "lg:w-full" : "md:left-full md:top-0 md:mt-0 md:ml-2"
          )}>

            {/* En-tête */}
            <div className="px-3 py-2 border-b border-surface-border">
              <p className="text-xs font-medium text-content-secondary uppercase tracking-wider">
                Établissements
              </p>
            </div>

            {/* Liste */}
            <div className="py-1 max-h-64 overflow-y-auto">
              {displayList.map(({ business: biz, role }) => {
                const isActive  = biz.id === business?.id;
                const isLoading = switching === biz.id;

                return (
                  <button
                    key={biz.id}
                    onClick={() => handleSwitch(biz.id)}
                    disabled={!!switching}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left
                      ${isActive ? 'bg-badge-brand' : 'hover:bg-surface-hover'}`}
                  >
                    <div className="w-8 h-8 shrink-0">
                      {isLoading
                        ? <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-content-primary" /></div>
                        : <BusinessLogo name={biz.name} logoUrl={biz.logo_url ?? null} size={8} />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate
                        ${isActive ? 'text-content-brand' : 'text-content-primary'}`}>
                        {biz.name}
                      </p>
                      {biz.organization_name && biz.organization_name !== biz.name && (
                        <p className="text-[10px] text-content-brand/60 truncate font-medium">
                          {biz.organization_name}
                        </p>
                      )}
                      <span className="text-[10px] font-bold text-content-muted uppercase tracking-tight">
                        {getRoleLabel(role as UserRole)}
                      </span>
                    </div>

                    {isActive && !isLoading && (
                      <Check className="w-4 h-4 text-content-brand shrink-0" />
                    )}
                  </button>
                );
              })}

              {displayList.length === 0 && (
                <p className="px-3 py-3 text-xs text-content-muted text-center">
                  Aucun établissement
                </p>
              )}
            </div>

            {/* Créer un établissement — Pro uniquement si déjà 1 établissement */}
            {canCreateBiz && (
              <div className="border-t border-surface-border py-1">
                <button
                  onClick={() => { setOpen(false); setShowCreate(true); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5
                             text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg border border-dashed border-slate-600
                                  flex items-center justify-center shrink-0">
                    <Plus className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-medium">Nouvel établissement</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateBusinessModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}
