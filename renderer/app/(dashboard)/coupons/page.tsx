'use client';

import { useState } from 'react';
import { Plus, Tag, Trash2, Pencil } from 'lucide-react';
import { useCoupons } from '@/hooks/useCoupons';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { deleteCoupon } from '../../../services/supabase/coupons';
import { CouponModal } from '@/components/coupons/CouponModal';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { Coupon } from '../../../../types';

export default function CouponsPage() {
  const { business } = useAuthStore();
  const { coupons, loading, refetch } = useCoupons(business?.id ?? '');
  const { success, error: notifError } = useNotificationStore();
  const [editCoupon, setEditCoupon] = useState<Coupon | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function handleDelete(coupon: Coupon) {
    if (!confirm(`Supprimer le coupon "${coupon.code}" ?`)) return;
    try {
      await deleteCoupon(coupon.id);
      success('Coupon supprimé');
      refetch();
    } catch (err) {
      notifError(String(err));
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-6 border-b border-surface-border flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Coupons & Remises</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Nouveau coupon
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="text-slate-400 text-center py-16">Chargement...</div>
        ) : coupons.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Tag className="w-12 h-12 mb-3 opacity-30" />
            <p>Aucun coupon créé</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {coupons.map((coupon) => {
              const expired = coupon.expires_at
                ? new Date(coupon.expires_at) < new Date()
                : false;
              const maxed = coupon.max_uses
                ? coupon.uses_count >= coupon.max_uses
                : false;
              const valid = coupon.is_active && !expired && !maxed;

              return (
                <div
                  key={coupon.id}
                  className={`card p-4 border ${
                    valid
                      ? 'border-surface-border'
                      : 'border-red-900 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-mono font-bold text-brand-400 text-lg">{coupon.code}</p>
                      <p className="text-sm text-white font-semibold">
                        {coupon.type === 'percentage'
                          ? `-${coupon.value}%`
                          : `-${coupon.value} ${business?.currency ?? ''}`}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-lg font-medium ${
                      valid
                        ? 'bg-green-900/30 text-green-400 border border-green-800'
                        : 'bg-red-900/30 text-red-400 border border-red-800'
                    }`}>
                      {valid ? 'Actif' : expired ? 'Expiré' : maxed ? 'Épuisé' : 'Inactif'}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-slate-400">
                    <p>Utilisations : {coupon.uses_count}{coupon.max_uses ? ` / ${coupon.max_uses}` : ''}</p>
                    {coupon.expires_at && (
                      <p>
                        Expire le{' '}
                        {format(new Date(coupon.expires_at), 'd MMM yyyy', { locale: fr })}
                      </p>
                    )}
                    {coupon.min_order_amount && (
                      <p>Commande min : {coupon.min_order_amount}</p>
                    )}
                  </div>

                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => setEditCoupon(coupon)}
                      className="flex-1 btn-secondary flex items-center justify-center gap-1 py-1.5 text-xs"
                    >
                      <Pencil className="w-3 h-3" />
                      Modifier
                    </button>
                    <button
                      onClick={() => handleDelete(coupon)}
                      className="btn-danger px-2 py-1.5"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {(showCreate || editCoupon) && (
        <CouponModal
          coupon={editCoupon}
          businessId={business?.id ?? ''}
          onClose={() => { setShowCreate(false); setEditCoupon(null); }}
          onSaved={() => { setShowCreate(false); setEditCoupon(null); refetch(); }}
        />
      )}
    </div>
  );
}
