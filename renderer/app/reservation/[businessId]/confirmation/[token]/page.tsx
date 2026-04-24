'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  CheckCircle2, BedDouble, Calendar, Users, MessageCircle,
  Loader2, AlertCircle, ArrowLeft, Hotel, Phone, Clock,
  Banknote, Star, Wifi, Wind, Tv, Coffee, Car,
} from 'lucide-react';
import { getPublicReservation, type PublicReservationDetail } from '@services/supabase/hotel-public';
import { formatCurrency } from '@/lib/utils';

const ROOM_TYPE_LABELS: Record<string, string> = {
  simple:    'Chambre Simple',
  double:    'Chambre Double',
  twin:      'Lits Jumeaux',
  suite:     'Suite',
  familiale: 'Familiale',
};

const AMENITY_ICONS: Record<string, React.ReactNode> = {
  'WiFi':        <Wifi    className="w-3.5 h-3.5" />,
  'Climatiseur': <Wind    className="w-3.5 h-3.5" />,
  'TV':          <Tv      className="w-3.5 h-3.5" />,
  'Minibar':     <Coffee  className="w-3.5 h-3.5" />,
  'Parking':     <Car     className="w-3.5 h-3.5" />,
  'Piscine':     <Star    className="w-3.5 h-3.5" />,
};

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function nightsBetween(from: string, to: string) {
  return Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000));
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  confirmed:   { label: 'Confirmée',    color: 'bg-green-50 border-green-200 text-green-700' },
  checked_in:  { label: 'En cours',     color: 'bg-blue-50 border-blue-200 text-blue-700'   },
  checked_out: { label: 'Terminée',     color: 'bg-slate-50 border-slate-200 text-slate-600' },
  cancelled:   { label: 'Annulée',      color: 'bg-red-50 border-red-200 text-red-600'       },
  no_show:     { label: 'Non présenté', color: 'bg-amber-50 border-amber-200 text-amber-700' },
};

