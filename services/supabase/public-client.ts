import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL     || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Client sans session – toujours utilisé comme anon (pages publiques sans auth)
// storageKey distinct pour éviter le warning "Multiple GoTrueClient instances"
//
// NOTE: pas typé <Database> volontairement — hotel-public.ts, rental-public.ts,
// public-business-ref.ts et le consommateur PublicServiceOrderClient.tsx
// s'appuient sur des casts qui ne survivent pas au typage strict (résultats de
// RPC castés directement vers des interfaces locales incompatibles avec Json,
// `description` nullable traité comme optionnel...). Untel typage nécessite de
// corriger ces 4 fichiers en profondeur — hors scope d'un correctif ciblé.
export const supabasePublic = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession:    false,
    autoRefreshToken:  false,
    detectSessionInUrl: false,
    storageKey:        'sb-public-anon',
  },
}) as any;
