-- Migration 100 : Retire le GRANT authenticated superflu sur paydunya_transactions
-- La migration 097 accordait SELECT/INSERT/UPDATE/DELETE à `authenticated` sur
-- paydunya_transactions alors qu'aucune policy RLS n'existe pour ce rôle sur
-- cette table (commentaire de la 097 : "seules les routes serveur — client
-- service_role — y accèdent"). Sans policy, l'accès est bloqué par défaut
-- aujourd'hui, mais le GRANT reste une trappe latente : la moindre policy
-- future un peu trop permissive exposerait immédiatement les clés/PII de
-- paiement (customer_name/email/phone, raw_initiate_response, raw_confirm_
-- response) à tout utilisateur authentifié. On retire le GRANT — seul
-- service_role doit pouvoir toucher cette table.
--
-- paydunya_settings garde son GRANT authenticated : la policy "paydunya_
-- settings: superadmin all" en dépend réellement pour le backoffice.

REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.paydunya_transactions FROM authenticated;
