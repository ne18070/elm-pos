-- File: 007_customer_acompte.sql
-- ============================================================
-- Migration 007 : Infos client + acomptes
-- ============================================================

-- 1. Ajouter les colonnes client sur orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_name  TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone TEXT;

-- 2. Réécrire create_order pour gérer :
--    - customer_name / customer_phone
--    - statut 'pending' pour les acomptes (payment.method = 'partial')
--    - tableau payments[] (plusieurs lignes de paiement)
CREATE OR REPLACE FUNCTION create_order(order_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order_id  UUID;
  v_order     JSONB;
  v_item      JSONB;
  v_payment   JSONB;
  v_status    TEXT;
  v_pay_method TEXT;
BEGIN
  -- Déterminer le statut : 'pending' si acompte, 'paid' sinon
  v_pay_method := order_data->'payment'->>'method';
  IF v_pay_method = 'partial' THEN
    v_status := 'pending';
  ELSE
    v_status := 'paid';
  END IF;

  -- Insérer la commande
  INSERT INTO orders (
    business_id, cashier_id, status,
    subtotal, tax_amount, discount_amount, total,
    coupon_id, coupon_code, notes,
    customer_name, customer_phone
  )
  VALUES (
    (order_data->>'business_id')::UUID,
    (order_data->>'cashier_id')::UUID,
    v_status,
    (order_data->>'subtotal')::NUMERIC,
    (order_data->>'tax_amount')::NUMERIC,
    (order_data->>'discount_amount')::NUMERIC,
    (order_data->>'total')::NUMERIC,
    NULLIF(order_data->>'coupon_id', '')::UUID,
    order_data->>'coupon_code',
    order_data->>'notes',
    order_data->>'customer_name',
    order_data->>'customer_phone'
  )
  RETURNING id INTO v_order_id;

  -- Insérer les articles + décrémenter le stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(order_data->'items')
  LOOP
    INSERT INTO order_items (
      order_id, product_id, variant_id, name,
      price, quantity, discount_amount, total, notes
    )
    VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      NULLIF(v_item->>'variant_id', '')::UUID,
      v_item->>'name',
      (v_item->>'price')::NUMERIC,
      (v_item->>'quantity')::INTEGER,
      COALESCE((v_item->>'discount_amount')::NUMERIC, 0),
      (v_item->>'total')::NUMERIC,
      v_item->>'notes'
    );

    PERFORM decrement_stock(
      (v_item->>'product_id')::UUID,
      (v_item->>'quantity')::INTEGER
    );
  END LOOP;

  -- Insérer les paiements
  -- Priorité : tableau payments[] s'il est fourni et non vide
  IF jsonb_array_length(COALESCE(order_data->'payments', '[]'::JSONB)) > 0 THEN
    FOR v_payment IN SELECT * FROM jsonb_array_elements(order_data->'payments')
    LOOP
      INSERT INTO payments (order_id, method, amount)
      VALUES (
        v_order_id,
        v_payment->>'method',
        (v_payment->>'amount')::NUMERIC
      );
    END LOOP;
  ELSE
    -- Fallback : paiement unique via order_data.payment
    INSERT INTO payments (order_id, method, amount, reference)
    VALUES (
      v_order_id,
      v_pay_method,
      (order_data->'payment'->>'amount')::NUMERIC,
      order_data->'payment'->>'reference'
    );
  END IF;

  -- Incrémenter le compteur du coupon
  IF order_data->>'coupon_id' IS NOT NULL AND order_data->>'coupon_id' <> '' THEN
    PERFORM increment_coupon_uses((order_data->>'coupon_id')::UUID);
  END IF;

  -- Retourner la commande complète
  SELECT to_jsonb(o.*) INTO v_order
  FROM orders o WHERE o.id = v_order_id;

  RETURN v_order;
END;
$$;


-- File: 021_resellers.sql
-- ============================================================
-- Migration 021 : Module Revendeurs (Vendeurs Marché / Grossistes)
-- ============================================================

-- ─── 1. Prix de gros sur les produits ────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(12,2);

