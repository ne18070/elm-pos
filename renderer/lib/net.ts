/**
 * Distingue une PERTE DE CONNEXION d'un refus applicatif du serveur.
 *
 * Le POS ne doit basculer une vente dans la file de synchro offline QUE sur une
 * vraie panne réseau. Une erreur métier (stock insuffisant, session expirée,
 * contrainte violée, abonnement expiré…) doit rester visible pour le caissier,
 * panier intact — sinon la vente est perdue en silence.
 */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;

  const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  return (
    err instanceof TypeError ||                 // fetch() qui échoue → TypeError
    msg.includes('failed to fetch') ||
    msg.includes('load failed') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('err_internet_disconnected') ||
    msg.includes('err_network') ||
    msg.includes('the internet connection appears to be offline') ||
    msg.includes('fetch failed')
  );
}

/** Message court à afficher au caissier pour une erreur de création de commande. */
export function orderErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  // Exception levée par create_order (migration 116) : « STOCK_INSUFFISANT: Nom (reste X, demandé Y) »
  const stock = raw.match(/STOCK_INSUFFISANT:\s*(.+?)\s*\(reste\s*([\d.]+),\s*demandé\s*([\d.]+)\)/i);
  if (stock) {
    return `Stock insuffisant pour « ${stock[1]} » : ${stock[2]} en stock, ${stock[3]} demandé(s). Vente non enregistrée.`;
  }
  // Exceptions fidélité levées par create_order (migration 116)
  if (/FIDELITE_SOLDE_INSUFFISANT/i.test(raw)) {
    return 'Solde de points fidélité insuffisant — un autre encaissement a peut-être consommé les points. Vente non enregistrée : réessayez sans la remise fidélité.';
  }
  if (/FIDELITE_INACTIVE/i.test(raw)) {
    return 'Programme de fidélité inactif — remise impossible. Vente non enregistrée.';
  }
  if (/FIDELITE_MIN_NON_ATTEINT/i.test(raw)) {
    return 'Minimum de points fidélité non atteint. Vente non enregistrée : retirez la remise fidélité.';
  }
  if (/FIDELITE_(CLIENT_MANQUANT|VALEUR_INCOHERENTE)/i.test(raw)) {
    return 'Anomalie sur la remise fidélité — vente non enregistrée. Rechargez la fiche client et réessayez.';
  }
  if (/row-level security|permission denied|jwt|not authenticated/i.test(raw)) {
    return 'Session expirée ou droits insuffisants. Reconnectez-vous, la vente n\'a pas été enregistrée.';
  }
  if (/402|subscription|abonnement/i.test(raw)) {
    return 'Abonnement expiré — encaissement impossible. La vente n\'a pas été enregistrée.';
  }
  return raw || 'La vente n\'a pas pu être enregistrée.';
}
