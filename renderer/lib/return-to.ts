/**
 * Retour après connexion : un lien partagé (ex. `/livraison?order=…` envoyé au
 * magasinier) doit rouvrir la bonne page une fois connecté, au lieu de la
 * page d'accueil par défaut.
 *
 * Seuls les chemins internes sont acceptés (`/…`, jamais `//hôte` ni une URL
 * absolue) : `next` vient de l'URL, il ne doit pas servir de redirection
 * ouverte vers un autre site.
 */

function safeInternalPath(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  if (value === '/login' || value.startsWith('/login?') || value.startsWith('/login/')) return null;
  return value;
}

/** `/login?next=<page courante>` — à utiliser quand la session manque. */
export function loginUrlWithReturn(): string {
  if (typeof window === 'undefined') return '/login';
  const here = safeInternalPath(window.location.pathname + window.location.search);
  return here && here !== '/' ? `/login?next=${encodeURIComponent(here)}` : '/login';
}

/** Page à rouvrir après connexion (lue dans `?next=`), ou null. */
export function getReturnTo(): string | null {
  if (typeof window === 'undefined') return null;
  return safeInternalPath(new URLSearchParams(window.location.search).get('next'));
}
