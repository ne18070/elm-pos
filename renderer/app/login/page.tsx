'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Loader2, Eye, EyeOff, X, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useSubscriptionStore } from '@/store/subscription';
import { supabase } from '@/lib/supabase';
import { getMyBusinesses } from '@services/supabase/business';
import { getSubscription, getPlans, getPaymentSettings } from '@services/supabase/subscriptions';
import { getCurrentSession } from '@services/supabase/cash-sessions';
import { autoRecordPresence } from '@services/supabase/staff';
import { useCashSessionStore } from '@/store/cashSession';
import { cn } from '@/lib/utils';
import { getDefaultRoute } from '@/lib/getDefaultRoute';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const { setUser, setBusiness, setBusinesses } = useAuthStore();
  const { setSubscription, setPlans, setPaymentSettings, setLoaded } = useSubscriptionStore();
  const { setSession: setCashSession, setLoaded: setCashLoaded } = useCashSessionStore();
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
        setChargement(false); // Réinitialiser ici car erreur
        return;
      }

      if (!data.user) {
        setErreur("Échec de l'authentification");
        setChargement(false); // Réinitialiser ici car erreur
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profileRows, error: profileError } = await (supabase as any)
        .rpc('get_or_create_profile');

      const profile = profileRows?.[0] ?? null;

      if (profileError || !profile) {
        setErreur('Impossible de charger le profil utilisateur');
        setChargement(false); // Réinitialiser ici car erreur
        return;
      }

      if ((profile as { is_blocked?: boolean }).is_blocked) {
        await supabase.auth.signOut();
        setErreur('Votre compte a été bloqué. Contactez votre administrateur.');
        setChargement(false); // Réinitialiser ici car erreur
        return;
      }

      if ((profile as { is_superadmin?: boolean }).is_superadmin) {
        setUser(profile as never);
        setLoaded(true);
        router.replace('/backoffice');
        // On ne met pas setChargement(false) ici car on redirige
        return;
      }

      setUser(profile as never);

      let activeBusiness: { features?: string[] } | null = null;
      if (profile.business_id) {
        const { data: business } = await supabase
          .from('businesses')
          .select('*')
          .eq('id', profile.business_id)
          .single();
        if (business) {
          setBusiness(business as never);
          activeBusiness = business as { features?: string[] };
        }
      }

      // Charger tous les établissements avant la redirection
      try {
        const memberships = await getMyBusinesses();
        setBusinesses(memberships);
        if (!activeBusiness && memberships.length > 0) {
          activeBusiness = memberships[0].business;
        }
      } catch { /* migration pas encore appliquée */ }

      // Charger l'abonnement avant la redirection
      const activeBizId = profile.business_id as string | null;
      if (activeBizId) {
        try {
          const [sub, plans, paySettings, cashSession] = await Promise.all([
            getSubscription(data.user.id, activeBizId),
            getPlans(),
            getPaymentSettings(),
            getCurrentSession(activeBizId),
          ]);
          setSubscription(sub);
          setPlans(plans);
          setPaymentSettings(paySettings);
          setCashSession(cashSession);
        } catch { /* non critique */ }
      }
      setLoaded(true);
      setCashLoaded(true);

      // Pointage automatique si l'utilisateur est lié à un compte staff
      if (activeBizId) {
        autoRecordPresence(activeBizId, data.user.id).catch(() => {});
      }

      router.replace(getDefaultRoute(activeBusiness?.features ?? []));
      // Note: On laisse l'état 'chargement' à true ici car le routeur Next.js
      // est en train de charger la nouvelle page.
    } catch {
      setErreur("Une erreur inattendue s'est produite");
      setChargement(false); // Réinitialiser ici car erreur
    }
  }

  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    if (window.electronAPI?.app?.getVersion) {
      window.electronAPI.app.getVersion().then(setVersion);
    }
  }, []);

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
          <div className="w-40 h-14 bg-white rounded-2xl flex items-center justify-center mb-6 p-3 shadow-2xl overflow-hidden border-2 border-white/20">
            <img src="/logo.png" alt="ELM Logo" className="w-full h-full object-contain" />
          </div>
          <p className="text-content-secondary text-sm mt-1">Connectez-vous à votre compte</p>
          <p className="text-xs text-slate-500 mt-2">
            Pas encore de compte ?{' '}
            <a href="/subscribe" className="text-content-brand hover:text-content-brand transition-colors">
              S&apos;inscrire
            </a>
          </p>
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
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="password" className="label mb-0">Mot de passe</label>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-xs text-content-brand hover:text-content-brand transition-colors"
                >
                  Mot de passe oublié ?
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input pr-10"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-content-secondary hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
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
              {chargement ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        </div>

        {showForgotModal && (
          <ForgotPasswordModal onClose={() => setShowForgotModal(false)} />
        )}

        <div className="text-center mt-8 space-y-2">
          <p className="text-[10px] font-medium text-slate-600 tracking-widest uppercase">
            ELM APP v{version || '1.0.0'}
          </p>
          <p className="text-xs text-slate-700">
            <a href="/privacy" className="hover:text-content-secondary transition-colors">
              Politique de confidentialité
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) throw resetError;
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-sm p-6 relative">
        <button onClick={onClose} className="absolute right-4 top-4 text-slate-500 hover:text-white">
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold text-white mb-2">Mot de passe oublié</h2>
        
        {success ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-6 h-6 text-status-success" />
            </div>
            <p className="text-slate-300 text-sm mb-6">
              Un e-mail de réinitialisation a été envoyé à <strong>{email}</strong>. 
              Veuillez vérifier votre boîte de réception.
            </p>
            <button onClick={onClose} className="btn-primary w-full">Fermer</button>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4 mt-4">
            <p className="text-content-secondary text-sm">
              Saisissez votre adresse e-mail pour recevoir un lien de réinitialisation.
            </p>
            
            <div>
              <label className="label">Adresse e-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
                className="input"
                autoFocus
              />
            </div>

            {error && (
              <div className="text-xs text-status-error bg-badge-error border border-status-error p-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Envoi...' : 'Envoyer le lien'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
