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
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-white">Suppression de compte</h1>
          <p className="text-sm text-gray-400 mt-2">
            Demandez la suppression de votre compte ELM et de toutes les données associées.
          </p>
        </div>

        {step === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-white/5 rounded-2xl border border-white/10 p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
                  Adresse e-mail *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="votre@email.com"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-red-500/50 focus:bg-white/8 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
                  Motif (optionnel)
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Raison de la suppression..."
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-red-500/50 focus:bg-white/8 transition-colors resize-none"
                />
              </div>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 text-xs text-yellow-300">
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
            <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto" />
            <p className="text-gray-400 text-sm mt-4">Traitement en cours…</p>
          </div>
        )}

        {step === 'done' && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-black text-white">Demande enregistrée</h2>
            <p className="text-sm text-gray-400">
              Votre demande a été transmise. Votre compte et toutes les données associées seront supprimés dans un délai de <strong className="text-white">30 jours</strong>.
            </p>
            <p className="text-xs text-gray-600 mt-2">
              Une confirmation sera envoyée à <span className="text-gray-400">{email}</span>
            </p>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-4">
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-300">
              Une erreur est survenue : {errorMsg}
            </div>
            <button
              onClick={() => setStep('form')}
              className="w-full py-3 rounded-xl border border-white/10 text-white text-sm font-bold hover:bg-white/5 transition-colors"
            >
              Réessayer
            </button>
            <p className="text-center text-xs text-gray-500">
              Ou contactez-nous directement :{' '}
              <a href="mailto:support@elm-app.click" className="text-gray-400 underline">
                support@elm-app.click
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
