'use client';

import { X, Check, Phone, Calendar, BadgeCheck, AlertCircle, LogIn, LogOut, Plus, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateHotelInvoice, printHtml } from '@/lib/invoice-templates';
import type { HotelReservation, HotelService } from '@services/supabase/hotel';
import { nightsBetween } from '@services/supabase/hotel';
import type { Business } from '@pos-types';
import { PayMethod, fmt, fmtMoney, resStatusStyle, resStatusLabel } from './hotel-helpers';

interface SvcForm { label: string; amount: string; service_date: string }

interface Props {
  reservation:       HotelReservation;
  services:          HotelService[];
  checkoutPaid:      string;
  checkoutMethod:    PayMethod;
  payForm:           { amount: string; method: PayMethod };
  svcForm:           SvcForm;
  savingPay:         boolean;
  saving:            boolean;
  isManagerOrAbove:  boolean;
  currency:          string;
  business:          Business | null;
  onClose:           () => void;
  setCheckoutPaid:   (v: string) => void;
  setCheckoutMethod: (v: PayMethod) => void;
  setPayForm:        (f: { amount: string; method: PayMethod }) => void;
  setSvcForm:        (f: SvcForm) => void;
  onCheckIn:         (res: HotelReservation) => void;
  onCheckOut:        (res: HotelReservation) => void;
  onCancel:          (res: HotelReservation) => void;
  onAddPayment:      (res: HotelReservation) => void;
  onAddService:      (reservationId: string) => void;
  onDeleteService:   (svc: HotelService, reservationId: string) => void;
}

