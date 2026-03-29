'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  href: string;
  done: boolean;
}

const DISMISS_KEY = (bizId: string) => `onboarding_dismissed_${bizId}`;

export function useOnboarding(businessId: string | undefined, businessType?: string) {
  const [steps, setSteps]         = useState<OnboardingStep[]>([]);
  const [loading, setLoading]     = useState(true);
  const [dismissed, setDismissed] = useState(false);

  const check = useCallback(async () => {
    if (!businessId) return;

    // Déjà fermé par l'utilisateur ?
    if (localStorage.getItem(DISMISS_KEY(businessId)) === '1') {
      setDismissed(true);
      setLoading(false);
      return;
    }

    const db = supabase as any;
    const printerConfigured = !!localStorage.getItem('printer_config');

    let newSteps: OnboardingStep[];

    if (businessType === 'hotel') {
      const [
        { count: roomCount },
        { count: guestCount },
        { count: resCount },
        { count: userCount },
      ] = await Promise.all([
        db.from('hotel_rooms').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
        db.from('hotel_guests').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
        db.from('hotel_reservations').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
        db.from('users').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
      ]);

      newSteps = [
        {
          id: 'rooms',
          label: 'Ajouter vos chambres',
          description: 'Configurez les chambres de votre établissement avec leurs tarifs.',
          href: '/hotel',
          done: (roomCount ?? 0) > 0,
        },
        {
          id: 'guest',
          label: 'Enregistrer un client',
          description: 'Créez votre premier profil client dans la gestion hôtelière.',
          href: '/hotel',
          done: (guestCount ?? 0) > 0,
        },
        {
          id: 'reservation',
          label: 'Créer une réservation',
          description: 'Effectuez votre première réservation de chambre.',
          href: '/hotel',
          done: (resCount ?? 0) > 0,
        },
        {
          id: 'printer',
          label: "Configurer l'imprimante",
          description: 'Connectez votre imprimante thermique pour imprimer les reçus.',
          href: '/settings',
          done: printerConfigured,
        },
        {
          id: 'team',
          label: 'Inviter votre équipe',
          description: 'Ajoutez vos réceptionnistes et collaborateurs.',
          href: '/admin',
          done: (userCount ?? 0) > 1,
        },
      ];
    } else {
      const [
        { count: catCount },
        { count: prodCount },
        { count: orderCount },
        { count: userCount },
      ] = await Promise.all([
        db.from('categories').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
        db.from('products').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
        db.from('orders').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'paid'),
        db.from('users').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
      ]);

      newSteps = [
        {
          id: 'categories',
          label: 'Créer une catégorie',
          description: 'Organisez vos produits par catégories (ex : Boissons, Snacks…).',
          href: '/categories',
          done: (catCount ?? 0) > 0,
        },
        {
          id: 'products',
          label: 'Ajouter vos produits',
          description: 'Ajoutez les articles que vous vendez avec leurs prix et stocks.',
          href: '/products',
          done: (prodCount ?? 0) > 0,
        },
        {
          id: 'printer',
          label: "Configurer l'imprimante",
          description: 'Connectez votre imprimante thermique pour imprimer les reçus.',
          href: '/settings',
          done: printerConfigured,
        },
        {
          id: 'team',
          label: 'Inviter votre équipe',
          description: 'Ajoutez vos caissiers et collaborateurs.',
          href: '/admin',
          done: (userCount ?? 0) > 1,
        },
        {
          id: 'first_sale',
          label: 'Effectuer votre première vente',
          description: 'Allez sur la page Caisse et encaissez votre premier client.',
          href: '/pos',
          done: (orderCount ?? 0) > 0,
        },
      ];
    }

    setSteps(newSteps);
    setLoading(false);
  }, [businessId, businessType]);

  useEffect(() => { check(); }, [check]);

  function dismiss() {
    if (!businessId) return;
    localStorage.setItem(DISMISS_KEY(businessId), '1');
    setDismissed(true);
  }

  const doneCount  = steps.filter((s) => s.done).length;
  const allDone    = steps.length > 0 && doneCount === steps.length;
  const show       = !dismissed && !loading && !allDone && steps.length > 0;

  return { steps, loading, dismissed, allDone, doneCount, show, dismiss, refetch: check };
}
