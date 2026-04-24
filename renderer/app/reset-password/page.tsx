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
  const [isActivation, setIsActivation] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Vérifier si c'est une activation de compte (invitation) via l'URL
    const hash = window.location.hash;
    const searchParams = new URLSearchParams(window.location.search);
    if (hash.includes('type=invite') || hash.includes('type=signup') || searchParams.get('type') === 'invite') {
      setIsActivation(true);
    }

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        // En cas d'invitation Supabase, la session est souvent déjà injectée
      }
    };
    checkSession();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur('');

    if (password.length < 8) {
      setErreur('Le mot de passe doit contenir au moins 8 caractères');
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
          <div className="w-64 h-24 bg-white rounded-2xl flex items-center justify-center mb-6 p-3 shadow-2xl overflow-hidden border-2 border-white/20">
            <img src="/logo.png" alt="ELM Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-3xl font-black text-content-primary tracking-tighter">ELM APP</h1>
          <p className="text-content-secondary text-sm mt-1">
            {isActivation ? 'Activation de votre compte' : 'Réinitialisation du mot de passe'}
          </p>
        </div>

        {/* Carte */}
        <div className="card p-6">
          {success ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-6 h-6 text-status-success" />
              </div>
              <h2 className="text-content-primary font-bold mb-2">
                {isActivation ? 'Compte activé !' : 'Mot de passe mis à jour'}
              </h2>
              <p className="text-content-secondary text-sm mb-6">
                {isActivation 
                  ? 'Votre compte est prêt. Vous pouvez maintenant vous connecter à votre interface.'
                  : 'Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter.'}
              </p>
              <button
                onClick={() => router.push('/login')}
                className="btn-primary w-full"
              >
                Aller à la connexion
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-content-secondary text-sm mb-4">
                {isActivation 
                  ? 'Veuillez choisir un mot de passe pour sécuriser votre accès.'
                  : 'Veuillez saisir votre nouveau mot de passe ci-dessous.'}
              </p>

              <div>
                <label htmlFor="password" className="label">
                  {isActivation ? 'Choisissez un mot de passe' : 'Nouveau mot de passe'}
                </label>
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-content-secondary hover:text-content-primary"
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
                <div className="rounded-xl bg-badge-error border border-status-error px-4 py-3 text-sm text-status-error">
                  {erreur}
                </div>
              )}

              <button
                type="submit"
                disabled={chargement}
                className={cn('btn-primary w-full flex items-center justify-center gap-2 h-11')}
              >
                {chargement && <Loader2 className="w-4 h-4 animate-spin" />}
                {chargement ? 'Traitement...' : isActivation ? 'Activer mon compte' : 'Réinitialiser le mot de passe'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-content-muted mt-6">
          <button 
            onClick={() => router.push('/login')}
            className="hover:text-content-secondary transition-colors"
          >
            Retour à la connexion
          </button>
        </p>
      </div>
    </div>
  );
}
