import { timingSafeEqual } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Module serveur uniquement — importer exclusivement depuis app/api/*.
// Ne jamais importer depuis un composant renderer (exposerait les clés PayDunya).

export type SoftpayMethod =
  | 'orange-money-senegal'
  | 'wave-senegal'
  | 'free-money-senegal'
  | 'expresso-senegal'
  | 'djamo-senegal';

export interface PaydunyaSettings {
  mode:              'test' | 'live';
  // Une seule Clé Principale (Master Key) par application PayDunya, partagée
  // entre Test et Production — seules Publique/Privée/Token sont dupliquées.
  master_key:        string | null;
  test_private_key:  string | null;
  test_public_key:   string | null;
  test_token:        string | null;
  live_private_key:  string | null;
  live_public_key:   string | null;
  live_token:        string | null;
  store_name:        string;
  store_logo_url:    string | null;
  store_website_url: string | null;
  proxy_api_key:     string | null;
}

interface ActiveKeys {
  master_key:  string | null;
  private_key: string | null;
  public_key:  string | null;
  token:       string | null;
}

export function activeKeys(settings: PaydunyaSettings): ActiveKeys {
  return settings.mode === 'live'
    ? { master_key: settings.master_key, private_key: settings.live_private_key, public_key: settings.live_public_key, token: settings.live_token }
    : { master_key: settings.master_key, private_key: settings.test_private_key, public_key: settings.test_public_key, token: settings.test_token };
}

export interface PaydunyaTransaction {
  id:                  string;
  external_reference:  string | null;
  invoice_token:       string | null;
  provider:            string;
  amount:              number;
  currency:            string;
  status:              'pending' | 'completed' | 'failed' | 'cancelled';
  redirect_url:        string | null;
  customer_name:       string | null;
  customer_email:      string | null;
  customer_phone:      string | null;
  created_at:          string;
  updated_at:          string;
}

export async function getPaydunyaSettings(): Promise<PaydunyaSettings> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from('paydunya_settings').select('*').eq('id', 1).single();
  if (error) throw new Error(error.message);
  return data as unknown as PaydunyaSettings;
}

function baseUrl(mode: 'test' | 'live'): string {
  // PayDunya utilise deux préfixes de chemin distincts selon le mode — les
  // deux vivent sous le même domaine app.paydunya.com.
  return mode === 'live'
    ? 'https://app.paydunya.com/api/v1'
    : 'https://app.paydunya.com/sandbox-api/v1';
}

function authHeaders(settings: PaydunyaSettings): HeadersInit {
  const keys = activeKeys(settings);
  if (!keys.master_key || !keys.private_key || !keys.token) {
    throw Object.assign(
      new Error(`PayDunya n'est pas configuré pour le mode "${settings.mode}" (clés manquantes) — configurez-le depuis le backoffice.`),
      { status: 503 },
    );
  }
  return {
    'Content-Type': 'application/json',
    'PAYDUNYA-MASTER-KEY': keys.master_key,
    'PAYDUNYA-PRIVATE-KEY': keys.private_key,
    'PAYDUNYA-TOKEN': keys.token,
  };
}

export interface CreateInvoiceParams {
  amount:            number;
  description:       string;
  externalReference?: string;
  customData?:       Record<string, unknown>;
  returnUrl?:        string;
  cancelUrl?:        string;
  callbackUrl:       string; // URL de notre webhook IPN
}

/** Étape 1 obligatoire de tout paiement PayDunya : créer une facture, qui renvoie un token. */
export async function createInvoice(settings: PaydunyaSettings, params: CreateInvoiceParams): Promise<{ token: string; checkoutUrl: string }> {
  const res = await fetch(`${baseUrl(settings.mode)}/checkout-invoice/create`, {
    method: 'POST',
    headers: authHeaders(settings),
    body: JSON.stringify({
      invoice: {
        total_amount: params.amount,
        description:  params.description,
      },
      store: {
        name:        settings.store_name,
        logo_url:    settings.store_logo_url ?? '',
        website_url: settings.store_website_url ?? '',
      },
      custom_data: { external_reference: params.externalReference ?? null, ...params.customData },
      actions: {
        callback_url: params.callbackUrl,
        return_url:   params.returnUrl ?? '',
        cancel_url:   params.cancelUrl ?? '',
      },
    }),
  });
  const json = await res.json();
  if (json.response_code !== '00' || !json.token) {
    throw Object.assign(new Error(json.response_text || 'Échec de création de la facture PayDunya.'), { status: 502 });
  }
  return { token: json.token as string, checkoutUrl: json.response_text as string };
}

