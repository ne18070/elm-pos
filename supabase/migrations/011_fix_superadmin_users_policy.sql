-- Migration 011 : Autoriser les superadmins à voir tous les profils utilisateurs
-- Correction pour le système de support où le champ "user" était null pour les superadmins.

-- Assure que la fonction helper existe (elle devrait déjà exister depuis migration 006)
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean AS $$
  SELECT COALESCE(is_superadmin, false) FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- 1. Lecture de tous les utilisateurs pour les superadmins
DROP POLICY IF EXISTS "superadmin_select_all_users" ON public.users;
CREATE POLICY "superadmin_select_all_users" ON public.users
  FOR SELECT TO authenticated 
  USING (public.is_superadmin());

-- 2. Mise à jour de tous les utilisateurs pour les superadmins
DROP POLICY IF EXISTS "superadmin_update_all_users" ON public.users;
CREATE POLICY "superadmin_update_all_users" ON public.users
  FOR UPDATE TO authenticated
  USING (public.is_superadmin());
