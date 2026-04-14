-- ============================================================
-- 075 — Lien staff ↔ compte utilisateur système
-- ============================================================

-- Colonne optionnelle : quand un employé a un compte de connexion
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Un compte utilisateur ne peut être lié qu'à un seul employé par business
CREATE UNIQUE INDEX IF NOT EXISTS staff_user_id_unique
  ON staff(user_id)
  WHERE user_id IS NOT NULL;
