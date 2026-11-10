import type { SupabaseClient } from '@supabase/supabase-js';

// Suppressions superadmin — import ONLY in server route handlers under app/api/.

// Supabase ne lève pas d'exception : chaque étape doit vérifier son { error },
// sinon une suppression ratée laisse la suite s'exécuter sur un état partiel.
export function check(step: string, error: { message: string } | null) {
  if (error) throw new Error(`${step} : ${error.message}`);
}

export async function deleteBusinesses(admin: SupabaseClient, bizIds: string[]) {
  if (bizIds.length === 0) return;
  // Supprimer les données liées d'abord (contourne les triggers)
  const results = await Promise.all([
    admin.from('subscriptions').delete().in('business_id', bizIds),
    admin.from('business_members').delete().in('business_id', bizIds),
    admin.from('monitoring_vitals').delete().in('business_id', bizIds),
  ]);
  for (const { error } of results) check('Données liées', error);
  check('Établissements', (await admin.from('businesses').delete().in('id', bizIds)).error);
}