export interface SoftpayCustomer {
  name:  string;
  email: string;
  phone: string;
}

export interface SoftpayResult {
  success:  boolean;
  message:  string;
  /** 'redirect' : afficher/ouvrir redirectUrl. 'pending' : le client valide sur son téléphone (USSD/appli), pas d'URL. */
  flow:     'redirect' | 'pending';
  /** URL de paiement à afficher/rediriger (QR Orange Money, page Wave/Djamo). */
  redirectUrl?: string;
  /** Lien profond vers l'app Orange Money (mobile, Orange Money Sénégal uniquement). */
  omUrl?:    string;
  /** Lien profond vers l'app Maxit (mobile, Orange Money Sénégal uniquement). */
  maxitUrl?: string;
  raw: unknown;
}

interface SoftpayMethodConfig {
  endpoint: string;
  flow:     'redirect' | 'pending';
  body:     (customer: SoftpayCustomer, invoiceToken: string) => Record<string, unknown>;
}

const SOFTPAY_METHODS: Record<SoftpayMethod, SoftpayMethodConfig> = {
  'orange-money-senegal': {
    endpoint: 'new-orange-money-senegal',
    flow: 'redirect',
    body: (c, token) => ({ customer_name: c.name, customer_email: c.email, phone_number: c.phone, invoice_token: token }),
  },
  'wave-senegal': {
    endpoint: 'wave-senegal',
    flow: 'redirect',
    body: (c, token) => ({ wave_senegal_fullName: c.name, wave_senegal_email: c.email, wave_senegal_phone: c.phone, wave_senegal_payment_token: token }),
  },
  'free-money-senegal': {
    endpoint: 'free-money-senegal',
    flow: 'pending', // le client valide via un code USSD reçu par SMS
    body: (c, token) => ({ customer_name: c.name, customer_email: c.email, phone_number: c.phone, payment_token: token }),
  },
  'expresso-senegal': {
    endpoint: 'expresso-senegal',
    flow: 'pending',
    body: (c, token) => ({ expresso_sn_fullName: c.name, expresso_sn_email: c.email, expresso_sn_phone: c.phone, payment_token: token }),
  },
  'djamo-senegal': {
    endpoint: 'djamo',
    flow: 'redirect',
    body: (c, token) => ({ djamo_fullName: c.name, djamo_email: c.email, djamo_phone: c.phone, code_country: 'sn', djamo_payment_token: token }),
  },
};

// Contrairement à checkout-invoice/create|confirm, les endpoints SOFTPAY
// n'existent pas sous le préfixe sandbox-api (404 "Page non trouvée" chez
// PayDunya) — ils vivent uniquement sous /api/v1, et acceptent directement
// des clés test_ ou live_ : c'est la clé fournie qui détermine le mode, pas
// l'URL. Vérifié empiriquement contre l'API PayDunya (2026-08-20).
const SOFTPAY_BASE_URL = 'https://app.paydunya.com/api/v1';

/** Déclenche le paiement via une méthode SOFTPAY donnée, sur une facture déjà créée. */
export async function initiateSoftpay(
  settings: PaydunyaSettings,
  method: SoftpayMethod,
  invoiceToken: string,
  customer: SoftpayCustomer,
): Promise<SoftpayResult> {
  const config = SOFTPAY_METHODS[method];
  const res = await fetch(`${SOFTPAY_BASE_URL}/softpay/${config.endpoint}`, {
    method: 'POST',
    headers: authHeaders(settings),
    body: JSON.stringify(config.body(customer, invoiceToken)),
  });
  const json = await res.json();

  if (!json.success) {
    throw Object.assign(new Error(json.message || json?.errors?.message || 'Paiement refusé par PayDunya.'), { status: 402 });
  }

  return {
    success: true,
    message: json.message,
    flow: config.flow,
    redirectUrl: json.url,
    omUrl: json.other_url?.om_url,
    maxitUrl: json.other_url?.maxit_url,
    raw: json,
  };
}

