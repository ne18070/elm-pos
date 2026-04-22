import { supabase as _supabase } from './client';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = _supabase as any;

export type TicketType = 'bug' | 'suggestion' | 'question' | 'feedback';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface SupportTicket {
  id:           string;
  business_id:  string;
  user_id:      string;
  type:         TicketType;
  subject:      string;
  message:      string;
  attachments:  string[];
  status:       TicketStatus;
  priority:     TicketPriority;
  metadata:     any;
  created_at:   string;
  updated_at:   string;
  user?:        { full_name: string; email: string };
  business?:    { name: string };
}

export interface TicketForm {
  type:         TicketType;
  subject:      string;
  message:      string;
  attachments?: string[];
  priority?:    TicketPriority;
  metadata?:    any;
}

// ─── Client Actions ──────────────────────────────────────────────────────────

/**
 * Submit a new support ticket.
 */
export async function createTicket(businessId: string, userId: string, form: TicketForm): Promise<SupportTicket> {
  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      business_id: businessId,
      user_id:     userId,
      ...form,
      metadata: {
        ...form.metadata,
        userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'unknown',
        platform:  typeof window !== 'undefined' ? window.navigator.platform : 'unknown',
      }
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as SupportTicket;
}

/**
 * Upload a screenshot/attachment for a ticket.
 */
export async function uploadAttachment(file: File): Promise<string> {
  const BUCKET = 'product-images'; // Reuse existing bucket
  const ext    = file.name.split('.').pop() ?? 'png';
  const path   = `support/attachment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Get tickets for the current business.
 */
export async function getMyTickets(businessId: string): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data as SupportTicket[];
}

// ─── Admin Actions ───────────────────────────────────────────────────────────

/**
 * Get all tickets (Superadmin).
 */
export async function getAllTicketsAdmin(): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*, user:users(full_name, email), business:businesses(name)')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data as SupportTicket[];
}

/**
 * Update ticket status/priority (Superadmin).
 */
export async function updateTicketAdmin(ticketId: string, updates: Partial<SupportTicket>): Promise<void> {
  const { error } = await supabase
    .from('support_tickets')
    .update(updates)
    .eq('id', ticketId);

  if (error) throw new Error(error.message);
}
