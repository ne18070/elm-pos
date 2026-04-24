-- ============================================================
-- ELM APP — Vente de voitures (parc auto + leads publics)
-- Migration 018
-- ============================================================

-- ─── 1. Table voitures ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.voitures (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  marque            TEXT        NOT NULL,
  modele            TEXT        NOT NULL,
  annee             INTEGER,
  prix              NUMERIC(12,2) NOT NULL DEFAULT 0,
  kilometrage       INTEGER,
  carburant         TEXT        CHECK (carburant IN ('essence','diesel','hybride','electrique')),
  transmission      TEXT        CHECK (transmission IN ('manuelle','automatique')),
  couleur           TEXT,
  description       TEXT,
  image_principale  TEXT,
  statut            TEXT        NOT NULL DEFAULT 'disponible'
                                CHECK (statut IN ('disponible','reserve','vendu')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voitures_business_id ON public.voitures(business_id);
CREATE INDEX IF NOT EXISTS idx_voitures_statut      ON public.voitures(business_id, statut);

CREATE TRIGGER voitures_updated_at
  BEFORE UPDATE ON public.voitures
  FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();

-- ─── 2. Table voiture_leads ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.voiture_leads (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  voiture_id  UUID        REFERENCES public.voitures(id) ON DELETE SET NULL,
  nom         TEXT        NOT NULL,
  telephone   TEXT        NOT NULL,
  message     TEXT,
  statut      TEXT        NOT NULL DEFAULT 'nouveau'
              CHECK (statut IN ('nouveau','contacte','converti')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voiture_leads_business_id ON public.voiture_leads(business_id);
CREATE INDEX IF NOT EXISTS idx_voiture_leads_statut      ON public.voiture_leads(business_id, statut);

-- ─── 3. RLS — voitures ───────────────────────────────────────────────────────

ALTER TABLE public.voitures ENABLE ROW LEVEL SECURITY;

-- Membres de l'établissement : CRUD complet
DROP POLICY IF EXISTS "voitures_member_all" ON public.voitures;
CREATE POLICY "voitures_member_all" ON public.voitures
  FOR ALL TO authenticated
  USING  (business_id IN (SELECT business_id FROM public.business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.business_members WHERE user_id = auth.uid()));

-- Public (anon) : lecture des véhicules non vendus
DROP POLICY IF EXISTS "voitures_public_read" ON public.voitures;
CREATE POLICY "voitures_public_read" ON public.voitures
  FOR SELECT TO anon
  USING (statut != 'vendu');

-- ─── 4. RLS — voiture_leads ──────────────────────────────────────────────────

ALTER TABLE public.voiture_leads ENABLE ROW LEVEL SECURITY;

-- Membres de l'établissement : CRUD complet
DROP POLICY IF EXISTS "voiture_leads_member_all" ON public.voiture_leads;
CREATE POLICY "voiture_leads_member_all" ON public.voiture_leads
  FOR ALL TO authenticated
  USING  (business_id IN (SELECT business_id FROM public.business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.business_members WHERE user_id = auth.uid()));

-- Public (anon) : insertion uniquement (formulaire de contact)
DROP POLICY IF EXISTS "voiture_leads_public_insert" ON public.voiture_leads;
CREATE POLICY "voiture_leads_public_insert" ON public.voiture_leads
  FOR INSERT TO anon
  WITH CHECK (true);

-- ─── 5. Storage bucket images voitures ──────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('voitures', 'voitures', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "voitures_images_read"   ON storage.objects;
DROP POLICY IF EXISTS "voitures_images_upload"  ON storage.objects;
DROP POLICY IF EXISTS "voitures_images_delete"  ON storage.objects;

CREATE POLICY "voitures_images_read"   ON storage.objects FOR SELECT
  USING (bucket_id = 'voitures');

CREATE POLICY "voitures_images_upload" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'voitures' AND auth.role() = 'authenticated');

CREATE POLICY "voitures_images_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'voitures' AND auth.role() = 'authenticated');

-- ─── 6. Module dans app_modules ─────────────────────────────────────────────

INSERT INTO public.app_modules (id, label, description, icon, is_core, is_active, sort_order)
VALUES ('voitures', 'Vente de Voitures', 'Parc automobile, catalogue public et gestion des leads', 'Car', false, true, 25)
ON CONFLICT (id) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description,
  icon        = EXCLUDED.icon,
  sort_order  = EXCLUDED.sort_order;
