// Opérateurs mobile money proposés pour le paiement des abonnements (Loov, Sénégal, XOF).
// Partagé client/serveur : le serveur refuse tout code absent de cette liste.
// Codes : GET /v2/operators. Wave n'envoie pas de push : en réel, Loov renvoie un
// checkout_url à ouvrir dans l'app Wave.

export const LOOV_CURRENCY = 'XOF';
/** Minimum Loov pour XOF/XAF. */
export const LOOV_MIN_AMOUNT = 200;

export const LOOV_OPERATORS = [
  // Orange Money SN : code à usage unique obligatoire (#144*82# ou app Orange Money), sinon 422 otp_required
  // provider : fournisseur Loov imposé — PAL tant que le fournisseur par défaut refuse ces canaux
  // (« not allowed to use this payin channel »). Sans provider : défaut de l'opérateur chez Loov.
  // enabled : proposé dans /billing et accepté par le serveur. Seul Wave pour l'instant.
  { code: 'orange-money-senegal', label: 'Orange Money', requiresOtp: true, provider: 'pal', enabled: false },
  { code: 'free-money-senegal',   label: 'Free Money',   enabled: false },
  { code: 'expresso-senegal',     label: 'Expresso',     enabled: false },
  // Wave via PAL : Loov renvoie un checkout_url (redirection vers l'app Wave)
  { code: 'wave-senegal',         label: 'Wave', provider: 'pal', enabled: true },
] as const;

export type LoovOperatorCode = (typeof LOOV_OPERATORS)[number]['code'];

/** Opérateurs proposés aux clients (les autres restent configurés mais masqués). */
export const ENABLED_LOOV_OPERATORS = LOOV_OPERATORS.filter((o) => o.enabled);

/** Opérateur proposé — le serveur refuse les opérateurs masqués. */
export function isLoovOperator(code: unknown): code is LoovOperatorCode {
  return ENABLED_LOOV_OPERATORS.some((o) => o.code === code);
}

export function operatorRequiresOtp(code: string): boolean {
  return LOOV_OPERATORS.some((o) => o.code === code && 'requiresOtp' in o && o.requiresOtp);
}

/** Fournisseur Loov à imposer pour cet opérateur (undefined = défaut Loov). */
export function operatorProvider(code: string): string | undefined {
  const op = LOOV_OPERATORS.find((o) => o.code === code);
  return op && 'provider' in op ? op.provider : undefined;
}

export function loovOperatorLabel(code: string | null | undefined): string {
  return LOOV_OPERATORS.find((o) => o.code === code)?.label ?? code ?? '';
}

/**
 * Numéro sénégalais → format Loov (international sans « + ») : 2217XXXXXXXX.
 * Accepte « 77 123 45 67 », « +221 77… », « 00221 77… ». null si invalide.
 */
export function normalizeSenegalPhone(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 9) digits = `221${digits}`;
  return /^2217\d{8}$/.test(digits) ? digits : null;
}
