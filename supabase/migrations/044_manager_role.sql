-- ─── Rôle Manager ────────────────────────────────────────────────────────────
-- Nouveau rôle intermédiaire entre 'staff' (caissier) et 'admin'

-- 1. Mettre à jour la contrainte sur la table users
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'staff'));

-- 2. Mettre à jour la contrainte sur business_members
ALTER TABLE public.business_members
  DROP CONSTRAINT IF EXISTS business_members_role_check;
ALTER TABLE public.business_members
  ADD CONSTRAINT business_members_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'staff'));
