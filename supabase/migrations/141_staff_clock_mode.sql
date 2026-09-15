-- ============================================================================
-- Migration 141 : Méthode de pointage par employé
--
-- Jusqu'ici, le pointage automatique (login/heartbeat/logout, cf. 007) et le
-- pointage par badge (140) pouvaient s'appliquer en parallèle au même
-- employé, créant un risque de double-pointage le même jour. Cette migration
-- ajoute `staff.clock_mode` pour désigner UN SEUL canal automatique autorisé
-- par employé :
--   - 'auto'   : pointage automatique à la connexion/déconnexion (comportement
--                historique, valeur par défaut — aucune régression)
--   - 'badge'  : uniquement le pointage par badge (recordBadgeClock)
--   - 'manual' : aucun canal automatique — la grille de présence (saisie
--                manuelle) reste le seul moyen d'enregistrer les présences
--
-- La grille de présence manuelle (AttendanceTab / cycleAttendance) reste
-- disponible dans tous les modes : ce réglage ne restreint que les canaux
-- automatiques, jamais la correction manuelle par un admin.
-- ============================================================================

ALTER TABLE staff ADD COLUMN IF NOT EXISTS clock_mode TEXT NOT NULL DEFAULT 'auto';

ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_clock_mode_check;
ALTER TABLE staff
  ADD CONSTRAINT staff_clock_mode_check
  CHECK (clock_mode IN ('auto', 'badge', 'manual'));

-- Colonne ajoutée sur une table déjà couverte par les GRANTs existants
-- (staff) — pas de nouveau GRANT nécessaire.
