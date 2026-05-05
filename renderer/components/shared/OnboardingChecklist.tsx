'use client';

import Link from 'next/link';
import {
  CheckCircle2, ChevronRight, X, Rocket, Sparkles,
  Tag, Package, Printer, Users, ShoppingCart,
  Building2, UserPlus, CalendarDays,
  FolderOpen, Receipt, Car,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useAuthStore } from '@/store/auth';
import { VisualTour, TourStep } from './VisualTour';
import { useSearchParams } from 'next/navigation';

const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  categories:  Tag,
  products:    Package,
  printer:     Printer,
  team:        Users,
  first_sale:  ShoppingCart,
  rooms:       Building2,
  guest:       UserPlus,
  reservation: CalendarDays,
  // juridique
  client:      UserPlus,
  dossier:     FolderOpen,
  honoraires:  Receipt,
  // location
  vehicles:    Car,
  contract:    Receipt,
};

const TOUR_STEPS_BY_TYPE: Record<string, TourStep[]> = {
  restaurant: [
    { id: 'welcome', title: 'Bienvenue Chef ! 👨‍🍳', content: 'ELM APP va transformer la gestion de votre restaurant. Suivez ce guide pour être prêt pour votre premier service.', position: 'center' },
    { id: 'checklist', title: 'Plan de mise en place', content: 'Commencez par configurer votre menu du jour et vos catégories pour simplifier la prise de commande.', selector: '#onboarding-checklist', position: 'bottom' },
    { id: 'sidebar', title: 'Navigation Cuisine & Salle', content: 'Accédez rapidement au suivi des commandes et à vos rapports de fin de service.', selector: '#sidebar-nav', position: 'right' },
    { id: 'search', title: 'Prise de commande éclair', content: 'Recherchez vos plats ou boissons ici pour les ajouter instantanément à une table.', selector: '#pos-search', position: 'bottom' },
  ],
  juridique: [
    { id: 'welcome', title: 'Bienvenue Maître ! ⚖️', content: 'Votre cabinet dispose maintenant d\'un outil puissant pour gérer dossiers, délais et honoraires.', position: 'center' },
    { id: 'checklist', title: 'Configuration du Cabinet', content: 'Suivez ces étapes pour importer vos premiers dossiers et configurer vos types d\'affaires.', selector: '#onboarding-checklist', position: 'bottom' },
    { id: 'sidebar', title: 'Vos Outils Juridiques', content: 'Retrouvez ici la gestion des dossiers, le suivi du temps et la facturation des honoraires.', selector: '#sidebar-nav', position: 'right' },
    { id: 'nav-dossiers', title: 'Gestion des Dossiers', content: 'C\'est ici que vous centralisez toutes les informations, pièces et procédures de vos clients.', selector: '#nav-item-dossiers', position: 'right' },
  ],
  location: [
    { id: 'welcome', title: 'Bienvenue ! 🚗', content: 'Optimisez la gestion de votre flotte et simplifiez la création de vos contrats de location.', position: 'center' },
    { id: 'checklist', title: 'Mise en route de la flotte', content: 'Ajoutez vos véhicules et configurez vos modèles de contrats pour gagner du temps.', selector: '#onboarding-checklist', position: 'bottom' },
    { id: 'sidebar', title: 'Gestion Locative', content: 'Accédez à votre parc automobile, vos contrats en cours et vos suivis de paiements.', selector: '#sidebar-nav', position: 'right' },
    { id: 'nav-vehicules', title: 'Votre Flotte', content: 'Suivez la disponibilité de chaque véhicule et gérez les entretiens en un clin d\'œil.', selector: '#nav-item-voitures', position: 'right' },
  ],
  hotel: [
    { id: 'welcome', title: 'Bienvenue ! 🏨', content: 'Gérez vos chambres, réservations et check-ins en toute simplicité.', position: 'center' },
    { id: 'checklist', title: 'Configuration de l\'Hôtel', content: 'Définissez vos types de chambres et commencez à enregistrer vos premières réservations.', selector: '#onboarding-checklist', position: 'bottom' },
    { id: 'sidebar', title: 'Espace Réception', content: 'Le calendrier des réservations et la gestion des clients sont à portée de clic.', selector: '#sidebar-nav', position: 'right' },
    { id: 'nav-hotel', title: 'Planning des Chambres', content: 'Visualisez d\'un coup d\'œil l\'occupation de votre établissement et les départs prévus.', selector: '#nav-item-hotel', position: 'right' },
  ],
  retail: [
    { id: 'welcome', title: 'Bienvenue ! 🛍️', content: 'ELM APP vous aide à piloter votre boutique, vos stocks et vos ventes au quotidien.', position: 'center' },
    { id: 'checklist', title: 'Préparation du magasin', content: 'Importez vos produits et configurez vos alertes de stock pour ne jamais être en rupture.', selector: '#onboarding-checklist', position: 'bottom' },
    { id: 'sidebar', title: 'Gestion Magasin', content: 'Tout pour vos stocks, vos clients et vos rapports de ventes est regroupé ici.', selector: '#sidebar-nav', position: 'right' },
    { id: 'search', title: 'Vente Rapide', content: 'Scannez un code-barres ou cherchez un produit pour encaisser vos clients en quelques secondes.', selector: '#pos-search', position: 'bottom' },
  ]
};

