'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Search, Filter, RefreshCw } from 'lucide-react';
import { useOrders } from '@/hooks/useOrders';
import { useAuthStore } from '@/store/auth';
import { formatCurrency } from '@/lib/utils';
import { OrderDetail } from '@/components/orders/OrderDetail';
import type { Order, OrderStatus } from '../../../../types';

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending:   'bg-yellow-500/20 text-yellow-400 border-yellow-700',
  paid:      'bg-green-500/20 text-green-400 border-green-700',
  cancelled: 'bg-red-500/20 text-red-400 border-red-700',
  refunded:  'bg-purple-500/20 text-purple-400 border-purple-700',
};

export default function OrdersPage() {
  const { business } = useAuthStore();
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [search, setSearch] = useState('');

  const { orders, loading, refetch } = useOrders(business?.id ?? '', {
    status: status === 'all' ? undefined : status,
  });

  const filtered = orders.filter(
    (o) =>
      !search ||
      o.id.toLowerCase().includes(search.toLowerCase()) ||
      o.cashier?.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* List */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-surface-border">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-white">Orders</h1>
            <button onClick={refetch} className="btn-secondary flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>

          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search orders..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-10"
              />
            </div>

            <div className="flex items-center gap-1 bg-surface-input rounded-xl p-1">
              {(['all', 'pending', 'paid', 'cancelled'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    status === s
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-slate-400">
              Loading orders...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-slate-400">
              <Filter className="w-8 h-8 mb-2 opacity-40" />
              No orders found
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-surface-card border-b border-surface-border">
                <tr className="text-left text-xs text-slate-400 uppercase tracking-wide">
                  <th className="px-6 py-3">Order</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Cashier</th>
                  <th className="px-6 py-3">Items</th>
                  <th className="px-6 py-3">Total</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className="border-b border-surface-border hover:bg-surface-hover cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 font-mono text-sm text-slate-300">
                      #{order.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {format(new Date(order.created_at), 'MMM d, HH:mm')}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-300">
                      {order.cashier?.full_name ?? '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      {order.items?.length ?? 0} items
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-white">
                      {formatCurrency(order.total, business?.currency)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex px-2 py-1 rounded-lg text-xs font-medium border ${
                          STATUS_COLORS[order.status as OrderStatus]
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedOrder && (
        <OrderDetail
          order={selectedOrder}
          currency={business?.currency ?? 'USD'}
          onClose={() => setSelectedOrder(null)}
          onRefresh={refetch}
        />
      )}
    </div>
  );
}
