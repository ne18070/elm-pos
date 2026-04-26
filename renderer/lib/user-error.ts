/**
 * Converts any caught error into a user-friendly French message.
 * Never exposes technical details (SQL, Supabase, HTTP codes, etc.).
 */
export function toUserError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const msg = raw.toLowerCase();

  // -- Réseau / connectivité -------------------------------------------------
  if (msg.includes('failed to fetch') || msg.includes('networkerror') ||
      msg.includes('network request failed') || msg.includes('load failed')) {
    return 'Erreur de connexion. Vérifiez votre réseau et réessayez.';
  }
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborted')) {
    return 'La requête a pris trop de temps. Réessayez.';
  }

  // -- Base de données -------------------------------------------------------
  if (msg.includes('duplicate key') || msg.includes('unique constraint') ||
      msg.includes('already exists')) {
    return 'Cet élément existe déjà.';
  }
  if (msg.includes('foreign key') || msg.includes('violates') ||
      msg.includes('referenced') || msg.includes('still referenced')) {
    return 'Impossible de supprimer : cet élément est utilisé ailleurs.';
  }
  if (msg.includes('not found') || msg.includes('no rows')) {
    return 'Élément introuvable.';
  }
  if (msg.includes('permission denied') || msg.includes('row-level security') ||
      msg.includes('unauthorized') || msg.includes('403')) {
    return "Vous n'avez pas les droits nécessaires pour cette action.";
  }
  if (msg.includes('jwt') || msg.includes('token') || msg.includes('session expired') ||
      msg.includes('invalid token') || msg.includes('401')) {
    return 'Session expirée. Veuillez vous reconnecter.';
  }

  // -- Stockage / fichiers ---------------------------------------------------
  if (msg.includes('storage') || msg.includes('upload') || msg.includes('file')) {
    return "Erreur lors de l'envoi du fichier. Vérifiez le format et la taille.";
  }

  // -- Validation ------------------------------------------------------------
  if (msg.includes('invalid') && (msg.includes('email') || msg.includes('password'))) {
    return 'Email ou mot de passe invalide.';
  }
  if (msg.includes('too many requests') || msg.includes('rate limit')) {
    return 'Trop de tentatives. Attendez quelques instants avant de réessayer.';
  }

  // -- Erreurs JavaScript brutes ---------------------------------------------
  if (msg.includes('cannot read') || msg.includes('is not a function') ||
      msg.includes('undefined') || msg.includes('null') ||
      msg.includes('typeerror') || msg.includes('referenceerror')) {
    return 'Une erreur inattendue s\'est produite.';
  }

  // -- Message applicatif déjà propre (court, sans jargon technique) ---------
  if (raw.length < 120 && !msg.includes('supabase') && !msg.includes('http') &&
      !msg.includes('sql') && !msg.includes('fetch') && !msg.includes('socket') &&
      !msg.includes('electron') && !msg.includes('ipc') && !msg.includes('error:')) {
    return raw;
  }

  return 'Une erreur inattendue s\'est produite.';
}
