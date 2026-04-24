'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  Car, Phone, MapPin, Loader2, AlertCircle,
  Gauge, Fuel, Settings2, Palette, X, Send,
  ChevronRight, Search,
} from 'lucide-react';
import {
  getPublicAgencyInfo, getPublicVoitures, createLead,
  CARBURANT_LABELS, TRANSMISSION_LABELS, STATUT_CFG,
  type PublicAgencyInfo, type Voiture,
} from '@services/supabase/voitures';

function fmtPrice(n: number, currency: string) {
  return new Intl.NumberFormat('fr-FR').format(n) + ' ' + currency;
}

// ─── VoitureCard ──────────────────────────────────────────────────────────────

function VoitureCard({
  v, currency, onContact,
}: {
  v: Voiture; currency: string; onContact: () => void;
}) {
  const cfg = STATUT_CFG[v.statut];
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
      {v.image_principale ? (
        <img src={v.image_principale} alt={`${v.marque} ${v.modele}`} className="w-full h-48 object-cover" />
      ) : (
        <div className="w-full h-48 bg-slate-100 flex items-center justify-center">
          <Car className="w-16 h-16 text-slate-300" />
        </div>
      )}

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-bold text-slate-900 text-base leading-tight">
              {v.marque} {v.modele}
            </h3>
            {v.annee && <p className="text-xs text-slate-500 mt-0.5">{v.annee}</p>}
          </div>
          <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.color}`}>
            {cfg.label}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-slate-600">
          {v.kilometrage != null && (
            <span className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-full">
              <Gauge className="w-3 h-3" />
              {v.kilometrage.toLocaleString('fr-FR')} km
            </span>
          )}
          {v.carburant && (
            <span className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-full">
              <Fuel className="w-3 h-3" />
              {CARBURANT_LABELS[v.carburant]}
            </span>
          )}
          {v.transmission && (
            <span className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-full">
              <Settings2 className="w-3 h-3" />
              {TRANSMISSION_LABELS[v.transmission]}
            </span>
          )}
          {v.couleur && (
            <span className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-full">
              <Palette className="w-3 h-3" />
              {v.couleur}
            </span>
          )}
        </div>

        {v.description && (
          <p className="text-xs text-slate-500 line-clamp-2">{v.description}</p>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <p className="text-lg font-black text-slate-900">{fmtPrice(v.prix, currency)}</p>
          {v.statut === 'disponible' && (
            <button
              onClick={onContact}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors"
            >
              Je suis intéressé <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ContactModal ─────────────────────────────────────────────────────────────

function ContactModal({
  voiture, businessId, onClose,
}: {
  voiture: Voiture | null; businessId: string; onClose: () => void;
}) {
  const [form, setForm] = useState({ nom: '', telephone: '', message: '' });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nom.trim() || !form.telephone.trim()) return;
    setLoading(true);
    try {
      await createLead(businessId, {
        voiture_id: voiture?.id,
        nom: form.nom.trim(),
        telephone: form.telephone.trim(),
        message: form.message.trim() || undefined,
      });
      setDone(true);
    } catch {
      // silent — user can retry
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="font-black text-slate-900 text-base">Prendre contact</h3>
            {voiture && (
              <p className="text-xs text-slate-500 mt-0.5">{voiture.marque} {voiture.modele} {voiture.annee ?? ''}</p>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <Send className="w-6 h-6 text-green-600" />
            </div>
            <p className="font-bold text-slate-900">Message envoyé !</p>
            <p className="text-sm text-slate-500">L'agence vous contactera dans les plus brefs délais.</p>
            <button onClick={onClose} className="mt-2 text-sm text-blue-600 font-medium hover:underline">
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                Votre nom *
              </label>
              <input
                value={form.nom}
                onChange={(e) => setForm(f => ({ ...f, nom: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Prénom et nom"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                Téléphone *
              </label>
              <input
                type="tel"
                value={form.telephone}
                onChange={(e) => setForm(f => ({ ...f, telephone: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="+225 07 00 00 00"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                Message
              </label>
              <textarea
                value={form.message}
                onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={3}
                placeholder="Questions, demande d'essai..."
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Envoyer ma demande
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function VoituresPublicClient() {
  const params = useParams();
  const businessId = params?.businessId as string;

  const [agency, setAgency]     = useState<PublicAgencyInfo | null>(null);
  const [voitures, setVoitures] = useState<Voiture[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [filterStatut, setFilterStatut] = useState<string>('all');
  const [contactVoiture, setContactVoiture] = useState<Voiture | null | 'general'>(null);

  useEffect(() => {
    if (!businessId) return;
    (async () => {
      try {
        const info = await getPublicAgencyInfo(businessId);
        if (!info) { setError('Agence introuvable.'); setLoading(false); return; }
        setAgency(info);
        const list = await getPublicVoitures(info.id);
        setVoitures(list);
      } catch {
        setError('Impossible de charger le catalogue.');
      } finally {
        setLoading(false);
      }
    })();
  }, [businessId]);

  const filtered = voitures.filter((v) => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      v.marque.toLowerCase().includes(q) ||
      v.modele.toLowerCase().includes(q) ||
      (v.couleur?.toLowerCase().includes(q) ?? false) ||
      (v.annee?.toString().includes(q) ?? false);
    const matchStatut = filterStatut === 'all' || v.statut === filterStatut;
    return matchSearch && matchStatut;
  });

  const stats = {
    total:      voitures.length,
    disponible: voitures.filter(v => v.statut === 'disponible').length,
    reserve:    voitures.filter(v => v.statut === 'reserve').length,
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !agency) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-2">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
          <p className="text-slate-600">{error || 'Agence introuvable.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {agency.logo_url ? (
              <img src={agency.logo_url} alt={agency.name} className="w-12 h-12 object-contain rounded-xl border border-slate-200" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <Car className="w-6 h-6 text-blue-600" />
              </div>
            )}
            <div>
              <h1 className="font-black text-slate-900 text-lg leading-tight">{agency.name}</h1>
              <p className="text-xs text-slate-500">Catalogue de véhicules</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 text-xs text-slate-500">
            {agency.phone && (
              <a href={`tel:${agency.phone}`} className="flex items-center gap-1.5 hover:text-blue-600 transition-colors font-medium">
                <Phone className="w-3.5 h-3.5" />
                {agency.phone}
              </a>
            )}
            {agency.address && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                {agency.address}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Véhicules', value: stats.total, color: 'text-slate-700' },
            { label: 'Disponibles', value: stats.disponible, color: 'text-green-600' },
            { label: 'Réservés', value: stats.reserve, color: 'text-amber-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-200 p-4 text-center shadow-sm">
              <p className={`text-2xl font-black ${color}`}>{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Search + filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
              placeholder="Rechercher marque, modèle, couleur..."
            />
          </div>
          <div className="flex gap-2">
            {(['all', 'disponible', 'reserve'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatut(s)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors border ${
                  filterStatut === s
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {s === 'all' ? 'Tous' : s === 'disponible' ? 'Disponible' : 'Réservé'}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Car className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Aucun véhicule trouvé</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((v) => (
              <VoitureCard
                key={v.id}
                v={v}
                currency={agency.currency}
                onContact={() => setContactVoiture(v)}
              />
            ))}
          </div>
        )}

        {/* Contact général */}
        <div className="text-center py-4">
          <button
            onClick={() => setContactVoiture('general')}
            className="text-sm text-blue-600 hover:underline font-medium"
          >
            Vous ne trouvez pas votre véhicule ? Contactez-nous
          </button>
        </div>
      </div>

      {/* Contact modal */}
      {contactVoiture !== null && (
        <ContactModal
          voiture={contactVoiture === 'general' ? null : contactVoiture}
          businessId={agency.id}
          onClose={() => setContactVoiture(null)}
        />
      )}
    </div>
  );
}