export function OnboardingChecklist() {
  const { business } = useAuthStore();
  const sector = (business as any)?.industry_sector || business?.type || 'retail';
  const effectiveSector = sector === 'boutique' ? 'retail' : sector;
  
  const { steps, doneCount, show, dismiss } = useOnboarding(business?.id, business?.type, (business as any)?.industry_sector);
  const searchParams = useSearchParams();
  const [startTour, setStartTour] = useState(false);

  useEffect(() => {
    if (searchParams.get('first_visit') === 'true' && show) {
      setStartTour(true);
    }
  }, [searchParams, show]);

  if (!show) return null;

  const progress  = Math.round((doneCount / steps.length) * 100);
  const nextStep  = steps.find((s) => !s.done);
  const tourSteps = TOUR_STEPS_BY_TYPE[effectiveSector] || TOUR_STEPS_BY_TYPE.retail;

  return (
    <div id="onboarding-checklist" className="card border border-brand-800/50 overflow-hidden relative">
      <VisualTour 
        tourId="onboarding" 
        steps={tourSteps} 
        autoStart={startTour} 
        onComplete={() => setStartTour(false)}
        onDismiss={() => setStartTour(false)}
      />

      {/* Header */}
      <div className="px-5 py-4 flex items-start justify-between gap-4 bg-brand-950/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center shrink-0">
            <Rocket className="w-4 h-4 text-content-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-content-primary text-sm">Configurez votre espace</p>
              <button 
                onClick={() => setStartTour(true)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-brand-500/10 text-[10px] font-bold text-content-brand border border-brand-500/20 hover:bg-brand-500/20 transition-colors"
              >
                <Sparkles className="w-2.5 h-2.5" /> Guide
              </button>
            </div>
            <p className="text-xs text-content-brand mt-0.5 font-medium">
              {doneCount}/{steps.length} étapes · {progress}%
            </p>
          </div>
        </div>
        <button
          onClick={dismiss}
          title="Ne plus afficher"
          className="text-content-muted hover:text-content-primary transition-colors mt-0.5 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-surface-input">
        <div
          className="h-full bg-gradient-to-r from-brand-600 to-brand-400 transition-all duration-700"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Steps */}
      <div className="px-5 py-4 space-y-0">
        {steps.map((step, index) => {
          const Icon      = STEP_ICONS[step.id] ?? ChevronRight;
          const isActive  = step.id === nextStep?.id;
          const isLast    = index === steps.length - 1;

          return (
            <div key={step.id} className="flex gap-3">

              {/* Timeline column */}
              <div className="flex flex-col items-center shrink-0 w-7">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300
                  ${step.done
                    ? 'bg-green-500/15 border border-green-500/40 text-status-success'
                    : isActive
                      ? 'bg-brand-600 border border-brand-400 text-content-primary shadow-[0_0_14px_rgba(37,99,235,0.45)]'
                      : 'bg-surface-input border border-surface-border text-content-muted'}`}
                >
                  {step.done
                    ? <CheckCircle2 className="w-3.5 h-3.5" />
                    : index + 1}
                </div>
                {!isLast && (
                  <div className={`w-px flex-1 my-1 min-h-[12px] ${step.done ? 'bg-green-500/25' : 'bg-surface-border'}`} />
                )}
              </div>

              {/* Content column */}
              <div className={`flex-1 min-w-0 ${!isLast ? 'pb-1' : ''}`}>
                {isActive ? (
                  /* Active step — expanded card */
                  <div className="bg-brand-950/50 border border-brand-800/60 rounded-xl p-3.5 mb-1.5">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-3.5 h-3.5 text-content-brand shrink-0" />
                      <p className="text-sm font-semibold text-content-primary">{step.label}</p>
                    </div>
                    <p className="text-xs text-content-secondary leading-relaxed mb-3">
                      {step.description}
                    </p>
                    <Link
                      href={step.href}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-content-primary text-xs font-semibold rounded-lg transition-colors"
                    >
                      Commencer <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                ) : (
                  /* Done or pending step — collapsed row */
                  <div className={`flex items-center gap-2 py-2 ${step.done ? 'opacity-45' : ''}`}>
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${step.done ? 'text-status-success' : 'text-content-muted'}`} />
                    <p className={`text-sm ${step.done ? 'line-through text-content-muted' : 'text-content-muted'}`}>
                      {step.label}
                    </p>
                  </div>
                )}
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
