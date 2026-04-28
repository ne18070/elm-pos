import { supabase } from './client';

export async function getOrCreateTrackingToken(
  businessId: string,
  serviceOrderId: string,
  clientPhone?: string | null
): Promise<string> {
  // 1. Chercher un token existant valide
  const { data: existing } = await (supabase as any)
    .from('client_tracking_tokens')
    .select('token')
    .eq('service_order_id', serviceOrderId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (existing) return existing.token;

  // 2. Créer un nouveau token (expire dans 30 jours)
  const token = crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const { error } = await (supabase as any)
    .from('client_tracking_tokens')
    .insert({
      service_order_id: serviceOrderId,
      token,
      client_phone:     clientPhone || null,
      expires_at:       expiresAt.toISOString(),
    });

  if (error) throw new Error(error.message);
  return token;
}
