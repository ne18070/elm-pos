import { toUserError } from '@/lib/user-error';
'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Check, Plus, Building2, Loader2 } from 'lucide-react';
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
import type { Business, UserRole } from '@pos-types';
import type { BusinessMembership } from '@services/supabase/business';

export function BusinessSwitcher() {
  const { user, business, businesses, setBusiness, setBusinesses, setUser } = useAuthStore();
  const { setSubscription } = useSubscriptionStore();
  const { setSession: setCashSession, setLoaded: setCashLoaded } = useCashSessionStore();
  const { success, error: notifError } = useNotificationStore();
  const clear = useCartStore((s) => s.clear);
  const router = useRouter();

  const [open, setOpen]             = useState(false);
  const [switching, setSwitching]   = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  async function handleSwitch(businessId: string) {
    if (businessId === business?.id) { setOpen(false); return; }
    setSwitching(businessId);
    try {
      await switchBusiness(businessId);

      const { data: profile } = await supabase
        .from('users').select('*').eq('id', user!.id).single();
      if (profile) setUser(profile as never);

      const { data: biz } = await supabase
        .from('businesses').select('*').eq('id', businessId).single();
      if (biz) setBusiness(biz as never);

      // Recharger l'abonnement pour le nouvel établissement
      try {
        const sub = await getSubscription(businessId);
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
      router.replace('/pos');
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSwitching(null);
    }
  }

  async function handleCreated(newBiz: Business) {
    setShowCreate(false);
    setBusiness(newBiz);

    const { data: profile } = await supabase
      .from('users').select('*').eq('id', user!.id).single();
    if (profile) setUser(profile as never);

    try {
      const memberships = await getMyBusinesses();
      setBusinesses(memberships);
    } catch { /* migration pas encore appliquée */ }

    // Charger l'abonnement du nouvel établissement (créé par le trigger SQL)
    try {
      const sub = await getSubscription(newBiz.id);
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
    router.replace('/pos');
  }

  return (
    <>
      <div ref={ref} className="relative">

        {/* ── Bouton déclencheur ── */}
        <button
          onClick={() => setOpen((o) => !o)}
          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-colors group
            ${open ? 'bg-surface-hover' : 'hover:bg-surface-hover'}`}
        >
          {/* Icône établissement */}
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
            {business?.logo_url
              ? <img src={business.logo_url} alt={business.name} className="w-full h-full object-cover" />
              : <Building2 className="w-4 h-4 text-white" />}
          </div>

          {/* Nom + chevron — expanded seulement */}
          <div className="hidden lg:flex flex-1 items-center justify-between min-w-0">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate leading-tight">
                {business?.name ?? 'Mon établissement'}
              </p>
              <p className="text-xs text-slate-500 truncate leading-tight">
                {getRoleLabel(user?.role)}
              </p>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200
              ${open ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {/* ── Dropdown ── */}
        {open && (
          <div className="absolute left-0 top-full mt-1.5 z-50
                          bg-surface-card border border-surface-border rounded-xl shadow-2xl overflow-hidden
                          w-72 lg:w-full">

            {/* En-tête */}
            <div className="px-3 py-2 border-b border-surface-border">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
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
                      ${isActive ? 'bg-brand-900/30' : 'hover:bg-surface-hover'}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden
                                    text-sm font-bold
                      ${isActive ? 'bg-brand-600 text-white' : 'bg-surface-input text-slate-300'}`}>
                      {isLoading
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : biz.logo_url
                          ? <img src={biz.logo_url} alt={biz.name} className="w-full h-full object-cover" />
                          : biz.name.charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate
                        ${isActive ? 'text-brand-400' : 'text-white'}`}>
                        {biz.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {getRoleLabel(role as UserRole)}
                      </p>
                    </div>

                    {isActive && !isLoading && (
                      <Check className="w-4 h-4 text-brand-400 shrink-0" />
                    )}
                  </button>
                );
              })}

              {displayList.length === 0 && (
                <p className="px-3 py-3 text-xs text-slate-500 text-center">
                  Aucun établissement
                </p>
              )}
            </div>

            {/* Créer un établissement — visible pour tous (pas encore membre = peut créer) */}
            {isOwner && (
              <div className="border-t border-surface-border py-1">
                <button
                  onClick={() => { setOpen(false); setShowCreate(true); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5
                             text-slate-400 hover:text-white hover:bg-surface-hover transition-colors"
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
