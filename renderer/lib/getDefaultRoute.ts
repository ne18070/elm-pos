/**
 * Retourne la première route accessible selon les features activées du business.
 * Utilisé après login, switch de business, ou création d'établissement.
 */
export function getDefaultRoute(features: string[]): string {
  // Routes ordonnées par priorité — la première dont la feature est active est choisie
  const PRIORITY: { feature: string | null; route: string }[] = [
    { feature: 'caisse',      route: '/pos'        },
    { feature: 'hotel',       route: '/hotel'       },
    { feature: 'dossiers',    route: '/dossiers'    },
    { feature: 'contrats',    route: '/contrats'    },
    { feature: 'livraison',   route: '/livraison'   },
    { feature: 'honoraires',  route: '/honoraires'  },
    { feature: null,          route: '/orders'      }, // toujours accessible
  ];

  for (const { feature, route } of PRIORITY) {
    if (!feature || features.includes(feature)) return route;
  }
  return '/orders';
}
