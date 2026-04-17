-- ── Member permission overrides ───────────────────────────────────────────────
-- Stores per-member permission overrides on top of role defaults.
-- A missing row means "use role default". A row with granted=true/false
-- explicitly grants or denies the permission regardless of role.

CREATE TABLE IF NOT EXISTS member_permission_overrides (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission  text NOT NULL CHECK (char_length(permission) > 0),
  granted     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, user_id, permission)
);

ALTER TABLE member_permission_overrides ENABLE ROW LEVEL SECURITY;

-- Members can read their own overrides
CREATE POLICY "members_read_own_overrides"
  ON member_permission_overrides
  FOR SELECT
  USING (user_id = auth.uid());

-- Admins/owners can read all overrides for their business
CREATE POLICY "admins_read_business_overrides"
  ON member_permission_overrides
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = member_permission_overrides.business_id
        AND bm.user_id = auth.uid()
        AND bm.role IN ('admin', 'owner')
    )
  );

-- Only admins/owners can insert overrides
CREATE POLICY "admins_insert_overrides"
  ON member_permission_overrides
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = member_permission_overrides.business_id
        AND bm.user_id = auth.uid()
        AND bm.role IN ('admin', 'owner')
    )
  );

-- Only admins/owners can update overrides
CREATE POLICY "admins_update_overrides"
  ON member_permission_overrides
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = member_permission_overrides.business_id
        AND bm.user_id = auth.uid()
        AND bm.role IN ('admin', 'owner')
    )
  );

-- Only admins/owners can delete overrides
CREATE POLICY "admins_delete_overrides"
  ON member_permission_overrides
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = member_permission_overrides.business_id
        AND bm.user_id = auth.uid()
        AND bm.role IN ('admin', 'owner')
    )
  );

-- ── RPC: get_my_permissions ───────────────────────────────────────────────────
-- Returns all explicit overrides for the current user within their business.

CREATE OR REPLACE FUNCTION get_my_permissions(p_business_id uuid)
RETURNS TABLE (permission text, granted boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT permission, granted
  FROM member_permission_overrides
  WHERE business_id = p_business_id
    AND user_id = auth.uid();
$$;

-- ── RPC: get_member_permissions ───────────────────────────────────────────────
-- Returns all overrides for a given member (admin/owner only).

CREATE OR REPLACE FUNCTION get_member_permissions(p_business_id uuid, p_user_id uuid)
RETURNS TABLE (permission text, granted boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mpo.permission, mpo.granted
  FROM member_permission_overrides mpo
  WHERE mpo.business_id = p_business_id
    AND mpo.user_id = p_user_id
    AND EXISTS (
      SELECT 1 FROM business_members bm
      WHERE bm.business_id = p_business_id
        AND bm.user_id = auth.uid()
        AND bm.role IN ('admin', 'owner')
    );
$$;
