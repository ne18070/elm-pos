'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  Calendar,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  Scale,
} from 'lucide-react';
import {
  createPublicLegalAppointment,
  getPublicLegalInfo,
  type PublicLegalInfo,
} from '@services/supabase/legal-public';

const TODAY = new Date().toISOString().slice(0, 10);

export default function JuridiqueClient() {
  const { businessId } = useParams<{ businessId: string }>();
  const router = useRouter();

  const [info, setInfo] = useState<PublicLegalInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    client_name: '',
    client_phone: '',
    client_email: '',
    subject: '',
    preferred_date: TODAY,
    notes: '',
  });

  useEffect(() => {
    if (!businessId) return;
    getPublicLegalInfo(businessId)
      .then((data) => {
        if (!data) setLoadErr("Ce cabinet n'existe pas.");
        else setInfo(data);
      })
      .catch(() => setLoadErr('Impossible de charger la page publique.'))
      .finally(() => setLoading(false));
  }, [businessId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!info) return;

    setSubmitting(true);
    setSubmitErr(null);
    try {
      const result = await createPublicLegalAppointment({
        business_id: info.id,
        client_name: form.client_name.trim(),
        client_phone: form.client_phone.trim(),
        client_email: form.client_email.trim() || undefined,
        subject: form.subject.trim(),
        preferred_date: form.preferred_date,
        notes: form.notes.trim() || undefined,
      });
      router.push(`/juridique/${businessId}/confirmation/${result.reference}`);
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : 'Impossible de creer le rendez-vous.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-brand-600" />
      </div>
    );
  }

  if (loadErr || !info) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="bg-surface-card rounded-2xl border border-surface-border p-8 text-center max-w-sm w-full space-y-4">
          <AlertCircle className="w-12 h-12 text-status-error mx-auto" />
          <p className="font-semibold text-content-primary">{loadErr ?? 'Cabinet introuvable'}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 rounded-xl bg-brand-600 text-content-primary font-semibold text-sm hover:bg-brand-500 transition-colors"
          >
            Reessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface pb-24">
      <header className="bg-surface-card border-b border-surface-border shadow-sm sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-white border border-surface-border overflow-hidden shrink-0">
              {info.logo_url ? (
                <img src={info.logo_url} alt={info.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-brand-600 flex items-center justify-center">
                  <Scale className="w-5 h-5 text-content-primary" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-content-primary truncate">{info.name}</h1>
              {info.address && (
                <p className="text-xs text-content-secondary truncate flex items-center gap-1">
                  <MapPin className="w-3 h-3 shrink-0" />{info.address}
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
        <div className="bg-gradient-to-br from-brand-600 to-brand-700 rounded-2xl p-5 text-content-primary space-y-1">
          <h2 className="font-black text-xl">Prendre un rendez-vous juridique</h2>
          <p className="text-brand-100 text-sm">
            Envoyez votre demande au cabinet et indiquez la date qui vous convient.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-surface-card rounded-2xl border border-surface-border p-5 space-y-4">
          <h3 className="font-semibold text-content-primary text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-brand-500" />
            Votre demande
          </h3>

          <div>
            <label className="text-xs text-content-primary font-medium block mb-1">Nom complet *</label>
            <input
              type="text"
              value={form.client_name}
              onChange={(e) => setForm((p) => ({ ...p, client_name: e.target.value }))}
              className="w-full border border-surface-border bg-surface-input rounded-xl px-3 py-2.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-400"
              placeholder="Ex: Amadou Diallo"
              required
            />
          </div>

          <div>
            <label className="text-xs text-content-primary font-medium block mb-1">
              <span className="flex items-center gap-1"><Phone className="w-3 h-3" />Numero WhatsApp *</span>
            </label>
            <input
              type="tel"
              value={form.client_phone}
              onChange={(e) => setForm((p) => ({ ...p, client_phone: e.target.value }))}
              className="w-full border border-surface-border bg-surface-input rounded-xl px-3 py-2.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-400"
              placeholder="+221 77 000 00 00"
              required
            />
          </div>

          <div>
            <label className="text-xs text-content-primary font-medium block mb-1">Email</label>
            <input
              type="email"
              value={form.client_email}
              onChange={(e) => setForm((p) => ({ ...p, client_email: e.target.value }))}
              className="w-full border border-surface-border bg-surface-input rounded-xl px-3 py-2.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-400"
              placeholder="email@exemple.com"
            />
          </div>

          <div>
            <label className="text-xs text-content-primary font-medium block mb-1">Motif / type d'affaire *</label>
            <input
              type="text"
              value={form.subject}
              onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
              className="w-full border border-surface-border bg-surface-input rounded-xl px-3 py-2.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-400"
              placeholder="Ex: Consultation, contrat, litige..."
              required
            />
          </div>

          <div>
            <label className="text-xs text-content-primary font-medium block mb-1">Date souhaitee *</label>
            <input
              type="date"
              min={TODAY}
              value={form.preferred_date}
              onChange={(e) => setForm((p) => ({ ...p, preferred_date: e.target.value }))}
              className="w-full border border-surface-border bg-surface-input rounded-xl px-3 py-2.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-400"
              required
            />
          </div>

          <div>
            <label className="text-xs text-content-primary font-medium block mb-1">Notes</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              className="w-full border border-surface-border bg-surface-input rounded-xl px-3 py-2.5 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
              placeholder="Decrivez brievement votre besoin..."
            />
          </div>

          {submitErr && (
            <div className="bg-badge-error border border-status-error/30 rounded-xl p-3 text-sm text-status-error flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {submitErr}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !form.client_name.trim() || !form.client_phone.trim() || !form.subject.trim()}
            className="w-full py-3.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-content-primary font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
            Envoyer la demande de rendez-vous
          </button>
        </form>

      </main>

      {info.phone && (
        <a
          href={`https://wa.me/${info.phone.replace(/[^0-9]/g, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-5 right-5 z-20 flex items-center gap-2 rounded-full bg-brand-600 px-4 py-3 text-sm font-semibold text-content-primary shadow-xl shadow-brand-600/30 transition-colors hover:bg-brand-500"
          aria-label="Contacter le cabinet sur WhatsApp"
          title="Contacter le cabinet sur WhatsApp"
        >
          <MessageCircle className="h-4 w-4" />
          WhatsApp
        </a>
      )}
    </div>
  );
}
