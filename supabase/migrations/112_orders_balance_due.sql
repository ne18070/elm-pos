-- Migration 112 : "Acompte" filtrable, paginable et comptable côté SQL
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Problème
--   L'onglet "Acompte" de la page Commandes = commande partiellement payée,
--   c.-à-d. SUM(payments.amount) < orders.total. Ce critère n'était pas
--   exprimable en SQL : le front chargeait jusqu'à 3000 commandes JOINTES en
--   mémoire (order_items + products + payments + cashier + resellers …) puis
--   filtrait et paginait côté client. Résultat : lent, plafonné à 3000, badge
--   de comptage approximatif, et surtout `statement timeout` (57014) dès que le
--   business dépasse quelques milliers de commandes.
--
-- Solution
--   1. `orders.amount_paid`  : total encaissé, dénormalisé, maintenu par trigger
--                              sur `payments` (INSERT / UPDATE OF amount / DELETE).
--   2. `orders.balance_due`  : colonne GÉNÉRÉE (total - amount_paid) STORED —
--                              ne référence que des colonnes de la même ligne,
--                              donc indexable et utilisable en WHERE PostgREST.
--   3. Index partiel `idx_orders_acompte` : (business_id, created_at DESC) sur
--                              les seules commandes à solde impayé non annulées.
--
--   L'onglet devient alors une requête paginée standard :
--     .gt('balance_due', 0.005).not('status','in','(cancelled,refunded)')
--     .neq('source','whatsapp').order('created_at',{ascending:false}).range(...)
--   avec `count: 'exact'`, exactement comme les autres onglets.
--
-- Sûr à rejouer (IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Colonne `amount_paid` + backfill ────────────────────────────────────
-- On renseigne `amount_paid` AVANT d'ajouter la colonne générée `balance_due`,
-- pour que celle-ci soit calculée une seule fois avec les bonnes valeurs.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS amount_paid numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders.amount_paid IS
  'Total encaissé (SUM payments.amount), dénormalisé — maintenu par le trigger payments_sync_order_amount_paid.';

UPDATE public.orders o
SET amount_paid = COALESCE(p.total_paid, 0)
FROM (
  SELECT order_id, SUM(amount) AS total_paid
  FROM public.payments
  GROUP BY order_id
) p
WHERE p.order_id = o.id
  AND o.amount_paid IS DISTINCT FROM COALESCE(p.total_paid, 0);

-- ─── 2. Colonne générée `balance_due` ───────────────────────────────────────
-- Ne référence que des colonnes de la même ligne ⇒ autorisée en STORED, donc
-- indexable et filtrable via PostgREST. NB : ADD COLUMN GENERATED réécrit la
-- table (verrou ACCESS EXCLUSIVE bref) — acceptable à l'échelle d'un POS.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS balance_due numeric(12,2)
    GENERATED ALWAYS AS (total - amount_paid) STORED;

COMMENT ON COLUMN public.orders.balance_due IS
  'Solde restant dû = total - amount_paid. > 0 ⇒ acompte. Négatif possible (trop-perçu).';

-- ─── 3. Trigger de synchronisation ──────────────────────────────────────────
-- SECURITY DEFINER : un caissier insère un paiement sans avoir de droit UPDATE
-- direct sur toutes les colonnes de `orders` via RLS.

CREATE OR REPLACE FUNCTION public.sync_order_amount_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid := COALESCE(NEW.order_id, OLD.order_id);
BEGIN
  UPDATE public.orders o
  SET amount_paid = COALESCE(
        (SELECT SUM(amount) FROM public.payments WHERE order_id = v_order_id), 0)
  WHERE o.id = v_order_id;
  RETURN NULL;  -- AFTER trigger, valeur de retour ignorée
END;
$$;

DROP TRIGGER IF EXISTS payments_sync_order_amount_paid ON public.payments;
CREATE TRIGGER payments_sync_order_amount_paid
  AFTER INSERT OR DELETE OR UPDATE OF amount, order_id ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_order_amount_paid();

-- ─── 4. Index partiel de l'onglet "Acompte" ─────────────────────────────────
-- Couvre le tri (business_id, created_at DESC) restreint aux acomptes ouverts.

CREATE INDEX IF NOT EXISTS idx_orders_acompte
  ON public.orders (business_id, created_at DESC)
  WHERE balance_due > 0.005
    AND status NOT IN ('cancelled', 'refunded')
    AND source <> 'whatsapp';

-- Ancien index mort : `status = 'partial'` n'est jamais écrit (un acompte reste
-- en statut 'pending').
DROP INDEX IF EXISTS public.idx_orders_partial_status;

-- ─── 5. Grants (convention projet — cf. 085_explicit_grants.sql) ─────────────

GRANT EXECUTE ON FUNCTION public.sync_order_amount_paid() TO authenticated, service_role;
