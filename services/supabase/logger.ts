/**
 * Journal d'activité — fire-and-forget.
 * Cette fonction ne throw jamais et ne bloque jamais l'appelant.
 */
import { supabase } from './client';

export type LogAction =
  | 'order.created'
  | 'order.cancelled'
  | 'order.refunded'
  | 'order.payment_completed'
  | 'product.created'
  | 'product.updated'
  | 'product.deleted'
  | 'stock.entry'
  | 'user.role_changed'
  | 'user.removed'
  | 'user.invited'
  | 'user.login'
  | 'settings.updated'
  | 'coupon.created'
  | 'coupon.deleted'
  | 'dossier.created'
  | 'dossier.updated'
  | 'dossier.archived'
  | 'dossier.unarchived'
  | 'honoraire.added'
  | 'honoraire.paid'
  | (string & {});  // permet les actions custom sans perdre l'autocomplétion

export interface LogInput {
  business_id: string;
  action: LogAction;
  entity_type?: string;
  entity_id?: string;
  user_id?: string;
  user_name?: string;
  metadata?: Record<string, unknown>;
}

export function logAction(input: LogInput): void {
  // Fire-and-forget : on lance la promesse sans l'attendre
  _insert(input).catch(() => {/* silencieux */});
}

async function _insert(input: LogInput): Promise<void> {
  try {
    let uid = input.user_id;
    let uname = input.user_name;

    // Si on n'a ni ID ni nom, on récupère de la session
    if (!uid || !uname) {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        if (!uid) uid = data.user.id;
        if (!uname) uname = data.user.user_metadata?.full_name;
      }
    }

    await (supabase as any).from('activity_logs').insert({
      business_id: input.business_id,
      user_id:     uid ?? null,
      user_name:   uname ?? null,
      action:      input.action,
      entity_type: input.entity_type ?? null,
      entity_id:   input.entity_id   ?? null,
      metadata:    input.metadata    ?? null,
    });
  } catch {
    // Le logger ne doit jamais faire crasher l'application
  }
}
