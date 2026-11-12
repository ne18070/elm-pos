import type { PermissionKey } from '@/lib/permissions';

/**
 * Nouveautés affichées une fois aux utilisateurs à leur prochaine connexion
 * (WhatsNewModal, monté dans le layout du dashboard).
 *
 * Ajouter une annonce = ajouter une entrée en TÊTE de liste, avec un `id`
 * unique et jamais réutilisé (il sert à mémoriser « déjà vu »). Chaque point
 * peut être réservé à une permission : un utilisateur ne voit que ce qui le
 * concerne, et une annonce dont aucun point ne le concerne ne s'affiche pas.
 * Au-delà de `MAX_AGE_DAYS`, une annonce n'est plus montrée (inutile de
 * l'imposer à un compte créé des semaines plus tard).
 */

export interface WhatsNewItem {
  title: string;
  body: string;
  permission?: PermissionKey;
}

export interface WhatsNewEntry {
  id: string;
  /** Date de publication (AAAA-MM-JJ). */
  date: string;
  title: string;
  items: WhatsNewItem[];
  /** Bouton principal (affiché si l'utilisateur a la permission). */
  cta?: { label: string; href: string; permission?: PermissionKey };
}

export const MAX_AGE_DAYS = 30;

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: '2026-11-12-livraisons',
    date: '2026-11-12',
    title: 'Livraisons : plus rien ne passe à la trappe',
    items: [
      {
        title: 'Une file de livraison épurée',
        body: "Seules les commandes à remettre y figurent : commandes rapides, boutique en ligne, WhatsApp et commandes confiées à un livreur. Les ventes au comptoir n'y apparaissent plus.",
        permission: 'view_livraisons',
      },
      {
        title: 'Un compteur sur « Suivi Livraisons »',
        body: 'Le menu affiche le nombre de commandes à livrer. Il passe en orange quand une commande attend depuis plus de 2 h.',
        permission: 'view_livraisons',
      },
      {
        title: 'Préparer juste après la vente',
        body: 'Après une commande rapide, un bandeau propose « Préparer la livraison » pour ouvrir directement la vérification de la commande.',
        permission: 'view_commande_rapide',
      },
      {
        title: 'Envoyer au magasinier',
        body: "Depuis la file ou après une commande rapide, envoyez par WhatsApp un lien qui ouvre la commande à préparer, même s'il doit d'abord se connecter.",
        permission: 'view_livraisons',
      },
      {
        title: 'Rappel à la clôture de caisse',
        body: 'Avant de fermer la caisse, vous voyez les commandes de la session pas encore livrées.',
        permission: 'view_cash_session',
      },
      {
        title: 'Mise à jour en temps réel',
        body: 'Les nouvelles commandes à livrer apparaissent sans recharger la page.',
        permission: 'view_livraisons',
      },
    ],
    cta: { label: 'Ouvrir le suivi des livraisons', href: '/livraison', permission: 'view_livraisons' },
  },
];

const storageKey = (userId: string) => `elm-pos:whats-new-seen:${userId}`;

export function getSeenIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markSeen(userId: string, ids: string[]): void {
  try {
    const seen = getSeenIds(userId);
    ids.forEach((id) => seen.add(id));
    localStorage.setItem(storageKey(userId), JSON.stringify([...seen]));
  } catch {
    /* stockage indisponible (navigation privée) : réaffichée au prochain chargement */
  }
}

/** Annonces non vues, récentes, réduites aux points accessibles à l'utilisateur. */
export function getPendingWhatsNew(
  userId: string,
  can: (p: PermissionKey) => boolean,
  now = Date.now(),
): WhatsNewEntry[] {
  const seen = getSeenIds(userId);
  return WHATS_NEW
    .filter((e) => !seen.has(e.id))
    .filter((e) => now - new Date(`${e.date}T00:00:00`).getTime() <= MAX_AGE_DAYS * 86_400_000)
    .map((e) => ({
      ...e,
      items: e.items.filter((i) => !i.permission || can(i.permission)),
      cta: e.cta && (!e.cta.permission || can(e.cta.permission)) ? e.cta : undefined,
    }))
    .filter((e) => e.items.length > 0);
}
