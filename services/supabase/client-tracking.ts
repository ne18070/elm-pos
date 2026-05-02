import { supabase } from './client';

export interface TrackingTokenInfo {
  token: string;
  business_id: string;
  dossier_id: string | null;
  service_order_id: string | null;
  client_phone: string | null;
  businesses: { name: string; logo_url: string | null };
}

export async function getOrCreateTrackingToken(
  _businessId: string,
  entityId: string,
  type: 'service_order' | 'dossier',
  clientPhone?: string | null
): Promise<string> {
  const col = type === 'service_order' ? 'service_order_id' : 'dossier_id';

  // 1. Chercher un token existant valide
  const { data: existing } = await (supabase as any)
    .from('client_tracking_tokens')
    .select('token')
    .eq(col, entityId)
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
      [col]:       entityId,
      token,
      client_phone:     clientPhone || null,
      expires_at:       expiresAt.toISOString(),
    });

  if (error) throw new Error(error.message);
  return token;
}

export async function validateTrackingToken(token: string): Promise<TrackingTokenInfo> {
  const { data, error } = await (supabase as any)
    .from('client_tracking_tokens')
    .select('id, token, dossier_id, service_order_id, client_phone, expires_at, view_count')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error || !data) throw new Error('Lien invalide ou expiré.');

  let businessId = '';
  let businesses = { name: '', logo_url: null as string | null };

  if (data.dossier_id) {
    const { data: dossier, error: dossierError } = await (supabase as any)
      .from('dossiers')
      .select('business_id, businesses(name, logo_url)')
      .eq('id', data.dossier_id)
      .single();
    if (dossierError || !dossier) throw new Error('Dossier introuvable.');
    businessId = dossier.business_id;
    businesses = dossier.businesses ?? businesses;
  } else if (data.service_order_id) {
    const { data: serviceOrder, error: serviceError } = await (supabase as any)
      .from('service_orders')
      .select('business_id, businesses(name, logo_url)')
      .eq('id', data.service_order_id)
      .single();
    if (serviceError || !serviceOrder) throw new Error('Ordre de service introuvable.');
    businessId = serviceOrder.business_id;
    businesses = serviceOrder.businesses ?? businesses;
  } else {
    throw new Error('Lien sans dossier ni ordre de service.');
  }

  // Update last_viewed and view_count
  await (supabase as any)
    .from('client_tracking_tokens')
    .update({ 
      last_viewed: new Date().toISOString(),
      view_count: (data.view_count || 0) + 1 
    })
    .eq('id', data.id);

  return {
    ...data,
    business_id: businessId,
    businesses,
  };
}
