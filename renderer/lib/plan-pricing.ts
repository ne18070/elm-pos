import type { Plan } from '@services/supabase/subscriptions';

/**
 * Affichage des offres d'abonnement (landing /#tarifs, /subscribe, /billing).
 * Les prix vivent dans la table `plans` (back office) : les étiquettes de
 * remise sont calculées à partir d'eux, jamais écrites en dur — sinon elles
 * divergent dès qu'un prix change (« 1 mois offert » affiché pour une remise
 * réelle de 10 %).
 */

/** Offre mise en avant (« Recommandé ») — la formule intermédiaire, pas la plus chère. */
export const RECOMMENDED_PLAN_NAME = 'pro';

/** Offre annuelle : même seuil partout (une offre mensuelle dure 30 jours). */
export const isAnnualPlan = (plan: Plan) => plan.duration_days >= 300;

/**
 * Remise réelle, en %, d'une offre annuelle par rapport à 12 mois de l'offre
 * mensuelle du même `name` (les deux lignes le partagent, ex. 'pro').
 * null : pas d'offre mensuelle correspondante, ou pas de remise.
 */
export function annualSavingsPercent(annual: Plan, plans: readonly Plan[]): number | null {
  if (!isAnnualPlan(annual)) return null;
  const monthly = plans.find((p) => p.name === annual.name && p.price > 0 && !isAnnualPlan(p));
  if (!monthly) return null;
  const pct = Math.round((1 - annual.price / (monthly.price * 12)) * 100);
  return pct > 0 ? pct : null;
}

/** « −10 % », ou « jusqu'à −15 % » si les remises diffèrent selon l'offre. null sans remise. */
export function annualSavingsLabel(plans: readonly Plan[]): string | null {
  const pcts = plans
    .filter(isAnnualPlan)
    .map((p) => annualSavingsPercent(p, plans))
    .filter((pct): pct is number => pct !== null);
  if (pcts.length === 0) return null;
  const max = Math.max(...pcts);
  return `${Math.min(...pcts) === max ? '' : 'jusqu’à '}${formatSavings(max)}`;
}

export const formatSavings = (pct: number) => `−${pct} %`;