export interface ConfirmResult {
  status:      'completed' | 'pending' | 'failed' | 'cancelled';
  amount:      number | null;
  receiptUrl:  string | null;
  raw:         unknown;
}

/**
 * Interroge PayDunya pour le statut définitif d'une facture — à utiliser après
 * réception d'un IPN plutôt que de faire confiance au corps du webhook, car le
 * hash renvoyé par l'IPN est un hash statique de la master key (ne dépend pas
 * du contenu de la transaction) et ne prouve donc pas l'intégrité du payload.
 */
export async function confirmInvoice(settings: PaydunyaSettings, invoiceToken: string): Promise<ConfirmResult> {
  const res = await fetch(`${baseUrl(settings.mode)}/checkout-invoice/confirm/${invoiceToken}`, {
    method: 'GET',
    headers: authHeaders(settings),
  });
  const json = await res.json();
  const status: ConfirmResult['status'] = json.status === 'completed' ? 'completed'
    : json.status === 'failed' ? 'failed'
    : json.status === 'cancelled' ? 'cancelled'
    : 'pending';
  return {
    status,
    amount: json.invoice?.total_amount ? Number(json.invoice.total_amount) : null,
    receiptUrl: json.receipt_url ?? null,
    raw: json,
  };
}

// ─── Transactions (audit + suivi statut) ──────────────────────────────────────

export async function recordTransaction(data: {
  external_reference?: string | null;
  invoice_token:       string;
  provider:            SoftpayMethod | 'paydunya-hosted-checkout';
  amount:              number;
  currency?:           string;
  customer_name:       string;
  customer_email:      string;
  customer_phone:      string;
  redirect_url?:       string | null;
  raw_initiate_response: unknown;
}): Promise<PaydunyaTransaction> {
  const admin = getSupabaseAdmin();
  const { data: row, error } = await admin
    .from('paydunya_transactions')
    .insert({
      external_reference: data.external_reference ?? null,
      invoice_token:       data.invoice_token,
      provider:            data.provider,
      amount:              data.amount,
      currency:            data.currency ?? 'XOF',
      customer_name:       data.customer_name,
      customer_email:      data.customer_email,
      customer_phone:      data.customer_phone,
      redirect_url:        data.redirect_url ?? null,
      raw_initiate_response: data.raw_initiate_response as never,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return row as unknown as PaydunyaTransaction;
}

/**
 * Met à jour redirect_url/raw_initiate_response après coup — utilisé par le
 * proxy SOFTPAY pour enregistrer la transaction (statut 'pending' par défaut)
 * immédiatement après la création de la facture PayDunya, avant même de
 * déclencher le SOFTPAY : si l'IPN du webhook arrivait avant que la ligne
 * n'existe, updateTransactionStatus ne trouverait aucune ligne à mettre à jour.
 */
export async function updateTransactionInitiateResult(
  id: string,
  data: { redirect_url: string | null; raw_initiate_response: unknown },
): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('paydunya_transactions')
    .update({
      redirect_url: data.redirect_url,
      raw_initiate_response: data.raw_initiate_response as never,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function updateTransactionStatus(
  invoiceToken: string,
  status: 'completed' | 'failed' | 'cancelled',
  rawConfirmResponse: unknown,
): Promise<PaydunyaTransaction | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('paydunya_transactions')
    .update({ status, raw_confirm_response: rawConfirmResponse as never, updated_at: new Date().toISOString() })
    .eq('invoice_token', invoiceToken)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as PaydunyaTransaction) ?? null;
}

export async function getTransactionByToken(invoiceToken: string): Promise<PaydunyaTransaction | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('paydunya_transactions')
    .select('*')
    .eq('invoice_token', invoiceToken)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as PaydunyaTransaction) ?? null;
}

export async function getTransactionByReference(externalReference: string): Promise<PaydunyaTransaction | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('paydunya_transactions')
    .select('*')
    .eq('external_reference', externalReference)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as PaydunyaTransaction) ?? null;
}

