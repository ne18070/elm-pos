'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  CheckCircle2, Car, Calendar, Loader2, AlertCircle,
  ArrowLeft, MapPin, Banknote, MessageCircle, Clock, Info,
} from 'lucide-react';
import { getPublicRentalRequest, type PublicRentalDetail } from '@services/supabase/rental-public';
import { formatCurrency } from '@/lib/utils';

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function daysBetween(from: string, to: string) {
  return Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000));
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft:    { label: 'En attente',   color: 'bg-amber-50 border-amber-200 text-amber-700'   },
  sent:     { label: 'En cours',     color: 'bg-blue-50 border-blue-200 text-blue-700'      },
  signed:   { label: 'Confirmée',    color: 'bg-green-50 border-green-200 text-green-700'   },
  archived: { label: 'Terminée',     color: 'bg-slate-50 border-slate-200 text-slate-600'   },
};

export default function LocationConfirmationPage() {
  const { businessId, token } = useParams<{ businessId: string; token: string }>();

  const [data,    setData]    = useState<PublicRentalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getPublicRentalRequest(token)
      .then((d) => {
        if (!d) setError('Demande introuvable ou lien invalide.');
        else setData(d);
      })
      .catch(() => setError('Impossible de charger la confirmation.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center max-w-sm w-full space-y-4">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <p className="font-semibold text-slate-800">{error}</p>
          <a
            href={`/location/${businessId}`}
            className="block w-full py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm text-center"
          >
            Retour à l'agence
          </a>
        </div>
      </div>
    );
  }

  const days     = daysBetween(data.start_date, data.end_date);
  const currency = data.currency;
  const status   = STATUS_CONFIG[data.status] ?? STATUS_CONFIG['draft'];
  const shortId  = data.id.slice(0, 8).toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 pb-16">

      {/* Header */}
      <header className="bg-white border-b border-slate-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <a
            href={`/location/${businessId}`}
            className="p-2 rounded-full hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-500" />
          </a>
          <div className="flex items-center gap-2">
            {data.logo_url ? (
              <img src={data.logo_url} alt={data.business_name} className="w-8 h-8 rounded-lg object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
                <Car className="w-4 h-4 text-white" />
              </div>
            )}
            <h1 className="font-bold text-slate-900">{data.business_name}</h1>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* Succès */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 text-center space-y-3">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto border-4 border-green-100">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
          <div>
            <h2 className="font-black text-xl text-slate-900">Demande enregistrée !</h2>
            <p className="text-slate-500 text-sm mt-1">
              L'agence va vous contacter pour confirmer la réservation.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
              <Car className="w-4 h-4 text-slate-400" />
              <span className="font-mono font-bold text-slate-800 text-sm">#{shortId}</span>
            </div>
            <span className={`inline-flex px-3 py-1.5 rounded-xl text-xs font-bold border ${status.color}`}>
              {status.label}
            </span>
          </div>
        </div>

        {/* Véhicule + dates */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
          <h3 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
            <Car className="w-4 h-4 text-brand-500" />
            Détail de la location
          </h3>

          {/* Véhicule */}
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            {data.vehicle_image ? (
              <img src={data.vehicle_image} alt={data.vehicle_name} className="w-16 h-12 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="w-16 h-12 bg-slate-200 rounded-lg flex items-center justify-center shrink-0">
                <Car className="w-6 h-6 text-slate-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-800">{data.vehicle_name}</p>
              <p className="text-xs text-slate-500">
                {[data.vehicle_brand, data.vehicle_model, data.vehicle_year].filter(Boolean).join(' · ')}
                {data.vehicle_plate ? ` · ${data.vehicle_plate}` : ''}
              </p>
            </div>
            <p className="font-black text-brand-600 text-lg shrink-0">
              {formatCurrency(data.total_amount, currency)}
            </p>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-green-50 rounded-xl border border-green-100">
              <p className="text-xs font-semibold text-green-600 mb-0.5">Départ</p>
              <p className="font-bold text-slate-800 text-sm leading-snug">{fmtDate(data.start_date)}</p>
              {data.pickup_location && (
                <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{data.pickup_location}
                </p>
              )}
            </div>
            <div className="p-3 bg-red-50 rounded-xl border border-red-100">
              <p className="text-xs font-semibold text-red-500 mb-0.5">Retour</p>
              <p className="font-bold text-slate-800 text-sm leading-snug">{fmtDate(data.end_date)}</p>
              {data.return_location && (
                <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{data.return_location}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-sm px-1">
            <span className="text-slate-500 flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {days} jour{days > 1 ? 's' : ''}
            </span>
            <span className="text-slate-500 flex items-center gap-1.5">
              <Banknote className="w-4 h-4" />
              {formatCurrency(data.price_per_day, currency)}/jour
            </span>
          </div>
        </div>

        {/* Infos client */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-3">
          <h3 className="font-semibold text-slate-700 text-sm">Vos informations</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-400">Nom</p>
              <p className="font-semibold text-slate-800">{data.client_name}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Téléphone</p>
              <p className="font-semibold text-slate-800">{data.client_phone ?? '—'}</p>
            </div>
          </div>
          {data.notes && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-400">Notes</p>
              <p className="text-sm text-slate-700 mt-0.5">{data.notes}</p>
            </div>
          )}
        </div>

        {/* Caution + paiement */}
        {data.deposit_amount > 0 && (
          <div className="bg-amber-50 rounded-2xl border border-amber-100 p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800 text-sm">Caution requise</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Une caution de <strong>{formatCurrency(data.deposit_amount, currency)}</strong> vous sera demandée à la prise en charge du véhicule.
              </p>
            </div>
          </div>
        )}

        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
          <Banknote className="w-6 h-6 text-slate-500 shrink-0" />
          <div>
            <p className="font-semibold text-slate-700 text-sm">Règlement à la prise en charge</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Montant total : <strong>{formatCurrency(data.total_amount, currency)}</strong>
            </p>
          </div>
        </div>

        {/* Contact agence */}
        {data.business_phone && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-slate-800 text-sm">Une question ?</p>
              <p className="text-xs text-slate-400 mt-0.5">Contactez {data.business_name}</p>
            </div>
            <a
              href={`https://wa.me/${data.business_phone.replace(/[^0-9]/g, '')}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shrink-0"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </a>
          </div>
        )}

        <a
          href={`/location/${businessId}`}
          className="block w-full text-center py-3.5 rounded-xl border-2 border-slate-200 text-slate-600 font-semibold text-sm hover:border-brand-400 hover:text-brand-600 transition-colors"
        >
          ← Retour à l'agence
        </a>

        <p className="text-center text-xs text-slate-300 pb-4">
          Demande #{shortId} · {new Date(data.created_at).toLocaleDateString('fr-FR', {
            day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </p>
      </main>
    </div>
  );
}
