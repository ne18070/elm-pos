-- ─── Sécurisation des types et modules (Backoffice) ───────────────────────────
-- Migration 085 : Restreindre la modification des types et modules aux superadmins.

-- 1. Supprimer les anciennes politiques trop permissives
DROP POLICY IF EXISTS "manage business_types" ON public.business_types;
DROP POLICY IF EXISTS "manage app_modules" ON public.app_modules;
DROP POLICY IF EXISTS "manage business_type_modules" ON public.business_type_modules;

-- 2. Créer les nouvelles politiques restreintes aux superadmins
CREATE POLICY "manage business_types" ON public.business_types
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true));

CREATE POLICY "manage app_modules" ON public.app_modules
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true));

CREATE POLICY "manage business_type_modules" ON public.business_type_modules
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true));

-- Note : Les politiques de lecture (SELECT) restent inchangées (accessibles à tous les authentifiés).
