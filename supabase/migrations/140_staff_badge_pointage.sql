-- ============================================================================
-- Migration 140 : Pointage par badge (code-barres)
--
-- Ajoute un identifiant de badge par employé (`staff.badge_code`) et trace la
-- méthode de pointage sur `staff_attendance` (`clock_method`). Purement
-- additif : aucune régression sur le pointage auto existant
-- (autoRecordPresence / autoRecordDeparture / updateStaffHeartbeat), qui
-- passe désormais explicitement clock_method = 'login'. Les lignes
-- existantes et les saisies manuelles (grille de présence, PaymentModal)
-- restent au défaut 'manual'.
-- ============================================================================

ALTER TABLE staff ADD COLUMN IF NOT EXISTS badge_code TEXT;

-- Un même code de badge ne peut être attribué qu'à un seul employé actif
-- ou non, au sein d'un même business.
CREATE UNIQUE INDEX IF NOT EXISTS staff_badge_code_unique
  ON staff(business_id, badge_code)
  WHERE badge_code IS NOT NULL;

ALTER TABLE staff_attendance
  ADD COLUMN IF NOT EXISTS clock_method TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE staff_attendance DROP CONSTRAINT IF EXISTS staff_attendance_clock_method_check;
ALTER TABLE staff_attendance
  ADD CONSTRAINT staff_attendance_clock_method_check
  CHECK (clock_method IN ('manual', 'login', 'badge'));

-- Colonnes ajoutées sur des tables déjà couvertes par les GRANTs existants
-- (staff, staff_attendance) — pas de nouveau GRANT nécessaire.
