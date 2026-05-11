'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const DATA_TYPES = [
  { id: 'clients',    label: 'Base clients',              description: 'Noms, téléphones, historique' },
  { id: 'orders',     label: 'Commandes & ventes',        description: 'Historique des transactions' },
  { id: 'stock',      label: 'Stock & produits',          description: 'Catalogue et inventaire' },
  { id: 'contracts',  label: 'Contrats & locations',      description: 'Contrats et véhicules' },
  { id: 'services',   label: 'Ordres de travail',         description: 'Prestations et interventions' },
  { id: 'dossiers',   label: 'Dossiers juridiques',       description: 'Affaires et honoraires' },
  { id: 'staff',      label: 'Données d\'équipe',         description: 'Membres et historique d\'activité' },
];

type Step = 'form' | 'loading' | 'done' | 'error';

export default function DeleteDataPage() {
  const [email, setEmail]       = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason]     = useState('');
  const [step, setStep]         = useState<Step>('form');
  const [errorMsg, setErrorMsg] = useState('');

  function toggle(id: string) {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || selected.length === 0) return;
    setStep('loading');

    const { error } = await supabase
      .from('deletion_requests')
      .insert({
        email:      email.trim().toLowerCase(),
        type:       'data',
        data_types: selected,
        reason:     reason.trim() || null,
      });

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
          <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-white">Suppression de données</h1>
          <p className="text-sm text-gray-400 mt-2">
            Demandez la suppression de certaines de vos données sans supprimer votre compte.
          </p>
        </div>

        {step === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-white/5 rounded-2xl border border-white/10 p-5 space-y-4">
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
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-orange-500/50 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                  Données à supprimer *
                </label>
                <div className="space-y-2">
                  {DATA_TYPES.map(dt => (
                    <label
                      key={dt.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        selected.includes(dt.id)
                          ? 'border-orange-500/50 bg-orange-500/10'
                          : 'border-white/10 bg-white/3 hover:bg-white/5'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(dt.id)}
                        onChange={() => toggle(dt.id)}
                        className="sr-only"
                      />
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        selected.includes(dt.id) ? 'bg-orange-500 border-orange-500' : 'border-gray-600'
                      }`}>
                        {selected.includes(dt.id) && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">{dt.label}</p>
                        <p className="text-[11px] text-gray-500">{dt.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
                  Motif (optionnel)
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Raison de la demande..."
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-orange-500/50 transition-colors resize-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={selected.length === 0 || !email.trim()}
              className="w-full py-3.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm uppercase tracking-widest transition-colors"
            >
              Envoyer la demande
            </button>

            <p className="text-center text-xs text-gray-600">
              Pour supprimer votre compte entier,{' '}
              <a href="/delete-account" className="text-gray-400 underline">cliquez ici</a>
            </p>
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
              Les données sélectionnées seront supprimées dans un délai de <strong className="text-white">30 jours</strong>. Votre compte reste actif.
            </p>
            <p className="text-xs text-gray-600 mt-2">
              Confirmation envoyée à <span className="text-gray-400">{email}</span>
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
              Ou contactez-nous :{' '}
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
