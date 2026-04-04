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
