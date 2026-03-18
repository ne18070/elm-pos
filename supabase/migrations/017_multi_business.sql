-- ============================================================
-- Migration 017 : Gestion multi-établissements
-- Un utilisateur peut appartenir à plusieurs businesses.
-- business_members stocke la relation (user ↔ business ↔ role).
-- users.business_id reste le "business actif" (lu par RLS).
-- ============================================================

-- ── 1. Table business_members ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS business_members (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  role        TEXT        NOT NULL DEFAULT 'staff'
                          CHECK (role IN ('owner', 'admin', 'staff')),
  invited_by  UUID        REFERENCES auth.users(id),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, user_id)
);

ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;

-- Voir les membres du business actif
CREATE POLICY "bm_select" ON business_members FOR SELECT
  USING (business_id = get_user_business_id());

-- Owner/admin peuvent gérer les membres
CREATE POLICY "bm_insert" ON business_members FOR INSERT
  WITH CHECK (
    business_id = get_user_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner','admin'))
  );

CREATE POLICY "bm_update" ON business_members FOR UPDATE
  USING (
    business_id = get_user_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner','admin'))
  );

CREATE POLICY "bm_delete" ON business_members FOR DELETE
  USING (
    business_id = get_user_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner','admin'))
  );

-- ── 2. Migrer les données existantes ─────────────────────────────────────────

INSERT INTO business_members (business_id, user_id, role)
SELECT business_id, id, role
FROM   users
WHERE  business_id IS NOT NULL
ON CONFLICT (business_id, user_id) DO NOTHING;

