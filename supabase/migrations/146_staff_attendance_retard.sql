-- ============================================================================
-- Migration 146 : Statut "retard" sur staff_attendance
--
-- Ajoute une distinction entre absence et retard, demandée pour le volet
-- Absences/Congés du self-service RH. Traitement payroll : un retard compte
-- comme un jour travaillé complet, sans déduction — cohérent avec l'absence
-- de règle légale figée déjà en place pour les heures supplémentaires
-- (staff_time_settings, migration 131). Purement additif sur le CHECK.
-- ============================================================================

ALTER TABLE staff_attendance DROP CONSTRAINT IF EXISTS staff_attendance_status_check;
ALTER TABLE staff_attendance
  ADD CONSTRAINT staff_attendance_status_check
  CHECK (status IN ('present', 'absent', 'half_day', 'leave', 'holiday', 'retard'));
