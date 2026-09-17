-- ============================================================================
-- Migration 131 : Module RH — Volet Temps & activités
-- Horaires hebdomadaires récurrents par employé + seuils configurables pour
-- le calcul des heures supplémentaires.
--
-- N'altère PAS le schéma de `staff_attendance` (clock_in/clock_out restent en
-- saisie manuelle HH:MM) : aucune régression sur autoRecordPresence /
-- autoRecordDeparture / updateStaffHeartbeat (pointage auto au login déjà en
-- prod). Purement additif.
-- ============================================================================

-- ── 1. Horaires hebdomadaires récurrents ───────────────────────────────────

CREATE TABLE IF NOT EXISTS staff_schedules (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id     UUID        NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  weekday      SMALLINT    NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0 = dimanche ... 6 = samedi
  start_time   TIME        NOT NULL,
  end_time     TIME        NOT NULL,
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  -- end_time < start_time est valide et représente un horaire de nuit
  -- (ex: 22:00 -> 06:00, chevauchant minuit) ; seule la durée nulle est rejetée.
  CONSTRAINT staff_schedules_valid_range CHECK (end_time <> start_time)
);

CREATE INDEX IF NOT EXISTS staff_schedules_staff_idx ON staff_schedules(staff_id, weekday);

ALTER TABLE staff_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_schedules_select" ON staff_schedules;
CREATE POLICY "staff_schedules_select" ON staff_schedules FOR SELECT TO authenticated
  USING (
    business_id = get_user_business_id() AND (
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true))
      OR EXISTS (SELECT 1 FROM staff s WHERE s.id = staff_schedules.staff_id AND s.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "staff_schedules_write_admin" ON staff_schedules;
CREATE POLICY "staff_schedules_write_admin" ON staff_schedules FOR ALL TO authenticated
  USING (business_id = get_user_business_id() AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true)))
  WITH CHECK (business_id = get_user_business_id() AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true)));

-- ── 2. Seuils horaires configurables par business (générique, pas de règle légale figée) ──

CREATE TABLE IF NOT EXISTS staff_time_settings (
  business_id            UUID        PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  weekly_hours_threshold NUMERIC(5,2) NOT NULL DEFAULT 40,
  daily_hours_threshold  NUMERIC(5,2) NOT NULL DEFAULT 8,
  overtime_multiplier    NUMERIC(4,2) NOT NULL DEFAULT 1.5,
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE staff_time_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_time_settings_select" ON staff_time_settings;
CREATE POLICY "staff_time_settings_select" ON staff_time_settings FOR SELECT TO authenticated
  USING (business_id = get_user_business_id());

DROP POLICY IF EXISTS "staff_time_settings_write_admin" ON staff_time_settings;
CREATE POLICY "staff_time_settings_write_admin" ON staff_time_settings FOR ALL TO authenticated
  USING (business_id = get_user_business_id() AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner') OR is_superadmin = true)))
  WITH CHECK (business_id = get_user_business_id() AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner') OR is_superadmin = true)));

CREATE TRIGGER staff_time_settings_updated_at BEFORE UPDATE ON staff_time_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 3. GRANTs explicites ─────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_schedules      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_time_settings  TO authenticated;
GRANT ALL ON TABLE public.staff_schedules     TO service_role;
GRANT ALL ON TABLE public.staff_time_settings TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
