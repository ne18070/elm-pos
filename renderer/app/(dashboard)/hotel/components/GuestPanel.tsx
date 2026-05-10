'use client';

import { useState } from 'react';
import { X, Check, Trash2, User, History, Star, Loader2, BedDouble, LogIn, LogOut } from 'lucide-react';
import type { HotelGuest, HotelReservation } from '@services/supabase/hotel';
import { ID_TYPES, fmt, fmtMoney, resStatusLabel, resStatusStyle } from './hotel-helpers';

export interface GuestForm {
  full_name:     string;
  phone:         string;
  email:         string;
  id_type:       string;
  id_number:     string;
  nationality:   string;
  address:       string;
  date_of_birth: string;
  notes:         string;
  preferences:   string;
}

interface Props {
  item:          HotelGuest | null;
  form:          GuestForm;
  saving:        boolean;
  stays:         HotelReservation[];
  staysLoading:  boolean;
  currency:      string;
  onChange:      (f: GuestForm) => void;
  onSave:        () => void;
  onDelete:      (id: string) => void;
  onOpenDetail:  (res: HotelReservation) => void;
  onClose:       () => void;
}

type GuestTab = 'profil' | 'sejours' | 'preferences';

export function GuestPanel({
  item, form, saving, stays, staysLoading, currency,
  onChange, onSave, onDelete, onOpenDetail, onClose,
}: Props) {
  const [tab, setTab] = useState<GuestTab>('profil');

  const totalSpent = stays.reduce((s, r) => s + Number(r.paid_amount), 0);
  const lastStay   = stays.find((r) => r.status === 'checked_out' || r.status === 'checked_in');

  const TABS: { id: GuestTab; label: string; Icon: React.ElementType }[] = [
    { id: 'profil',      label: 'Profil',      Icon: User    },
    { id: 'sejours',     label: 'Séjours',     Icon: History },
    { id: 'preferences', label: 'Préférences', Icon: Star    },
  ];

  return (
    <div className="absolute inset-y-0 right-0 w-full max-w-md bg-surface-card border-l border-surface-border shadow-2xl flex flex-col z-40">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border shrink-0">
        <div className="min-w-0">
          <h3 className="font-semibold text-content-primary truncate">
            {item ? item.full_name : 'Nouveau client'}
          </h3>
          {item && (
            <p className="text-xs text-content-secondary">
              {stays.length} séjour{stays.length !== 1 ? 's' : ''} · {fmtMoney(totalSpent, currency)} encaissé
            </p>
          )}
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-hover shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs (only for existing guests) */}
      {item && (
        <div className="flex border-b border-surface-border shrink-0">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                tab === id
                  ? 'border-b-2 border-brand-500 text-content-brand'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {id === 'sejours' && stays.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-brand-600/30 text-content-brand text-[10px] font-bold">
                  {stays.length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* ── Profil ─────────────────────────────────────── */}
        {(!item || tab === 'profil') && (
          <div className="p-5 space-y-4">
            <div>
              <label className="label">Nom complet <span className="text-status-error">*</span></label>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" value={form.email} onChange={(e) => onChange({ ...form, email: e.target.value })} />
              </div>
              <div>
                <label className="label">Date de naissance</label>
                <input className="input" type="date" value={form.date_of_birth} onChange={(e) => onChange({ ...form, date_of_birth: e.target.value })} />
              </div>
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
          </div>
        )}

        {/* ── Séjours ─────────────────────────────────────── */}
        {item && tab === 'sejours' && (
          <div className="p-5 space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-surface-card border border-surface-border p-3 text-center">
                <p className="text-lg font-black text-content-primary">{stays.length}</p>
                <p className="text-[10px] text-content-secondary uppercase tracking-wide font-bold">Séjours</p>
              </div>
              <div className="rounded-xl bg-surface-card border border-surface-border p-3 text-center">
                <p className="text-lg font-black text-content-primary">{fmtMoney(totalSpent, currency)}</p>
                <p className="text-[10px] text-content-secondary uppercase tracking-wide font-bold">Encaissé</p>
              </div>
              <div className="rounded-xl bg-surface-card border border-surface-border p-3 text-center">
                <p className="text-sm font-black text-content-primary leading-tight">
                  {lastStay ? fmt(lastStay.check_in) : '—'}
                </p>
                <p className="text-[10px] text-content-secondary uppercase tracking-wide font-bold">Dernier</p>
              </div>
            </div>

            {staysLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-content-secondary" />
              </div>
            ) : stays.length === 0 ? (
              <div className="text-center py-10 text-content-secondary border border-dashed border-surface-border rounded-xl">
                <BedDouble className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Aucun séjour enregistré</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stays.map((res) => (
                  <button
                    key={res.id}
                    onClick={() => { onOpenDetail(res); onClose(); }}
                    className="w-full text-left p-3 rounded-xl bg-surface-card border border-surface-border hover:border-brand-500/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-content-primary flex items-center gap-1.5">
                          <BedDouble className="w-3 h-3 shrink-0 text-content-brand" />
                          Chambre {res.room?.number ?? '?'}
                        </p>
                        <p className="text-[10px] text-content-secondary mt-0.5 flex items-center gap-2">
                          <span className="flex items-center gap-0.5"><LogIn className="w-2.5 h-2.5" />{fmt(res.check_in)}</span>
                          <span className="flex items-center gap-0.5"><LogOut className="w-2.5 h-2.5" />{fmt(res.check_out)}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${resStatusStyle(res.status)}`}>
                          {resStatusLabel(res.status)}
                        </span>
                        <p className="text-xs font-bold text-content-primary mt-1">
                          {fmtMoney(res.paid_amount, currency)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Préférences ─────────────────────────────────── */}
        {item && tab === 'preferences' && (
          <div className="p-5 space-y-4">
            <div>
              <label className="label">Préférences client</label>
              <textarea
                className="input min-h-[120px] resize-none text-sm w-full"
                value={form.preferences}
                onChange={(e) => onChange({ ...form, preferences: e.target.value })}
                placeholder="Ex: chambre calme, étage élevé, oreiller ferme, allergique aux chats, préfère chambre non-fumeur…"
              />
            </div>
            <div>
              <label className="label">Notes internes</label>
              <textarea
                className="input min-h-[100px] resize-none text-sm w-full"
                value={form.notes}
                onChange={(e) => onChange({ ...form, notes: e.target.value })}
                placeholder="Informations confidentielles, observations du personnel…"
              />
            </div>
          </div>
        )}

        {/* Notes for new guest (no tabs) */}
        {!item && (
          <div className="px-5 pb-5 space-y-4">
            <div>
              <label className="label">Préférences</label>
              <textarea className="input min-h-[60px] resize-none text-sm w-full" value={form.preferences} onChange={(e) => onChange({ ...form, preferences: e.target.value })} placeholder="Allergies, préférences chambre…" />
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea className="input min-h-[60px] resize-none text-sm w-full" value={form.notes} onChange={(e) => onChange({ ...form, notes: e.target.value })} />
            </div>
          </div>
        )}
      </div>

      {/* Footer — save/delete only visible on profil & preferences tabs */}
      {(!item || tab === 'profil' || tab === 'preferences') && (
        <div className="flex gap-2 px-5 py-4 border-t border-surface-border shrink-0">
          {item && (
            <button onClick={() => onDelete(item.id)} className="p-2.5 rounded-xl text-status-error hover:bg-badge-error">
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
      )}
    </div>
  );
}
