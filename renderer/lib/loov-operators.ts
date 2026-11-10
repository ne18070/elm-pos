// Opérateurs mobile money proposés pour le paiement des abonnements (Loov, Sénégal, XOF).
// Partagé client/serveur : le serveur refuse tout code absent de cette liste.
// Codes : GET /v2/operators. Wave n'envoie pas de push : en réel, Loov renvoie un
// checkout_url à ouvrir dans l'app Wave.

export const LOOV_CURRENCY = 'XOF';
/** Minimum Loov pour XOF/XAF. */
export const LOOV_MIN_AMOUNT = 200;

export const LOOV_OPERATORS = [
  { code: 'orange-money-senegal', label: 'Orange Money' },
  { code: 'free-money-senegal',   label: 'Free Money' },
  { code: 'expresso-senegal',     label: 'Expresso' },
  { code: 'wave-senegal',         label: 'Wave' },
] as const;

export type LoovOperatorCode = (typeof LOOV_OPERATORS)[number]['code'];

export function isLoovOperator(code: unknown): code is LoovOperatorCode {
  return LOOV_OPERATORS.some((o) => o.code === code);
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
