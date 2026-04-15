'use client';

import { useEffect, useState } from 'react';
import { Loader2, Layers, Map as MapIcon, ChevronRight } from 'lucide-react';
import { getFloors, getTables } from '@services/supabase/restaurant';
import type { RestaurantFloor, RestaurantTable } from '@pos-types';
import { TableItem } from './TableItem';
import { cn } from '@/lib/utils';

interface FloorPlanProps {
  businessId: string;
  onTableSelect: (table: RestaurantTable) => void;
  selectedTableId?: string;
}

export function FloorPlan({ businessId, onTableSelect, selectedTableId }: FloorPlanProps) {
  const [loading, setLoading] = useState(true);
  const [floors, setFloors]   = useState<RestaurantFloor[]>([]);
  const [tables, setTables]   = useState<RestaurantTable[]>([]);
  const [activeFloorId, setActiveFloorId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const f = await getFloors(businessId);
        setFloors(f);
        if (f.length > 0) {
          setActiveFloorId(f[0].id);
          const t = await getTables(businessId, f[0].id);
          setTables(t);
        }
      } catch (err) {
        console.error('Failed to load floor plan:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [businessId]);

  async function switchFloor(floorId: string) {
    setActiveFloorId(floorId);
    setLoading(true);
    try {
      const t = await getTables(businessId, floorId);
      setTables(t);
    } catch (err) {
      console.error('Failed to load tables:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading && floors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm">Chargement du plan de salle...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950/20 rounded-2xl overflow-hidden border border-surface-border">
      {/* Floor Tabs */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-border bg-surface-card overflow-x-auto no-scrollbar">
        <Layers className="w-4 h-4 text-slate-500 mr-2 shrink-0" />
        {floors.map((f) => (
          <button
            key={f.id}
            onClick={() => switchFloor(f.id)}
            className={cn(
              "px-4 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all",
              activeFloorId === f.id
                ? "bg-brand-600 text-white shadow-lg shadow-brand-900/40"
                : "bg-surface-input text-slate-400 hover:text-white"
            )}
          >
            {f.name}
          </button>
        ))}
      </div>

      {/* Visual Map Area */}
      <div className="flex-1 relative overflow-hidden bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px]">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm z-50">
            <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
          </div>
        ) : tables.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-4">
            <MapIcon className="w-12 h-12 opacity-20" />
            <p className="text-sm font-medium">Aucune table configurée pour cette zone</p>
            <button className="btn-secondary text-xs">Ajouter une table</button>
          </div>
        ) : (
          <div className="absolute inset-0 p-8">
             {tables.map((t) => (
               <TableItem 
                 key={t.id} 
                 table={t} 
                 onSelect={onTableSelect}
                 selected={selectedTableId === t.id}
               />
             ))}
          </div>
        )}
      </div>

      {/* Legend / Stats */}
      <div className="px-4 py-3 bg-surface-card border-t border-surface-border flex items-center justify-between text-[10px] uppercase font-bold tracking-wider">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-surface-border border border-slate-700" />
            <span className="text-slate-500">Libre</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-brand-500 shadow-[0_0_8px_rgba(20,184,166,0.4)]" />
            <span className="text-brand-400">Occupée</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-amber-500">Réservée</span>
          </div>
        </div>
        <div className="text-slate-500">
          {tables.filter(t => t.status === 'occupied').length} / {tables.length} tables occupées
        </div>
      </div>
    </div>
  );
}
