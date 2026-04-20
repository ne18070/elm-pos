-- ─── Évolution des Clients en Entités Juridiques ─────────────────────────────
-- Migration 088 : Support des types de clients configurables et attributs moraux.

-- 1. Ajouter les colonnes nécessaires à la table clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS type text; -- Référence à reference_data
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS identification_number text; -- RCCM, NINEA, etc.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS representative_name text; -- Pour les personnes morales

-- 2. Insérer les types de clients par défaut dans reference_data (si non présents)
-- Ces types sont éditables par l'utilisateur via l'interface.
INSERT INTO public.reference_data (category, value, label, sort_order, is_active)
VALUES 
  ('type_client', 'personne_physique', 'Personne Physique', 1, true),
  ('type_client', 'personne_morale', 'Personne Morale (Société)', 2, true),
  ('type_client', 'association', 'Association / ONG', 3, true),
  ('type_client', 'institution_publique', 'Institution Publique / État', 4, true)
ON CONFLICT (business_id, category, value) DO NOTHING;
