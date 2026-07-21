-- Migration 095 : Gestion des entrées événementielles (check-in invités)
-- Import d'une liste d'invités (Excel/CSV), recherche par nom, marquage du
-- pass comme utilisé à l'entrée. Pas de dépendance à un type de business en
-- particulier — module transverse activable depuis le backoffice (Modules ×
-- Types) pour n'importe quel établissement (ex : événement ponctuel type
-- Samsung Unpacked).

-- 1. Catalogue module applicatif
INSERT INTO public.app_modules (id, label, description, icon, is_core, sort_order)
VALUES (
  'evenements',
  'Événements (Check-in invités)',
  'Import de listes d''invités, recherche et pointage des entrées via pass/QR',
  'Ticket',
  false,
  30
)
ON CONFLICT (id) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description,
  icon        = EXCLUDED.icon;

-- 2. Disponible pour tous les types d'établissement, désactivé par défaut
--    (activation au cas par cas depuis le backoffice > Monitoring > Configuration établissement)
INSERT INTO public.business_type_modules (business_type_id, module_id, is_default)
SELECT id, 'evenements', false FROM public.business_types
ON CONFLICT (business_type_id, module_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  event_date  DATE,
  location    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS events_business_idx ON events (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS event_guests (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  event_id       UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  full_name      TEXT        NOT NULL,
  company        TEXT,                 -- entreprise / média / pays représenté
  phone          TEXT,
  category       TEXT,                 -- ex : VIP, presse, partenaire
  pass_code      TEXT,
  status         TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'used')),
  checked_in_at  TIMESTAMPTZ,
  checked_in_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_guests_event_idx ON event_guests (event_id, status);
CREATE INDEX IF NOT EXISTS event_guests_name_idx  ON event_guests (event_id, lower(full_name));

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_guests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_select" ON events;
DROP POLICY IF EXISTS "events_insert" ON events;
DROP POLICY IF EXISTS "events_update" ON events;
DROP POLICY IF EXISTS "events_delete" ON events;

CREATE POLICY "events_select" ON events FOR SELECT
  USING (business_id = get_user_business_id());

CREATE POLICY "events_insert" ON events FOR INSERT
  WITH CHECK (business_id = get_user_business_id());

CREATE POLICY "events_update" ON events FOR UPDATE
  USING (business_id = get_user_business_id());

CREATE POLICY "events_delete" ON events FOR DELETE
  USING (
    business_id = get_user_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner','admin'))
  );

DROP POLICY IF EXISTS "event_guests_select" ON event_guests;
DROP POLICY IF EXISTS "event_guests_insert" ON event_guests;
DROP POLICY IF EXISTS "event_guests_update" ON event_guests;
DROP POLICY IF EXISTS "event_guests_delete" ON event_guests;

CREATE POLICY "event_guests_select" ON event_guests FOR SELECT
  USING (business_id = get_user_business_id());

CREATE POLICY "event_guests_insert" ON event_guests FOR INSERT
  WITH CHECK (business_id = get_user_business_id());

CREATE POLICY "event_guests_update" ON event_guests FOR UPDATE
  USING (business_id = get_user_business_id());

CREATE POLICY "event_guests_delete" ON event_guests FOR DELETE
  USING (
    business_id = get_user_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner','admin'))
  );

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE events       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE event_guests TO authenticated;
GRANT ALL ON TABLE events       TO service_role;
GRANT ALL ON TABLE event_guests TO service_role;

-- ── Marquage atomique du pass comme utilisé ───────────────────────────────────
-- Empêche deux entrées simultanées de valider deux fois le même invité :
-- l'UPDATE ne s'applique que si le statut est encore 'pending'. Si aucune ligne
-- n'est retournée, l'appelant sait que l'invité a déjà été enregistré.

CREATE OR REPLACE FUNCTION check_in_guest(p_guest_id UUID)
RETURNS SETOF event_guests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE event_guests
  SET status = 'used',
      checked_in_at = NOW(),
      checked_in_by = auth.uid()
  WHERE id = p_guest_id
    AND business_id = get_user_business_id()
    AND status = 'pending'
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION check_in_guest(UUID) TO authenticated, service_role;