// ─── Paiement d'une demande d'abonnement ELM (partagé /subscribe + /billing) ──
// Les deux pages ELM (nouveaux prospects sur /subscribe, clients existants qui
// renouvellent sur /billing) suivent exactement le même flow : résoudre le prix
// réel du plan côté serveur, créer la facture PayDunya, puis rediriger vers la
// page de paiement hébergée PayDunya (tous moyens de paiement inclus, gérés
// par PayDunya lui-même — pas de SOFTPAY direct ici) :
// contrairement au SOFTPAY, cette page hébergée ne nécessite pas de validation
// KYC préalable du compte business. Le SOFTPAY method-par-method reste
// disponible via /api/payments/paydunya/initiate pour les applications
// externes une fois le compte vérifié.

export interface PayForRequestResult {
  invoice_token: string;
  redirect_url:  string | null;
  om_url:        string | null;
  maxit_url:     string | null;
  flow:          'redirect' | 'pending';
  message:       string;
}

interface RequestRow { id: string; business_name?: string; email?: string; plan_id: string; payment_status: string | null }

/**
 * Cœur partagé : facture la demande déjà en base (row insérée par l'appelant),
 * en supprimant la ligne si PayDunya échoue — pour ne jamais laisser une
 * demande fantôme visible dans le backoffice quand le paiement n'a même pas
 * pu démarrer (KYC, réseau, clés manquantes...).
 */
async function payExistingRequest(
  admin: ReturnType<typeof getSupabaseAdmin>,
  table: 'public_subscription_requests' | 'subscription_requests',
  reqRow: RequestRow,
  customerName: string,
  customerEmail: string,
  customerPhone: string,
  origin: string,
  returnPath: string,
): Promise<PayForRequestResult> {
  try {
    const { data: plan, error: planErr } = await admin
      .from('plans')
      .select('id, label, price, currency')
      .eq('id', reqRow.plan_id)
      .single();
    if (planErr || !plan) throw Object.assign(new Error('Plan introuvable.'), { status: 404 });
    if (!plan.price || plan.price <= 0) throw Object.assign(new Error('Ce plan est gratuit — aucun paiement requis.'), { status: 400 });

    const settings = await getPaydunyaSettings();

    const invoice = await createInvoice(settings, {
      amount: plan.price,
      description: `Abonnement ELM — ${plan.label}`,
      externalReference: reqRow.id,
      returnUrl: `${origin}${returnPath}?paid=1&ref=${reqRow.id}`,
      cancelUrl: `${origin}${returnPath}?cancelled=1&ref=${reqRow.id}`,
      callbackUrl: `${origin}/api/payments/paydunya/webhook`,
    });

    const finalName  = customerName  || reqRow.business_name || '';
    const finalEmail = customerEmail || reqRow.email || '';

    await recordTransaction({
      external_reference: reqRow.id,
      invoice_token: invoice.token,
      provider: 'paydunya-hosted-checkout',
      amount: plan.price,
      currency: plan.currency,
      customer_name: finalName,
      customer_email: finalEmail,
      customer_phone: customerPhone,
      redirect_url: invoice.checkoutUrl,
      raw_initiate_response: invoice,
    });

    return {
      invoice_token: invoice.token,
      redirect_url:  invoice.checkoutUrl,
      om_url:        null,
      maxit_url:     null,
      flow:          'redirect',
      message:       'Redirection vers la page de paiement PayDunya',
    };
  } catch (err) {
    // La demande n'a jamais réellement démarré son paiement — on la retire
    // plutôt que de laisser un doublon vide dans la file du backoffice.
    await admin.from(table).delete().eq('id', reqRow.id);
    throw err;
  }
}

export interface CreateAndPayExistingBusinessParams {
  businessId:     string;
  planId:         string;
  customerName:   string;
  customerEmail:  string;
  customerPhone:  string;
  origin:         string;
}

/** /billing — client déjà inscrit qui renouvelle/change de plan. */
export async function createAndPayExistingBusinessRequest(params: CreateAndPayExistingBusinessParams): Promise<PayForRequestResult> {
  const admin = getSupabaseAdmin();
  const { data: inserted, error: insErr } = await admin
    .from('subscription_requests')
    .insert({ business_id: params.businessId, plan_id: params.planId, receipt_url: '' })
    .select('id, plan_id, payment_status')
    .single();
  if (insErr || !inserted) throw Object.assign(new Error("Impossible de créer la demande."), { status: 500 });

  return payExistingRequest(
    admin, 'subscription_requests', inserted as RequestRow,
    params.customerName, params.customerEmail, params.customerPhone,
    params.origin, '/billing',
  );
}

