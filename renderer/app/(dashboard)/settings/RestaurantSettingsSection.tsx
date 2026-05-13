'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Check, X, Loader2, Layers, LayoutGrid, ChevronDown, ChevronRight, UtensilsCrossed } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { toUserError } from '@/lib/user-error';
import {
  getFloors, createFloor, updateFloor, deleteFloor,
  getTables, createTable, updateTable, deleteTable,
} from '@services/supabase/restaurant';
import type { RestaurantFloor, RestaurantTable } from '@pos-types';

// ─── Types locaux ─────────────────────────────────────────────────────────────

interface FloorWithTables extends RestaurantFloor {
  tables: RestaurantTable[];
  expanded: boolean;
}

// ─── Inline Edit Input ────────────────────────────────────────────────────────

function InlineInput({
  value, onSave, onCancel, placeholder,
}: { value: string; onSave: (v: string) => void; onCancel: () => void; placeholder?: string }) {
  const [v, setV] = useState(value);
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => { e.preventDefault(); if (v.trim()) onSave(v.trim()); }}
    >
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        className="input text-sm py-1 h-8 w-40"
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      />
      <button type="submit" disabled={!v.trim()} className="p-1.5 rounded-lg bg-brand-600 text-white disabled:opacity-40 hover:bg-brand-500">
        <Check className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={onCancel} className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-hover">
        <X className="w-3.5 h-3.5" />
      </button>
    </form>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function RestaurantSettingsSection() {
  const { business } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  const [floors, setFloors] = useState<FloorWithTables[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingFloorId, setEditingFloorId] = useState<string | null>(null);
  const [addingFloor, setAddingFloor] = useState(false);
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [addingTableFloorId, setAddingTableFloorId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      const fs = await getFloors(business.id);
      const withTables = await Promise.all(
        fs.map(async (f) => ({
          ...f,
          tables: await getTables(business.id!, f.id),
          expanded: true,
        }))
      );
      setFloors(withTables);
    } catch (e) {
      notifError(toUserError(e));
    } finally {
      setLoading(false);
    }
  }, [business?.id, notifError]);

  useEffect(() => { load(); }, [load]);

  // ── Zones ─────────────────────────────────────────────────────────────────

  async function handleAddFloor(name: string) {
    if (!business?.id) return;
    try {
      await createFloor({
        business_id: business.id,
        name,
        position: floors.length,
        is_active: true,
      });
      setAddingFloor(false);
      success(`Zone « ${name} » créée`);
      load();
    } catch (e) { notifError(toUserError(e)); }
  }

  async function handleRenameFloor(floorId: string, name: string) {
    try {
      await updateFloor(floorId, { name });
      setEditingFloorId(null);
      setFloors(prev => prev.map(f => f.id === floorId ? { ...f, name } : f));
    } catch (e) { notifError(toUserError(e)); }
  }

  async function handleDeleteFloor(floor: FloorWithTables) {
    if (floor.tables.length > 0) {
      notifError(`Supprimez d'abord les ${floor.tables.length} espace(s) de cette zone`);
      return;
    }
    if (!confirm(`Supprimer la zone « ${floor.name} » ?`)) return;
    try {
      await deleteFloor(floor.id);
      success(`Zone « ${floor.name} » supprimée`);
      setFloors(prev => prev.filter(f => f.id !== floor.id));
    } catch (e) { notifError(toUserError(e)); }
  }

  // ── Espaces ───────────────────────────────────────────────────────────────

  async function handleAddTable(floorId: string, name: string) {
    if (!business?.id) return;
    const floor = floors.find(f => f.id === floorId);
    const idx = floor?.tables.length ?? 0;
    // Grid auto-layout : 4 colonnes, step 22% horizontal / 28% vertical, marge 6%
    const col = idx % 4;
    const row = Math.floor(idx / 4);
    const pos_x = 6 + col * 22;
    const pos_y = 6 + row * 28;
    try {
      await createTable({
        business_id: business.id,
        floor_id: floorId,
        name,
        capacity: 4,
        shape: 'square',
        status: 'free',
        is_active: true,
        pos_x, pos_y, width: 80, height: 80, rotation: 0,
      });
      setAddingTableFloorId(null);
      success(`Espace « ${name} » créé`);
      load();
    } catch (e) { notifError(toUserError(e)); }
  }

  async function handleRenameTable(tableId: string, name: string) {
    try {
      await updateTable(tableId, { name });
      setEditingTableId(null);
      setFloors(prev => prev.map(f => ({
        ...f,
        tables: f.tables.map(t => t.id === tableId ? { ...t, name } : t),
      })));
    } catch (e) { notifError(toUserError(e)); }
  }

  async function handleDeleteTable(table: RestaurantTable) {
    if (!confirm(`Supprimer « ${table.name} » ?`)) return;
    try {
      await deleteTable(table.id);
      setFloors(prev => prev.map(f => ({
        ...f,
        tables: f.tables.filter(t => t.id !== table.id),
      })));
    } catch (e) { notifError(toUserError(e)); }
  }

  function toggleExpand(floorId: string) {
    setFloors(prev => prev.map(f => f.id === floorId ? { ...f, expanded: !f.expanded } : f));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-content-secondary text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className="rounded-xl bg-surface-input border border-surface-border p-4 text-sm text-content-secondary space-y-1">
        <p className="font-semibold text-content-primary flex items-center gap-2">
          <UtensilsCrossed className="w-4 h-4 text-content-brand" />
          Comment ça fonctionne
        </p>
        <ul className="list-disc list-inside space-y-0.5 text-xs text-content-secondary ml-1">
          <li><strong>Zones</strong> = les espaces physiques (Restaurant, Bar, Terrasse, Lobby, Piscine…)</li>
          <li><strong>Espaces</strong> = les tables/emplacements dans chaque zone (Table 1, Bar stool A, Chambre 204…)</li>
          <li>Dans le POS, l'icône plan de salle permet de choisir un espace avant de passer commande</li>
          <li>Chaque zone peut avoir son propre menu du jour</li>
        </ul>
      </div>

      {/* Liste des zones */}
      <div className="space-y-3">
        {floors.length === 0 && !addingFloor && (
          <div className="rounded-xl border border-dashed border-surface-border p-8 flex flex-col items-center gap-3 text-center">
            <Layers className="w-8 h-8 text-content-muted opacity-40" />
            <div>
              <p className="text-sm font-medium text-content-primary">Aucune zone configurée</p>
              <p className="text-xs text-content-secondary mt-0.5">Créez vos premières zones : Restaurant, Bar, Terrasse…</p>
            </div>
            <button onClick={() => setAddingFloor(true)} className="btn-primary flex items-center gap-2 text-xs">
              <Plus className="w-3.5 h-3.5" /> Créer une zone
            </button>
          </div>
        )}

        {floors.map((floor) => (
          <div key={floor.id} className="rounded-xl border border-surface-border bg-surface-card overflow-hidden">
            {/* Zone header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-surface-input/50 border-b border-surface-border">
              <button onClick={() => toggleExpand(floor.id)} className="text-content-muted hover:text-content-primary">
                {floor.expanded
                  ? <ChevronDown className="w-4 h-4" />
                  : <ChevronRight className="w-4 h-4" />}
              </button>
              <Layers className="w-3.5 h-3.5 text-content-brand shrink-0" />

              {editingFloorId === floor.id ? (
                <InlineInput
                  value={floor.name}
                  placeholder="Nom de la zone"
                  onSave={(name) => handleRenameFloor(floor.id, name)}
                  onCancel={() => setEditingFloorId(null)}
                />
              ) : (
                <>
                  <span className="text-sm font-semibold text-content-primary flex-1">{floor.name}</span>
                  <span className="text-[10px] text-content-muted">{floor.tables.length} espace{floor.tables.length !== 1 ? 's' : ''}</span>
                  <button onClick={() => setEditingFloorId(floor.id)} className="p-1 rounded text-content-muted hover:text-content-primary hover:bg-surface-hover">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDeleteFloor(floor)} className="p-1 rounded text-content-muted hover:text-status-error hover:bg-surface-hover">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>

            {/* Espaces */}
            {floor.expanded && (
              <div className="p-3 space-y-1.5">
                {floor.tables.map((table) => (
                  <div key={table.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-hover group">
                    <LayoutGrid className="w-3.5 h-3.5 text-content-muted shrink-0" />
                    {editingTableId === table.id ? (
                      <InlineInput
                        value={table.name}
                        placeholder="Nom de l'espace"
                        onSave={(name) => handleRenameTable(table.id, name)}
                        onCancel={() => setEditingTableId(null)}
                      />
                    ) : (
                      <>
                        <span className="text-sm text-content-primary flex-1">{table.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          table.status === 'free'     ? 'bg-badge-success text-status-success' :
                          table.status === 'occupied' ? 'bg-badge-info text-status-info' :
                          table.status === 'reserved' ? 'bg-badge-warning text-status-warning' :
                          'bg-surface-input text-content-muted'
                        }`}>
                          {table.status === 'free' ? 'Libre' : table.status === 'occupied' ? 'Occupé' : table.status === 'reserved' ? 'Réservé' : 'Nettoyage'}
                        </span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditingTableId(table.id)} className="p-1 rounded text-content-muted hover:text-content-primary hover:bg-surface-hover">
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleDeleteTable(table)} className="p-1 rounded text-content-muted hover:text-status-error hover:bg-surface-hover">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {/* Ajout d'un espace */}
                {addingTableFloorId === floor.id ? (
                  <div className="px-3 py-1">
                    <InlineInput
                      value=""
                      placeholder="Ex : Table 5, Bar stool A, Chambre 204…"
                      onSave={(name) => handleAddTable(floor.id, name)}
                      onCancel={() => setAddingTableFloorId(null)}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingTableFloorId(floor.id)}
                    className="flex items-center gap-2 px-3 py-2 w-full text-xs text-content-muted hover:text-content-primary hover:bg-surface-hover rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Ajouter un espace
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Ajout d'une zone */}
        {addingFloor ? (
          <div className="rounded-xl border border-dashed border-brand-500/40 p-4">
            <p className="text-xs font-semibold text-content-secondary mb-2">Nom de la nouvelle zone</p>
            <InlineInput
              value=""
              placeholder="Ex : Restaurant, Bar, Terrasse, Lobby, Piscine…"
              onSave={handleAddFloor}
              onCancel={() => setAddingFloor(false)}
            />
          </div>
        ) : (
          floors.length > 0 && (
            <button
              onClick={() => setAddingFloor(true)}
              className="flex items-center gap-2 w-full px-4 py-2.5 rounded-xl border border-dashed border-surface-border text-sm text-content-secondary hover:text-content-primary hover:border-brand-500/40 transition-colors"
            >
              <Plus className="w-4 h-4" /> Ajouter une zone
            </button>
          )
        )}
      </div>
    </div>
  );
}
