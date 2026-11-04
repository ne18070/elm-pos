/**
 * Organisation bloquée depuis le backoffice (migration 166) : l'app déconnecte le
 * compte et /login affiche pourquoi. Le drapeau survit à la redirection.
 */

const SUSPENDED_FLAG = 'elm-pos-org-suspended';

export const SUSPENDED_MESSAGE =
  'Votre organisation a été suspendue par l’équipe ELM. Contactez le support pour la réactiver.';

/** À appeler juste avant la déconnexion forcée. */
export function markSuspended() {
  try { sessionStorage.setItem(SUSPENDED_FLAG, '1'); } catch { /* ignore */ }
}

/** Lu une seule fois par /login. */
export function consumeSuspended(): boolean {
  try {
    if (!sessionStorage.getItem(SUSPENDED_FLAG)) return false;
    sessionStorage.removeItem(SUSPENDED_FLAG);
    return true;
  } catch {
    return false;
  }
}

/** Erreur Supabase Auth d'un compte banni (blocage de son organisation). */
export function isBannedError(err: { code?: string; message?: string } | null | undefined): boolean {
  return !!err && (err.code === 'user_banned' || /banned/i.test(err.message ?? ''));
}
