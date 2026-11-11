-- ============================================================================
-- Migration 171 : Frais de scolarité — enregistrer, émettre et encaisser
--
-- Bug : /scolarite liste les commandes liées à un élève (orders.student_id,
-- 079_education_module.sql), mais rien ne permettait d'en créer : ni la
-- caisse, ni create_order, ni aucune RPC ne renseignait student_id. Une école
-- voyait toujours une page vide, sans moyen d'enregistrer un paiement.
--
-- Un frais = une commande :
--   student_id = l'élève, notes = le motif (« Mensualité novembre »…),
--   total = montant dû, source = 'scolarite', sans ligne order_items
--   (order_items.product_id est NOT NULL : un frais n'est pas un produit).
-- Chaque versement = une ligne payments ; amount_paid / balance_due sont tenus
-- par le trigger payments_sync_order_amount_paid (112). Le statut passe à
-- 'paid' quand le solde est réglé et reste 'pending' tant qu'il reste dû
-- (acompte possible).
--
-- Trois RPC, même contrôle d'accès que create_order (168) — être membre de
-- l'établissement — et l'élève / la classe doivent lui appartenir :
--   create_school_fee : un frais pour un élève, avec versement immédiat optionnel
--   issue_class_fees  : le même frais « à payer » pour chaque élève actif d'une
--                       classe (rentrée, mensualité) — sans doublon de motif
--   pay_school_fee    : encaisser tout ou partie d'un frais en attente
-- Les messages d'erreur sont rédigés pour être affichés tels quels.
-- ============================================================================

-- ── 0. Contrôle d'accès commun (appelé uniquement par les RPC ci-dessous) ───

CREATE OR REPLACE FUNCTION public.assert_school_fee_access(p_business_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT COALESCE(public.is_superadmin(), false) THEN
    IF auth.uid() IS NULL OR NOT (
      EXISTS (SELECT 1 FROM public.business_members bm
              WHERE bm.business_id = p_business_id AND bm.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.businesses b
                 WHERE b.id = p_business_id AND b.owner_id = auth.uid())
    ) THEN
      RAISE EXCEPTION 'Vous n''êtes pas membre de cet établissement.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_school_fee_access(UUID) FROM PUBLIC, anon, authenticated;

-- ── 1. Un frais pour un élève (versement immédiat optionnel) ───────────────

CREATE OR REPLACE FUNCTION public.create_school_fee(
  p_business_id UUID,
  p_student_id  UUID,
  p_label       TEXT,
  p_amount      NUMERIC,
  p_paid_amount NUMERIC DEFAULT 0,
  p_method      TEXT    DEFAULT 'cash'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label    TEXT    := NULLIF(btrim(p_label), '');
  v_paid     NUMERIC := COALESCE(p_paid_amount, 0);
  v_order_id UUID;
BEGIN
  PERFORM public.assert_school_fee_access(p_business_id);

  IF v_label IS NULL THEN
    RAISE EXCEPTION 'Indiquez le motif du frais.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant doit être supérieur à 0.';
  END IF;
  IF v_paid < 0 OR v_paid > p_amount THEN
    RAISE EXCEPTION 'Le montant versé doit être compris entre 0 et le montant dû.';
  END IF;
  IF v_paid > 0 AND p_method NOT IN ('cash', 'card', 'mobile_money') THEN
    RAISE EXCEPTION 'Moyen de paiement non accepté pour un frais de scolarité.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.edu_students s
                 WHERE s.id = p_student_id AND s.business_id = p_business_id) THEN
    RAISE EXCEPTION 'Élève introuvable dans cet établissement.';
  END IF;

  INSERT INTO public.orders (
    business_id, cashier_id, status, subtotal, total, notes, student_id, source
  )
  VALUES (
    p_business_id, auth.uid(),
    CASE WHEN v_paid >= p_amount THEN 'paid' ELSE 'pending' END,
    p_amount, p_amount, v_label, p_student_id, 'scolarite'
  )
  RETURNING id INTO v_order_id;

  IF v_paid > 0 THEN
    INSERT INTO public.payments (order_id, method, amount)
    VALUES (v_order_id, p_method, v_paid);
  END IF;

  RETURN v_order_id;
END;
$$;

-- ── 2. Le même frais pour toute une classe ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.issue_class_fees(
  p_business_id  UUID,
  p_classroom_id UUID,
  p_label        TEXT,
  p_amount       NUMERIC
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label TEXT := NULLIF(btrim(p_label), '');
  v_count INTEGER;
BEGIN
  PERFORM public.assert_school_fee_access(p_business_id);

  IF v_label IS NULL THEN
    RAISE EXCEPTION 'Indiquez le motif du frais.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant doit être supérieur à 0.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.edu_classrooms c
                 WHERE c.id = p_classroom_id AND c.business_id = p_business_id) THEN
    RAISE EXCEPTION 'Classe introuvable dans cet établissement.';
  END IF;

  -- Un élève qui a déjà ce frais (même motif, non annulé) n'est pas facturé
  -- deux fois : relancer l'émission après une inscription tardive est sans risque.
  INSERT INTO public.orders (
    business_id, cashier_id, status, subtotal, total, notes, student_id, source
  )
  SELECT p_business_id, auth.uid(), 'pending', p_amount, p_amount, v_label, s.id, 'scolarite'
  FROM public.edu_students s
  WHERE s.business_id = p_business_id
    AND s.classroom_id = p_classroom_id
    AND COALESCE(s.status, 'active') = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.business_id = p_business_id
        AND o.student_id  = s.id
        AND o.source      = 'scolarite'
        AND lower(btrim(o.notes)) = lower(v_label)
        AND o.status NOT IN ('cancelled', 'refunded')
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── 3. Encaisser tout ou partie d'un frais en attente ──────────────────────
-- Renvoie le reste dû après ce versement.

CREATE OR REPLACE FUNCTION public.pay_school_fee(
  p_order_id UUID,
  p_amount   NUMERIC,
  p_method   TEXT DEFAULT 'cash'
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order   public.orders%ROWTYPE;
  v_balance NUMERIC;
BEGIN
  -- Verrou : deux encaissements simultanés ne peuvent pas dépasser le reste dû
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.source IS DISTINCT FROM 'scolarite' OR v_order.student_id IS NULL THEN
    RAISE EXCEPTION 'Frais de scolarité introuvable.';
  END IF;

  PERFORM public.assert_school_fee_access(v_order.business_id);

  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'Ce frais est déjà réglé ou annulé.';
  END IF;
  IF p_method NOT IN ('cash', 'card', 'mobile_money') THEN
    RAISE EXCEPTION 'Moyen de paiement non accepté pour un frais de scolarité.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > v_order.balance_due THEN
    RAISE EXCEPTION 'Le montant doit être compris entre 1 et le reste dû (%).', v_order.balance_due;
  END IF;

  INSERT INTO public.payments (order_id, method, amount)
  VALUES (p_order_id, p_method, p_amount);

  -- amount_paid / balance_due viennent d'être recalculés par le trigger (112)
  SELECT balance_due INTO v_balance FROM public.orders WHERE id = p_order_id;
  IF v_balance <= 0.005 THEN
    UPDATE public.orders SET status = 'paid', updated_at = now() WHERE id = p_order_id;
  END IF;

  RETURN GREATEST(v_balance, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.create_school_fee(UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.issue_class_fees(UUID, UUID, TEXT, NUMERIC)                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pay_school_fee(UUID, NUMERIC, TEXT)                        FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_school_fee(UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_class_fees(UUID, UUID, TEXT, NUMERIC)                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pay_school_fee(UUID, NUMERIC, TEXT)                        TO authenticated, service_role;

-- Liste /scolarite : les frais d'un établissement, du plus récent au plus ancien
CREATE INDEX IF NOT EXISTS idx_orders_school_fees
  ON public.orders (business_id, created_at DESC)
  WHERE student_id IS NOT NULL;
