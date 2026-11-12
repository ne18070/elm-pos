-- Temps réel sur les commandes.
--
-- useRealtimeSync, la file /livraison et le badge « Suivi Livraisons »
-- écoutent postgres_changes sur public.orders, mais aucune migration n'avait
-- ajouté la table à la publication supabase_realtime : sans elle, aucun
-- événement n'arrive (badge figé après livraison, nouvelles commandes
-- invisibles sans recharger).
--
-- Les événements restent filtrés par RLS : un abonné ne reçoit que les
-- commandes des entreprises auxquelles il a accès. Idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;
