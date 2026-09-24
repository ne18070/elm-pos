// Les montants circulent partout en unité mineure + devise (voir migration 152).
// Le XOF n'a pas de décimales : 5000 XOF en mineur = 5 000 FCFA, alors que
// 5000 EUR en mineur = 50,00 €. Se tromper ici, c'est dépenser 100× le budget
// prévu — d'où la conversion centralisée au lieu d'un /100 dispersé.

const ZERO_DECIMAL = new Set([
  'XOF', 'XAF', 'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY',
  'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'VND', 'VUV',
]);

export function decimalsFor(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 0 : 2;
}

/** Meta attend les budgets en unité mineure — donc tels quels. */
export function toMetaBudget(minor: number): string {
  return String(Math.round(minor));
}

/** TikTok attend les budgets en unité majeure (nombre décimal). */
export function toTikTokBudget(minor: number, currency: string): number {
  const d = decimalsFor(currency);
  return d === 0 ? Math.round(minor) : Math.round(minor) / 10 ** d;
}

/** Sens inverse, pour les dépenses renvoyées par les rapports TikTok. */
export function majorToMinor(major: number | string, currency: string): number {
  const value = typeof major === 'string' ? parseFloat(major) : major;
  if (!isFinite(value)) return 0;
  return Math.round(value * 10 ** decimalsFor(currency));
}
