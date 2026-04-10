-- ============================================================
-- 071 — Location de véhicules + contrats signés en ligne
-- ============================================================

-- ─── Véhicules ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rental_vehicles (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  brand           text,
  model           text,
  year            integer,
  license_plate   text,
  color           text,
  price_per_day   numeric(12,2) NOT NULL DEFAULT 0,
  price_per_hour  numeric(12,2),
  deposit_amount  numeric(12,2) NOT NULL DEFAULT 0,
  currency        text        NOT NULL DEFAULT 'XOF',
  description     text,
  image_url       text,
  is_available    boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rental_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_owner_rental_vehicles" ON rental_vehicles
  USING (business_id IN (
    SELECT id FROM businesses WHERE owner_id = auth.uid()
  ));

CREATE POLICY "staff_read_rental_vehicles" ON rental_vehicles
  FOR SELECT
  USING (business_id IN (
    SELECT business_id FROM business_members WHERE user_id = auth.uid()
  ));

-- ─── Modèles de contrat ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS contract_templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  body        text        NOT NULL,   -- HTML avec {{variables}}
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_owner_contract_templates" ON contract_templates
  USING (business_id IN (
    SELECT id FROM businesses WHERE owner_id = auth.uid()
  ));

CREATE POLICY "staff_read_contract_templates" ON contract_templates
  FOR SELECT
  USING (business_id IN (
    SELECT business_id FROM business_members WHERE user_id = auth.uid()
  ));

-- ─── Contrats ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracts (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  vehicle_id        uuid        REFERENCES rental_vehicles(id),
  template_id       uuid        REFERENCES contract_templates(id),

  -- Informations client
  client_name       text        NOT NULL,
  client_phone      text,
  client_email      text,
  client_id_number  text,
  client_address    text,

  -- Détails de location
  start_date        date        NOT NULL,
  end_date          date        NOT NULL,
  pickup_location   text,
  return_location   text,
  price_per_day     numeric(12,2),
  deposit_amount    numeric(12,2),
  total_amount      numeric(12,2),
  currency          text        NOT NULL DEFAULT 'XOF',

  -- Contenu du contrat (template rempli)
  body              text        NOT NULL,

  -- Signature en ligne
  token             text        UNIQUE NOT NULL,
  token_expires_at  timestamptz NOT NULL,
  status            text        NOT NULL DEFAULT 'draft',
  -- draft | sent | signed | archived

  signed_at         timestamptz,
  signature_image   text,        -- URL dans storage
  pdf_url           text,

  notes             text,
  created_by        uuid        REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

-- Propriétaire / staff : accès complet
CREATE POLICY "business_access_contracts" ON contracts
  USING (business_id IN (
    SELECT id FROM businesses WHERE owner_id = auth.uid()
    UNION
    SELECT business_id FROM business_members WHERE user_id = auth.uid()
  ));

-- Page publique : lecture via token (pas d'auth)
CREATE POLICY "public_read_contract_by_token" ON contracts
  FOR SELECT
  USING (
    status IN ('sent', 'signed')
    AND token_expires_at > now()
  );

-- Page publique : mise à jour signature via token (pas d'auth)
CREATE POLICY "public_sign_contract" ON contracts
  FOR UPDATE
  USING (
    status = 'sent'
    AND token_expires_at > now()
  )
  WITH CHECK (
    status IN ('sent', 'signed')
  );

-- ─── Storage bucket pour signatures et PDFs ───────────────────
-- (à créer dans le dashboard Supabase si pas existant)
-- Bucket : "contracts"  — public read

-- ─── Trigger updated_at ───────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_contracts_updated_at'
  ) THEN
    CREATE TRIGGER set_contracts_updated_at
      BEFORE UPDATE ON contracts
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_contract_templates_updated_at'
  ) THEN
    CREATE TRIGGER set_contract_templates_updated_at
      BEFORE UPDATE ON contract_templates
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
