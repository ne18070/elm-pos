'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';
import { supabase } from '@/lib/supabase';
import { getMyBusinesses } from '@services/supabase/business';
import { getSubscription, getPlans, getPaymentSettings } from '@services/supabase/subscriptions';
import { cn } from '@/lib/utils';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);

  const { setUser, setBusiness, setBusinesses } = useAuthStore();
  const { setSubscription, setPlans, setPaymentSettings, setLoaded } = useSubscriptionStore();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur('');
    setChargement(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError) {
        setErreur(authError.message);
        return;
      }

      if (!data.user) {
        setErreur("Échec de l'authentification");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profileError || !profile) {
        setErreur('Impossible de charger le profil utilisateur');
        return;
      }

      if ((profile as { is_blocked?: boolean }).is_blocked) {
        await supabase.auth.signOut();
        setErreur('Votre compte a été bloqué. Contactez votre administrateur.');
        return;
      }

      setUser(profile as never);

      if (profile.business_id) {
        const { data: business } = await supabase
          .from('businesses')
          .select('*')
          .eq('id', profile.business_id)
          .single();
        if (business) setBusiness(business as never);
      }

      // Charger tous les établissements avant la redirection
      try {
        const memberships = await getMyBusinesses();
        setBusinesses(memberships);
      } catch { /* migration pas encore appliquée */ }

      // Charger l'abonnement avant la redirection (auth-provider ne re-tourne pas après login)
      const activeBizId = profile.business_id as string | null;
      if (activeBizId) {
        try {
          const [sub, plans, paySettings] = await Promise.all([
            getSubscription(activeBizId),
            getPlans(),
            getPaymentSettings(),
          ]);
          setSubscription(sub);
          setPlans(plans);
          setPaymentSettings(paySettings);
        } catch { /* non critique */ }
      }
      setLoaded(true);

      router.replace('/pos');
    } catch {
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
          <h1 className="text-2xl font-bold text-white">Elm POS</h1>
          <p className="text-slate-400 text-sm mt-1">Connectez-vous à votre compte</p>
        </div>

        {/* Carte */}
        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="label">Adresse e-mail</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
                className="input"
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="password" className="label">Mot de passe</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input"
                required
                autoComplete="current-password"
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
              {chargement ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          Elm POS — Caisse multi-établissements
        </p>
      </div>
    </div>
  );
}
