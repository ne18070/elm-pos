'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Layers, Map as MapIcon, Settings2, Pencil, Check } from 'lucide-react';
import { getFloors, getTables, updateTablePosition } from '@services/supabase/restaurant';
import type { RestaurantFloor, RestaurantTable } from '@pos-types';
import { TableItem } from './TableItem';
import { cn } from '@/lib/utils';

interface FloorPlanProps {
  businessId: string;
  onTableSelect: (table: RestaurantTable) => void;
  selectedTableId?: string;
}

export function FloorPlan({ businessId, onTableSelect, selectedTableId }: FloorPlanProps) {
  const [loading, setLoading]         = useState(true);
  const [floors, setFloors]           = useState<RestaurantFloor[]>([]);
  const [tables, setTables]           = useState<RestaurantTable[]>([]);
  const [activeFloorId, setActiveFloorId] = useState<string | null>(null);
  const [editMode, setEditMode]       = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

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
    setEditMode(false);
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

  async function handleDragEnd(tableId: string, pos_x: number, pos_y: number) {
    // Optimistic update
    setTables(prev => prev.map(t => t.id === tableId ? { ...t, pos_x, pos_y } : t));
    try {
      await updateTablePosition(tableId, { pos_x, pos_y });
    } catch {
      // Rollback on error — reload
      if (activeFloorId) {
        const t = await getTables(businessId, activeFloorId);
        setTables(t);
      }
    }
  }

  if (loading && floors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-content-primary">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm">Chargement du plan de salle...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950/20 rounded-2xl overflow-hidden border border-surface-border">
      {/* Zone tabs + edit toggle */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-surface-border bg-surface-card overflow-x-auto no-scrollbar">
        <Layers className="w-4 h-4 text-content-primary mr-1 shrink-0" />
        {floors.map((f) => (
          <button
            key={f.id}
            onClick={() => switchFloor(f.id)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all",
              activeFloorId === f.id
                ? "bg-brand-600 text-white shadow-lg shadow-brand-900/40"
                : "bg-surface-input text-content-secondary hover:text-content-primary"
            )}
          >
            {f.name}
          </button>
        ))}
        <div className="ml-auto shrink-0">
          <button
            onClick={() => setEditMode(e => !e)}
            title={editMode ? "Quitter le mode édition" : "Déplacer les espaces"}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all",
              editMode
                ? "bg-brand-500 text-white"
                : "bg-surface-input text-content-secondary hover:text-content-primary"
            )}
          >
            {editMode ? <><Check className="w-3 h-3" />Terminé</> : <><Pencil className="w-3 h-3" />Déplacer</>}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        className="flex-1 relative overflow-hidden"
        style={{
          backgroundColor: '#060c1a',
          backgroundImage: [
            /* vignette */
            'radial-gradient(ellipse at 50% 50%, transparent 45%, rgba(0,0,0,0.65) 100%)',
            /* lignes majeures horizontales */
            'linear-gradient(rgba(56,189,248,0.14) 1px, transparent 1px)',
            /* lignes majeures verticales */
            'linear-gradient(90deg, rgba(56,189,248,0.14) 1px, transparent 1px)',
            /* lignes mineures horizontales */
            'linear-gradient(rgba(56,189,248,0.05) 1px, transparent 1px)',
            /* lignes mineures verticales */
            'linear-gradient(90deg, rgba(56,189,248,0.05) 1px, transparent 1px)',
          ].join(','),
          backgroundSize: '100% 100%, 120px 120px, 120px 120px, 30px 30px, 30px 30px',
        }}
      >
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm z-50">
            <Loader2 className="w-6 h-6 animate-spin text-content-brand" />
          </div>
        ) : tables.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-content-primary gap-4">
            <MapIcon className="w-12 h-12 opacity-20" />
            <p className="text-sm font-medium">Aucun espace configuré pour cette zone</p>
            <Link href="/settings" className="btn-secondary text-xs flex items-center gap-1.5">
              <Settings2 className="w-3.5 h-3.5" />Configurer dans Paramètres
            </Link>
          </div>
        ) : (
          <div ref={canvasRef} className="absolute inset-0">
            {editMode && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 text-[10px] font-semibold text-content-brand bg-surface-card/80 backdrop-blur-sm px-3 py-1 rounded-full border border-brand-700/40">
                Glissez les espaces pour les repositionner
              </div>
            )}
            {tables.map((t) => (
              <TableItem
                key={t.id}
                table={t}
                onSelect={onTableSelect}
                selected={selectedTableId === t.id}
                editMode={editMode}
                onDragEnd={handleDragEnd}
                containerRef={canvasRef}
              />
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="px-4 py-2 bg-surface-card border-t border-surface-border flex items-center justify-between text-[10px] uppercase font-bold tracking-wider">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-surface-border border border-slate-700" />
            <span className="text-content-primary">Libre</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-brand-500 shadow-[0_0_8px_rgba(20,184,166,0.4)]" />
            <span className="text-content-brand">Occupé</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-status-warning">Réservé</span>
          </div>
        </div>
        <div className="text-content-primary">
          {tables.filter(t => t.status === 'occupied').length} / {tables.length} espaces occupés
        </div>
      </div>
    </div>
  );
}
