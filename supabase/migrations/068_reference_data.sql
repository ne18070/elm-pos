-- ─── Table de données de référence configurables ─────────────────────────────
-- business_id NULL  = données globales (gérées par superadmin via backoffice)
-- business_id défini = données propres à l'établissement (surcharge ou ajout)

CREATE TABLE IF NOT EXISTS reference_data (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid        REFERENCES businesses(id) ON DELETE CASCADE,
  category    text        NOT NULL,
  value       text        NOT NULL,
  label       text        NOT NULL,
  color       text,       -- classe CSS Tailwind optionnelle, ex: 'text-green-400'
  metadata    jsonb       NOT NULL DEFAULT '{}',
  sort_order  int         NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (business_id, category, value)
);

CREATE INDEX IF NOT EXISTS reference_data_cat_idx ON reference_data (category, business_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE reference_data ENABLE ROW LEVEL SECURITY;

-- Lecture : données globales + celles du business courant
CREATE POLICY "read_reference_data" ON reference_data FOR SELECT TO authenticated
  USING (
    business_id IS NULL
    OR business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
      UNION SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- Écriture : uniquement les données propres au business (pas les globales)
CREATE POLICY "write_reference_data" ON reference_data FOR ALL TO authenticated
  USING (
    business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
      UNION SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
      UNION SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- ─── Données globales par défaut ──────────────────────────────────────────────

INSERT INTO reference_data (business_id, category, value, label, color, metadata, sort_order) VALUES
  -- Types d'affaires (juridique)
  (NULL,'type_affaire','civil',         'Civil',                NULL, '{"icon":"⚖️"}', 0),
  (NULL,'type_affaire','pénal',         'Pénal / Criminel',     NULL, '{"icon":"🔒"}', 1),
  (NULL,'type_affaire','commercial',    'Commercial',           NULL, '{"icon":"🏢"}', 2),
  (NULL,'type_affaire','administratif', 'Administratif',        NULL, '{"icon":"🏛️"}', 3),
  (NULL,'type_affaire','travail',       'Droit du travail',     NULL, '{"icon":"👷"}', 4),
  (NULL,'type_affaire','famille',       'Famille / Succession', NULL, '{"icon":"👨‍👩‍👧"}', 5),
  (NULL,'type_affaire','foncier',       'Foncier / Immobilier', NULL, '{"icon":"🏠"}', 6),
  (NULL,'type_affaire','ohada',         'OHADA',                NULL, '{"icon":"📋"}', 7),

  -- Tribunaux (Sénégal)
  (NULL,'tribunal','tgi_dakar',       'TGI Dakar',                        NULL, '{}', 0),
  (NULL,'tribunal','tgi_thies',       'TGI Thiès',                        NULL, '{}', 1),
  (NULL,'tribunal','tgi_stlouis',     'TGI Saint-Louis',                  NULL, '{}', 2),
  (NULL,'tribunal','tgi_ziguinchor',  'TGI Ziguinchor',                   NULL, '{}', 3),
  (NULL,'tribunal','tgi_kaolack',     'TGI Kaolack',                      NULL, '{}', 4),
  (NULL,'tribunal','tgi_diourbel',    'TGI Diourbel',                     NULL, '{}', 5),
  (NULL,'tribunal','tgi_louga',       'TGI Louga',                        NULL, '{}', 6),
  (NULL,'tribunal','tgi_tambacounda', 'TGI Tambacounda',                  NULL, '{}', 7),
  (NULL,'tribunal','tc_dakar',        'TC Dakar (Tribunal du Commerce)',   NULL, '{}', 8),
  (NULL,'tribunal','trav_dakar',      'Tribunal du Travail Dakar',         NULL, '{}', 9),
  (NULL,'tribunal','ca_dakar',        'CA Dakar (Cour d''Appel)',          NULL, '{}', 10),
  (NULL,'tribunal','cs',              'Cour Suprême du Sénégal',          NULL, '{}', 11),
  (NULL,'tribunal','ccja',            'CCJA (OHADA)',                      NULL, '{}', 12),

  -- Statuts dossier
  (NULL,'statut_dossier','ouvert',   'Ouvert',   NULL, '{"cls":"bg-blue-900/30 text-blue-400 border-blue-800"}',     0),
  (NULL,'statut_dossier','en_cours', 'En cours', NULL, '{"cls":"bg-amber-900/30 text-amber-400 border-amber-800"}',  1),
  (NULL,'statut_dossier','plaidé',   'Plaidé',   NULL, '{"cls":"bg-purple-900/30 text-purple-400 border-purple-800"}',2),
  (NULL,'statut_dossier','gagné',    'Gagné',    NULL, '{"cls":"bg-green-900/30 text-green-400 border-green-800"}',  3),
  (NULL,'statut_dossier','perdu',    'Perdu',    NULL, '{"cls":"bg-red-900/30 text-red-400 border-red-800"}',        4),
  (NULL,'statut_dossier','clôturé',  'Clôturé',  NULL, '{"cls":"bg-slate-800 text-slate-400 border-slate-700"}',    5),
  (NULL,'statut_dossier','archivé',  'Archivé',  NULL, '{"cls":"bg-gray-900/50 text-gray-500 border-gray-700"}',    6),

  -- Types de prestation (juridique)
  (NULL,'type_prestation','consultation',   'Consultation',              NULL, '{}', 0),
  (NULL,'type_prestation','plaidoirie',     'Plaidoirie / Audience',     NULL, '{}', 1),
  (NULL,'type_prestation','rédaction',      'Rédaction d''acte',         NULL, '{}', 2),
  (NULL,'type_prestation','conseil',        'Conseil juridique',         NULL, '{}', 3),
  (NULL,'type_prestation','représentation', 'Représentation en justice', NULL, '{}', 4),
  (NULL,'type_prestation','arbitrage',      'Arbitrage / Médiation',     NULL, '{}', 5),
  (NULL,'type_prestation','notarié',        'Acte notarié',              NULL, '{}', 6),
  (NULL,'type_prestation','huissier',       'Acte d''huissier',          NULL, '{}', 7),

  -- Statuts paiement
  (NULL,'statut_paiement','impayé',  'Impayé',          NULL, '{"cls":"bg-red-900/30 text-red-400 border-red-800"}',      0),
  (NULL,'statut_paiement','partiel', 'Paiement partiel', NULL, '{"cls":"bg-amber-900/30 text-amber-400 border-amber-800"}',1),
  (NULL,'statut_paiement','payé',    'Payé',             NULL, '{"cls":"bg-green-900/30 text-green-400 border-green-800"}',2)

ON CONFLICT (business_id, category, value) DO NOTHING;
