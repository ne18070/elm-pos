-- Migration: 037_onboarding_system.sql
-- Description: Système d'onboarding modulaire et tracking analytics

-- 1. ANALYTICS : Pour piloter le funnel sans outils tiers lourds
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id),
  business_id UUID,
  event_name  TEXT NOT NULL,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Analytics
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "analytics_insert_policy" ON public.analytics_events;
CREATE POLICY "analytics_insert_policy" ON public.analytics_events 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 2. SCHEMA BUSINESS : Extension safe
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS industry_sector TEXT;

-- 3. RPC : create_business_v2
-- Plus flexible que la V1, évite les blocages sur les types
CREATE OR REPLACE FUNCTION public.create_business_v2(p_name TEXT, p_sector TEXT)
RETURNS UUID AS $$
DECLARE
  v_biz_id UUID;
BEGIN
  -- Insertion dans businesses (type service par défaut pour passer le CHECK existant)
  INSERT INTO public.businesses (name, type, industry_sector, owner_id)
  VALUES (p_name, 'service', p_sector, auth.uid())
  RETURNING id INTO v_biz_id;

  -- Liaison utilisateur
  UPDATE public.users 
  SET business_id = v_biz_id, role = 'owner' 
  WHERE id = auth.uid();

  RETURN v_biz_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC : activate_trial_v2
CREATE OR REPLACE FUNCTION public.activate_trial_v2(p_biz_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.subscriptions (business_id, status, trial_ends_at)
  VALUES (p_biz_id, 'trial', NOW() + INTERVAL '7 days')
  ON CONFLICT (business_id) DO UPDATE 
  SET status = 'trial', trial_ends_at = EXCLUDED.trial_ends_at
  WHERE subscriptions.status = 'expired'; -- Ne réactive que si expiré
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC : seed_demo_data
-- On sépare le seeding pour pouvoir l'appeler de manière asynchrone si besoin
CREATE OR REPLACE FUNCTION public.seed_demo_data(p_biz_id UUID, p_sector TEXT)
RETURNS VOID AS $$
DECLARE
  v_cat_id UUID;
BEGIN
  IF p_sector = 'retail' OR p_sector = 'boutique' THEN
    INSERT INTO public.categories (business_id, name) VALUES (p_biz_id, 'Général') RETURNING id INTO v_cat_id;
    INSERT INTO public.products (business_id, category_id, name, price) VALUES (p_biz_id, v_cat_id, 'Produit démo', 1000);
  ELSIF p_sector = 'restaurant' THEN
    INSERT INTO public.categories (business_id, name) VALUES (p_biz_id, 'Boissons');
  END IF;
  -- On peut étendre ici sans casser les fonctions de création de base
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
