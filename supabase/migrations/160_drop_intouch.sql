-- ============================================================================
-- Migration 160 : Suppression de l'intégration Intouch (paiement mobile push)
--
-- Le code client (POS, backoffice, service, edge function process-intouch-payment)
-- a été retiré. On supprime ici la configuration stockée, qui contenait les clés
-- d'API des marchands, et la vue intouch_configs_public — sans RLS ni filtre, elle
-- exposait partner_id/merchant_id de tous les établissements à tout utilisateur
-- authentifié (cf. note de 152_marketing_ads.sql).
--
-- payment_transactions et update_payment_transaction_status() sont conservés :
-- c'est l'historique des tentatives de paiement, à supprimer séparément si
-- cet historique n'a plus d'utilité.
-- ============================================================================

DROP VIEW  IF EXISTS public.intouch_configs_public;
DROP TABLE IF EXISTS public.intouch_configs;
