import { supabase as _supabase } from './client';
import { findPublicBusinessByRef } from './public-business-ref';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

export interface PublicLegalInfo {
  id: string;
  name: string;
  logo_url: string | null;
  phone: string | null;
  address: string | null;
  currency: string;
}

export interface CreatePublicLegalAppointmentInput {
  business_id: string;
  client_name: string;
  client_phone: string;
  client_email?: string;
  subject: string;
  preferred_date: string;
  notes?: string;
}

export interface PublicLegalAppointmentResult {
  id: string;
  reference: string;
}

export async function getPublicLegalInfo(businessId: string): Promise<PublicLegalInfo | null> {
  return findPublicBusinessByRef<PublicLegalInfo>(
    businessId,
    'id, name, logo_url, phone, address, currency',
  );
}

export async function createPublicLegalAppointment(
  input: CreatePublicLegalAppointmentInput,
): Promise<PublicLegalAppointmentResult> {
  const res = await fetch('/api/public/legal-appointment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as { error?: string }).error ?? 'Impossible de créer le rendez-vous.');
  }

  return json as PublicLegalAppointmentResult;
}
