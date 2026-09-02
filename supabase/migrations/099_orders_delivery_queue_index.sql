-- Migration 099 : index dédié à la file de livraison / picking
--
-- getOrdersForDelivery (services/supabase/orders.ts) filtre les commandes sur
--   business_id = ? AND status IN ('paid','pending')
--   AND delivery_status <> 'delivered'
--   AND created_at >= now() - 60 jours
--   ORDER BY created_at ASC LIMIT 500
--
-- L'index existant idx_orders_delivery (business_id, delivery_status) WHERE
-- status IN ('paid','pending') ne porte pas created_at : comme delivery_status
-- vaut 'pending' sur quasiment toutes les commandes, Postgres devait lire puis
-- trier tout l'historique -> statement timeout (57014).
--
-- Cet index partiel colle exactement aux prédicats constants de la requête et
-- fournit l'ordre de tri, donc le LIMIT s'arrête tôt.
--
-- CONCURRENTLY : la table orders est écrite en continu par la caisse ; exécuter
-- CETTE instruction SEULE dans le SQL editor (pas dans un bloc transactionnel).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_delivery_queue
  ON public.orders (business_id, created_at)
  WHERE status IN ('paid', 'pending') AND delivery_status <> 'delivered';
