import { supabase as _supabase } from './client';
import { q } from './q';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WhatsAppConfig {
  id:              string;
  business_id:     string;
  phone_number_id: string;
  access_token:    string;
  verify_token:    string;
  display_phone:   string | null;
  is_active:       boolean;
  catalog_enabled: boolean;
  welcome_message: string;
  menu_keyword:    string;
  created_at:      string;
  updated_at:      string;
}

export type WhatsAppConfigForm = Pick<
  WhatsAppConfig,
  'phone_number_id' | 'access_token' | 'display_phone' | 'is_active' | 'catalog_enabled' | 'welcome_message' | 'menu_keyword'
>;

export interface WhatsAppMessage {
  id:           string;
  business_id:  string;
  wa_message_id: string | null;
  from_phone:   string;
  from_name:    string | null;
  direction:    'inbound' | 'outbound';
  message_type: string;
  body:         string | null;
  payload:      unknown;
  order_id:     string | null;
  status:       string;
  replied_by:   string | null;
  created_at:   string;
}

export interface WhatsAppConversation {
  from_phone:   string;
  from_name:    string | null;
  last_message: string | null;
  last_at:      string;
  unread:       number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export async function getWhatsAppConfig(businessId: string): Promise<WhatsAppConfig | null> {
  const { data } = await supabase
    .from('whatsapp_configs')
    .select('*')
    .eq('business_id', businessId)
    .maybeSingle();
  return data ?? null;
}

export async function upsertWhatsAppConfig(
  businessId: string,
  form: WhatsAppConfigForm,
): Promise<WhatsAppConfig> {
  return q<WhatsAppConfig>(
    supabase.from('whatsapp_configs').upsert(
      { business_id: businessId, ...form },
      { onConflict: 'business_id' },
    ).select().single(),
  );
}

export async function regenerateVerifyToken(configId: string): Promise<string> {
  // Le token est régénéré côté SQL, on le récupère après update
  const { data } = await supabase
    .from('whatsapp_configs')
    .update({ verify_token: crypto.randomUUID().replace(/-/g, '') })
    .eq('id', configId)
    .select('verify_token')
    .single();
  return (data as { verify_token: string }).verify_token;
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function getConversations(businessId: string): Promise<WhatsAppConversation[]> {
  const messages = await q<WhatsAppMessage[]>(
    supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(500),
  ) ?? [];

  const map = new Map<string, WhatsAppConversation>();
  for (const m of messages) {
    if (!map.has(m.from_phone)) {
      map.set(m.from_phone, {
        from_phone:   m.from_phone,
        from_name:    m.from_name,
        last_message: m.body,
        last_at:      m.created_at,
        unread:       m.direction === 'inbound' && m.status === 'received' ? 1 : 0,
      });
    } else if (m.direction === 'inbound' && m.status === 'received') {
      map.get(m.from_phone)!.unread += 1;
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime(),
  );
}

export async function getMessages(
  businessId: string,
  fromPhone: string,
): Promise<WhatsAppMessage[]> {
  return q<WhatsAppMessage[]>(
    supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('business_id', businessId)
      .eq('from_phone', fromPhone)
      .order('created_at', { ascending: true }),
  ) ?? [];
}

export async function markMessagesRead(businessId: string, fromPhone: string): Promise<void> {
  await supabase
    .from('whatsapp_messages')
    .update({ status: 'read' })
    .eq('business_id', businessId)
    .eq('from_phone', fromPhone)
    .eq('direction', 'inbound')
    .eq('status', 'received');
}

// ─── Envoi de message (reply depuis l'app) ────────────────────────────────────

export async function sendWhatsAppReply(
  config: WhatsAppConfig,
  toPhone: string,
  text: string,
  userId: string,
): Promise<void> {
  // Appel direct à Meta Cloud API (depuis le renderer via fetch)
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${config.phone_number_id}/messages`,
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${config.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to:                toPhone,
        type:              'text',
        text:              { preview_url: false, body: text },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } })?.error?.message ?? `Meta API error ${res.status}`);
  }

  // Stocker le message sortant
  await supabase.from('whatsapp_messages').insert({
    business_id:  config.business_id,
    from_phone:   toPhone,
    direction:    'outbound',
    message_type: 'text',
    body:         text,
    replied_by:   userId,
    status:       'sent',
  });
}