-- ─── 2. Revendeurs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resellers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  address     TEXT,
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 3. Clients des revendeurs ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reseller_clients (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reseller_id UUID NOT NULL REFERENCES resellers(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT,
  address     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 4. Offres volume revendeurs ──────────────────────────────────────────────
-- Ex : pour 100 cartons achetés → 1 carton offert
CREATE TABLE IF NOT EXISTS reseller_offers (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  reseller_id  UUID REFERENCES resellers(id) ON DELETE CASCADE, -- NULL = tous les revendeurs
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  min_qty      NUMERIC(10,3) NOT NULL,   -- seuil déclencheur (ex: 100)
  bonus_qty    NUMERIC(10,3) NOT NULL DEFAULT 1, -- qté offerte (ex: 1)
  label        TEXT,                     -- ex: "1 carton offert pour 100 achetés"
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 5. Lien commandes ↔ revendeurs ─────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type       TEXT NOT NULL DEFAULT 'retail';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reseller_id      UUID REFERENCES resellers(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reseller_client_id UUID REFERENCES reseller_clients(id) ON DELETE SET NULL;

-- ─── 6. Index ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_resellers_business      ON resellers(business_id);
CREATE INDEX IF NOT EXISTS idx_reseller_clients_biz    ON reseller_clients(business_id);
CREATE INDEX IF NOT EXISTS idx_reseller_clients_res    ON reseller_clients(reseller_id);
CREATE INDEX IF NOT EXISTS idx_reseller_offers_biz     ON reseller_offers(business_id);
CREATE INDEX IF NOT EXISTS idx_reseller_offers_res     ON reseller_offers(reseller_id);
CREATE INDEX IF NOT EXISTS idx_orders_reseller         ON orders(reseller_id);

-- ─── 7. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE resellers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_offers  ENABLE ROW LEVEL SECURITY;

-- Revendeurs
DROP POLICY IF EXISTS "resellers_business"  ON resellers;
DROP POLICY IF EXISTS "resellers_insert"    ON resellers;
DROP POLICY IF EXISTS "resellers_update"    ON resellers;
DROP POLICY IF EXISTS "resellers_delete"    ON resellers;
CREATE POLICY "resellers_business" ON resellers
  USING (business_id = get_user_business_id());
CREATE POLICY "resellers_insert" ON resellers FOR INSERT
  WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "resellers_update" ON resellers FOR UPDATE
  USING (business_id = get_user_business_id());
CREATE POLICY "resellers_delete" ON resellers FOR DELETE
  USING (business_id = get_user_business_id());

-- Clients revendeurs
DROP POLICY IF EXISTS "reseller_clients_business" ON reseller_clients;
DROP POLICY IF EXISTS "reseller_clients_insert"   ON reseller_clients;
DROP POLICY IF EXISTS "reseller_clients_update"   ON reseller_clients;
DROP POLICY IF EXISTS "reseller_clients_delete"   ON reseller_clients;
CREATE POLICY "reseller_clients_business" ON reseller_clients
  USING (business_id = get_user_business_id());
CREATE POLICY "reseller_clients_insert" ON reseller_clients FOR INSERT
  WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "reseller_clients_update" ON reseller_clients FOR UPDATE
  USING (business_id = get_user_business_id());
CREATE POLICY "reseller_clients_delete" ON reseller_clients FOR DELETE
  USING (business_id = get_user_business_id());

-- Offres volume
DROP POLICY IF EXISTS "reseller_offers_business" ON reseller_offers;
DROP POLICY IF EXISTS "reseller_offers_insert"   ON reseller_offers;
DROP POLICY IF EXISTS "reseller_offers_update"   ON reseller_offers;
DROP POLICY IF EXISTS "reseller_offers_delete"   ON reseller_offers;
CREATE POLICY "reseller_offers_business" ON reseller_offers
  USING (business_id = get_user_business_id());
CREATE POLICY "reseller_offers_insert" ON reseller_offers FOR INSERT
  WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "reseller_offers_update" ON reseller_offers FOR UPDATE
  USING (business_id = get_user_business_id());
CREATE POLICY "reseller_offers_delete" ON reseller_offers FOR DELETE
  USING (business_id = get_user_business_id());


-- File: 045_clients.sql
-- ============================================================
-- Migration 045 : Module Clients (pour tous les types d'établissement)
-- ============================================================

CREATE TABLE IF NOT EXISTS clients (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  address     TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour les recherches par établissement
CREATE INDEX IF NOT EXISTS clients_business_id_idx ON clients(business_id);
CREATE INDEX IF NOT EXISTS clients_name_idx ON clients(business_id, name);

-- RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients: members can read"
  ON clients FOR SELECT
  USING (
    business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "clients: members can insert"
  ON clients FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "clients: members can update"
  ON clients FOR UPDATE
  USING (
    business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "clients: members can delete"
  ON clients FOR DELETE
  USING (
    business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
    )
  );


-- File: 049_clients_service_role.sql
-- Permettre à l'Edge Function WhatsApp (service_role) d'insérer/modifier les clients
CREATE POLICY "clients: service_role"
  ON clients FOR ALL
  USING (auth.role() = 'service_role');


-- File: 067_juridique_module.sql
-- ─── Type d'établissement ─────────────────────────────────────────────────────
INSERT INTO business_types (id, label, description, icon, accent_color, sort_order) VALUES
  ('juridique', 'Cabinet Juridique', 'Avocat, notaire, huissier — dossiers, honoraires et agenda judiciaire', 'Scale', 'purple', 4)
ON CONFLICT (id) DO NOTHING;

-- ─── Nouveaux modules ─────────────────────────────────────────────────────────
INSERT INTO app_modules (id, label, description, icon, is_core, sort_order) VALUES
  ('dossiers',   'Dossiers & Affaires',      'Gestion des dossiers clients et affaires judiciaires', 'Briefcase', false, 8),
  ('honoraires', 'Honoraires & Facturation', 'Facturation des prestations et suivi des paiements',   'Receipt',   false, 9)
ON CONFLICT (id) DO NOTHING;

-- ─── Matrice juridique ────────────────────────────────────────────────────────
INSERT INTO business_type_modules (business_type_id, module_id, is_default) VALUES
  ('juridique', 'pos',              false),
  ('juridique', 'stock',            false),
  ('juridique', 'approvisionnement',false),
  ('juridique', 'livraison',        false),
  ('juridique', 'revendeurs',       false),
  ('juridique', 'hotel',            false),
  ('juridique', 'coupons',          false),
  ('juridique', 'comptabilite',     true),
  ('juridique', 'dossiers',         true),
  ('juridique', 'honoraires',       true)
ON CONFLICT DO NOTHING;

-- ─── Table dossiers ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dossiers (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  reference      text        NOT NULL,
  type_affaire   text        NOT NULL DEFAULT 'civil',
  -- civil | pénal | commercial | administratif | travail | famille | foncier | ohada
  client_name    text        NOT NULL,
  client_phone   text,
  client_email   text,
  adversaire     text,
  tribunal       text,
  juge           text,
  status         text        NOT NULL DEFAULT 'ouvert',
  -- ouvert | en_cours | plaidé | gagné | perdu | clôturé | archivé
  description    text,
  date_ouverture date        NOT NULL DEFAULT CURRENT_DATE,
  date_audience  date,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

-- ─── Table honoraires_cabinet ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS honoraires_cabinet (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid         NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  dossier_id      uuid         REFERENCES dossiers(id) ON DELETE SET NULL,
  client_name     text         NOT NULL,
  type_prestation text         NOT NULL DEFAULT 'consultation',
  -- consultation | plaidoirie | rédaction | conseil | représentation | arbitrage | notarié | huissier
  description     text,
  montant         numeric(12,2) NOT NULL DEFAULT 0,
  montant_paye    numeric(12,2) NOT NULL DEFAULT 0,
  status          text         NOT NULL DEFAULT 'impayé',
  -- impayé | partiel | payé
  date_facture    date         NOT NULL DEFAULT CURRENT_DATE,
  created_at      timestamptz  DEFAULT now()
);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE dossiers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE honoraires_cabinet  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_dossiers" ON dossiers FOR ALL TO authenticated
  USING (business_id IN (
    SELECT business_id FROM business_members WHERE user_id = auth.uid()
    UNION SELECT id FROM businesses WHERE owner_id = auth.uid()
  ));

CREATE POLICY "members_honoraires" ON honoraires_cabinet FOR ALL TO authenticated
  USING (business_id IN (
    SELECT business_id FROM business_members WHERE user_id = auth.uid()
    UNION SELECT id FROM businesses WHERE owner_id = auth.uid()
  ));


-- File: 070_dossier_fichiers.sql
-- Migration 070: Fichiers joints aux dossiers + quota de stockage
-- 1 GB gratuit par business, extensible via achat

-- ── 1. Quota de stockage par business ────────────────────────────────────────

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS storage_quota_bytes  BIGINT NOT NULL DEFAULT 1073741824,  -- 1 GB
  ADD COLUMN IF NOT EXISTS storage_used_bytes   BIGINT NOT NULL DEFAULT 0;

-- ── 2. Table des fichiers ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dossier_fichiers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id    UUID NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  uploaded_by   UUID REFERENCES users(id) ON DELETE SET NULL,

  nom           TEXT NOT NULL,          -- nom original du fichier
  storage_path  TEXT NOT NULL UNIQUE,   -- chemin dans le bucket Supabase Storage
  mime_type     TEXT,
  taille_bytes  BIGINT NOT NULL DEFAULT 0,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dossier_fichiers_dossier  ON dossier_fichiers(dossier_id);
CREATE INDEX IF NOT EXISTS idx_dossier_fichiers_business ON dossier_fichiers(business_id);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE dossier_fichiers ENABLE ROW LEVEL SECURITY;

-- Membres du business peuvent voir les fichiers
CREATE POLICY "dossier_fichiers_select" ON dossier_fichiers
  FOR SELECT USING (
    business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
    )
  );

-- Membres peuvent uploader
CREATE POLICY "dossier_fichiers_insert" ON dossier_fichiers
  FOR INSERT WITH CHECK (
    business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
    )
  );

-- Membres peuvent supprimer leurs propres fichiers (owner/admin peuvent tout supprimer)
CREATE POLICY "dossier_fichiers_delete" ON dossier_fichiers
  FOR DELETE USING (
    business_id IN (
      SELECT bm.business_id FROM business_members bm
      WHERE bm.user_id = auth.uid()
        AND (bm.role IN ('owner', 'admin', 'manager') OR dossier_fichiers.uploaded_by = auth.uid())
    )
  );

-- ── 4. Trigger : mettre à jour storage_used_bytes automatiquement ─────────────

CREATE OR REPLACE FUNCTION update_storage_used()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE businesses
      SET storage_used_bytes = storage_used_bytes + NEW.taille_bytes
      WHERE id = NEW.business_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE businesses
      SET storage_used_bytes = GREATEST(0, storage_used_bytes - OLD.taille_bytes)
      WHERE id = OLD.business_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_storage_used ON dossier_fichiers;
CREATE TRIGGER trg_storage_used
  AFTER INSERT OR DELETE ON dossier_fichiers
  FOR EACH ROW EXECUTE FUNCTION update_storage_used();

-- ── 5. Bucket Storage (à créer manuellement dans le dashboard Supabase) ───────
-- Nom du bucket : dossier-files
-- Public : NON (accès via signed URLs uniquement)
-- Taille max par fichier : 50 MB
--
-- Policies Storage à créer :
--   SELECT  : bucket = 'dossier-files' AND auth.uid() IN (members of business)
--   INSERT  : idem
--   DELETE  : idem (owner/admin uniquement)


-- File: 071_contracts.sql
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

-- ─── Module dans app_modules ─────────────────────────────────────────────────
INSERT INTO app_modules (id, label, description, icon, is_core, sort_order) VALUES
  ('contrats', 'Contrats & Location', 'Location de véhicules avec signature électronique de contrat', 'FileSignature', false, 10)
ON CONFLICT (id) DO NOTHING;

-- Associer le module à tous les types d'établissement qui pourraient l'utiliser
-- (optionnel par défaut — à activer selon le business)
INSERT INTO business_type_modules (business_type_id, module_id, is_default)
SELECT id, 'contrats', false
FROM business_types
ON CONFLICT DO NOTHING;

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


-- File: 072_lessor_signature.sql
-- ============================================================
-- 072 — Signature du loueur sur les contrats
-- ============================================================

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS lessor_signature_image text;


-- File: 073_contracts_storage_policies.sql
-- ============================================================
-- 073 — Policies RLS pour le bucket "contracts"
-- ============================================================

-- Lecture publique (PDFs + signatures accessibles via URL publique)
CREATE POLICY "contracts_storage_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'contracts');

-- Upload par les utilisateurs authentifiés (signatures loueur, véhicules)
CREATE POLICY "contracts_storage_auth_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'contracts');

-- Mise à jour par les utilisateurs authentifiés (upsert)
CREATE POLICY "contracts_storage_auth_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'contracts');

-- Upload anonyme pour les pages publiques (signature locataire + PDF)
-- Limité aux chemins signatures/ et pdfs/
CREATE POLICY "contracts_storage_anon_sign"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'contracts'
  AND (
    name LIKE 'signatures/%'
    OR name LIKE 'pdfs/%'
  )
);

-- Mise à jour anonyme (upsert signature + pdf)
CREATE POLICY "contracts_storage_anon_update"
ON storage.objects FOR UPDATE
TO anon
USING (
  bucket_id = 'contracts'
  AND (
    name LIKE 'signatures/%'
    OR name LIKE 'pdfs/%'
  )
);


-- File: 088_client_entities.sql
-- ─── Évolution des Clients en Entités Juridiques ─────────────────────────────
-- Migration 088 : Support des types de clients configurables et attributs moraux.

-- 1. Ajouter les colonnes nécessaires à la table clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS type text; -- Référence à reference_data
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS identification_number text; -- RCCM, NINEA, etc.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS representative_name text; -- Pour les personnes morales

-- 2. Insérer les types de clients par défaut dans reference_data (si non présents)
-- Ces types sont éditables par l'utilisateur via l'interface.
INSERT INTO public.reference_data (category, value, label, sort_order, is_active)
VALUES 
  ('type_client', 'personne_physique', 'Personne Physique', 1, true),
  ('type_client', 'personne_morale', 'Personne Morale (Société)', 2, true),
  ('type_client', 'association', 'Association / ONG', 3, true),
  ('type_client', 'institution_publique', 'Institution Publique / État', 4, true)
ON CONFLICT (business_id, category, value) DO NOTHING;
