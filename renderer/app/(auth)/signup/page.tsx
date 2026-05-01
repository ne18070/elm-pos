'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowRight, CheckCircle, XCircle, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Validation email temps réel
  const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  
  const router = useRouter();

  useEffect(() => {
    if (!email) {
      setEmailStatus('idle');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setEmailStatus('invalid');
      return;
    }

    const timer = setTimeout(async () => {
      setEmailStatus('checking');
      try {
        const { data } = await supabase.rpc('check_email_exists', { p_email: email.trim().toLowerCase() });
        setEmailStatus(data ? 'taken' : 'available');
      } catch {
        setEmailStatus('idle');
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [email]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (emailStatus !== 'available') return;
    
    setLoading(true);
    setError('');

    try {
      const { data, error: signupError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            full_name: email.split('@')[0],
          }
        }
      });

      if (signupError) throw signupError;
      if (!data.user) throw new Error('Erreur lors de la création du compte');

      localStorage.setItem('temp_biz_name', businessName.trim());
      router.push('/onboarding');
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue');
      setLoading(false);
    }
  }

  const isFormValid = businessName.trim() && password.length >= 6 && emailStatus === 'available';

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-4 shadow-xl border border-white/20">
            <img src="/logo.png" alt="ELM Logo" className="w-10 h-10 object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-content-primary">Créez votre espace ELM</h1>
          <p className="text-content-secondary text-sm mt-2">Commencez votre essai gratuit de 7 jours</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-8 space-y-5">
          <div>
            <label className="label">Nom de votre commerce</label>
            <input 
              type="text" 
              required 
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="input" 
              placeholder="Ex: Boutique Horizon" 
            />
          </div>

          <div>
            <label className="label">Email professionnel</label>
            <div className="relative">
              <input 
                type="email" 
                required 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`input pr-10 ${
                    emailStatus === 'taken' || emailStatus === 'invalid' ? 'border-status-error' : 
                    emailStatus === 'available' ? 'border-status-success' : ''
                }`}
                placeholder="nom@exemple.com" 
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {emailStatus === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-content-muted" />}
                {emailStatus === 'available' && <CheckCircle className="w-4 h-4 text-status-success" />}
                {emailStatus === 'taken' && <XCircle className="w-4 h-4 text-status-error" />}
                {emailStatus === 'invalid' && <Mail className="w-4 h-4 text-content-muted" />}
              </div>
            </div>
            {emailStatus === 'taken' && <p className="text-[10px] text-status-error mt-1">Cet email est déjà utilisé.</p>}
            {emailStatus === 'invalid' && email.length > 5 && <p className="text-[10px] text-status-error mt-1">Format d'email invalide.</p>}
          </div>

          <div>
            <label className="label">Mot de passe</label>
            <input 
              type="password" 
              required 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input" 
              placeholder="••••••••" 
              minLength={6}
            />
          </div>

          {error && (
            <div className="p-3 bg-status-error/10 border border-status-error/20 rounded-lg text-status-error text-xs">
              {error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={!isFormValid || loading}
            className={`btn-primary w-full h-12 flex items-center justify-center gap-2 ${!isFormValid ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <>
                Suivant <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <p className="text-center text-xs text-content-muted mt-6">
          Déjà un compte ?{' '}
          <a href="/login" className="text-content-brand font-semibold hover:underline">
            Se connecter
          </a>
        </p>
      </div>
    </div>
  );
}
