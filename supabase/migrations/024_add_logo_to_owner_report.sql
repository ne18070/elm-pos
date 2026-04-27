-- Update get_vehicle_owner_report to include business logo_url
CREATE OR REPLACE FUNCTION get_vehicle_owner_report(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_rental RECORD;
  v_sale RECORD;
  v_total numeric := 0;
  v_commission numeric := 0;
BEGIN
  SELECT rv.*, b.name AS business_name, b.currency, b.phone AS business_phone, b.logo_url AS business_logo
  INTO v_rental
  FROM rental_vehicles rv
  JOIN businesses b ON b.id = rv.business_id
  WHERE rv.owner_report_token = p_token
  LIMIT 1;

  IF FOUND THEN
    SELECT COALESCE(SUM(c.total_amount), 0)
    INTO v_total
    FROM contracts c
    WHERE c.vehicle_id = v_rental.id
      AND c.status IN ('sent', 'signed', 'active', 'archived');

    v_commission := CASE
      WHEN v_rental.owner_type = 'third_party' AND v_rental.commission_type = 'fixed'
        THEN LEAST(v_total, GREATEST(0, v_rental.commission_value))
      WHEN v_rental.owner_type = 'third_party'
        THEN LEAST(v_total, GREATEST(0, v_total * (v_rental.commission_value / 100)))
      ELSE v_total
    END;

    RETURN jsonb_build_object(
      'kind', 'rental',
      'business_name', v_rental.business_name,
      'business_phone', v_rental.business_phone,
      'business_logo', v_rental.business_logo,
      'currency', v_rental.currency,
      'vehicle', jsonb_build_object(
        'name', v_rental.name,
        'brand', v_rental.brand,
        'model', v_rental.model,
        'year', v_rental.year,
        'plate', v_rental.license_plate,
        'image', v_rental.image_url,
        'owner_name', v_rental.owner_name,
        'owner_phone', v_rental.owner_phone,
        'commission_type', v_rental.commission_type,
        'commission_value', v_rental.commission_value
      ),
      'totals', jsonb_build_object(
        'gross', v_total,
        'commission', v_commission,
        'owner_share', GREATEST(0, v_total - v_commission)
      ),
      'rentals', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'client_name', c.client_name,
          'start_date', c.start_date,
          'start_time', c.start_time,
          'end_date', c.end_date,
          'end_time', c.end_time,
          'status', c.status,
          'total_amount', c.total_amount,
          'amount_paid', c.amount_paid
        ) ORDER BY c.start_date DESC)
        FROM contracts c
        WHERE c.vehicle_id = v_rental.id
          AND c.status IN ('sent', 'signed', 'archived', 'cancelled')
      ), '[]'::jsonb),
      'sales', '[]'::jsonb,
      'expenses', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'date', je.entry_date,
          'label', je.description,
          'amount', COALESCE((
            SELECT SUM(jl.debit)
            FROM journal_lines jl
            WHERE jl.entry_id = je.id
              AND jl.account_code LIKE '6%'
          ), 0)
        ) ORDER BY je.entry_date DESC)
        FROM journal_entries je
        WHERE je.source = 'manual'
          AND je.source_id = v_rental.id
      ), '[]'::jsonb)
    );
  END IF;

  SELECT v.*, b.name AS business_name, b.currency, b.phone AS business_phone, b.logo_url AS business_logo
  INTO v_sale
  FROM voitures v
  JOIN businesses b ON b.id = v.business_id
  WHERE v.owner_report_token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_total := CASE WHEN v_sale.statut = 'vendu' THEN v_sale.prix ELSE 0 END;
  v_commission := CASE
    WHEN v_sale.owner_type = 'third_party' AND v_sale.commission_type = 'fixed'
      THEN LEAST(v_total, GREATEST(0, v_sale.commission_value))
    WHEN v_sale.owner_type = 'third_party'
      THEN LEAST(v_total, GREATEST(0, v_total * (v_sale.commission_value / 100)))
    ELSE v_total
  END;

  RETURN jsonb_build_object(
    'kind', 'sale',
    'business_name', v_sale.business_name,
    'business_phone', v_sale.business_phone,
    'business_logo', v_sale.business_logo,
    'currency', v_sale.currency,
    'vehicle', jsonb_build_object(
      'name', concat_ws(' ', v_sale.marque, v_sale.modele),
      'brand', v_sale.marque,
      'model', v_sale.modele,
      'year', v_sale.annee,
      'plate', NULL,
      'image', v_sale.image_principale,
      'owner_name', v_sale.owner_name,
      'owner_phone', v_sale.owner_phone,
      'commission_type', v_sale.commission_type,
      'commission_value', v_sale.commission_value
    ),
    'totals', jsonb_build_object(
      'gross', v_total,
      'commission', v_commission,
      'owner_share', GREATEST(0, v_total - v_commission)
    ),
    'rentals', '[]'::jsonb,
    'sales', jsonb_build_array(jsonb_build_object(
      'status', v_sale.statut,
      'price', v_sale.prix,
      'updated_at', v_sale.updated_at
    )),
    'expenses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'date', je.entry_date,
        'label', je.description,
        'amount', COALESCE((
          SELECT SUM(jl.debit)
          FROM journal_lines jl
          WHERE jl.entry_id = je.id
            AND jl.account_code LIKE '6%'
        ), 0)
      ) ORDER BY je.entry_date DESC)
      FROM journal_entries je
      WHERE je.source = 'manual'
        AND je.source_id = v_sale.id
    ), '[]'::jsonb)
  );
END;
$$;
