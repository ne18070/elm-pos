import { supabase as _supabase } from './client';
import { q } from './q';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

export interface Livreur {
  id: string;
  business_id: string;
  name: string;
  phone: string;
  is_active: boolean;
  notes?: string | null;
  created_at: string;
}

export type LivreurForm = {
  name: string;
  phone: string;
  is_active: boolean;
  notes?: string | null;
};

export async function getLivreurs(businessId: string): Promise<Livreur[]> {
  const rows = await q<Livreur[]>(
    supabase.from('livreurs').select('*').eq('business_id', businessId).eq('is_active', true).order('name'),
  );
  return rows ?? [];
}

export async function getAllLivreurs(businessId: string): Promise<Livreur[]> {
  const rows = await q<Livreur[]>(
    supabase.from('livreurs').select('*').eq('business_id', businessId).order('name'),
  );
  return rows ?? [];
}

export async function createLivreur(businessId: string, form: LivreurForm): Promise<Livreur> {
  return q<Livreur>(
    supabase.from('livreurs').insert({ business_id: businessId, ...form }).select().single(),
  );
}

export async function updateLivreur(id: string, form: Partial<LivreurForm>): Promise<Livreur> {
  return q<Livreur>(supabase.from('livreurs').update(form).eq('id', id).select().single());
}

export async function deleteLivreur(id: string): Promise<void> {
  await q(supabase.from('livreurs').delete().eq('id', id));
}

export async function assignLivreur(orderId: string, livreurId: string | null): Promise<void> {
  await q(supabase.from('orders').update({ livreur_id: livreurId }).eq('id', orderId));
}

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  return `+${cleaned}`;
}

export async function sendLocationToLivreur(
  config: { phone_number_id: string; access_token: string },
  livreur: Livreur,
  order: {
    id: string;
    customer_name?: string;
    customer_phone?: string;
    delivery_address?: string;
    delivery_location?: { latitude: number; longitude: number } | null;
    total: number;
  },
): Promise<void> {
  const phone = normalizePhone(livreur.phone);
  const orderId = order.id.slice(0, 8).toUpperCase();

  let body = `🚗 *Nouvelle livraison assignée !*\n\n`;
  body += `👤 *Client :* ${order.customer_name ?? 'N/A'} (${order.customer_phone ?? 'N/A'})\n`;
  body += `📦 *Commande :* #${orderId}\n`;
  body += `💰 *Total :* ${order.total} FCFA\n\n`;
  body += `📍 *Adresse :* ${order.delivery_address ?? 'Non précisée'}`;

  if (order.delivery_location?.latitude && order.delivery_location?.longitude) {
    body += `\n🗺️ https://www.google.com/maps?q=${order.delivery_location.latitude},${order.delivery_location.longitude}`;
  }

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${config.phone_number_id}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.access_token}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body },
      }),
    },
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = data?.error?.message ?? `Erreur API Meta (${res.status})`;
    throw new Error(msg);
  }
}
