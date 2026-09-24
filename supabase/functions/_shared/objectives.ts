// Source unique de vérité de la traduction « objectif en français courant » →
// paramètres plateforme. Le renderer n'envoie qu'un slug et ne connaît aucun de
// ces identifiants : c'est précisément ce qui permet de simplifier l'écran de
// création sans dupliquer la logique de deux API dans l'app.

export type Objective = 'ventes' | 'visibilite' | 'messages';

export const OBJECTIVES: readonly Objective[] = ['ventes', 'visibilite', 'messages'];

export function isObjective(value: unknown): value is Objective {
  return typeof value === 'string' && (OBJECTIVES as readonly string[]).includes(value);
}

interface MetaObjectiveSpec {
  objective:        string;
  optimizationGoal: string;
  billingEvent:     string;
  callToAction:     string;
}

/**
 * `hasPixel` change la donne pour « vendre plus » : sans pixel sur la boutique,
 * Meta ne peut pas optimiser sur l'achat, seulement sur le clic. On bascule
 * alors explicitement sur du trafic plutôt que de demander une optimisation que
 * la plateforme refuserait ou livrerait mal.
 */
export function metaSpec(objective: Objective, hasPixel: boolean): MetaObjectiveSpec {
  switch (objective) {
    case 'ventes':
      return hasPixel
        ? {
            objective:        'OUTCOME_SALES',
            optimizationGoal: 'OFFSITE_CONVERSIONS',
            billingEvent:     'IMPRESSIONS',
            callToAction:     'SHOP_NOW',
          }
        : {
            objective:        'OUTCOME_TRAFFIC',
            optimizationGoal: 'LINK_CLICKS',
            billingEvent:     'IMPRESSIONS',
            callToAction:     'SHOP_NOW',
          };
    case 'visibilite':
      return {
        objective:        'OUTCOME_AWARENESS',
        optimizationGoal: 'REACH',
        billingEvent:     'IMPRESSIONS',
        callToAction:     'LEARN_MORE',
      };
    case 'messages':
      // Volontairement du trafic vers un lien wa.me plutôt que le vrai
      // click-to-WhatsApp (destination_type WHATSAPP + optimisation
      // CONVERSATIONS) : ce dernier exige que le numéro WhatsApp soit rattaché
      // à la Page Facebook, une étape de configuration de plus chez le client —
      // exactement ce qu'on cherche à lui épargner. Le lien ouvre sa
      // conversation de la même manière.
      return {
        objective:        'OUTCOME_TRAFFIC',
        optimizationGoal: 'LINK_CLICKS',
        billingEvent:     'IMPRESSIONS',
        // Pas WHATSAPP_MESSAGE : ce bouton d'appel à l'action n'est accepté
        // qu'avec la destination WhatsApp native, que l'on n'utilise pas ici.
        callToAction:     'CONTACT_US',
      };
  }
}

interface TikTokObjectiveSpec {
  objectiveType:    string;
  optimizationGoal: string;
  billingEvent:     string;
  callToAction:     string;
}

export function tiktokSpec(objective: Objective): TikTokObjectiveSpec {
  switch (objective) {
    case 'ventes':
      return {
        objectiveType:    'TRAFFIC',
        optimizationGoal: 'CLICK',
        billingEvent:     'CPC',
        callToAction:     'SHOP_NOW',
      };
    case 'visibilite':
      return {
        objectiveType:    'REACH',
        optimizationGoal: 'REACH',
        billingEvent:     'CPM',
        callToAction:     'LEARN_MORE',
      };
    case 'messages':
      return {
        objectiveType:    'TRAFFIC',
        optimizationGoal: 'CLICK',
        billingEvent:     'CPC',
        callToAction:     'CONTACT_US',
      };
  }
}
