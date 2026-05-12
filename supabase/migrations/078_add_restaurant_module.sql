-- Fix: Add restaurant module to app_modules and enable it for restaurant and retail types
INSERT INTO public.app_modules (id, label, description, icon, is_core, is_active, sort_order)
VALUES ('restaurant', 'Module Restaurant', 'Gestion du menu du jour, plan de salle et commandes restaurant', 'Utensils', false, true, 8)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  is_active = EXCLUDED.is_active;

-- Link to business types
INSERT INTO public.business_type_modules (business_type_id, module_id, is_default)
VALUES 
  ('restaurant', 'restaurant', true),
  ('retail', 'restaurant', false)
ON CONFLICT (business_type_id, module_id) DO NOTHING;

-- Enable restaurant feature for existing restaurant businesses
UPDATE public.businesses
SET features = array_append(features, 'restaurant')
WHERE type = 'restaurant' AND NOT ('restaurant' = ANY(features));
