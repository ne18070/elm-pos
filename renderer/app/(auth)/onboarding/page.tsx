'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Store, Utensils, Car, Gavel, Hotel, LayoutGrid,
  ChevronRight, CheckCircle2, Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { trackEvent } from '@/lib/analytics';

const SECTORS = [
  {
    id:    'boutique',
    label: 'Boutique / Retail',
    desc:  'Caisse, stock, catégories',
    icon:  Store,
    color: 'text-status-info',
    bg:    'bg-badge-info',
  },
  {
    id:    'restaurant',
    label: 'Restaurant / Café',
    desc:  'Tables, menu du jour, caisse',
    icon:  Utensils,
    color: 'text-status-warning',
    bg:    'bg-badge-warning',
  },
  {
    id:    'location',
    label: 'Location Véhicules',
    desc:  'Flotte, contrats, clients',
    icon:  Car,
    color: 'text-status-success',
    bg:    'bg-badge-success',
  },
  {
    id:    'juridique',
    label: 'Cabinet Juridique',
    desc:  'Dossiers, honoraires, clients',
    icon:  Gavel,
    color: 'text-status-info',
    bg:    'bg-badge-info',
  },
  {
    id:    'hotel',
    label: 'Hôtel / Hébergement',
    desc:  'Chambres, réservations, check-in',
    icon:  Hotel,
    color: 'text-status-info',
    bg:    'bg-badge-info',
  },
  {
    id:    'autre',
    label: 'Autre activité',
    desc:  'Configuration personnalisée',
    icon:  LayoutGrid,
    color: 'text-content-secondary',
    bg:    'bg-surface-input',
  },
];

export default function OnboardingPage() {
  const [step,         setStep]        = useState<'sector' | 'loading' | 'success'>('sector');
  const [progress,     setProgress]    = useState(0);
  const [loadingText,  setLoadingText] = useState('Configuration...');
  const router = useRouter();

  useEffect(() => { trackEvent('onboarding_started'); }, []);

  async function handleSelectSector(sectorId: string) {
    const bizName = localStorage.getItem('temp_biz_name') || 'Mon Commerce';
    setStep('loading');
    setProgress(10);

    try {
      trackEvent('sector_selected', { sector: sectorId });

      setLoadingText('Création de votre environnement…');
      const { data: bizId, error: bizError } = await supabase.rpc('create_business_v2', {
        p_name: bizName, p_sector: sectorId,
      });
      if (bizError) throw bizError;
      setProgress(40);

      setLoadingText('Activation de votre licence…');
      await supabase.rpc('activate_trial_v2', { p_biz_id: bizId });
      trackEvent('trial_started', { bizId, sector: sectorId });
      setProgress(70);

      setLoadingText('Personnalisation de votre espace…');
      await supabase.rpc('seed_demo_data', { p_biz_id: bizId, p_sector: sectorId });
      trackEvent('provisioning_success', { bizId, sector: sectorId });
      setProgress(100);

      // Transition vers le succès
      setStep('success');
      setLoadingText('Tout est prêt !');
      localStorage.removeItem('temp_biz_name');
      await supabase.auth.refreshSession();

      const { data }: any = await supabase
        .from('businesses')
        .select('features')
        .eq('id', bizId)
        .single();

      const features: string[] = data?.features ?? [];
      const route =
        features.includes('hotel')    ? '/hotel'    :
        features.includes('dossiers') ? '/dossiers' :
        features.includes('contrats') ? '/contrats' :
        '/pos';

      // On laisse l'animation de succès respirer un peu
      setTimeout(() => {
        router.push(`${route}?first_visit=true`);
      }, 1500);

    } catch (err: any) {
      console.error('[Onboarding]', err);
      trackEvent('provisioning_failed', { error: err.message, sector: sectorId });
      alert('Une erreur est survenue. Veuillez réessayer ou contacter le support.');
      setStep('sector');
      setProgress(0);
    }
  }

  /* ── Success ────────────────────────────────────────────────── */
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-500">
        <div className="w-24 h-24 mb-8 bg-badge-success border border-status-success rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(34,197,94,0.3)]">
          <CheckCircle2 className="w-12 h-12 text-status-success animate-in zoom-in spin-in-90 duration-700" />
        </div>
        <h2 className="text-3xl font-black text-content-primary mb-3">C'est prêt !</h2>
        <p className="text-content-secondary text-lg mb-8">Votre espace ELM est configuré et personnalisé.</p>
        <div className="flex items-center gap-3 px-6 py-3 bg-white rounded-2xl border border-surface-border shadow-sm">
          <Loader2 className="w-4 h-4 text-brand-500 animate-spin" />
          <span className="text-sm font-semibold text-content-primary">Redirection vers votre tableau de bord...</span>
        </div>
      </div>
    );
  }

  /* ── Loading ─────────────────────────────────────────────────── */
  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center">
        <div className="relative w-24 h-24 mb-8">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 96 96">
            <circle
              cx="48" cy="48" r="40"
              stroke="currentColor" strokeWidth="5" fill="transparent"
              className="text-surface-border"
            />
            <circle
              cx="48" cy="48" r="40"
              stroke="currentColor" strokeWidth="5" fill="transparent"
              strokeDasharray={251.2}
              strokeDashoffset={251.2 - (251.2 * progress) / 100}
              strokeLinecap="round"
              className="text-brand-500 transition-all duration-500 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <img src="/logo.png" alt="ELM" className="w-10 h-10 object-contain" />
          </div>
        </div>

        <h2 className="text-xl font-bold text-content-primary mb-3">{loadingText}</h2>

        <div className="w-48 h-1 bg-surface-border rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  /* ── Sector picker ───────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center py-12 px-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-badge-info border border-status-info/30 text-status-info text-[10px] font-bold uppercase tracking-widest mb-6">
            Étape 2/2
          </div>
          <h1 className="text-4xl font-black text-content-primary mb-3">
            Quel est votre métier ?
          </h1>
          <p className="text-content-secondary text-lg">
            Nous adaptons l'interface ELM à votre activité.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SECTORS.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSelectSector(s.id)}
              className="flex items-center gap-4 p-6 rounded-2xl border border-surface-border bg-surface-card hover:border-brand-500 hover:shadow-card transition-all text-left group relative overflow-hidden"
            >
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${s.bg} ${s.color} transition-transform group-hover:scale-110`}>
                <s.icon className="w-7 h-7" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-bold text-content-primary group-hover:text-content-brand transition-colors">
                  {s.label}
                </p>
                <p className="text-xs text-content-muted mt-0.5 truncate">{s.desc}</p>
              </div>

              <ChevronRight className="w-5 h-5 text-content-muted group-hover:text-content-brand group-hover:translate-x-0.5 transition-all shrink-0" />

              {/* Barre décorative bas de carte */}
              <div className="absolute bottom-0 left-0 h-0.5 bg-brand-500 transition-all duration-300 w-0 group-hover:w-full" />
            </button>
          ))}
        </div>

        <p className="text-center text-xs text-content-muted mt-12">
          Besoin d'aide ?{' '}
          <a
            href="https://wa.me/221338670000"
            className="text-content-brand hover:underline"
          >
            Contactez-nous sur WhatsApp
          </a>
        </p>
      </div>
    </div>
  );
}
