-- ─── Permissions Monitoring pour Superadmins ─────────────────────────────────
-- Migration 086 : Autoriser les superadmins à voir les données globales pour le monitoring.

-- Fonction helper pour vérifier si l'utilisateur est superadmin
-- (Déjà utilisée dans d'autres migrations, on s'assure qu'elle est accessible)
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean AS $$
  SELECT COALESCE(is_superadmin, false) FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- 1. Businesses
CREATE POLICY "superadmin_select_all_businesses" ON public.businesses
  FOR SELECT TO authenticated USING (public.is_superadmin());

CREATE POLICY "superadmin_update_all_businesses" ON public.businesses
  FOR UPDATE TO authenticated USING (public.is_superadmin());

-- 2. Orders
CREATE POLICY "superadmin_select_all_orders" ON public.orders
  FOR SELECT TO authenticated USING (public.is_superadmin());

-- 3. Business Members
CREATE POLICY "superadmin_select_all_members" ON public.business_members
  FOR SELECT TO authenticated USING (public.is_superadmin());

-- 4. Products
CREATE POLICY "superadmin_select_all_products" ON public.products
  FOR SELECT TO authenticated USING (public.is_superadmin());

-- 5. Subscriptions (déjà géré par get_all_subscriptions RPC mais pour être sûr)
CREATE POLICY "superadmin_select_all_subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated USING (public.is_superadmin());