export function DetailPanel({
  reservation, services, checkoutPaid, checkoutMethod, payForm, svcForm,
  savingPay, saving, isManagerOrAbove, currency, business,
  onClose, setCheckoutPaid, setCheckoutMethod, setPayForm, setSvcForm,
  onCheckIn, onCheckOut, onCancel, onAddPayment, onAddService, onDeleteService,
}: Props) {
  const res     = reservation;
  const nights  = nightsBetween(res.check_in, res.check_out);
  const balance = res.total - res.paid_amount;

  return (
    <div className="absolute inset-y-0 right-0 w-[440px] bg-surface-card border-l border-surface-border shadow-2xl flex flex-col z-40">
      <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
        <div className="flex items-center gap-2">
          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', resStatusStyle(res.status))}>
            {resStatusLabel(res.status)}
          </span>
          <h3 className="font-semibold text-white">Chambre {res.room?.number}</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            title="Imprimer la facture"
            onClick={() => {
              if (!business) return;
              const html = generateHotelInvoice(res, services, business);
              printHtml(html);
            }}
            className="p-1.5 rounded-lg text-content-secondary hover:text-white hover:bg-surface-hover"
          >
            <Printer className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg text-content-secondary hover:text-white hover:bg-surface-hover">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Client */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-surface-input flex items-center justify-center shrink-0 text-sm font-bold text-content-brand">
            {res.guest?.full_name.charAt(0).toUpperCase() ?? '?'}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{res.guest?.full_name}</p>
            {res.guest?.phone && <p className="text-xs text-content-secondary flex items-center gap-1"><Phone className="w-3 h-3" />{res.guest.phone}</p>}
            {res.guest?.nationality && <p className="text-xs text-slate-500">{res.guest.nationality}</p>}
            {res.guest?.id_number && (
              <p className="text-xs text-slate-500 flex items-center gap-1"><BadgeCheck className="w-3 h-3" />{res.guest.id_type} {res.guest.id_number}</p>
            )}
          </div>
        </div>

        {/* Séjour */}
        <div className="card p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-content-secondary flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Arrivée</span>
            <span className="font-medium text-white">{fmt(res.check_in)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-content-secondary flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Départ</span>
            <span className="font-medium text-white">{fmt(res.check_out)}</span>
          </div>
          <div className="flex items-center justify-between text-sm border-t border-surface-border pt-2">
            <span className="text-content-secondary">{nights} nuit{nights > 1 ? 's' : ''} × {fmtMoney(res.price_per_night, currency)}</span>
            <span className="font-semibold text-white">{fmtMoney(res.total_room, currency)}</span>
          </div>
        </div>

        {/* Prestations */}
        <div>
          <p className="text-xs font-semibold text-content-secondary uppercase tracking-wide mb-2">Prestations</p>
          {services.length === 0 && <p className="text-xs text-slate-500 py-2">Aucune prestation</p>}
          {services.map((svc) => (
            <div key={svc.id} className="flex items-center justify-between py-1.5 border-b border-surface-border last:border-0">
              <div>
                <p className="text-sm text-white">{svc.label}</p>
                <p className="text-xs text-slate-500">{fmt(svc.service_date)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{fmtMoney(svc.amount, currency)}</span>
                {(res.status === 'confirmed' || res.status === 'checked_in') && (
                  <button onClick={() => onDeleteService(svc, res.id)} className="p-1 text-slate-500 hover:text-status-error">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {(res.status === 'confirmed' || res.status === 'checked_in') && (
            <div className="flex gap-2 mt-2">
              <input
                className="input flex-1 h-8 text-sm"
                placeholder="Prestation…"
                value={svcForm.label}
                onChange={(e) => setSvcForm({ ...svcForm, label: e.target.value })}
              />
              <input
                className="input w-24 h-8 text-sm"
                type="number"
                placeholder="Montant"
                value={svcForm.amount}
                onChange={(e) => setSvcForm({ ...svcForm, amount: e.target.value })}
              />
              <button
                onClick={() => onAddService(res.id)}
                disabled={saving || !svcForm.label.trim() || !svcForm.amount}
                className="btn-primary h-8 px-3 text-sm flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Totaux */}
        <div className="card p-4 space-y-1.5">
          <div className="flex justify-between text-sm text-content-secondary">
            <span>Chambre</span><span>{fmtMoney(res.total_room, currency)}</span>
          </div>
          {res.total_services > 0 && (
            <div className="flex justify-between text-sm text-content-secondary">
              <span>Prestations</span><span>{fmtMoney(res.total_services, currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-white border-t border-surface-border pt-2">
            <span>Total</span><span>{fmtMoney(res.total, currency)}</span>
          </div>
          {res.paid_amount > 0 && (
            <div className="flex justify-between text-sm text-status-success">
              <span>Payé</span><span>{fmtMoney(res.paid_amount, currency)}</span>
            </div>
          )}
          {balance > 0 && res.status !== 'cancelled' && (
            <div className="flex justify-between text-sm text-status-warning">
              <span>Reste à payer</span><span>{fmtMoney(balance, currency)}</span>
            </div>
          )}
        </div>

        {/* Encaissement partiel */}
        {(res.status === 'confirmed' || res.status === 'checked_in') && balance > 0 && (
          <div>
            <p className="text-xs font-semibold text-content-secondary uppercase tracking-wide mb-2">Encaisser un acompte</p>
            <div className="flex gap-2">
              <input
                className="input flex-1 h-9 text-sm"
                type="number"
                min={0}
                placeholder={`Reste: ${fmtMoney(balance, currency)}`}
                value={payForm.amount}
                onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
              />
              <select className="input w-28 h-9 text-sm" value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value as PayMethod })}>
                <option value="cash">Espèces</option>
                <option value="card">Carte</option>
                <option value="mobile_money">Mobile</option>
              </select>
              <button
                onClick={() => onAddPayment(res)}
                disabled={savingPay || !payForm.amount}
                className="btn-primary h-9 px-3 text-sm flex items-center gap-1 shrink-0"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Montant check-out */}
        {res.status === 'checked_in' && (
          <div>
            <label className="label">Montant à encaisser au check-out</label>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                type="number"
                min={0}
                placeholder={balance > 0 ? `Reste: ${fmtMoney(balance, currency)}` : '0'}
                value={checkoutPaid}
                onChange={(e) => setCheckoutPaid(e.target.value)}
              />
              <select className="input w-32" value={checkoutMethod} onChange={(e) => setCheckoutMethod(e.target.value as PayMethod)}>
                <option value="cash">Espèces</option>
                <option value="card">Carte</option>
                <option value="mobile_money">Mobile</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="px-5 py-4 border-t border-surface-border space-y-2">
        {res.status === 'confirmed' && (
          <button
            onClick={() => onCheckIn(res)}
            className="w-full h-10 rounded-xl bg-green-700 hover:bg-green-600 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <LogIn className="w-4 h-4" /> Check-in
          </button>
        )}
        {res.status === 'checked_in' && (
          <button
            onClick={() => onCheckOut(res)}
            className="w-full h-10 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Check-out &amp; encaisser
          </button>
        )}
        {isManagerOrAbove && (res.status === 'confirmed' || res.status === 'checked_in') && (
          <button
            onClick={() => onCancel(res)}
            className="w-full h-9 rounded-xl border border-status-error text-status-error hover:bg-badge-error text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <AlertCircle className="w-4 h-4" /> Annuler la réservation
          </button>
        )}
      </div>
    </div>
  );
}
