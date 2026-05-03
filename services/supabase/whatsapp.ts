import { supabase as _supabase } from './client';
import { q } from './q';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

// --- Types --------------------------------------------------------------------

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
  menu_keyword:      string;
  confirm_message:   string;
  wave_payment_url:  string | null;
  enable_pickup:     boolean;
  enable_delivery:   boolean;
  msg_cart_footer:          string;
  msg_shipping_question:    string;
  msg_address_request:      string;
  msg_delivery_confirmation: string;
  use_shared_number: boolean;
  created_at:        string;
  updated_at:        string;
}

export type WhatsAppConfigForm = Pick<
  WhatsAppConfig,
  'phone_number_id' | 'access_token' | 'display_phone' | 'is_active' | 'catalog_enabled' | 'welcome_message' | 'menu_keyword' | 'confirm_message' | 'wave_payment_url' | 'enable_pickup' | 'enable_delivery' | 'msg_cart_footer' | 'msg_shipping_question' | 'msg_address_request' | 'msg_delivery_confirmation'
> & { use_shared_number?: boolean };

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

export interface ConversationFilter {
  search?:     string;
  unreadOnly?: boolean;
  page?:       number;
  pageSize?:   number;
}

export interface ConversationPage {
  items:   WhatsAppConversation[];
  hasMore: boolean;
}

// --- Config -------------------------------------------------------------------

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

// --- Phone normalization ------------------------------------------------------

function normalizePhone(phone: string): string {
  if (!phone) return phone;
  return phone.startsWith('+') ? phone : `+${phone}`;
}

// --- Messages -----------------------------------------------------------------

export async function getConversations(
  businessId: string,
  filter?: ConversationFilter,
): Promise<ConversationPage> {
  const pageSize = filter?.pageSize ?? 25;
  const offset   = (filter?.page ?? 0) * pageSize;

  const { data, error } = await supabase.rpc('get_whatsapp_conversations', {
    p_business_id: businessId,
    p_search:      filter?.search      || null,
    p_unread_only: filter?.unreadOnly  ?? false,
    p_limit:       pageSize,
    p_offset:      offset,
  });

  if (error) throw error;

  const rows = (data ?? []) as WhatsAppConversation[];
  return {
    items:   rows.slice(0, pageSize),
    hasMore: rows.length > pageSize,
  };
}

export async function getMessages(
  businessId: string,
  fromPhone: string,
): Promise<WhatsAppMessage[]> {
  const normalized = normalizePhone(fromPhone);
  // Récupère les messages avec et sans le préfixe '+' pour couvrir les anciens enregistrements
  const withoutPlus = normalized.slice(1);
  const { data } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .eq('business_id', businessId)
    .or(`from_phone.eq.${normalized},from_phone.eq.${withoutPlus}`)
    .order('created_at', { ascending: true });
  return (data ?? []) as WhatsAppMessage[];
}

export async function markMessagesRead(businessId: string, fromPhone: string): Promise<void> {
  const normalized = normalizePhone(fromPhone);
  const withoutPlus = normalized.slice(1);
  await supabase
    .from('whatsapp_messages')
    .update({ status: 'read' })
    .eq('business_id', businessId)
    .or(`from_phone.eq.${normalized},from_phone.eq.${withoutPlus}`)
    .eq('direction', 'inbound')
    .eq('status', 'received');
}

// --- Broadcast menu du jour ---------------------------------------------------

export interface BroadcastResult {
  sent:    number;
  skipped: number;
  failed:  number;
  errors:  string[];
}

export interface BroadcastLog {
  phone:   string;
  sent_at: string;
}

export async function getBroadcastLog(businessId: string, date: string): Promise<BroadcastLog[]> {
  const { data } = await supabase
    .from('whatsapp_broadcast_logs')
    .select('phone, sent_at')
    .eq('business_id', businessId)
    .eq('date', date)
    .order('sent_at', { ascending: false });
  return (data ?? []) as BroadcastLog[];
}

