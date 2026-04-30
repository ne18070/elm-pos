import { useState } from 'react';
import { Package, Plus, X, Loader2, Save } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { updateBusiness } from '@services/supabase/business';
import { DEFAULT_UNITS } from './settings-utils';
import { toUserError } from '@/lib/user-error';

export function StockUnitsSection() {
  const { business, setBusiness } = useAuthStore();
  const { success, error: notifError } = useNotificationStore();
  
  const [stockUnits, setStockUnits] = useState<string[]>(
    business?.stock_units ?? DEFAULT_UNITS
  );
  const [newUnit, setNewUnit] = useState('');
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  function addUnit() {
    const u = newUnit.trim().toLowerCase();
    if (!u || stockUnits.includes(u)) { setNewUnit(''); return; }
    setStockUnits((prev) => [...prev, u]);
    setNewUnit('');
    setIsDirty(true);
  }

  function removeUnit(unit: string) {
    setStockUnits((prev) => prev.filter((u) => u !== unit));
    setIsDirty(true);
  }

  async function handleSave() {
    if (!business) return;
    setSaving(true);
    try {
      await updateBusiness(business.id, { stock_units: stockUnits });
      setBusiness({ ...business, stock_units: stockUnits });
      setIsDirty(false);
      success('Unités de stock enregistrées');
    } catch (err) {
      notifError(toUserError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-content-muted">
        Ces unités seront disponibles en liste déroulante lors de la création de produits.
      </p>

      {/* Liste des unités existantes */}
      <div className="flex flex-wrap gap-2">
        {stockUnits.map((unit) => (
          <span
            key={unit}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-input
                       border border-surface-border rounded-lg text-sm text-content-primary"
          >
            {unit}
            <button
              onClick={() => removeUnit(unit)}
              className="text-content-muted hover:text-status-error transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>

      {/* Ajouter une nouvelle unité */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newUnit}
          onChange={(e) => setNewUnit(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addUnit()}
          placeholder="Nouvelle unité (ex: bouteille)"
          className="input flex-1"
        />
        <button onClick={addUnit} className="btn-secondary px-3">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="pt-2 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="btn-primary flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer les unités
        </button>
        {isDirty && (
          <span className="text-[10px] bg-brand-500/10 text-content-brand px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
            Modifié
          </span>
        )}
      </div>
    </div>
  );
}