export interface CreateAndPayPublicParams {
  businessName:   string;
  denomination?:  string | null;
  fullName:       string;
  email:          string;
  phone?:         string | null;
  planId:         string;
  origin:         string;
}

/** /subscribe — nouveau prospect sans compte. */
export async function createAndPayPublicRequest(params: CreateAndPayPublicParams): Promise<PayForRequestResult & { requestId: string }> {
  const admin = getSupabaseAdmin();
  const { data: inserted, error: insErr } = await admin
    .from('public_subscription_requests')
    .insert({
      business_name: params.businessName,
      denomination:  params.denomination ?? null,
      full_name:     params.fullName,
      email:         params.email,
      phone:         params.phone ?? null,
      plan_id:       params.planId,
      receipt_url:   null,
    })
    .select('id, business_name, email, plan_id, payment_status')
    .single();
  if (insErr || !inserted) throw Object.assign(new Error("Impossible de créer la demande."), { status: 500 });

  const result = await payExistingRequest(
    admin, 'public_subscription_requests', inserted as RequestRow,
    params.fullName, params.email, params.phone ?? '',
    params.origin, '/subscribe',
  );
  return { ...result, requestId: inserted.id };
}

// ─── Activation automatique post-paiement ─────────────────────────────────────
// Jusqu'ici, un paiement PayDunya confirmé ne faisait que marquer la demande
// "payée" — un superadmin devait ensuite valider manuellement dans le
// backoffice pour activer réellement l'abonnement. Puisque le paiement est
// déjà vérifié côté serveur (confirmInvoice, jamais le corps de l'IPN), la
// validation manuelle n'apporte plus rien pour le flow PayDunya : on active
// directement ici, via le client admin (bypass RLS — appel non authentifié
// déclenché par PayDunya, donc pas de session utilisateur disponible).

interface PublicRequestRow {
  id: string; business_name: string; denomination: string | null;
  full_name: string | null; email: string; phone: string | null; plan_id: string | null;
}

/**
 * Appelée à la fois par le webhook IPN et par /api/payments/paydunya/status
 * (?live=1) dès qu'un paiement 'paydunya-hosted-checkout' est confirmé — les
 * deux chemins peuvent découvrir la confirmation en premier selon l'ordre
 * d'arrivée, donc les deux doivent pouvoir déclencher l'activation.
 *
 * Idempotence : la garde `.eq('status', 'pending')` est combinée DANS LA MÊME
 * requête UPDATE qui fait passer `status` à 'approved' (pas dans une requête
 * séparée après coup). Deux appels concurrents (IPN dupliqué, webhook + poll
 * live=1 en même temps) ne peuvent donc pas tous les deux matcher la ligne :
 * Postgres sérialise les UPDATE concurrents sur une même ligne, un seul verra
 * `status = 'pending'` au moment de son UPDATE. C'est ce qui empêche
 * activate_subscription d'être appelée deux fois pour un seul paiement.
 */
