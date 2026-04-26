'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Car, Calendar, Users, Loader2, AlertCircle, Hotel,
  Search, ChevronRight, Star, Gauge, Fuel, Clock,
  MessageCircle, MapPin, Info, X, ArrowRight, Phone,
} from 'lucide-react';
import {
  getPublicAgencyInfo, getAvailableVehicles, createPublicRentalRequest,
  type PublicAgencyInfo, type PublicVehicle,
} from '@services/supabase/rental-public';
import { formatCurrency } from '@/lib/utils';

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function daysWithTime(startDate: string, startTime: string, endDate: string, endTime: string) {
  const start = new Date(`${startDate}T${startTime}:00`);
  const end = new Date(`${endDate}T${endTime}:00`);
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
}

function isValidPeriod(startDate: string, startTime: string, endDate: string, endTime: string) {
  return new Date(`${endDate}T${endTime}:00`).getTime() > new Date(`${startDate}T${startTime}:00`).getTime();
}

const TODAY    = new Date().toISOString().split('T')[0];
const TOMORROW = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];
const DEFAULT_START_TIME = '09:00';
const DEFAULT_END_TIME = '18:00';

// ─── VehicleCard ──────────────────────────────────────────────────────────────

function VehicleCard({
  vehicle, days, currency, onSelect,
}: {
  vehicle: PublicVehicle; days: number; currency: string; onSelect: () => void;
}) {
  return (
    <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-border overflow-hidden">
      {vehicle.image_url ? (
        <img
          src={vehicle.image_url}
          alt={vehicle.name}
          className="w-full h-44 object-cover"
        />
      ) : (
        <div className="w-full h-44 bg-surface-input flex items-center justify-center">
          <Car className="w-16 h-16 text-content-secondary" />
        </div>
      )}

      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-bold text-content-primary text-base">{vehicle.name}</h3>
          {(vehicle.brand || vehicle.model || vehicle.year) && (
            <p className="text-xs text-content-secondary mt-0.5">
              {[vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {vehicle.color && (
            <span className="flex items-center gap-1 bg-surface-input border border-surface-border px-2 py-0.5 rounded-full text-content-secondary">
              <span className="w-2 h-2 rounded-full bg-content-muted inline-block" />
              {vehicle.color}
            </span>
          )}
          {vehicle.license_plate && (
            <span className="bg-surface-input border border-surface-border px-2 py-0.5 rounded-full text-content-secondary font-mono">
              {vehicle.license_plate}
            </span>
          )}
        </div>

        {vehicle.description && (
          <p className="text-xs text-content-secondary line-clamp-2">{vehicle.description}</p>
        )}

        <div className="flex items-end justify-between pt-1 border-t border-surface-border">
          <div>
            <p className="text-xs text-content-secondary">Total {days} jour{days > 1 ? 's' : ''}</p>
            <p className="font-black text-brand-600 text-xl leading-tight">
              {formatCurrency(vehicle.price_per_day * days, currency)}
            </p>
            <p className="text-xs text-content-secondary">{formatCurrency(vehicle.price_per_day, currency)}/jour</p>
          </div>
          <button
            onClick={onSelect}
            className="bg-brand-600 hover:bg-brand-700 text-content-primary px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center gap-1.5"
          >
            Réserver
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {vehicle.deposit_amount > 0 && (
          <p className="text-xs text-status-warning flex items-center gap-1">
            <Info className="w-3 h-3" />
            Caution : {formatCurrency(vehicle.deposit_amount, currency)}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function LocationPageClient() {
  const { businessId } = useParams<{ businessId: string }>();
  const router = useRouter();

  const [agency,    setAgency]    = useState<PublicAgencyInfo | null>(null);
  const [vehicles,  setVehicles]  = useState<PublicVehicle[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [pageLoad,  setPageLoad]  = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [searched,  setSearched]  = useState(false);

  const [startDate, setStartDate] = useState(TODAY);
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME);
  const [endDate,   setEndDate]   = useState(TOMORROW);
  const [endTime,   setEndTime]   = useState(DEFAULT_END_TIME);
  const [vehicleQuery, setVehicleQuery] = useState('');
  const [sortBy, setSortBy] = useState<'price_asc' | 'price_desc' | 'name'>('price_asc');

  const [selected,  setSelected]  = useState<PublicVehicle | null>(null);
  const [showForm,  setShowForm]  = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    client_name:      '',
    client_phone:     '',
    client_email:     '',
    client_id_number: '',
    client_address:   '',
    pickup_location:  '',
    return_location:  '',
    notes:            '',
  });

  useEffect(() => {
    getPublicAgencyInfo(businessId)
      .then((d) => { if (d) setAgency(d); })
      .finally(() => setPageLoad(false));
  }, [businessId]);

  const days     = daysWithTime(startDate, startTime, endDate, endTime);
  const currency = agency?.currency ?? 'XOF';
  const filteredVehicles = useMemo(() => {
    const q = vehicleQuery.trim().toLowerCase();
    const list = q
      ? vehicles.filter((v) =>
          [v.name, v.brand, v.model, v.license_plate, v.color]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q)
        )
      : vehicles;

    return [...list].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'price_desc') return b.price_per_day - a.price_per_day;
      return a.price_per_day - b.price_per_day;
    });
  }, [vehicles, vehicleQuery, sortBy]);

  async function search() {
    if (!agency?.id || !startDate || !endDate || !startTime || !endTime || !isValidPeriod(startDate, startTime, endDate, endTime)) {
      setError('Sélectionnez une période valide.');
      return;
    }
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await getAvailableVehicles(agency.id, startDate, endDate, startTime, endTime);
      setVehicles(res);
    } catch {
      setError('Impossible de charger les véhicules. Réessayez.');
    } finally {
      setLoading(false);
    }
  }

  async function submitRequest() {
    if (!agency?.id || !selected || !form.client_name.trim() || !form.client_phone.trim()) return;
    setSubmitting(true);
    try {
      const result = await createPublicRentalRequest({
        business_id:      agency.id,
        vehicle_id:       selected.id,
        client_name:      form.client_name.trim(),
        client_phone:     form.client_phone.trim(),
        client_email:     form.client_email.trim(),
        client_id_number: form.client_id_number.trim(),
        client_address:   form.client_address.trim(),
        start_date:       startDate,
        start_time:       startTime,
        end_date:         endDate,
        end_time:         endTime,
        pickup_location:  form.pickup_location.trim(),
        return_location:  form.return_location.trim(),
        notes:            form.notes.trim(),
      });
      router.push(`/location/${businessId}/confirmation/${result.token}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la réservation.');
      setSubmitting(false);
    }
  }

  if (pageLoad) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface pb-16">

      {/* Header */}
      <header className="bg-surface-card border-b border-surface-border shadow-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-xl bg-white border border-surface-border overflow-hidden shrink-0">
            {agency?.logo_url ? (
              <img src={agency.logo_url} alt={agency.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-brand-600 flex items-center justify-center">
                <Car className="w-5 h-5 text-content-primary" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-content-primary leading-tight truncate">{agency?.name ?? 'Location'}</h1>
            {agency?.address && (
              <p className="text-xs text-content-secondary flex items-center gap-1 mt-0.5 truncate">
                <MapPin className="w-3 h-3 shrink-0" />{agency.address}
              </p>
            )}
          </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-white border border-surface-border flex items-center justify-center p-1 shrink-0">
            <img src="/logo.png" alt="ELM APP" className="w-full h-full object-contain" />
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* Hero */}
        <div className="bg-gradient-to-br from-brand-600 to-brand-700 rounded-2xl p-5 text-content-primary space-y-1">
          <h2 className="font-black text-xl">Réservez votre véhicule</h2>
          <p className="text-brand-100 text-sm">Choisissez vos dates et trouvez le véhicule idéal.</p>
        </div>

        {/* Date picker */}
        <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-border p-4 space-y-3">
          <h3 className="font-semibold text-content-secondary text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-brand-500" />
            Période de location
          </h3>
          <div className="space-y-3">
            <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 sm:gap-3">
              <div className="min-w-0">
                <label className="text-xs text-content-secondary font-medium block mb-1">Départ</label>
                <input
                  type="date"
                  value={startDate}
                  min={TODAY}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (e.target.value > endDate) {
                      setEndDate(e.target.value);
                    }
                    setSearched(false);
                  }}
                  className="w-full min-w-0 border border-surface-border bg-surface-input rounded-xl px-3 py-2.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <div className="min-w-0">
                <label className="text-xs text-content-secondary font-medium block mb-1">Heure</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => { setStartTime(e.target.value); setSearched(false); }}
                  className="w-full min-w-0 border border-surface-border bg-surface-input rounded-xl px-2 py-2.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 sm:gap-3">
              <div className="min-w-0">
                <label className="text-xs text-content-secondary font-medium block mb-1">Retour</label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || TODAY}
                  onChange={(e) => { setEndDate(e.target.value); setSearched(false); }}
                  className="w-full min-w-0 border border-surface-border bg-surface-input rounded-xl px-3 py-2.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <div className="min-w-0">
                <label className="text-xs text-content-secondary font-medium block mb-1">Heure</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => { setEndTime(e.target.value); setSearched(false); }}
                  className="w-full min-w-0 border border-surface-border bg-surface-input rounded-xl px-2 py-2.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
            </div>
          </div>
          {startDate && endDate && isValidPeriod(startDate, startTime, endDate, endTime) && (
            <p className="text-xs text-content-secondary text-center leading-relaxed">
              {days} jour{days > 1 ? 's' : ''} · du {fmtDate(startDate)} à {startTime} au {fmtDate(endDate)} à {endTime}
            </p>
          )}
          <button
            onClick={search}
            disabled={loading || !startDate || !endDate || !isValidPeriod(startDate, startTime, endDate, endTime)}
            className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-content-primary font-semibold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Voir les véhicules disponibles
          </button>
        </div>

        {error && (
          <div className="bg-badge-error border border-status-error/30 rounded-xl p-3 flex items-center gap-2 text-sm text-status-error">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Results */}
        {searched && !loading && (
          <>
            {vehicles.length === 0 ? (
              <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-border p-8 text-center space-y-2">
                <Car className="w-12 h-12 text-content-secondary mx-auto" />
                <p className="font-semibold text-content-muted">Aucun véhicule disponible</p>
                <p className="text-sm text-content-secondary">Essayez d'autres dates.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-border p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-content-secondary absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="search"
                        value={vehicleQuery}
                        onChange={(e) => setVehicleQuery(e.target.value)}
                        placeholder="Rechercher modèle, marque, plaque..."
                        className="w-full border border-surface-border bg-surface-input rounded-xl pl-9 pr-3 py-2.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-400"
                      />
                    </div>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                      className="border border-surface-border bg-surface-input rounded-xl px-2 py-2.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-400"
                    >
                      <option value="price_asc">Prix +</option>
                      <option value="price_desc">Prix -</option>
                      <option value="name">Nom</option>
                    </select>
                  </div>
                  <p className="text-xs text-content-secondary">
                    {filteredVehicles.length} sur {vehicles.length} véhicule{vehicles.length > 1 ? 's' : ''} disponible{vehicles.length > 1 ? 's' : ''}
                  </p>
                </div>

                {filteredVehicles.length === 0 && (
                  <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-border p-6 text-center">
                    <p className="text-sm text-content-secondary">Aucun véhicule disponible ne correspond à cette recherche.</p>
                  </div>
                )}

                {filteredVehicles.map((v) => (
                  <VehicleCard
                    key={v.id}
                    vehicle={v}
                    days={days}
                    currency={currency}
                    onSelect={() => { setSelected(v); setShowForm(true); setError(null); }}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Contact agence */}
        {agency?.phone && (
          <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-border p-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-content-primary text-sm">Une question ?</p>
              <p className="text-xs text-content-secondary mt-0.5">{agency.name}</p>
            </div>
            <a
              href={`https://wa.me/${agency.phone.replace(/[^0-9]/g, '')}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-content-primary px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shrink-0"
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </a>
          </div>
        )}
      </main>

      {/* Reservation drawer */}
      {showForm && selected && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowForm(false)} />
          <div className="relative bg-surface-card border border-surface-border rounded-t-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-surface-card border-b border-surface-border px-5 pt-4 pb-3 flex items-center justify-between rounded-t-3xl">
              <div>
                <h3 className="font-bold text-content-primary">Réserver — {selected.name}</h3>
                <p className="text-xs text-content-secondary mt-0.5">
                  {fmtDate(startDate)} {startTime} → {fmtDate(endDate)} {endTime} · {days} jour{days > 1 ? 's' : ''}
                </p>
              </div>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-full hover:bg-surface-hover">
                <X className="w-5 h-5 text-content-muted" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {error && (
                <div className="bg-badge-error border border-status-error/30 rounded-xl p-3 text-sm text-status-error flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* Récap véhicule */}
              <div className="bg-surface-input rounded-xl p-3 flex items-center gap-3">
                {selected.image_url ? (
                  <img src={selected.image_url} alt={selected.name} className="w-14 h-10 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-14 h-10 bg-surface-hover rounded-lg flex items-center justify-center shrink-0">
                    <Car className="w-5 h-5 text-content-secondary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-content-primary text-sm truncate">{selected.name}</p>
                  <p className="text-xs text-content-secondary">{formatCurrency(selected.price_per_day, currency)}/jour</p>
                </div>
                <p className="font-black text-brand-600 shrink-0">
                  {formatCurrency(selected.price_per_day * days, currency)}
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-content-secondary uppercase tracking-wide">Vos informations</p>

                <div>
                  <label className="text-xs text-content-muted block mb-1">Nom complet *</label>
                  <input
                    type="text"
                    value={form.client_name}
                    onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                    placeholder="Ex: Mamadou Koné"
                    className="w-full border border-surface-border bg-surface-input rounded-xl px-3 py-2.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>

                <div>
                  <label className="text-xs text-content-muted block mb-1">Téléphone *</label>
                  <input
                    type="tel"
                    value={form.client_phone}
                    onChange={(e) => setForm({ ...form, client_phone: e.target.value })}
                    placeholder="+221 07 00 00 00 00"
                    className="w-full border border-surface-border bg-surface-input rounded-xl px-3 py-2.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-content-muted block mb-1">Email</label>
                    <input
                      type="email"
                      value={form.client_email}
                      onChange={(e) => setForm({ ...form, client_email: e.target.value })}
                      placeholder="email@exemple.com"
                      className="w-full border border-surface-border bg-surface-input rounded-xl px-3 py-2.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-content-muted block mb-1">N° pièce d'identité</label>
                    <input
                      type="text"
                      value={form.client_id_number}
                      onChange={(e) => setForm({ ...form, client_id_number: e.target.value })}
                      placeholder="CI-12345678"
                      className="w-full border border-surface-border bg-surface-input rounded-xl px-3 py-2.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-content-muted block mb-1">Adresse</label>
                  <input
                    type="text"
                    value={form.client_address}
                    onChange={(e) => setForm({ ...form, client_address: e.target.value })}
                    placeholder="Votre adresse"
                    className="w-full border border-surface-border bg-surface-input rounded-xl px-3 py-2.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>

                <p className="text-xs font-semibold text-content-muted uppercase tracking-wide pt-1">Lieux</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-content-muted block mb-1">Lieu de départ</label>
                    <input
                      type="text"
                      value={form.pickup_location}
                      onChange={(e) => setForm({ ...form, pickup_location: e.target.value })}
                      placeholder="Agence / Aéroport"
                      className="w-full border border-surface-border bg-surface-input rounded-xl px-3 py-2.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-content-muted block mb-1">Lieu de retour</label>
                    <input
                      type="text"
                      value={form.return_location}
                      onChange={(e) => setForm({ ...form, return_location: e.target.value })}
                      placeholder="Agence / Aéroport"
                      className="w-full border border-surface-border bg-surface-input rounded-xl px-3 py-2.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-content-muted block mb-1">Notes / demandes spéciales</label>
                  <textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Siège bébé, GPS..."
                    className="w-full border border-surface-border bg-surface-input rounded-xl px-3 py-2.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
                  />
                </div>
              </div>

              {selected.deposit_amount > 0 && (
                <div className="bg-badge-warning border border-status-warning/30 rounded-xl p-3 text-xs text-status-warning">
                  Une caution de <strong>{formatCurrency(selected.deposit_amount, currency)}</strong> sera demandée à la prise en charge du véhicule.
                </div>
              )}

              <button
                onClick={submitRequest}
                disabled={submitting || !form.client_name.trim() || !form.client_phone.trim()}
                className="w-full py-3.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-content-primary font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>Confirmer la demande <ArrowRight className="w-4 h-4" /></>
                )}
              </button>

              <p className="text-center text-xs text-content-secondary pb-2">
                Votre demande sera confirmée par l'agence. Règlement à la prise en charge.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
