'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { getVehicles } from '@services/supabase/contracts';
import type { RentalVehicle } from '@services/supabase/contracts';
import { Car, Loader2, RefreshCcw, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function MobileVehiclesPage() {
  const { business } = useAuthStore();
  const [vehicles, setVehicles] = useState<RentalVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'dispo' | 'tous'>('dispo');

  const fetch = async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      const data = await getVehicles(business.id);
      setVehicles(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, [business?.id]);

  const displayed = tab === 'dispo'
    ? vehicles.filter(v => v.is_available)
    : vehicles;

  const dispoCount = vehicles.filter(v => v.is_available).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-black text-content-primary">Véhicules</h2>
          <p className="text-xs font-bold text-content-muted uppercase tracking-widest">
            {dispoCount}/{vehicles.length} disponible{dispoCount !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={fetch} className="p-2 rounded-xl bg-surface-card border border-surface-border text-content-muted active:rotate-180 transition-transform">
          <RefreshCcw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-2 bg-surface-card rounded-2xl p-1 border border-surface-border">
        {(['dispo', 'tous'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all',
              tab === t ? 'bg-brand-500 text-white shadow-sm' : 'text-content-muted'
            )}
          >
            {t === 'dispo' ? 'Disponibles' : 'Tous'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
        </div>
      ) : displayed.length === 0 ? (
        <div className="py-20 text-center space-y-4 bg-surface-card rounded-3xl border border-dashed border-surface-border">
          <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mx-auto">
            <Car className="w-8 h-8 text-content-muted opacity-20" />
          </div>
          <p className="text-sm font-bold text-content-primary">
            {tab === 'dispo' ? 'Aucun véhicule disponible' : 'Aucun véhicule'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map(v => (
            <div key={v.id} className="bg-surface-card rounded-2xl border border-surface-border shadow-sm p-4 flex items-center gap-4">
              {v.image_url ? (
                <img src={v.image_url} alt="" className="w-16 h-12 object-cover rounded-xl border border-surface-border shrink-0" />
              ) : (
                <div className="w-16 h-12 rounded-xl bg-surface-hover flex items-center justify-center shrink-0">
                  <Car className="w-6 h-6 text-content-muted" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-content-primary truncate">{v.name}{v.brand ? ` — ${v.brand}` : ''}</p>
                <p className="text-[10px] font-bold text-content-muted uppercase tracking-widest">{v.license_plate ?? '—'}</p>
              </div>
              <div className="shrink-0">
                {v.is_available ? (
                  <div className="flex flex-col items-center gap-1">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span className="text-[9px] font-black text-green-500 uppercase">Dispo</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <XCircle className="w-5 h-5 text-red-500" />
                    <span className="text-[9px] font-black text-red-500 uppercase">Loué</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