export async function autoActivatePaidRequest(externalReference: string, invoiceToken: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const paidPatch = { payment_status: 'paid', paydunya_invoice_token: invoiceToken, payment_confirmed_at: now };

  // Cas /billing : renouvellement d'un business déjà existant.
  const { data: bizReq } = await admin
    .from('subscription_requests')
    .update({ ...paidPatch, status: 'approved', processed_at: now })
    .eq('id', externalReference)
    .eq('status', 'pending')
    .select('id, business_id, plan_id')
    .maybeSingle();
  if (bizReq) {
    const { data: plan } = await admin.from('plans').select('duration_days').eq('id', bizReq.plan_id).single();
    if (!plan?.duration_days) return;

    const { error: rpcError } = await admin.rpc('activate_subscription', {
      p_business_id: bizReq.business_id,
      p_plan_id: bizReq.plan_id,
      p_days: plan.duration_days,
      p_note: 'Paiement PayDunya automatique',
    });
    if (rpcError) {
      // L'activation a échoué (ex: RPC mal configurée, business sans owner) —
      // on revient à 'pending' plutôt que de laisser 'approved' mentir sur
      // l'état réel : la demande redevient visible pour un traitement manuel,
      // et le paiement reste marqué 'paid' donc pas perdu.
      await admin.from('subscription_requests').update({ status: 'pending', processed_at: null }).eq('id', bizReq.id);
      throw new Error(`activate_subscription a échoué pour subscription_requests ${bizReq.id}: ${rpcError.message}`);
    }
    return;
  }

  // Cas /subscribe : nouveau prospect sans compte — crée le compte, le
  // business et l'appartenance, comme le fait approvePublicRequest() côté
  // backoffice, mais entièrement via le client admin (pas de session à relayer).
  const { data: pubReq } = await admin
    .from('public_subscription_requests')
    .update({ ...paidPatch, status: 'approved', processed_at: now })
    .eq('id', externalReference)
    .eq('status', 'pending')
    .select('id, business_name, denomination, full_name, email, phone, plan_id')
    .maybeSingle<PublicRequestRow>();
  if (!pubReq?.plan_id) return;

  const { data: plan } = await admin.from('plans').select('label, duration_days').eq('id', pubReq.plan_id).single();
  if (!plan?.duration_days) {
    await admin.from('public_subscription_requests').update({ status: 'pending', processed_at: null }).eq('id', pubReq.id);
    return;
  }

  const revertToPending = () =>
    admin.from('public_subscription_requests').update({ status: 'pending', processed_at: null }).eq('id', pubReq.id);

  const password = Math.random().toString(36).slice(-10) + 'A1!';
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: pubReq.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: pubReq.full_name || pubReq.business_name },
  });
  // Le compte n'a pas pu être créé (email déjà utilisé, etc.) — revenir à
  // 'pending' pour un traitement manuel plutôt que de perdre le paiement.
  if (authError || !authData.user) { await revertToPending(); return; }
  const userId = authData.user.id;

  await admin.from('users').upsert(
    { id: userId, email: pubReq.email, full_name: pubReq.full_name || pubReq.business_name, role: 'owner' },
    { onConflict: 'id' },
  );

  const { data: biz } = await admin
    .from('businesses')
    .insert({ name: pubReq.business_name, denomination: pubReq.denomination || pubReq.business_name, owner_id: userId, type: 'retail' })
    .select('id')
    .single();
  if (!biz) { await revertToPending(); return; }

  await Promise.all([
    admin.from('business_members').insert({ business_id: biz.id, user_id: userId, role: 'owner' }),
    admin.from('users').update({ business_id: biz.id }).eq('id', userId),
  ]);

  const { error: rpcError } = await admin.rpc('activate_subscription', {
    p_business_id: biz.id,
    p_plan_id: pubReq.plan_id,
    p_days: plan.duration_days,
    p_note: 'Paiement PayDunya automatique',
  });
  if (rpcError) {
    // Le compte existe déjà à ce stade (createUser a réussi) — on ne peut pas
    // proprement revenir à 'pending' sans laisser un compte orphelin sans
    // abonnement. On laisse 'approved' mais on ne prétend pas que tout a
    // fonctionné : l'erreur remonte pour être investiguée manuellement.
    throw new Error(`activate_subscription a échoué pour public_subscription_requests ${pubReq.id} (compte ${userId} déjà créé) : ${rpcError.message}`);
  }

  const expiresAt = new Date(Date.now() + plan.duration_days * 86_400_000);
  const { sendEmail } = await import('@services/resend');
  await sendEmail({
    type: 'subscription_approved',
    to: pubReq.email,
    subject: '✅ Votre accès ELM APP est activé',
    data: {
      business_name: pubReq.business_name,
      email: pubReq.email,
      password,
      plan_label: plan.label ?? 'Pro',
      expires_at: expiresAt.toISOString(),
    },
  }).catch(() => {});
}

// ─── Auth du proxy API (pour les applications externes) ──────────────────────

export function assertValidProxyKey(request: Request, settings: PaydunyaSettings): void {
  const provided = request.headers.get('x-api-key') ?? '';
  const expected = settings.proxy_api_key ?? '';
  if (!expected) {
    throw Object.assign(new Error('Le proxy PayDunya n\'a pas de clé API configurée côté serveur.'), { status: 503 });
  }
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
    throw Object.assign(new Error('Clé API invalide.'), { status: 401 });
  }
}
