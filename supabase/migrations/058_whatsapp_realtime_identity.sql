-- Pour que les filtres postgres_changes (business_id=eq.xxx) fonctionnent
-- sur des colonnes hors clé primaire, la table doit avoir REPLICA IDENTITY FULL.
-- Sans ça, Supabase Realtime ne peut pas évaluer le filtre et ne livre aucun événement.
ALTER TABLE whatsapp_messages REPLICA IDENTITY FULL;
