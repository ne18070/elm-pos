'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Loader2, Eye, EyeOff, CheckCircle2, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Supabase handles the recovery token in the URL fragment automatically
    // when we call updatePassword. But we can check if we have a session.
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        // If no session, the link might be expired or invalid
        // However, some flows might not have a session yet depending on how the URL is handled.
      }
    };
    checkSession();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur('');

    if (password.length < 6) {
      setErreur('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    if (password !== confirmPassword) {
      setErreur('Les mots de passe ne correspondent pas');
      return;
    }

    setChargement(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        setErreur(error.message);
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setErreur("Une erreur inattendue s'est produite");
    } finally {
      setChargement(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Grille de fond */}
      <div
        className="fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-brand-600 rounded-2xl flex items-center justify-center mb-4 shadow-glow">
            <ShoppingCart className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">ELM APP</h1>
          <p className="text-slate-400 text-sm mt-1">Réinitialisation du mot de passe</p>
        </div>

        {/* Carte */}
        <div className="card p-6">
          {success ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              </div>
              <h2 className="text-white font-bold mb-2">Mot de passe mis à jour</h2>
              <p className="text-slate-400 text-sm mb-6">
                Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter.
              </p>
              <button
                onClick={() => router.push('/login')}
                className="btn-primary w-full"
              >
                Retour à la connexion
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-slate-400 text-sm mb-4">
                Veuillez saisir votre nouveau mot de passe ci-dessous.
              </p>

              <div>
                <label htmlFor="password" className="label">Nouveau mot de passe</label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input pr-10"
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="label">Confirmer le mot de passe</label>
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input"
                  required
                />
              </div>

              {erreur && (
                <div className="rounded-xl bg-red-900/30 border border-red-700 px-4 py-3 text-sm text-red-400">
                  {erreur}
                </div>
              )}

              <button
                type="submit"
                disabled={chargement}
                className={cn('btn-primary w-full flex items-center justify-center gap-2 h-11')}
              >
                {chargement && <Loader2 className="w-4 h-4 animate-spin" />}
                {chargement ? 'Mise à jour...' : 'Réinitialiser le mot de passe'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          <button 
            onClick={() => router.push('/login')}
            className="hover:text-slate-400 transition-colors"
          >
            Retour à la connexion
          </button>
        </p>
      </div>
    </div>
  );
}
