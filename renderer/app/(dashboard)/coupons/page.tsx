'use client';
import { toUserError } from '@/lib/user-error';

import { useState } from 'react';
import { Plus, Tag, Trash2, Pencil, Search, Percent, DollarSign, Gift } from 'lucide-react';
import { useCoupons } from '@/hooks/useCoupons';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { formatCurrency } from '@/lib/utils';
import { deleteCoupon } from '@services/supabase/coupons';
import { CouponModal } from '@/components/coupons/CouponModal';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { Coupon } from '@pos-types';

function couponStatusInfo(coupon: Coupon): { label: string; cls: string } {
  const expired = coupon.expires_at ? new Date(coupon.expires_at) < new Date() : false;
  const maxed   = coupon.max_uses != null && coupon.uses_count >= coupon.max_uses;
  if (!coupon.is_active) return { label: 'Inactif',  cls: 'bg-surface-card text-content-secondary border-slate-700' };
  if (expired)           return { label: 'Expiré',   cls: 'bg-badge-error text-status-error border-status-error' };
  if (maxed)             return { label: 'Épuisé',   cls: 'bg-badge-orange text-status-orange border-orange-800' };
  return                        { label: 'Actif',    cls: 'bg-badge-success text-status-success border-status-success' };
}

function couponValueLabel(coupon: Coupon, currency: string): string {
  if (coupon.type === 'percentage') return `-${coupon.value}%`;
  if (coupon.type === 'fixed')      return `-${formatCurrency(coupon.value, currency)}`;
  return coupon.free_item_label ?? 'Article offert';
}

function CouponTypeIcon({ type }: { type: Coupon['type'] }) {
  if (type === 'percentage') return <Percent className="w-3.5 h-3.5" />;
  if (type === 'fixed')      return <DollarSign className="w-3.5 h-3.5" />;
  return <Gift className="w-3.5 h-3.5" />;
}

export default function CouponsPage() {
  const { business } = useAuthStore();
  const { coupons, loading, refetch } = useCoupons(business?.id ?? '');
  const { success, error: notifError } = useNotificationStore();
  const [editCoupon, setEditCoupon] = useState<Coupon | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');

  const currency = business?.currency ?? '';

  const filtered = coupons.filter((c) =>
    !search ||
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    (c.free_item_label ?? '').toLowerCase().includes(search.toLowerCase())
  );

  async function handleDelete(coupon: Coupon) {
    if (!confirm(`Supprimer le coupon "${coupon.code}" ?`)) return;
    try {
      await deleteCoupon(coupon.id);
      success('Coupon supprimé');
      refetch();
    } catch (err) {
      notifError(toUserError(err));
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-surface-border space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-content-primary">Coupons & Remises</h1>
            {!loading && (
              <p className="text-xs text-content-primary mt-0.5">
                {filtered.length} coupon{filtered.length !== 1 ? 's' : ''}
                {search && ` · filtrés sur ${coupons.length}`}
              </p>
            )}
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary flex items-center gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Nouveau coupon
          </button>
        </div>

        {/* Recherche */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary" />
          <input
            type="text"
            placeholder="Rechercher par code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10 w-full"
          />
        </div>
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-content-secondary">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-content-secondary gap-3">
            <Tag className="w-12 h-12 opacity-30" />
            <p className="font-medium">{search ? 'Aucun coupon trouvé' : 'Aucun coupon créé'}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-surface-border overflow-hidden m-6">
            <table className="w-full">
              <thead className="sticky top-0 bg-surface-card border-b border-surface-border z-10">
                <tr className="text-left text-xs text-content-secondary uppercase tracking-wide">
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Type / Valeur</th>
                  <th className="px-4 py-3 hidden md:table-cell">Conditions</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Utilisations</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Expiration</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((coupon, i) => {
                  const { label: statusLabel, cls: statusCls } = couponStatusInfo(coupon);

                  return (
                    <tr
                      key={coupon.id}
                      className={`border-b border-surface-border last:border-0 transition-colors group
                        ${i % 2 === 0 ? '' : 'bg-surface-card/30'}`}
                    >
                      {/* Code */}
                      <td className="px-4 py-3 max-w-[160px]">
                        <p className="font-mono font-bold text-content-brand text-sm truncate">{coupon.code}</p>
                      </td>

                      {/* Type + Valeur */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`shrink-0 w-6 h-6 rounded-lg flex items-center justify-center
                            ${coupon.type === 'free_item'
                              ? 'bg-badge-warning text-status-warning'
                              : 'bg-badge-brand text-content-brand'}`}
                          >
                            <CouponTypeIcon type={coupon.type} />
                          </span>
                          <span className="text-sm text-content-primary font-medium truncate">
                            {couponValueLabel(coupon, currency)}
                          </span>
                        </div>
                      </td>

                      {/* Conditions */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="space-y-0.5 text-xs text-content-secondary">
                          {coupon.min_order_amount != null && (
                            <p className="truncate">Min {formatCurrency(coupon.min_order_amount, currency)}</p>
                          )}
                          {coupon.min_quantity != null && (
                            <p className="truncate">Min {coupon.min_quantity} articles</p>
                          )}
                          {!coupon.min_order_amount && !coupon.min_quantity && (
                            <span className="text-content-muted">—</span>
                          )}
                        </div>
                      </td>

                      {/* Utilisations */}
                      <td className="px-4 py-3 hidden sm:table-cell text-sm text-content-secondary whitespace-nowrap">
                        {coupon.uses_count}
                        {coupon.max_uses != null && (
                          <span className="text-content-muted"> / {coupon.max_uses}</span>
                        )}
                      </td>

                      {/* Expiration */}
                      <td className="px-4 py-3 hidden lg:table-cell text-sm text-content-secondary whitespace-nowrap">
                        {coupon.expires_at
                          ? format(new Date(coupon.expires_at), 'd MMM yyyy', { locale: fr })
                          : <span className="text-content-muted">—</span>
                        }
                      </td>

                      {/* Statut */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${statusCls}`}>
                          {statusLabel}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setEditCoupon(coupon)}
                            className="btn-secondary p-1.5"
                            title="Modifier"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(coupon)}
                            className="btn-danger p-1.5"
                            title="Supprimer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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