-- ── 3. Trigger : sync users → business_members (pour l'edge function invite) ─
-- Quand l'edge function met à jour users.business_id, on ajoute automatiquement
-- l'utilisateur dans business_members.

CREATE OR REPLACE FUNCTION sync_user_to_business_members()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.business_id IS NOT NULL THEN
    INSERT INTO business_members (business_id, user_id, role)
    VALUES (NEW.business_id, NEW.id, NEW.role)
    ON CONFLICT (business_id, user_id)
      DO UPDATE SET role = EXCLUDED.role;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_business_members ON users;
CREATE TRIGGER trg_sync_business_members
  AFTER INSERT OR UPDATE OF business_id, role ON users
  FOR EACH ROW EXECUTE FUNCTION sync_user_to_business_members();

-- ── 4. RPC : lister tous les établissements de l'utilisateur connecté ─────────

CREATE OR REPLACE FUNCTION get_my_businesses()
RETURNS TABLE (
  id              UUID,
  name            TEXT,
  type            TEXT,
  address         TEXT,
  phone           TEXT,
  email           TEXT,
  logo_url        TEXT,
  currency        TEXT,
  tax_rate        NUMERIC,
  receipt_footer  TEXT,
  stock_units     JSONB,
  owner_id        UUID,
  created_at      TIMESTAMPTZ,
  member_role     TEXT
)
SECURITY DEFINER LANGUAGE sql AS $$
  SELECT
    b.id, b.name, b.type, b.address, b.phone, b.email, b.logo_url,
    b.currency, b.tax_rate, b.receipt_footer, b.stock_units,
    b.owner_id, b.created_at,
    bm.role AS member_role
  FROM businesses b
  JOIN business_members bm ON bm.business_id = b.id
  WHERE bm.user_id = auth.uid()
  ORDER BY b.name;
$$;

-- ── 5. RPC : basculer vers un autre établissement ────────────────────────────
-- Met à jour users.business_id + users.role → toutes les RLS suivent.

CREATE OR REPLACE FUNCTION switch_business(p_business_id UUID)
RETURNS void SECURITY DEFINER LANGUAGE plpgsql AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM   business_members
  WHERE  user_id = auth.uid() AND business_id = p_business_id;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Vous n''êtes pas membre de cet établissement';
  END IF;

  UPDATE users
  SET business_id = p_business_id,
      role        = v_role
  WHERE id = auth.uid();
END;
$$;

-- ── 6. RPC : créer un nouvel établissement ────────────────────────────────────
-- L'utilisateur devient automatiquement owner et bascule dessus.

CREATE OR REPLACE FUNCTION create_business(business_data JSONB)
RETURNS JSONB SECURITY DEFINER LANGUAGE plpgsql AS $$
DECLARE
  v_biz businesses;
BEGIN
  INSERT INTO businesses (
    name, type, currency, tax_rate, owner_id
  )
  VALUES (
    business_data->>'name',
    COALESCE(business_data->>'type', 'retail'),
    COALESCE(business_data->>'currency', 'XOF'),
    COALESCE((business_data->>'tax_rate')::NUMERIC, 0),
    auth.uid()
  )
  RETURNING * INTO v_biz;

  -- Ajouter comme owner dans business_members
  INSERT INTO business_members (business_id, user_id, role)
  VALUES (v_biz.id, auth.uid(), 'owner');

  -- Basculer vers le nouvel établissement
  UPDATE users
  SET business_id = v_biz.id,
      role        = 'owner'
  WHERE id = auth.uid();

  RETURN to_jsonb(v_biz);
END;
$$;

-- ── 7. RLS businesses : autoriser la création ─────────────────────────────────

DROP POLICY IF EXISTS "users_can_create_businesses" ON businesses;
CREATE POLICY "users_can_create_businesses" ON businesses FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- ── 8. RPC : lister les membres d'un établissement (avec profil utilisateur) ──

CREATE OR REPLACE FUNCTION get_business_members(p_business_id UUID)
RETURNS TABLE (
  user_id    UUID,
  full_name  TEXT,
  email      TEXT,
  avatar_url TEXT,
  role       TEXT,
  joined_at  TIMESTAMPTZ
)
SECURITY DEFINER LANGUAGE sql AS $$
  SELECT
    u.id        AS user_id,
    u.full_name,
    u.email,
    u.avatar_url,
    bm.role,
    bm.joined_at
  FROM business_members bm
  JOIN users u ON u.id = bm.user_id
  WHERE bm.business_id = p_business_id
    -- Seuls les membres du business actif peuvent voir la liste
    AND p_business_id = get_user_business_id()
  ORDER BY bm.role, u.full_name;
$$;

-- ── 9. RPC : changer le rôle d'un membre ─────────────────────────────────────

CREATE OR REPLACE FUNCTION set_member_role(
  p_business_id UUID,
  p_user_id     UUID,
  p_role        TEXT
)
RETURNS void SECURITY DEFINER LANGUAGE plpgsql AS $$
BEGIN
  -- Seuls owner/admin du business actif peuvent modifier les rôles
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND business_id = p_business_id
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Permission refusée';
  END IF;

  -- Ne pas modifier le propriétaire
  IF EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = p_business_id AND user_id = p_user_id AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Le rôle du propriétaire ne peut pas être modifié';
  END IF;

  UPDATE business_members
  SET role = p_role
  WHERE business_id = p_business_id AND user_id = p_user_id;

  -- Sync users.role si ce business est le business actif de l'agent
  UPDATE users
  SET role = p_role
  WHERE id = p_user_id AND business_id = p_business_id;
END;
$$;

-- ── 10. RPC : retirer un membre ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION remove_business_member(
  p_business_id UUID,
  p_user_id     UUID
)
RETURNS void SECURITY DEFINER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND business_id = p_business_id
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Permission refusée';
  END IF;

  IF EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = p_business_id AND user_id = p_user_id AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Impossible de retirer le propriétaire';
  END IF;

  DELETE FROM business_members
  WHERE business_id = p_business_id AND user_id = p_user_id;

  -- Si c'était le business actif de l'agent, le détacher
  UPDATE users
  SET business_id = NULL, role = 'staff'
  WHERE id = p_user_id AND business_id = p_business_id;
END;
$$;