export default function ReservationConfirmationPage() {
  const { businessId, token } = useParams<{ businessId: string; token: string }>();

  const [data,    setData]    = useState<PublicReservationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getPublicReservation(token)
      .then((d) => {
        if (!d) setError("Réservation introuvable ou lien invalide.");
        else setData(d);
      })
      .catch(() => setError("Impossible de charger la confirmation."))
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
          <AlertCircle className="w-12 h-12 text-status-error mx-auto" />
          <p className="font-semibold text-slate-800">{error}</p>
          <a
            href={`/reservation/${businessId}`}
            className="block w-full py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm text-center"
          >
            Retour à l'hôtel
          </a>
        </div>
      </div>
    );
  }

  const nights    = nightsBetween(data.check_in, data.check_out);
  const currency  = data.currency;
  const status    = STATUS_CONFIG[data.status] ?? STATUS_CONFIG['confirmed'];
  const shortId   = data.id.slice(0, 8).toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 pb-16">

      {/* Header */}
      <header className="bg-white border-b border-slate-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <a
            href={`/reservation/${businessId}`}
            className="p-2 rounded-full hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-500" />
          </a>
          <div className="flex items-center gap-2">
            {data.logo_url ? (
              <img src={data.logo_url} alt={data.business_name} className="w-8 h-8 rounded-lg object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
                <Hotel className="w-4 h-4 text-white" />
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
            <CheckCircle2 className="w-8 h-8 text-status-success" />
          </div>
          <div>
            <h2 className="font-black text-xl text-slate-900">Réservation confirmée !</h2>
            <p className="text-slate-500 text-sm mt-1">
              Votre chambre est réservée. Vous recevrez une confirmation sur votre WhatsApp.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
              <BedDouble className="w-4 h-4 text-content-secondary" />
              <span className="font-mono font-bold text-slate-800 text-sm">#{shortId}</span>
            </div>
            <span className={`inline-flex px-3 py-1.5 rounded-xl text-xs font-bold border ${status.color}`}>
              {status.label}
            </span>
          </div>
        </div>

        {/* Détail séjour */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
          <h3 className="font-semibold text-slate-700 flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-brand-500" />
            Détail du séjour
          </h3>

          {/* Chambre */}
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
            <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center shrink-0">
              <BedDouble className="w-5 h-5 text-brand-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-800">Chambre {data.room_number}</p>
              <p className="text-xs text-slate-500">
                {ROOM_TYPE_LABELS[data.room_type] ?? data.room_type}
                {data.room_floor ? ` · Étage ${data.room_floor}` : ''}
              </p>
            </div>
            <p className="font-black text-brand-600 text-lg shrink-0">
              {formatCurrency(data.total, currency)}
            </p>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-green-50 rounded-xl border border-green-100">
              <p className="text-xs font-semibold text-green-600 mb-0.5">Arrivée</p>
              <p className="font-bold text-slate-800 text-sm leading-snug">{fmtDate(data.check_in)}</p>
              <p className="text-xs text-slate-500 mt-0.5">Check-in à partir de 14h</p>
            </div>
            <div className="p-3 bg-red-50 rounded-xl border border-red-100">
              <p className="text-xs font-semibold text-status-error mb-0.5">Départ</p>
              <p className="font-bold text-slate-800 text-sm leading-snug">{fmtDate(data.check_out)}</p>
              <p className="text-xs text-slate-500 mt-0.5">Check-out avant 12h</p>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm px-1">
            <span className="text-slate-500 flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {nights} nuit{nights > 1 ? 's' : ''}
            </span>
            <span className="text-slate-500 flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              {data.num_guests} personne{data.num_guests > 1 ? 's' : ''}
            </span>
            <span className="text-slate-500 flex items-center gap-1.5">
              <Banknote className="w-4 h-4" />
              {formatCurrency(data.price_per_night, currency)}/nuit
            </span>
          </div>

          {/* Équipements */}
          {data.room_amenities?.length > 0 && (
            <div className="pt-1">
              <p className="text-xs font-semibold text-slate-500 mb-2">Équipements inclus</p>
              <div className="flex flex-wrap gap-1.5">
                {data.room_amenities.map((a) => (
                  <span key={a} className="flex items-center gap-1 text-xs text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-full">
                    {AMENITY_ICONS[a] ?? <Star className="w-3 h-3" />}
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Infos voyageur */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-3">
          <h3 className="font-semibold text-slate-700 text-sm">Vos informations</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-content-secondary">Nom</p>
              <p className="font-semibold text-slate-800">{data.guest_name}</p>
            </div>
            <div>
              <p className="text-xs text-content-secondary">Téléphone</p>
              <p className="font-semibold text-slate-800">{data.guest_phone ?? '—'}</p>
            </div>
          </div>
          {data.notes && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs text-content-secondary">Demandes spéciales</p>
              <p className="text-sm text-slate-700 mt-0.5">{data.notes}</p>
            </div>
          )}
        </div>

        {/* Paiement */}
        <div className="bg-amber-50 rounded-2xl border border-amber-100 p-5 flex items-center gap-3">
          <Banknote className="w-6 h-6 text-status-warning shrink-0" />
          <div>
            <p className="font-semibold text-amber-800 text-sm">Règlement à l'hôtel</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Le montant de <strong>{formatCurrency(data.total, currency)}</strong> sera réglé directement à l'hôtel lors de votre arrivée.
            </p>
          </div>
        </div>

        {/* Contact hôtel */}
        {data.business_phone && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-slate-800 text-sm">Une question ?</p>
              <p className="text-xs text-content-secondary mt-0.5">Contactez {data.business_name}</p>
            </div>
            <a
              href={`https://wa.me/${data.business_phone.replace(/[^0-9]/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shrink-0"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </a>
          </div>
        )}

        <a
          href={`/reservation/${businessId}`}
          className="block w-full text-center py-3.5 rounded-xl border-2 border-slate-200 text-slate-600 font-semibold text-sm hover:border-brand-400 hover:text-brand-600 transition-colors"
        >
          ← Retour à l'hôtel
        </a>

        <p className="text-center text-xs text-slate-300 pb-4">
          Réservation #{shortId} · {new Date(data.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      </main>
    </div>
  );
}
