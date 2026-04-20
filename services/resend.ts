import { supabase } from './supabase/client';

export type EmailType =
  | 'subscription_received'
  | 'subscription_approved'
  | 'subscription_rejected'
  | 'marketing';

interface SendEmailOpts {
  type:    EmailType;
  to:      string;
  subject: string;
  data:    Record<string, unknown>;
}

export async function sendEmail(opts: SendEmailOpts): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Call Supabase Edge Function instead of Next.js API route
  const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method:  'POST',
    headers,
    body:    JSON.stringify(opts),
  });
  
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Email send failed (${res.status})`);
  }
}