export async function broadcastDailyMenu(
  config: WhatsAppConfig,
  text: string,
  userId: string,
  date: string,
  imageUrl?: string | null,
): Promise<BroadcastResult> {
  // Récupérer tous les clients avec un numéro de téléphone
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, phone')
    .eq('business_id', config.business_id)
    .not('phone', 'is', null);

  const result: BroadcastResult = { sent: 0, skipped: 0, failed: 0, errors: [] };
  if (!clients?.length) return result;

  // Récupérer les contacts déjà contactés aujourd'hui
  const { data: logs } = await supabase
    .from('whatsapp_broadcast_logs')
    .select('phone')
    .eq('business_id', config.business_id)
    .eq('date', date);

  const alreadySent = new Set((logs ?? []).map((l: { phone: string }) => normalizePhone(l.phone)));

  for (const client of clients as { id: string; name: string; phone: string }[]) {
    const phone = normalizePhone(client.phone);

    // Sauter si déjà envoyé aujourd'hui
    if (alreadySent.has(phone)) {
      result.skipped++;
      continue;
    }

    try {
      // Si image - envoyer image avec caption
      const payload = imageUrl
        ? {
            messaging_product: 'whatsapp',
            recipient_type:    'individual',
            to:                phone,
            type:              'image',
            image:             { link: imageUrl, caption: text },
          }
        : {
            messaging_product: 'whatsapp',
            recipient_type:    'individual',
            to:                phone,
            type:              'text',
            text:              { preview_url: false, body: text },
          };

      await callMetaAPI(config, payload);

      // Enregistrer dans les messages WhatsApp
      await supabase.from('whatsapp_messages').insert({
        business_id:  config.business_id,
        from_phone:   phone,
        direction:    'outbound',
        message_type: imageUrl ? 'image' : 'text',
        body:         text,
        replied_by:   userId,
        status:       'sent',
      });

      // Enregistrer dans l'historique broadcast (contrainte UNIQUE empêche les doublons)
      await supabase.from('whatsapp_broadcast_logs').insert({
        business_id: config.business_id,
        date,
        phone,
      });

      result.sent++;
      await new Promise((r) => setTimeout(r, 120));
    } catch {
      result.failed++;
      result.errors.push(`${client.name} (${client.phone}): erreur réseau`);
    }
  }

  return result;
}

// --- Helpers Meta Cloud API (via Proxy Edge Function) --------------------------

async function callMetaAPI(config: WhatsAppConfig, payload: unknown) {
  // On passe par une Edge Function pour éviter les problèmes de CORS dans Electron
  const { data, error } = await supabase.functions.invoke('send-whatsapp', {
    body: {
      phone_number_id: config.phone_number_id,
      access_token:    config.access_token,
      payload,
    },
  });

  if (error) {
    console.error('[WhatsApp Proxy] Error:', error);
    throw new Error('Erreur de communication avec le service WhatsApp');
  }

  if (data?.error) {
    console.error('[Meta API] Error:', data.error);
    throw new Error(data.error.message || 'Erreur API WhatsApp');
  }

  return data;
}

async function sendTextMessage(config: WhatsAppConfig, toPhone: string, text: string) {
  await callMetaAPI(config, {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:                toPhone,
    type:              'text',
    text:              { preview_url: false, body: text },
  });
}

export async function sendWhatsAppReply(
  config: WhatsAppConfig,
  toPhone: string,
  text: string,
  userId: string,
): Promise<void> {
  const phone = normalizePhone(toPhone);

  await sendTextMessage(config, phone, text);

  // Stocker le message sortant
  await supabase.from('whatsapp_messages').insert({
    business_id:  config.business_id,
    from_phone:   phone,
    direction:    'outbound',
    message_type: 'text',
    body:         text,
    replied_by:   userId,
    status:       'sent',
  });
}

/** Envoie un document (PDF) par WhatsApp via URL publique */
export async function sendWhatsAppDocument(
  config: WhatsAppConfig,
  toPhone: string,
  docUrl: string,
  filename: string,
  caption: string,
  userId: string,
): Promise<void> {
  const phone = normalizePhone(toPhone);

  await callMetaAPI(config, {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:                phone,
    type:              'document',
    document: {
      link:     docUrl,
      filename: filename,
      caption:  caption,
    },
  });

  await supabase.from('whatsapp_messages').insert({
    business_id:  config.business_id,
    from_phone:   phone,
    direction:    'outbound',
    message_type: 'document',
    body:         caption,
    replied_by:   userId,
    status:       'sent',
  });
}

// --- Health Monitoring (Admin) ------------------------------------------------

export interface WhatsAppHealthRow extends WhatsAppConfig {
  status_health: 'healthy' | 'token_expired' | 'api_error' | 'unknown';
  last_health_check_at: string | null;
  last_api_error_message: string | null;
  business_name?: string;
}

export async function getAllWhatsAppConfigsAdmin(): Promise<WhatsAppHealthRow[]> {
  const { data, error } = await supabase
    .from('whatsapp_configs')
    .select('*, businesses(name)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...row,
    business_name: row.businesses?.name
  }));
}

export async function runWhatsAppHealthCheck(): Promise<void> {
  const { error } = await supabase.functions.invoke('check-wa-health');
  if (error) throw error;
}
