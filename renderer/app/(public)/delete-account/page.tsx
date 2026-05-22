'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type Step = 'form' | 'loading' | 'done' | 'error';

export default function DeleteAccountPage() {
  const [email, setEmail]   = useState('');
  const [reason, setReason] = useState('');
  const [step, setStep]     = useState<Step>('form');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStep('loading');

    const { error } = await supabase
      .from('deletion_requests')
      .insert({ email: email.trim().toLowerCase(), reason: reason.trim() || null });

    if (error) {
      setErrorMsg(error.message);
      setStep('error');
    } else {
      setStep('done');
    }
  }

  return (
    <div className="theme-dark min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-badge-error flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-status-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-content-primary">Suppression de compte</h1>
          <p className="text-sm text-content-secondary mt-2">
            Demandez la suppression de votre compte ELM et de toutes les données associées.
          </p>
        </div>

        {step === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-surface-card rounded-2xl border border-surface-border/30 p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-content-secondary uppercase tracking-widest mb-2">
                  Adresse e-mail *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="votre@email.com"
                  className="w-full bg-surface-input border border-surface-border rounded-xl px-4 py-3 text-content-primary placeholder-content-muted text-sm focus:outline-none focus:border-status-error/50 focus:bg-surface-card transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-content-secondary uppercase tracking-widest mb-2">
                  Motif (optionnel)
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Raison de la suppression..."
                  rows={3}
                  className="w-full bg-surface-input border border-surface-border rounded-xl px-4 py-3 text-content-primary placeholder-content-muted text-sm focus:outline-none focus:border-status-error/50 focus:bg-surface-card transition-colors resize-none"
                />
              </div>
            </div>

            <div className="bg-badge-warning border border-status-warning/20 rounded-xl px-4 py-3 text-xs text-status-warning">
              Cette action est <strong>irréversible</strong>. Toutes vos données (ventes, clients, stock, etc.) seront définitivement supprimées sous 30 jours.
            </div>

            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-black text-sm uppercase tracking-widest transition-colors"
            >
              Envoyer la demande
            </button>
          </form>
        )}

        {step === 'loading' && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-2 border-surface-border border-t-content-primary rounded-full animate-spin mx-auto" />
            <p className="text-content-secondary text-sm mt-4">Traitement en cours…</p>
          </div>
        )}

        {step === 'done' && (
          <div className="bg-surface-card border border-surface-border/30 rounded-2xl p-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-badge-success flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-black text-content-primary">Demande enregistrée</h2>
            <p className="text-sm text-content-secondary">
              Votre demande a été transmise. Votre compte et toutes les données associées seront supprimés dans un délai de <strong className="text-content-primary">30 jours</strong>.
            </p>
            <p className="text-xs text-content-muted mt-2">
              Une confirmation sera envoyée à <span className="text-content-secondary">{email}</span>
            </p>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-4">
            <div className="bg-badge-error border border-status-error/20 rounded-xl px-4 py-3 text-sm text-status-error">
              Une erreur est survenue : {errorMsg}
            </div>
            <button
              onClick={() => setStep('form')}
              className="w-full py-3 rounded-xl border border-surface-border text-content-primary text-sm font-bold hover:bg-surface-card transition-colors"
            >
              Réessayer
            </button>
            <p className="text-center text-xs text-content-muted">
              Ou contactez-nous directement :{' '}
              <a href="mailto:support@elm-app.click" className="text-content-secondary underline">
                support@elm-app.click
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
