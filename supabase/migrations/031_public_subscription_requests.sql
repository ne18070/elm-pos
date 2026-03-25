-- ── Demandes d'abonnement publiques (prospects sans compte) ──────────────────

CREATE TABLE IF NOT EXISTS public.public_subscription_requests (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  business_name text        NOT NULL,
  email         text        NOT NULL,
  phone         text,
  plan_id       uuid        REFERENCES public.plans(id),
  receipt_url   text        NOT NULL,
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected')),
  note          text,
  created_at    timestamptz DEFAULT now(),
  processed_at  timestamptz,
  processed_by  uuid        REFERENCES public.users(id)
);

ALTER TABLE public.public_subscription_requests ENABLE ROW LEVEL SECURITY;

-- Tout le monde (anonyme inclus) peut insérer une demande
CREATE POLICY "psr_insert_anon" ON public.public_subscription_requests
  FOR INSERT WITH CHECK (true);

-- Seul le superadmin peut lire et modifier
CREATE POLICY "psr_superadmin" ON public.public_subscription_requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true)
  );

-- Permettre à l'utilisateur anonyme d'uploader dans product-images/receipts/
-- (La politique receipts_insert de la migration 030 couvre déjà les authentifiés ;
--  on ajoute une politique pour les anonymes sur le sous-dossier public-*)
CREATE POLICY "receipts_insert_anon" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'product-images'
    AND name LIKE 'receipts/public-%'
  );
