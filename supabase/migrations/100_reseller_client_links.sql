-- Migration 100 : un client peut être associé à plusieurs revendeurs
--
-- reseller_clients était en 1:N strict (reseller_id NOT NULL) : le même client
-- physique devait être recréé pour chaque revendeur. On introduit une table de
-- liaison N:N ; reseller_clients devient le référentiel client du commerce.
-- orders.reseller_client_id continue de pointer sur reseller_clients(id).

CREATE TABLE IF NOT EXISTS public.reseller_client_links (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id        UUID NOT NULL REFERENCES public.businesses(id)        ON DELETE CASCADE,
  reseller_id        UUID NOT NULL REFERENCES public.resellers(id)         ON DELETE CASCADE,
  reseller_client_id UUID NOT NULL REFERENCES public.reseller_clients(id)  ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reseller_id, reseller_client_id)
);

CREATE INDEX IF NOT EXISTS idx_rcl_reseller ON public.reseller_client_links(reseller_id);
CREATE INDEX IF NOT EXISTS idx_rcl_client   ON public.reseller_client_links(reseller_client_id);
CREATE INDEX IF NOT EXISTS idx_rcl_business ON public.reseller_client_links(business_id);

-- Backfill : une liaison par association existante
INSERT INTO public.reseller_client_links (business_id, reseller_id, reseller_client_id)
SELECT business_id, reseller_id, id
FROM public.reseller_clients
WHERE reseller_id IS NOT NULL
ON CONFLICT (reseller_id, reseller_client_id) DO NOTHING;

-- reseller_clients.reseller_id devient héritage : la table de liaison fait foi.
ALTER TABLE public.reseller_clients ALTER COLUMN reseller_id DROP NOT NULL;

-- RLS : isolé par commerce, comme reseller_clients
ALTER TABLE public.reseller_client_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rcl_business" ON public.reseller_client_links;
DROP POLICY IF EXISTS "rcl_insert"   ON public.reseller_client_links;
DROP POLICY IF EXISTS "rcl_delete"   ON public.reseller_client_links;
CREATE POLICY "rcl_business" ON public.reseller_client_links
  USING (business_id = get_user_business_id());
CREATE POLICY "rcl_insert" ON public.reseller_client_links FOR INSERT
  WITH CHECK (business_id = get_user_business_id());
CREATE POLICY "rcl_delete" ON public.reseller_client_links FOR DELETE
  USING (business_id = get_user_business_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reseller_client_links TO authenticated;
GRANT ALL ON TABLE public.reseller_client_links TO service_role;
