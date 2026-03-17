-- ─── Politiques RLS supplémentaires — Administration ──────────────────────────
-- À exécuter dans : Supabase Dashboard > SQL Editor

-- Permettre aux admin/owner de modifier le rôle des membres de leur business
CREATE POLICY "users_update_by_admin" ON users FOR UPDATE
  USING (
    business_id = get_user_business_id()
    AND get_user_role() IN ('admin', 'owner')
  )
  WITH CHECK (
    business_id = get_user_business_id()
    -- Empêcher la promotion au rôle "owner" (un seul owner par business)
    AND role IN ('admin', 'staff')
  );

-- Permettre aux admin/owner de voir tous les membres de leur business
-- (la politique existante "users_select" couvre déjà ce cas, pas de doublon)

-- Ajouter colonne is_active si besoin de suspendre sans retirer du business
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Index pour les requêtes d'équipe
CREATE INDEX IF NOT EXISTS idx_users_business ON users(business_id);
