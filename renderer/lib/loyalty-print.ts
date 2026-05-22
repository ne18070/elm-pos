import { getLoyaltyConfig, getClientBalance } from '@services/supabase/loyalty';

export interface LoyaltyPrintData {
  points_earned?: number;
  new_balance?:   number;
}

/**
 * Fetches loyalty data for a paid service order receipt.
 * Returns undefined silently if the program is inactive, the order has no client,
 * or no points were earned. Never throws.
 */
export async function buildLoyaltyForReceipt(
  businessId:  string,
  clientName:  string | null | undefined,
  orderTotal:  number,
  orderStatus: string,
): Promise<LoyaltyPrintData | undefined> {
  if (!clientName || orderStatus !== 'paye') return undefined;
  try {
    const [cfg, balance] = await Promise.all([
      getLoyaltyConfig(businessId),
      getClientBalance(businessId, clientName),
    ]);
    if (!cfg.is_active) return undefined;
    const pointsEarned = Math.floor(orderTotal / cfg.earn_per);
    if (pointsEarned <= 0) return undefined;
    return { points_earned: pointsEarned, new_balance: balance };
  } catch {
    return undefined;
  }
}
