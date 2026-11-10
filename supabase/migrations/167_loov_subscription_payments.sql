-- ============================================================================
-- Migration 167 : Paiement des abonnements par mobile money (Loov)
--
-- Un établissement paie son abonnement depuis /billing (Orange Money, Free Money,
-- Expresso). Le serveur (/api/billing/loov/*) crée la tentative ici, appelle
-- Loov, puis le webhook Loov (ou le polling de statut) la fait avancer.
-- Quand Loov confirme le paiement, apply_subscription_payment active ou
-- prolonge l'abonnement et émet la facture — sans intervention du superadmin.
--
-- - subscription_payments : une ligne par tentative. Lecture seule pour le
--   client (owner/admin de l'établissement, superadmin) ; seul le service_role
--   écrit — le montant vient toujours du plan, côté serveur.
-- - apply_subscription_payment : réservée au service_role, idempotente
--   (applied_at), verrouille la ligne pour encaisser un webhook rejoué ou
--   concurrent du polling une seule fois.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        uuid        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  plan_id            uuid        NOT NULL REFERENCES public.plans(id),
  initiated_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  provider           text        NOT NULL DEFAULT 'loov',
  -- Référence Loov (PAY…) — NULL tant que Loov n'a pas répondu
  reference          text        UNIQUE,
  operator           text        NOT NULL,
  phone_number       text        NOT NULL,
  amount             numeric     NOT NULL CHECK (amount > 0),
  currency           text        NOT NULL,
  days               int         NOT NULL CHECK (days BETWEEN 1 AND 3650),
  status             text        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'expired')),
  failure_code       text,
  failure_reason     text,
  livemode           boolean     NOT NULL DEFAULT false,
  -- Renseigné quand l'abonnement a été activé/prolongé (garde d'idempotence)
  applied_at         timestamptz,
  invoice_id         uuid        REFERENCES public.subscription_invoices(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_business ON public.subscription_payments(business_id, created_at DESC);

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subpay_select" ON public.subscription_payments;
CREATE POLICY "subpay_select" ON public.subscription_payments FOR SELECT TO authenticated
  USING (
    initiated_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.business_members bm
      WHERE bm.business_id = subscription_payments.business_id
        AND bm.user_id = auth.uid()
        AND bm.role IN ('owner', 'admin')
    )
    OR public.is_superadmin()
  );

-- Lecture seule côté client : pas de policy d'écriture, pas de grant d'écriture
GRANT SELECT ON TABLE public.subscription_payments TO authenticated;
GRANT ALL    ON TABLE public.subscription_payments TO service_role;

-- ── Encaissement d'un paiement confirmé ─────────────────────────────────────
-- Prolonge depuis l'échéance en cours si l'abonnement est encore actif (un
-- renouvellement anticipé ne fait pas perdre les jours restants), sinon depuis
-- maintenant. Renvoie l'id de la facture (NULL si déjà appliqué ou non payé).
CREATE OR REPLACE FUNCTION public.apply_subscription_payment(p_payment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pay      public.subscription_payments;
  v_owner_id uuid;
  v_current  public.subscriptions;
  v_start    timestamptz;
  v_end      timestamptz;
  v_invoice  uuid;
  v_note     text;
BEGIN
  SELECT * INTO v_pay FROM public.subscription_payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paiement introuvable'; END IF;
  IF v_pay.applied_at IS NOT NULL OR v_pay.status <> 'succeeded' THEN RETURN NULL; END IF;

  SELECT user_id INTO v_owner_id
  FROM public.business_members
  WHERE business_id = v_pay.business_id AND role = 'owner'
  LIMIT 1;
  IF v_owner_id IS NULL THEN
    SELECT owner_id INTO v_owner_id FROM public.businesses WHERE id = v_pay.business_id;
  END IF;
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Aucun propriétaire trouvé pour cet établissement';
  END IF;

  SELECT * INTO v_current FROM public.subscriptions WHERE owner_id = v_owner_id FOR UPDATE;
  v_start := CASE
    WHEN v_current.status = 'active' AND v_current.expires_at > now() THEN v_current.expires_at
    ELSE now()
  END;
  v_end  := v_start + make_interval(days => v_pay.days);
  v_note := 'Paiement mobile money ' || v_pay.operator || ' — réf. ' || COALESCE(v_pay.reference, v_pay.id::text);

  INSERT INTO public.subscriptions (business_id, owner_id, plan_id, status, expires_at, activated_at, payment_note)
  VALUES (v_pay.business_id, v_owner_id, v_pay.plan_id, 'active', v_end, now(), v_note)
  ON CONFLICT (owner_id) DO UPDATE SET
    business_id  = EXCLUDED.business_id,
    plan_id      = EXCLUDED.plan_id,
    status       = 'active',
    expires_at   = EXCLUDED.expires_at,
    activated_at = now(),
    payment_note = EXCLUDED.payment_note;

  -- Facture émise maintenant, période = celle réellement achetée
  v_invoice := public.create_subscription_invoice(
    v_pay.business_id, v_owner_id, v_pay.plan_id, v_pay.days, v_note, v_pay.amount, 'activation', now()
  );
  IF v_invoice IS NOT NULL THEN
    UPDATE public.subscription_invoices
       SET period_start = v_start, period_end = v_end
     WHERE id = v_invoice;
  END IF;

  UPDATE public.subscription_payments
     SET applied_at = now(), invoice_id = v_invoice, updated_at = now()
   WHERE id = p_payment_id;

  RETURN v_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_subscription_payment(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_subscription_payment(uuid) TO service_role;
