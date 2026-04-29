-- Migration 033 : Correction get_member_permissions
-- Le RPC retournait rien si l'appelant n'était pas admin/owner,
-- ce qui cachait les overrides négatifs (granted=false) dans le panel.
-- Fix : un membre peut toujours voir ses propres overrides.

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
    AND (
      -- Le membre consulte ses propres permissions
      p_user_id = auth.uid()
      OR
      -- Un admin/owner consulte un autre membre
      EXISTS (
        SELECT 1 FROM business_members bm
        WHERE bm.business_id = p_business_id
          AND bm.user_id = auth.uid()
          AND bm.role IN ('admin', 'owner')
      )
    );
$$;
