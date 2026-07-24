import { supabase } from './client';
import { q } from './q';
import type { TablesInsert } from './database.types';

// --- Types --------------------------------------------------------------------

export interface EventItem {
  id:          string;
  business_id: string;
  name:        string;
  event_date:  string | null;
  location:    string | null;
  archived_at: string | null;
  created_at:  string;
}

export type GuestStatus = 'pending' | 'used';

export interface EventGuest {
  id:            string;
  business_id:   string;
  event_id:      string;
  full_name:     string;
  company:       string | null;
  phone:         string | null;
  category:      string | null;
  pass_code:     string | null;
  status:        GuestStatus;
  checked_in_at: string | null;
  checked_in_by: string | null;
  notes:         string | null;
  created_at:    string;
}

export interface GuestImportRow {
  full_name: string;
  company?:  string | null;
  phone?:    string | null;
  category?: string | null;
  pass_code?: string | null;
}

// --- Events ---------------------------------------------------------------------

export async function listEvents(businessId: string): Promise<EventItem[]> {
  const rows = await q<EventItem[]>(
    supabase.from('events').select('*').eq('business_id', businessId).is('archived_at', null)
      .order('created_at', { ascending: false }),
  );
  return rows ?? [];
}

export async function listArchivedEvents(businessId: string): Promise<EventItem[]> {
  const rows = await q<EventItem[]>(
    supabase.from('events').select('*').eq('business_id', businessId).not('archived_at', 'is', null)
      .order('archived_at', { ascending: false }),
  );
  return rows ?? [];
}

/** Masque l'événement de la liste active sans rien supprimer — réversible via unarchiveEvent. */
export async function archiveEvent(businessId: string, eventId: string): Promise<void> {
  await q(
    supabase.from('events')
      .update({ archived_at: new Date().toISOString() } as unknown as TablesInsert<'events'>)
      .eq('id', eventId).eq('business_id', businessId),
  );
}

export async function unarchiveEvent(businessId: string, eventId: string): Promise<void> {
  await q(
    supabase.from('events')
      .update({ archived_at: null } as unknown as TablesInsert<'events'>)
      .eq('id', eventId).eq('business_id', businessId),
  );
}

export async function createEvent(
  businessId: string,
  data: { name: string; event_date?: string | null; location?: string | null },
): Promise<EventItem> {
  return q<EventItem>(
    supabase
      .from('events')
      .insert({ business_id: businessId, ...data } as unknown as TablesInsert<'events'>)
      .select()
      .single(),
  );
}

/**
 * Supprime un événement et, par cascade (ON DELETE CASCADE), tous ses invités
 * et leur historique de check-in. La RLS restreint cette action aux
 * owners/admins — si l'utilisateur n'a pas ce rôle, la suppression est
 * silencieusement ignorée par la RLS (0 ligne affectée) : on le détecte pour
 * ne pas laisser croire que l'événement a été supprimé.
 */
export async function deleteEvent(businessId: string, eventId: string): Promise<void> {
  const { data, error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)
    .eq('business_id', businessId)
    .select('id');
  if (error) throw new Error(error.message);
  if ((data?.length ?? 0) === 0) {
    throw new Error("Seuls les propriétaires/administrateurs peuvent supprimer un événement.");
  }
}

// --- Guests -----------------------------------------------------------------------

export async function listGuests(eventId: string): Promise<EventGuest[]> {
  const rows = await q<EventGuest[]>(
    supabase.from('event_guests').select('*').eq('event_id', eventId).order('full_name'),
  );
  return (rows ?? []) as unknown as EventGuest[];
}

export async function importGuests(
  businessId: string,
  eventId: string,
  rows: GuestImportRow[],
  options?: { replace?: boolean; expectedExisting?: number },
): Promise<number> {
  // Remplace la liste existante de l'événement — supprime aussi l'historique
  // de check-in des invités déjà validés, donc à utiliser uniquement pour
  // corriger un import erroné, pas pour ajouter des invités en cours d'événement.
  if (options?.replace) {
    const { data: deleted, error: delErr } = await supabase
      .from('event_guests')
      .delete()
      .eq('event_id', eventId)
      .eq('business_id', businessId)
      .select('id');
    if (delErr) throw new Error(delErr.message);
    // La RLS ne permet la suppression qu'aux owners/admins : si des invités
    // existaient mais qu'aucun n'a été supprimé, l'utilisateur n'a pas les
    // droits — mieux vaut bloquer que d'ajouter des doublons en silence.
    if ((options.expectedExisting ?? 0) > 0 && (deleted?.length ?? 0) === 0) {
      throw new Error(
        "Impossible de remplacer la liste : seuls les propriétaires/administrateurs peuvent supprimer les invités existants. Demandez à un admin de le faire, ou décochez l'option pour ajouter à la liste actuelle."
      );
    }
  }
  if (rows.length === 0) return 0;
  const payload = rows.map((r) => ({
    business_id: businessId,
    event_id:    eventId,
    full_name:   r.full_name,
    company:     r.company ?? null,
    phone:       r.phone ?? null,
    category:    r.category ?? null,
    pass_code:   r.pass_code ?? null,
  }));
  await q(
    supabase.from('event_guests').insert(payload as unknown as TablesInsert<'event_guests'>[]),
  );
  return payload.length;
}

/**
 * Marque le pass comme utilisé de façon atomique côté serveur (RPC) : si un
 * autre poste a déjà validé cet invité entre-temps, aucune ligne n'est
 * retournée et l'appelant doit recharger l'état du badge.
 */
export async function checkInGuest(guestId: string): Promise<EventGuest | null> {
  const { data, error } = await supabase.rpc('check_in_guest', { p_guest_id: guestId });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as EventGuest[];
  return rows[0] ?? null;
}

export async function undoCheckIn(guestId: string): Promise<void> {
  await q(
    supabase
      .from('event_guests')
      .update({ status: 'pending', checked_in_at: null, checked_in_by: null } as unknown as TablesInsert<'event_guests'>)
      .eq('id', guestId),
  );
}
