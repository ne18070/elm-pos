'use client';

import { X, Check, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HotelRoom, RoomType, RoomStatus } from '@services/supabase/hotel';
import { ROOM_TYPES, AMENITIES } from './hotel-helpers';

interface RoomForm {
  number:          string;
  type:            RoomType;
  floor:           string;
  capacity:        number;
  price_per_night: string;
  status:          RoomStatus;
  description:     string;
  amenities:       string[];
  is_active:       boolean;
}

interface Props {
  item:            HotelRoom | null;
  form:            RoomForm;
  saving:          boolean;
  onChange:        (f: RoomForm) => void;
  onToggleAmenity: (a: string) => void;
  onSave:          () => void;
  onDelete:        (id: string) => void;
  onClose:         () => void;
}

export function RoomPanel({ item, form, saving, onChange, onToggleAmenity, onSave, onDelete, onClose }: Props) {
  return (
    <div className="absolute inset-y-0 right-0 w-96 bg-surface-card border-l border-surface-border shadow-2xl flex flex-col z-40">
      <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
        <h3 className="font-semibold text-white">{item ? 'Modifier chambre' : 'Nouvelle chambre'}</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg text-content-secondary hover:text-white hover:bg-surface-hover">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Numéro <span className="text-status-error">*</span></label>
            <input className="input" value={form.number} onChange={(e) => onChange({ ...form, number: e.target.value })} placeholder="101" autoFocus />
          </div>
          <div>
            <label className="label">Étage</label>
            <input className="input" value={form.floor} onChange={(e) => onChange({ ...form, floor: e.target.value })} placeholder="1er" />
          </div>
        </div>
        <div>
          <label className="label">Type</label>
          <select className="input" value={form.type} onChange={(e) => onChange({ ...form, type: e.target.value as RoomType })}>
            {ROOM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Capacité (pers.)</label>
            <input className="input" type="number" min={1} value={form.capacity} onChange={(e) => onChange({ ...form, capacity: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Prix / nuit <span className="text-status-error">*</span></label>
            <input className="input" type="number" min={0} value={form.price_per_night} onChange={(e) => onChange({ ...form, price_per_night: e.target.value })} placeholder="0" />
          </div>
        </div>
        <div>
          <label className="label">Statut</label>
          <select className="input" value={form.status} onChange={(e) => onChange({ ...form, status: e.target.value as RoomStatus })}>
            <option value="available">Disponible</option>
            <option value="occupied">Occupée</option>
            <option value="cleaning">Nettoyage</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>
        <div>
          <label className="label">Équipements</label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {AMENITIES.map((a) => (
              <button
                key={a} type="button"
                onClick={() => onToggleAmenity(a)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs border transition-colors',
                  form.amenities.includes(a)
                    ? 'border-brand-600 bg-badge-brand text-content-brand'
                    : 'border-surface-border text-content-secondary hover:border-slate-500'
                )}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input min-h-[72px] resize-none text-sm" value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} />
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => onChange({ ...form, is_active: !form.is_active })}
            className={cn('w-10 h-6 rounded-full transition-colors', form.is_active ? 'bg-brand-600' : 'bg-slate-700')}
          >
            <span className={cn('block w-4 h-4 bg-white rounded-full shadow mt-1 transition-transform', form.is_active ? 'translate-x-5' : 'translate-x-1')} />
          </div>
          <span className="text-sm text-slate-300">Active</span>
        </label>
      </div>
      <div className="flex gap-2 px-5 py-4 border-t border-surface-border">
        {item && (
          <button onClick={() => onDelete(item.id)} className="p-2.5 rounded-xl text-status-error hover:bg-badge-error">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={onSave}
          disabled={saving || !form.number.trim() || !form.price_per_night}
          className="btn-primary flex-1 h-10 flex items-center justify-center gap-2"
        >
          {saving ? 'Enregistrement…' : <><Check className="w-4 h-4" /> Enregistrer</>}
        </button>
      </div>
    </div>
  );
}
