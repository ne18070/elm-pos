'use client';

import { useState, useEffect, useCallback } from 'react';
import { Receipt, Search, Loader2, User, CreditCard } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { toUserError } from '@/lib/user-error';
import { displayCurrency } from '@/lib/utils';
import { supabase } from '@services/supabase/client';

interface ScolariteOrder {
  id: string;
  created_at: string;
  status: string;
  total: number;
  notes?: string | null;
  student: { first_name: string; last_name: string } | null;
  items: { id: string; name: string; quantity: number; total: number }[];
  payments: { method: string }[];
}

export default function ScolaritePage() {
  const { business } = useAuthStore();
  const { error: notifError } = useNotificationStore();

  const [orders, setOrders]   = useState<ScolariteOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<'all' | 'pending' | 'paid'>('all');

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      let query = (supabase as any)
        .from('orders')
        .select('id, created_at, status, total, notes, student:edu_students(first_name,last_name), items:order_items(id,name,quantity,total), payments(method)')
        .eq('business_id', business.id)
        .not('student_id', 'is', null)
        .order('created_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setOrders(data || []);
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setLoading(false);
    }
  }, [business?.id, filter, notifError]);

  useEffect(() => { load(); }, [load]);

  const filtered = orders.filter(o => {
    const studentName = o.student
      ? `${o.student.first_name} ${o.student.last_name}`.toLowerCase()
      : '';
    return studentName.includes(search.toLowerCase()) || (o.notes?.toLowerCase() || '').includes(search.toLowerCase());
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-badge-warning border border-yellow-700/40 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-status-warning" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-content-primary">Suivi Scolarité</h1>
              <p className="text-xs text-content-secondary">Paiements des frais et inscriptions</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un élève..."
                className="input pl-10 w-64"
              />
            </div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="input w-40"
            >
              <option value="all">Tous les statuts</option>
              <option value="paid">Payés</option>
              <option value="pending">En attente</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-content-secondary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((o) => (
                <div key={o.id} className="card p-5 bg-surface-card border-surface-border hover:border-brand-500/30 transition-all group">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center">
                        <User className="w-5 h-5 text-content-secondary" />
                      </div>
                      <div>
                        <p className="font-bold text-content-primary group-hover:text-brand-300 transition-colors">
                          {o.student ? `${o.student.first_name} ${o.student.last_name}` : 'Élève inconnu'}
                        </p>
                        <p className="text-xs text-content-muted">
                          {new Date(o.created_at).toLocaleDateString()} • Ref: {o.id.slice(0, 8)}
                        </p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      o.status === 'paid' ? 'bg-badge-success text-status-success' : 'bg-badge-warning text-status-warning'
                    }`}>
                      {o.status === 'paid' ? 'Payé' : 'En attente'}
                    </span>
                  </div>

                  <div className="space-y-2 mb-4">
                    {o.items.map(item => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span className="text-content-secondary">{item.name} x{item.quantity}</span>
                        <span className="text-content-primary font-medium">{item.total.toLocaleString()} {displayCurrency(business?.currency || 'XOF')}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-surface-border flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-content-muted">
                      <CreditCard className="w-3 h-3" />
                      <span>{o.payments.length > 0 ? o.payments[0].method : 'Non réglé'}</span>
                    </div>
                    <p className="text-lg font-bold text-content-primary">
                      {o.total.toLocaleString()} {displayCurrency(business?.currency || 'XOF')}
                    </p>
                  </div>
                </div>
            ))}

            {filtered.length === 0 && (
              <div className="col-span-full py-20 text-center space-y-3">
                <Receipt className="w-12 h-12 text-content-muted mx-auto" />
                <p className="text-content-muted">Aucun paiement trouvé.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
