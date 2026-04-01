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
  catalog_enabled:   boolean;
  welcome_message:   string;
  menu_keyword:      string;
  confirm_message:   string;
  wave_payment_url:  string | null;
  business_name?:    string;
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
          .select('id,business_id,phone_number_id,access_token,catalog_enabled,welcome_message,menu_keyword,confirm_message,wave_payment_url,businesses(name)')
          .eq('phone_number_id', value.metadata?.phone_number_id ?? '')
          .eq('is_active', true)
          .maybeSingle();

        if (config) {
          (config as WaConfig).business_name =
            (config as { businesses?: { name?: string } }).businesses?.name ?? '';
        }

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
  const fromPhone = normalizePhone(msg.from);
  const contact   = contacts.find((c) => c.wa_id === msg.from);
  const fromName  = contact?.profile?.name ?? null;

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
    from_phone:    fromPhone,
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
        .eq('from_phone', fromPhone)
        .eq('direction', 'inbound');
      if ((count ?? 0) <= 1) {
        await sendTextMessage(config, fromPhone, resolvePlaceholders(config.welcome_message, config));
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
  const fromPhone = normalizePhone(msg.from);
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
  const menuKeyword = (config.menu_keyword || 'menu').toLowerCase();
  if ([menuKeyword, 'annuler', 'cancel', 'restart', '0'].includes(lower)) {
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

  // Sélection de produit (liste ou bouton image)
  if (step === 'product' && msg.type === 'interactive') {
    const productId = msg.interactive?.list_reply?.id
                   ?? msg.interactive?.button_reply?.id
                   ?? '';
    if (productId) {
      await addToCart(supabase, config, cart, fromPhone, productId);
      return;
    }
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
  await resetCart(supabase, config, toPhone);

  // Menu du jour — affiché en premier s'il existe pour aujourd'hui
  const today = new Date().toISOString().slice(0, 10);
  const { data: dailyMenu } = await supabase
    .from('daily_menus')
    .select('id, note, image_url')
    .eq('business_id', config.business_id)
    .eq('date', today)
    .maybeSingle();

  if (dailyMenu) {
    const { data: dailyItems } = await supabase
      .from('daily_menu_items')
      .select('product_id, custom_price, sort_order, products(name, price, image_url)')
      .eq('daily_menu_id', dailyMenu.id)
      .order('sort_order')
      .limit(10);

    if (dailyItems?.length) {
      const { data: biz } = await supabase.from('businesses').select('currency').eq('id', config.business_id).single();
      const currency = displayCurrency((biz as { currency?: string } | null)?.currency ?? 'XOF');

      type DailyItem = {
        product_id: string;
        custom_price: number | null;
        sort_order: number;
        products: { name: string; price: number; image_url: string | null };
      };

      const introText = dailyMenu.note
        ? `🍽️ *Menu du jour*\n${dailyMenu.note}`
        : '🍽️ *Menu du jour*';

      // Image du menu si disponible
      if ((dailyMenu as { image_url?: string | null }).image_url) {
        await callMetaAPI(config, {
          messaging_product: 'whatsapp',
          recipient_type:    'individual',
          to:                toPhone,
          type:              'image',
          image:             { link: (dailyMenu as { image_url: string }).image_url, caption: introText },
        });
      } else {
        await sendTextMessage(config, toPhone, introText);
      }

      const withImage    = (dailyItems as DailyItem[]).filter((i) => i.products.image_url);
      const withoutImage = (dailyItems as DailyItem[]).filter((i) => !i.products.image_url);

      for (const item of withImage) {
        const price = item.custom_price ?? item.products.price;
        const body  = `*${item.products.name}*\n💰 ${price.toLocaleString()} ${currency}`;
        await callMetaAPI(config, {
          messaging_product: 'whatsapp',
          recipient_type:    'individual',
          to:                toPhone,
          type:              'interactive',
          interactive: {
            type:   'button',
            header: { type: 'image', image: { link: item.products.image_url } },
            body:   { text: body },
            action: { buttons: [{ type: 'reply', reply: { id: item.product_id, title: '🛒 Ajouter' } }] },
          },
        });
        await supabase.from('whatsapp_messages').insert({
          business_id: config.business_id, from_phone: toPhone,
          direction: 'outbound', message_type: 'image', body,
          payload: { image_url: item.products.image_url, product_id: item.product_id, product_name: item.products.name },
          status: 'sent',
        });
      }

      if (withoutImage.length > 0) {
        const rows = withoutImage.map((item) => {
          const price = item.custom_price ?? item.products.price;
          return {
            id:          item.product_id,
            title:       item.products.name.slice(0, 24),
            description: `${price.toLocaleString()} ${currency}`,
          };
        });
        await sendInteractiveList(config, toPhone, {
          body:     withImage.length > 0 ? 'Autres plats du jour :' : '🍽️ Choisissez un plat :',
          button:   'Choisir',
          sections: [{ title: 'Menu du jour', rows }],
        });
      }

      await sendTextMessage(config, toPhone, '_Tapez *menu* pour voir le catalogue complet._');
      return;
    }
  }

  // Catalogue normal
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
    .select('id, name, price, image_url')
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
  const currency = displayCurrency((biz as { currency?: string } | null)?.currency ?? 'XOF');

  type Product = { id: string; name: string; price: number; image_url?: string | null };

  // Séparer produits avec et sans image
  const withImage    = (products as Product[]).filter((p) => p.image_url);
  const withoutImage = (products as Product[]).filter((p) => !p.image_url);

  // Produits avec image → message image + bouton "Ajouter"
  for (const p of withImage) {
    const productBody = `*${p.name}*\n💰 ${p.price.toLocaleString()} ${currency}`;
    await callMetaAPI(config, {
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to:                toPhone,
      type:              'interactive',
      interactive: {
        type: 'button',
        header: {
          type:  'image',
          image: { link: p.image_url },
        },
        body: { text: productBody },
        action: {
          buttons: [
            { type: 'reply', reply: { id: p.id, title: '🛒 Ajouter' } },
          ],
        },
      },
    });
    // Stocker le message sortant avec l'image dans le payload
    await supabase.from('whatsapp_messages').insert({
      business_id:  config.business_id,
      from_phone:   toPhone,
      direction:    'outbound',
      message_type: 'image',
      body:         productBody,
      payload:      { image_url: p.image_url, product_id: p.id, product_name: p.name },
      status:       'sent',
    });
  }

  // Produits sans image → liste classique groupée
  if (withoutImage.length > 0) {
    const rows = withoutImage.map((p) => ({
      id:          p.id,
      title:       p.name.slice(0, 24),
      description: `${p.price.toLocaleString()} ${currency}`,
    }));
    await sendInteractiveList(config, toPhone, {
      body:     withImage.length > 0 ? 'Autres produits :' : '📦 Choisissez un produit :',
      button:   'Choisir',
      sections: [{ title: 'Produits', rows }],
    });
  }

  await sendTextMessage(config, toPhone, '_Tapez *menu* pour revenir au début._');
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
  const currency = displayCurrency((biz as { currency?: string } | null)?.currency ?? 'XOF');
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

  // Enregistrer / mettre à jour le client dans la table clients
  const { data: existingClient } = await supabase
    .from('clients')
    .select('id')
    .eq('business_id', config.business_id)
    .eq('phone', fromPhone)
    .maybeSingle();

  if (existingClient) {
    // Mettre à jour le nom si on l'a maintenant
    if (fromName) {
      await supabase.from('clients')
        .update({ name: fromName })
        .eq('id', (existingClient as { id: string }).id);
    }
  } else {
    await supabase.from('clients').insert({
      business_id: config.business_id,
      name:        fromName ?? fromPhone,
      phone:       fromPhone,
      notes:       'Client WhatsApp',
    });
  }

  // Vider le panier
  await supabase.from('whatsapp_carts')
    .delete()
    .eq('business_id', config.business_id)
    .eq('from_phone', fromPhone);

  // Confirmation au client
  const confirmMsg = resolvePlaceholders(
    config.confirm_message || '✅ *Commande confirmée !*\n\nMerci de votre confiance ! 🙏\n\nPour une nouvelle commande, tapez *{mot_cle}*.',
    config,
  );
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

  // Lien de paiement Wave (si configuré)
  if (config.wave_payment_url) {
    const waveLink = `${config.wave_payment_url}amount=${total}`;
    const waveMsg  = `💳 *Payer par Wave :*\n${waveLink}`;
    await sendTextMessage(config, fromPhone, waveMsg);
    await supabase.from('whatsapp_messages').insert({
      business_id:  config.business_id,
      from_phone:   fromPhone,
      direction:    'outbound',
      message_type: 'text',
      body:         waveMsg,
      order_id:     (order as { id: string }).id,
      status:       'sent',
    });
  }
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

// ─── Currency display ─────────────────────────────────────────────────────────

function displayCurrency(code: string): string {
  const map: Record<string, string> = { XOF: 'FCFA', XAF: 'FCFA' };
  return map[code] ?? code;
}

// ─── Placeholders ─────────────────────────────────────────────────────────────

function normalizePhone(phone: string): string {
  return phone.startsWith('+') ? phone : `+${phone}`;
}

function resolvePlaceholders(template: string, config: WaConfig): string {
  return template
    .replace(/\{nom\}/gi,      config.business_name ?? '')
    .replace(/\{mot_cle\}/gi,  config.menu_keyword  ?? 'menu');
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
