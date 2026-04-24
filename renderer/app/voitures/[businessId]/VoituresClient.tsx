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

const CURRENCY_LABEL: Record<string, string> = { XOF: 'FCFA', XAF: 'FCFA' };

function fmtPrice(n: number, currency: string) {
  const label = CURRENCY_LABEL[currency] ?? currency;
  return new Intl.NumberFormat('fr-FR').format(n) + ' ' + label;
}

// ─── VoitureCard ──────────────────────────────────────────────────────────────

function VoitureCard({
  v, currency, onContact,
}: {
  v: Voiture; currency: string; onContact: () => void;
}) {
  const cfg = STATUT_CFG[v.statut];
  return (
    <div className="bg-surface-card rounded-2xl shadow-sm border border-surface-border overflow-hidden hover:shadow-md transition-shadow">
      {v.image_principale ? (
        <img src={v.image_principale} alt={`${v.marque} ${v.modele}`} className="w-full h-48 object-cover" />
      ) : (
        <div className="w-full h-48 bg-surface-input flex items-center justify-center">
          <Car className="w-16 h-16 text-content-muted" />
        </div>
      )}

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-bold text-content-primary text-base leading-tight">
              {v.marque} {v.modele}
            </h3>
            {v.annee && <p className="text-xs text-content-secondary mt-0.5">{v.annee}</p>}
          </div>
          <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.color}`}>
            {cfg.label}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 text-xs text-content-secondary">
          {v.kilometrage != null && (
            <span className="flex items-center gap-1 bg-surface-input border border-surface-border px-2 py-0.5 rounded-full">
              <Gauge className="w-3 h-3" />
              {v.kilometrage.toLocaleString('fr-FR')} km
            </span>
          )}
          {v.carburant && (
            <span className="flex items-center gap-1 bg-surface-input border border-surface-border px-2 py-0.5 rounded-full">
              <Fuel className="w-3 h-3" />
              {CARBURANT_LABELS[v.carburant]}
            </span>
          )}
          {v.transmission && (
            <span className="flex items-center gap-1 bg-surface-input border border-surface-border px-2 py-0.5 rounded-full">
              <Settings2 className="w-3 h-3" />
              {TRANSMISSION_LABELS[v.transmission]}
            </span>
          )}
          {v.couleur && (
            <span className="flex items-center gap-1 bg-surface-input border border-surface-border px-2 py-0.5 rounded-full">
              <Palette className="w-3 h-3" />
              {v.couleur}
            </span>
          )}
        </div>

        {v.description && (
          <p className="text-xs text-content-secondary line-clamp-2">{v.description}</p>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-surface-border">
          <p className="text-lg font-black text-content-primary">{fmtPrice(v.prix, currency)}</p>
          {v.statut === 'disponible' && (
            <button
              onClick={onContact}
              className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors"
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
        nom:        form.nom.trim(),
        telephone:  form.telephone.trim(),
        message:    form.message.trim() || undefined,
      });
      setDone(true);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-card rounded-2xl w-full max-w-md shadow-2xl border border-surface-border">
        <div className="flex items-center justify-between p-5 border-b border-surface-border">
          <div>
            <h3 className="font-black text-content-primary text-base">Prendre contact</h3>
            {voiture && (
              <p className="text-xs text-content-secondary mt-0.5">
                {voiture.marque} {voiture.modele} {voiture.annee ?? ''}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-surface-hover text-content-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-badge-success flex items-center justify-center mx-auto">
              <Send className="w-6 h-6 text-status-success" />
            </div>
            <p className="font-bold text-content-primary">Message envoyé !</p>
            <p className="text-sm text-content-secondary">L'agence vous contactera dans les plus brefs délais.</p>
            <button onClick={onClose} className="mt-2 text-sm text-content-brand font-medium hover:underline">
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-content-muted mb-1.5 uppercase tracking-wide">
                Votre nom *
              </label>
              <input
                value={form.nom}
                onChange={(e) => setForm(f => ({ ...f, nom: e.target.value }))}
                className="w-full bg-surface-input border border-surface-border rounded-xl px-3 py-2.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Prénom et nom"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-content-muted mb-1.5 uppercase tracking-wide">
                Téléphone *
              </label>
              <input
                type="tel"
                value={form.telephone}
                onChange={(e) => setForm(f => ({ ...f, telephone: e.target.value }))}
                className="w-full bg-surface-input border border-surface-border rounded-xl px-3 py-2.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="+221 07 00 00 00"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-content-muted mb-1.5 uppercase tracking-wide">
                Message
              </label>
              <textarea
                value={form.message}
                onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))}
                className="w-full bg-surface-input border border-surface-border rounded-xl px-3 py-2.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                rows={3}
                placeholder="Questions, demande d'essai..."
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors"
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
  const params     = useParams();
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
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-content-muted" />
      </div>
    );
  }

  if (error || !agency) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center space-y-2">
          <AlertCircle className="w-10 h-10 text-status-error mx-auto" />
          <p className="text-content-secondary">{error || 'Agence introuvable.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface pb-16">

      {/* Header */}
      <header className="bg-surface-card border-b border-surface-border shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-surface-hover border border-surface-border overflow-hidden shrink-0">
              {agency.logo_url ? (
                <img src={agency.logo_url} alt={agency.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-brand-600 flex items-center justify-center">
                  <Car className="w-5 h-5 text-white" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-content-primary text-base truncate">{agency.name}</h1>
              <div className="flex items-center gap-3 text-xs text-content-secondary">
                {agency.phone && (
                  <a href={`tel:${agency.phone}`} className="flex items-center gap-1 hover:text-content-brand transition-colors">
                    <Phone className="w-3 h-3 shrink-0" />{agency.phone}
                  </a>
                )}
                {agency.address && (
                  <span className="hidden sm:flex items-center gap-1 truncate">
                    <MapPin className="w-3 h-3 shrink-0" />{agency.address}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-white border border-surface-border flex items-center justify-center p-1 shrink-0">
            <img src="/logo.png" alt="ELM APP" className="w-full h-full object-contain" />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* Hero */}
        <div className="bg-gradient-to-br from-brand-600 to-brand-700 rounded-2xl p-5 text-white space-y-1">
          <h2 className="font-black text-xl">Catalogue de véhicules</h2>
          <p className="text-brand-100 text-sm">{stats.disponible} véhicule{stats.disponible > 1 ? 's' : ''} disponible{stats.disponible > 1 ? 's' : ''} · {stats.total} au total</p>
        </div>

        {/* Search + filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-surface-card border border-surface-border rounded-xl text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500"
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
                    ? 'bg-brand-500 text-white border-brand-500'
                    : 'bg-surface-card text-content-secondary border-surface-border hover:border-surface-hover'
                }`}
              >
                {s === 'all' ? 'Tous' : s === 'disponible' ? 'Disponible' : 'Réservé'}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-content-muted">
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
            className="text-sm text-content-brand hover:underline font-medium"
          >
            Vous ne trouvez pas votre véhicule ? Contactez-nous
          </button>
        </div>
      </main>

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
