-- Public REST API key management.
-- Keys are stored as SHA-256 hashes. The raw key (elm_live_...) is shown
-- once at creation time and never persisted. Scopes follow a read:/write:
-- naming convention (e.g. 'read:products', 'write:orders').

CREATE TABLE IF NOT EXISTS public.api_keys (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  key_prefix   text        NOT NULL,        -- first 17 chars for display ("elm_live_" + 8 hex)
  key_hash     text        NOT NULL UNIQUE, -- SHA-256 hex of full raw key
  scopes       text[]      NOT NULL DEFAULT '{}',
  is_active    boolean     NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid        REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS api_keys_business_id_idx ON public.api_keys(business_id);
CREATE INDEX IF NOT EXISTS api_keys_key_hash_idx    ON public.api_keys(key_hash);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Business members can list their keys (key_hash is never exposed via select *)
CREATE POLICY "members_can_read_api_keys" ON public.api_keys
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.business_members
      WHERE business_id = api_keys.business_id
        AND user_id = auth.uid()
    )
  );

-- Only owners and admins can create, update, or delete keys
CREATE POLICY "owners_can_manage_api_keys" ON public.api_keys
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.business_members
      WHERE business_id = api_keys.business_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.business_members
      WHERE business_id = api_keys.business_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- Service role (used by /api/v1/* routes) bypasses RLS to validate key hashes
-- No extra grant needed: service_role always bypasses RLS in Supabase.
