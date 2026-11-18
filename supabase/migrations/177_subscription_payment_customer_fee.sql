-- ============================================================================
-- Migration 177 : Frais de paiement mobile money à la charge du client
--
-- Pour les abonnements, le client paie les frais Loov (2,5 % Wave / Orange Money) :
-- le montant débité = prix du plan + frais, calculé côté serveur
-- (renderer/lib/loov-operators.ts › customerFee) pour qu'ELM reçoive le prix du plan net.
--
-- - subscription_payments.customer_fee : part des frais ajoutée au prix du plan
--   (amount = montant total débité, frais inclus).
-- - apply_subscription_payment : la facture reste au prix du plan (amount - customer_fee).
-- ============================================================================

ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS customer_fee numeric NOT NULL DEFAULT 0 CHECK (customer_fee >= 0);

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
    v_pay.business_id, v_owner_id, v_pay.plan_id, v_pay.days, v_note, v_pay.amount - v_pay.customer_fee, 'activation', now()
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
