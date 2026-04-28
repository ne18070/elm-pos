-- Synchronisation comptable des ordres de service.
-- Permet aux membres autorises a encaisser une prestation de generer l'ecriture
-- sans donner un droit INSERT direct sur le journal comptable.

CREATE OR REPLACE FUNCTION public.sync_service_orders_accounting(p_business_id UUID)
RETURNS INTEGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER := 0;
  v_entry_id UUID;
  v_existing_entry_id UUID;
  v_order RECORD;
  v_debit_code TEXT;
  v_debit_name TEXT;
  v_reference TEXT;
  v_description TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.business_members bm
    WHERE bm.business_id = p_business_id
      AND bm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  FOR v_order IN
    SELECT
      so.id,
      so.order_number,
      COALESCE(NULLIF(so.paid_amount, 0), so.total, 0) AS amount,
      so.payment_method,
      COALESCE(so.paid_at, so.created_at)::DATE AS entry_date,
      so.subject_ref,
      so.client_name
    FROM public.service_orders so
    WHERE so.business_id = p_business_id
      AND so.status = 'paye'
      AND COALESCE(NULLIF(so.paid_amount, 0), so.total, 0) > 0
    ORDER BY COALESCE(so.paid_at, so.created_at), so.order_number
  LOOP
    IF v_order.payment_method IN ('mobile', 'mobile_money') THEN
      v_debit_code := '576';
      v_debit_name := 'Mobile Money';
    ELSIF v_order.payment_method IN ('card', 'bank') THEN
      v_debit_code := '521';
      v_debit_name := 'Banques - comptes courants';
    ELSE
      v_debit_code := '571';
      v_debit_name := 'Caisse';
    END IF;

    v_reference := 'OT-' || LPAD(v_order.order_number::TEXT, 4, '0');
    v_description := 'Prestation ' || v_reference
      || COALESCE(' - ' || NULLIF(v_order.subject_ref, ''), '')
      || COALESCE(' / ' || NULLIF(v_order.client_name, ''), '');

    SELECT je.id INTO v_existing_entry_id
    FROM public.journal_entries je
    WHERE je.business_id = p_business_id
      AND je.source = 'service_order'
      AND je.source_id = v_order.id
    LIMIT 1;

    IF v_existing_entry_id IS NULL THEN
      INSERT INTO public.journal_entries
        (business_id, entry_date, reference, description, source, source_id, created_by)
      VALUES
        (
          p_business_id,
          v_order.entry_date,
          v_reference,
          v_description,
          'service_order',
          v_order.id,
          auth.uid()
        )
      RETURNING id INTO v_entry_id;
    ELSE
      v_entry_id := v_existing_entry_id;

      IF EXISTS (
        SELECT 1
        FROM public.journal_entries je
        WHERE je.id = v_entry_id
          AND je.entry_date = v_order.entry_date
          AND je.reference = v_reference
          AND je.description = v_description
      )
      AND EXISTS (
        SELECT 1
        FROM public.journal_lines jl
        WHERE jl.entry_id = v_entry_id
          AND jl.account_code = v_debit_code
          AND jl.debit = ROUND(v_order.amount::NUMERIC, 2)
          AND jl.credit = 0
      )
      AND EXISTS (
        SELECT 1
        FROM public.journal_lines jl
        WHERE jl.entry_id = v_entry_id
          AND jl.account_code = '7065'
          AND jl.debit = 0
          AND jl.credit = ROUND(v_order.amount::NUMERIC, 2)
      ) THEN
        CONTINUE;
      END IF;

      UPDATE public.journal_entries
      SET
        entry_date = v_order.entry_date,
        reference = v_reference,
        description = v_description
      WHERE id = v_entry_id;

      DELETE FROM public.journal_lines
      WHERE entry_id = v_entry_id;
    END IF;

    INSERT INTO public.journal_lines (entry_id, account_code, account_name, debit, credit)
    VALUES
      (v_entry_id, v_debit_code, v_debit_name, ROUND(v_order.amount::NUMERIC, 2), 0),
      (v_entry_id, '7065', 'Prestations de services', 0, ROUND(v_order.amount::NUMERIC, 2));

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_service_orders_accounting(UUID) TO authenticated;
