import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ─── Types ────────────────────────────────────────────────────────────────────

interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      field: string;
      value: {
        metadata?: { phone_number_id: string };
        messages?: WaMessage[];
        statuses?: WaStatus[];
        contacts?: WaContact[];
      };
    }>;
  }>;
}

interface WaMessage {
  id:          string;
  from:        string;
  timestamp:   string;
  type:        string;
  text?:       { body: string };
  interactive?: {
    type:          string;
    list_reply?:   { id: string; title: string; description?: string };
    button_reply?: { id: string; title: string };
  };
}

interface WaStatus { id: string; status: string; }
interface WaContact { wa_id: string; profile: { name: string }; }

interface WaConfig {
  id:              string;
  business_id:     string;
  phone_number_id: string;
  access_token:    string;
  catalog_enabled: boolean;
  welcome_message: string;
}

interface CartItem {
  product_id: string;
  name:       string;
  price:      number;
  quantity:   number;
  total:      number;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

serve(async (req) => {
  const url = new URL(req.url);

  // GET — vérification du webhook par Meta
  if (req.method === 'GET') {
    const mode      = url.searchParams.get('hub.mode');
    const token     = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode !== 'subscribe' || !token || !challenge) {
      return new Response('Bad request', { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data } = await supabase
      .from('whatsapp_configs')
      .select('id')
      .eq('verify_token', token)
      .eq('is_active', true)
      .maybeSingle();

    if (!data) return new Response('Forbidden', { status: 403 });
    return new Response(challenge, { status: 200 });
  }

  // POST — messages entrants depuis Meta Cloud API
  if (req.method === 'POST') {
    let body: unknown;
    try { body = await req.json(); } catch { return new Response('OK', { status: 200 }); }

    const payload = body as WhatsAppWebhookPayload;
    if (payload.object !== 'whatsapp_business_account') {
      return new Response('OK', { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue;
        const value = change.value;

        const { data: config } = await supabase
          .from('whatsapp_configs')
          .select('id,business_id,phone_number_id,access_token,catalog_enabled,welcome_message')
          .eq('phone_number_id', value.metadata?.phone_number_id ?? '')
          .eq('is_active', true)
          .maybeSingle<WaConfig>();

        if (!config) continue;

        for (const msg of value.messages ?? []) {
          await processMessage(supabase, config, msg, value.contacts ?? []);
        }

        for (const status of value.statuses ?? []) {
          if (status.id) {
            await supabase
              .from('whatsapp_messages')
              .update({ status: status.status })
              .eq('wa_message_id', status.id);
          }
        }
      }
    }

    return new Response('OK', { status: 200 });
  }

  return new Response('Method not allowed', { status: 405 });
});

// ─── Message processing ───────────────────────────────────────────────────────

async function processMessage(
  supabase: ReturnType<typeof createClient>,
  config: WaConfig,
  msg: WaMessage,
  contacts: WaContact[],
) {
  const contact  = contacts.find((c) => c.wa_id === msg.from);
  const fromName = contact?.profile?.name ?? null;

  let body = '';
  if (msg.type === 'text') {
    body = msg.text?.body ?? '';
  } else if (msg.type === 'interactive') {
    body = msg.interactive?.list_reply?.title
        ?? msg.interactive?.button_reply?.title
        ?? '';
  }

  // Stocker le message (idempotent via contrainte UNIQUE sur wa_message_id)
  const { error: insertErr } = await supabase.from('whatsapp_messages').insert({
    business_id:   config.business_id,
    wa_message_id: msg.id,
    from_phone:    msg.from,
    from_name:     fromName,
    direction:     'inbound',
    message_type:  msg.type,
    body,
    payload:       msg,
    status:        'received',
  });

  // Doublon : message déjà traité
  if ((insertErr as { code?: string } | null)?.code === '23505') return;

  if (config.catalog_enabled) {
    await handleCatalogFlow(supabase, config, msg, body, fromName);
  } else {
    // Mode manuel : auto-reply de bienvenue uniquement au premier message
    if (config.welcome_message) {
      const { count } = await supabase
        .from('whatsapp_messages')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', config.business_id)
        .eq('from_phone', msg.from)
        .eq('direction', 'inbound');
      if ((count ?? 0) <= 1) {
        await sendTextMessage(config, msg.from, config.welcome_message);
      }
    }
  }
}

// ─── Catalogue interactif ─────────────────────────────────────────────────────

async function handleCatalogFlow(
  supabase: ReturnType<typeof createClient>,
  config: WaConfig,
  msg: WaMessage,
  body: string,
  fromName: string | null,
) {
  const fromPhone = msg.from;
  const lower     = body.toLowerCase().trim();

  // Récupérer le panier actuel
  const { data: cart } = await supabase
    .from('whatsapp_carts')
    .select('*')
    .eq('business_id', config.business_id)
    .eq('from_phone', fromPhone)
    .maybeSingle();

  const step: string = cart?.step ?? 'menu';

  // Commandes globales
  if (['menu', 'annuler', 'cancel', 'restart', '0'].includes(lower)) {
    await resetCart(supabase, config, fromPhone);
    await sendCategoryMenu(supabase, config, fromPhone);
    return;
  }

  // Confirmation de commande
  if (['confirmer', 'confirm', 'oui', 'yes', 'ok'].includes(lower) && step === 'confirm') {
    await confirmOrder(supabase, config, cart, fromPhone, fromName);
    return;
  }

  // Sélection de catégorie (réponse interactive)
  if ((step === 'menu' || step === 'category') && msg.type === 'interactive'
      && msg.interactive?.type === 'list_reply') {
    const catId = msg.interactive.list_reply?.id ?? '';
    await supabase.from('whatsapp_carts').upsert({
      business_id: config.business_id,
      from_phone:  fromPhone,
      step:        'product',
      items:       cart?.items ?? [],
      context:     { selected_category: catId },
      updated_at:  new Date().toISOString(),
    }, { onConflict: 'business_id,from_phone' });
    await sendProductMenu(supabase, config, fromPhone, catId);
    return;
  }

  // Sélection de produit (réponse interactive)
  if (step === 'product' && msg.type === 'interactive'
      && msg.interactive?.type === 'list_reply') {
    const productId = msg.interactive.list_reply?.id ?? '';
    await addToCart(supabase, config, cart, fromPhone, productId);
    return;
  }

  // Résumé panier si step = confirm
  if (step === 'confirm') {
    await sendCartSummary(supabase, config, cart, fromPhone);
    return;
  }

  // Fallback : envoyer le menu
  await sendCategoryMenu(supabase, config, fromPhone);
}

async function sendCategoryMenu(
  supabase: ReturnType<typeof createClient>,
  config: WaConfig,
  toPhone: string,
) {
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')
    .eq('business_id', config.business_id)
    .order('sort_order')
    .limit(10);

  if (!categories?.length) {
    await sendTextMessage(config, toPhone, "Notre catalogue n'est pas encore disponible. Revenez bientôt !");
    return;
  }

  await resetCart(supabase, config, toPhone);

  const rows = categories.map((c: { id: string; name: string }) => ({
    id:          c.id,
    title:       c.name.slice(0, 24),
    description: '',
  }));

  await sendInteractiveList(config, toPhone, {
    body:     '🛍️ Choisissez une catégorie :',
    button:   'Voir les catégories',
    sections: [{ title: 'Catégories', rows }],
  });
}

async function sendProductMenu(
  supabase: ReturnType<typeof createClient>,
  config: WaConfig,
  toPhone: string,
  categoryId: string,
) {
  const { data: products } = await supabase
    .from('products')
    .select('id, name, price')
    .eq('business_id', config.business_id)
    .eq('category_id', categoryId)
    .eq('is_active', true)
    .order('name')
    .limit(10);

  if (!products?.length) {
    await sendTextMessage(config, toPhone, 'Aucun produit dans cette catégorie. Tapez *menu* pour revenir.');
    return;
  }

  const { data: biz } = await supabase.from('businesses').select('currency').eq('id', config.business_id).single();
  const currency = (biz as { currency?: string } | null)?.currency ?? 'XOF';

  const rows = products.map((p: { id: string; name: string; price: number }) => ({
    id:          p.id,
    title:       p.name.slice(0, 24),
    description: `${p.price.toLocaleString()} ${currency}`,
  }));

  await sendInteractiveList(config, toPhone, {
    body:     '📦 Choisissez un produit (tapez *menu* pour revenir) :',
    button:   'Choisir',
    sections: [{ title: 'Produits', rows }],
  });
}

async function addToCart(
  supabase: ReturnType<typeof createClient>,
  config: WaConfig,
  cart: Record<string, unknown> | null,
  fromPhone: string,
  productId: string,
) {
  const { data: product } = await supabase
    .from('products')
    .select('id, name, price')
    .eq('id', productId)
    .eq('business_id', config.business_id)
    .single();

  if (!product) {
    await sendTextMessage(config, fromPhone, 'Produit introuvable. Tapez *menu* pour recommencer.');
    return;
  }

  const items: CartItem[] = (cart?.items as CartItem[] | null) ?? [];
  const existing = items.find((i) => i.product_id === productId);

  if (existing) {
    existing.quantity += 1;
    existing.total = existing.price * existing.quantity;
  } else {
    const p = product as { id: string; name: string; price: number };
    items.push({ product_id: p.id, name: p.name, price: p.price, quantity: 1, total: p.price });
  }

  await supabase.from('whatsapp_carts').upsert({
    business_id: config.business_id,
    from_phone:  fromPhone,
    step:        'confirm',
    items,
    context:     cart?.context ?? {},
    updated_at:  new Date().toISOString(),
  }, { onConflict: 'business_id,from_phone' });

  const { data: updatedCart } = await supabase
    .from('whatsapp_carts')
    .select('*')
    .eq('business_id', config.business_id)
    .eq('from_phone', fromPhone)
    .single();

  await sendCartSummary(supabase, config, updatedCart, fromPhone);
}

async function sendCartSummary(
  supabase: ReturnType<typeof createClient>,
  config: WaConfig,
  cart: Record<string, unknown> | null,
  fromPhone: string,
) {
  const items: CartItem[] = (cart?.items as CartItem[] | null) ?? [];

  if (!items.length) {
    await sendTextMessage(config, fromPhone, 'Votre panier est vide. Tapez *menu* pour commander.');
    return;
  }

  const { data: biz } = await supabase.from('businesses').select('currency').eq('id', config.business_id).single();
  const currency = (biz as { currency?: string } | null)?.currency ?? 'XOF';
  const total    = items.reduce((s, i) => s + i.total, 0);
  const lines    = items.map((i) => `• ${i.name} × ${i.quantity} = ${i.total.toLocaleString()} ${currency}`).join('\n');

  const summary = `🛒 *Votre commande :*\n${lines}\n\n💰 *Total : ${total.toLocaleString()} ${currency}*\n\nTapez *confirmer* pour valider ou *menu* pour modifier.`;
  await sendTextMessage(config, fromPhone, summary);
}

async function confirmOrder(
  supabase: ReturnType<typeof createClient>,
  config: WaConfig,
  cart: Record<string, unknown> | null,
  fromPhone: string,
  fromName: string | null,
) {
  const items: CartItem[] = (cart?.items as CartItem[] | null) ?? [];

  if (!items.length) {
    await sendTextMessage(config, fromPhone, 'Votre panier est vide. Tapez *menu* pour commander.');
    return;
  }

  const total = items.reduce((s, i) => s + i.total, 0);

  const { data: order, error: orderErr } = await supabase.from('orders').insert({
    business_id:     config.business_id,
    cashier_id:      null,
    status:          'pending',
    subtotal:        total,
    tax_amount:      0,
    discount_amount: 0,
    total,
    notes:           `Commande WhatsApp — ${fromName ?? fromPhone}`,
    customer_name:   fromName ?? fromPhone,
    customer_phone:  fromPhone,
    source:          'whatsapp',
  }).select().single();

  if (orderErr || !order) {
    await sendTextMessage(config, fromPhone, 'Une erreur est survenue. Veuillez réessayer ou nous contacter directement.');
    return;
  }

  await supabase.from('order_items').insert(
    items.map((i) => ({
      order_id:        (order as { id: string }).id,
      product_id:      i.product_id,
      name:            i.name,
      price:           i.price,
      quantity:        i.quantity,
      discount_amount: 0,
      total:           i.total,
    }))
  );

  // Lier les messages WhatsApp à la commande
  await supabase
    .from('whatsapp_messages')
    .update({ order_id: (order as { id: string }).id, status: 'ordered' })
    .eq('business_id', config.business_id)
    .eq('from_phone', fromPhone)
    .is('order_id', null);

  // Vider le panier
  await supabase.from('whatsapp_carts')
    .delete()
    .eq('business_id', config.business_id)
    .eq('from_phone', fromPhone);

  // Confirmation au client
  const confirmMsg = `✅ *Commande confirmée !*\n\nVotre commande a bien été enregistrée. Notre équipe vous contactera pour la préparation ou la livraison.\n\nMerci de votre confiance ! 🙏\n\nPour une nouvelle commande, tapez *menu*.`;
  await sendTextMessage(config, fromPhone, confirmMsg);

  // Stocker le message sortant
  await supabase.from('whatsapp_messages').insert({
    business_id:  config.business_id,
    from_phone:   fromPhone,
    direction:    'outbound',
    message_type: 'text',
    body:         confirmMsg,
    order_id:     (order as { id: string }).id,
    status:       'sent',
  });
}

async function resetCart(
  supabase: ReturnType<typeof createClient>,
  config: WaConfig,
  fromPhone: string,
) {
  await supabase.from('whatsapp_carts').upsert({
    business_id: config.business_id,
    from_phone:  fromPhone,
    step:        'menu',
    items:       [],
    context:     {},
    updated_at:  new Date().toISOString(),
  }, { onConflict: 'business_id,from_phone' });
}

// ─── Helpers Meta Cloud API ───────────────────────────────────────────────────

async function sendTextMessage(config: WaConfig, toPhone: string, text: string) {
  await callMetaAPI(config, {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:                toPhone,
    type:              'text',
    text:              { preview_url: false, body: text },
  });
}

async function sendInteractiveList(
  config: WaConfig,
  toPhone: string,
  opts: {
    body:     string;
    button:   string;
    sections: { title: string; rows: { id: string; title: string; description: string }[] }[];
  },
) {
  await callMetaAPI(config, {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:                toPhone,
    type:              'interactive',
    interactive: {
      type: 'list',
      body: { text: opts.body },
      action: {
        button:   opts.button,
        sections: opts.sections,
      },
    },
  });
}

async function callMetaAPI(config: WaConfig, payload: unknown) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${config.phone_number_id}/messages`,
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${config.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const err = await res.text();
      console.error('[WhatsApp] Meta API error:', res.status, err);
    }
  } catch (e) {
    console.error('[WhatsApp] Meta API call failed:', e);
  }
}
