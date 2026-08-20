import { supabase } from './client';

// Lecture/écriture de paydunya_settings — réservé au backoffice superadmin
// (RLS : "paydunya_settings: superadmin all"). Les clés ne doivent jamais
// être lues ailleurs que dans cet écran et dans les routes serveur.

export interface PaydunyaSettingsAdmin {
  mode:              'test' | 'live';
  // Une seule Clé Principale (Master Key), partagée entre Test et Production.
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

// paydunya_settings n'existe pas encore dans database.types.ts (régénérer les
// types après application de la migration 097) — cast ciblé sur le nom de
// table uniquement, pas sur le client entier.

export async function getPaydunyaSettingsAdmin(): Promise<PaydunyaSettingsAdmin> {
  const { data, error } = await supabase.from('paydunya_settings' as any).select('*').eq('id', 1).single();
  if (error) throw new Error(error.message);
  return data as unknown as PaydunyaSettingsAdmin;
}

export async function upsertPaydunyaSettingsAdmin(settings: Partial<PaydunyaSettingsAdmin>): Promise<void> {
  const { error } = await supabase
    .from('paydunya_settings' as any)
    .update({ ...settings, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) throw new Error(error.message);
}

/** Génère une clé aléatoire côté client pour le proxy PayDunya (partagée avec les apps externes). */
export function generateProxyApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `pdproxy_${hex}`;
}
