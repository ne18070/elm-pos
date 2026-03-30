'use client';

import { X, Check, Trash2 } from 'lucide-react';
import type { HotelGuest } from '@services/supabase/hotel';
import { ID_TYPES } from './hotel-helpers';

interface GuestForm {
  full_name:   string;
  phone:       string;
  email:       string;
  id_type:     string;
  id_number:   string;
  nationality: string;
  address:     string;
  notes:       string;
}

interface Props {
  item:     HotelGuest | null;
  form:     GuestForm;
  saving:   boolean;
  onChange: (f: GuestForm) => void;
  onSave:   () => void;
  onDelete: (id: string) => void;
  onClose:  () => void;
}

export function GuestPanel({ item, form, saving, onChange, onSave, onDelete, onClose }: Props) {
  return (
    <div className="absolute inset-y-0 right-0 w-96 bg-surface-card border-l border-surface-border shadow-2xl flex flex-col z-40">
      <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
        <h3 className="font-semibold text-white">{item ? 'Modifier client' : 'Nouveau client'}</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-hover">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div>
          <label className="label">Nom complet <span className="text-red-400">*</span></label>
          <input className="input" value={form.full_name} onChange={(e) => onChange({ ...form, full_name: e.target.value })} placeholder="Prénom Nom" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Téléphone</label>
            <input className="input" value={form.phone} onChange={(e) => onChange({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="label">Nationalité</label>
            <input className="input" value={form.nationality} onChange={(e) => onChange({ ...form, nationality: e.target.value })} placeholder="Ex : Sénégal" />
          </div>
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={form.email} onChange={(e) => onChange({ ...form, email: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Pièce d&apos;identité</label>
            <select className="input" value={form.id_type} onChange={(e) => onChange({ ...form, id_type: e.target.value })}>
              <option value="">— Choisir —</option>
              {ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Numéro</label>
            <input className="input" value={form.id_number} onChange={(e) => onChange({ ...form, id_number: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">Adresse</label>
          <input className="input" value={form.address} onChange={(e) => onChange({ ...form, address: e.target.value })} />
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input min-h-[72px] resize-none text-sm" value={form.notes} onChange={(e) => onChange({ ...form, notes: e.target.value })} />
        </div>
      </div>
      <div className="flex gap-2 px-5 py-4 border-t border-surface-border">
        {item && (
          <button onClick={() => onDelete(item.id)} className="p-2.5 rounded-xl text-red-400 hover:bg-red-900/20">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={onSave}
          disabled={saving || !form.full_name.trim()}
          className="btn-primary flex-1 h-10 flex items-center justify-center gap-2"
        >
          {saving ? 'Enregistrement…' : <><Check className="w-4 h-4" /> Enregistrer</>}
        </button>
      </div>
    </div>
  );
}
