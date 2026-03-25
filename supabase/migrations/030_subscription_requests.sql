-- ── Table des demandes d'abonnement ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.subscription_requests (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id  uuid        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  plan_id      uuid        REFERENCES public.plans(id),
  receipt_url  text        NOT NULL,
  status       text        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected')),
  note         text,
  created_at   timestamptz DEFAULT now(),
  processed_at timestamptz,
  processed_by uuid        REFERENCES public.users(id)
);

ALTER TABLE public.subscription_requests ENABLE ROW LEVEL SECURITY;

-- Les membres d'un établissement peuvent soumettre une demande
CREATE POLICY "sr_insert" ON public.subscription_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND business_id = subscription_requests.business_id
    )
  );

-- Lecture : ses propres demandes ou superadmin
CREATE POLICY "sr_select" ON public.subscription_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND (business_id = subscription_requests.business_id OR is_superadmin = true)
    )
  );

-- Mise à jour : superadmin seulement (approbation / rejet)
CREATE POLICY "sr_update" ON public.subscription_requests
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true)
  );

-- ── Bucket receipts (réutilise product-images, sous-dossier receipts/) ───────
-- Les utilisateurs authentifiés peuvent uploader leurs reçus
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'product-images' AND name LIKE 'receipts/%'
    LIMIT 1
  ) THEN NULL; END IF; -- bucket déjà existant, juste vérification
END $$;

-- Politique d'upload des reçus (INSERT dans product-images/receipts/*)
CREATE POLICY "receipts_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'product-images'
    AND name LIKE 'receipts/%'
    AND auth.role() = 'authenticated'
  );
