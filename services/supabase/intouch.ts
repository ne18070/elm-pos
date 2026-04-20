import { supabase as _supabase } from './client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IntouchConfig {
  id:          string;
  business_id: string;
  partner_id:  string;
  api_key?:    string; // Optional for security: hidden in public views
  merchant_id: string;
  is_active:   boolean;
  created_at?: string;
  updated_at?: string;
}

export type IntouchConfigForm = Pick<IntouchConfig, 'partner_id' | 'api_key' | 'merchant_id' | 'is_active'>;

export interface IntouchPaymentRequest {
  business_id: string;
  amount:      number;
  currency:    string;
  phone:       string; // msisdn
  provider:    'WAVE' | 'ORANGE_MONEY' | 'FREE_MONEY';
}

export interface IntouchPaymentResponse {
  success:             boolean;
  transaction_id?:     string;
  external_reference?: string;
  status:              'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  error?:              string;
}

// ─── Config (Secure Fetch) ───────────────────────────────────────────────────

/**
 * Fetch public config for Intouch. 
 */
export async function getIntouchConfig(businessId: string): Promise<IntouchConfig | null> {
  const { data } = await supabase
    .from('intouch_configs_public')
    .select('*')
    .eq('business_id', businessId)
    .maybeSingle();
  return data ?? null;
}

/**
 * Upsert Intouch configuration.
 */
export async function upsertIntouchConfig(
  businessId: string,
  form: IntouchConfigForm,
): Promise<IntouchConfig> {
  const { data, error } = await supabase
    .from('intouch_configs')
    .upsert(
      { business_id: businessId, ...form },
      { onConflict: 'business_id' }
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as IntouchConfig;
}

// ─── Payment Execution (Secure & Robust) ────────────────────────────────────

export async function processIntouchPayment(
  req: IntouchPaymentRequest
): Promise<IntouchPaymentResponse> {
  const externalRef = `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  const { error: logErr } = await supabase.from('payment_transactions').insert({
    business_id:        req.business_id,
    external_reference: externalRef,
    amount:             req.amount,
    currency:           req.currency,
    provider:           req.provider,
    method:             'push',
    phone:              req.phone,
    status:             'PENDING'
  });

  if (logErr) throw new Error('Échec de la création de la transaction locale');

  try {
    const { data, error } = await (supabase.functions as any).invoke('process-intouch-payment', {
      body: { 
        ...req,
        external_reference: externalRef 
      }
    });

    if (error) throw new Error(error.message || 'Erreur lors de l\'appel de la fonction de paiement');

    return {
      success:    data.status === 'SUCCESS' || data.status === 'PENDING',
      transaction_id: data.transaction_id,
      external_reference: externalRef,
      status:     data.status,
      error:      data.error
    };
  } catch (err: any) {
    await supabase.rpc('update_payment_transaction_status', {
      p_external_ref: externalRef,
      p_status:       'FAILED',
      p_error:        err.message
    });

    return {
      success: false,
      status:  'FAILED',
      error:   err.message
    };
  }
}

export async function checkPaymentStatus(externalRef: string): Promise<IntouchPaymentResponse> {
  const { data, error } = await supabase
    .from('payment_transactions')
    .select('*')
    .eq('external_reference', externalRef)
    .single();

  if (error) throw new Error('Impossible de vérifier le statut');

  return {
    success:        data.status === 'SUCCESS',
    transaction_id: data.transaction_id,
    external_reference: externalRef,
    status:         data.status as any,
    error:          data.error_message
  };
}

export async function waitForPayment(
  externalRef: string, 
  timeoutMs: number = 60000, 
  intervalMs: number = 3000
): Promise<IntouchPaymentResponse> {
  const start = Date.now();
  
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await checkPaymentStatus(externalRef);
    if (res.status !== 'PENDING') return res;
    
    if (Date.now() - start > timeoutMs) {
      return { success: false, status: 'PENDING', error: 'Temps d\'attente dépassé' };
    }
    
    await new Promise(r => setTimeout(r, intervalMs));
  }
}
