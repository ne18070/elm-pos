-- ============================================================
-- ELM APP — Schéma initial Supabase
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ─── Établissements ───────────────────────────────────────────────────────────

CREATE TABLE businesses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('restaurant','retail','service','hotel')),
  address         TEXT,
  phone           TEXT,
  email           TEXT,
  logo_url        TEXT,
  currency        TEXT NOT NULL DEFAULT 'XOF',
  tax_rate        NUMERIC(5,2) NOT NULL DEFAULT 0,
  receipt_footer  TEXT,
  owner_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─── Profils utilisateurs ─────────────────────────────────────────────────────

CREATE TABLE users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','owner','staff')),
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Déclencher à la création d'un compte auth
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'staff')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ─── Sécurité (RLS) ───────────────────────────────────────────────────────────

ALTER TABLE businesses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE users       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_select" ON businesses FOR SELECT
  USING (id = get_user_business_id() OR owner_id = auth.uid());

CREATE POLICY "business_update" ON businesses FOR UPDATE
  USING (owner_id = auth.uid());

-- users : chaque utilisateur voit les membres de son business
CREATE POLICY "users_select" ON users FOR SELECT
  USING (business_id = get_user_business_id() OR id = auth.uid());

CREATE POLICY "users_update_self" ON users FOR UPDATE
  USING (id = auth.uid());

-- categories, products : lecture par tous les membres du business



-- File: 004_admin_rls.sql
-- ─── Politiques RLS supplémentaires — Administration ──────────────────────────
-- À exécuter dans : Supabase Dashboard > SQL Editor

-- Permettre aux admin/owner de modifier le rôle des membres de leur business
CREATE POLICY "users_update_by_admin" ON users FOR UPDATE
  USING (
    business_id = get_user_business_id()
    AND get_user_role() IN ('admin', 'owner')
  )
  WITH CHECK (
    business_id = get_user_business_id()
    -- Empêcher la promotion au rôle "owner" (un seul owner par business)
    AND role IN ('admin', 'staff')
  );

-- Permettre aux admin/owner de voir tous les membres de leur business
-- (la politique existante "users_select" couvre déjà ce cas, pas de doublon)

-- Ajouter colonne is_active si besoin de suspendre sans retirer du business
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Index pour les requêtes d'équipe
CREATE INDEX IF NOT EXISTS idx_users_business ON users(business_id);


-- File: 017_multi_business.sql
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


-- File: 019_activity_logs.sql
-- ─── Journal d'activité (audit log) ─────────────────────────────────────────

create table if not exists activity_logs (
  id           uuid        primary key default gen_random_uuid(),
  business_id  uuid        not null references businesses(id) on delete cascade,
  user_id      uuid        references auth.users(id) on delete set null,
  user_name    text,
  action       text        not null,   -- ex: 'order.created', 'product.deleted'
  entity_type  text,                   -- ex: 'order', 'product', 'stock', 'user'
  entity_id    text,                   -- UUID ou identifiant de l'entité concernée
  metadata     jsonb,                  -- données contextuelles supplémentaires
  created_at   timestamptz not null default now()
);

-- Index pour les requêtes les plus courantes
create index if not exists activity_logs_biz_date_idx
  on activity_logs (business_id, created_at desc);

create index if not exists activity_logs_user_idx
  on activity_logs (user_id);

create index if not exists activity_logs_action_idx
  on activity_logs (action);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table activity_logs enable row level security;

-- Tout utilisateur authentifié peut insérer un log
create policy "activity_logs_insert"
  on activity_logs for insert
  to authenticated
  with check (true);

-- Seuls owner/admin voient les logs de leur établissement
create policy "activity_logs_select"
  on activity_logs for select
  to authenticated
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.business_id = activity_logs.business_id
        and users.role in ('owner', 'admin')
    )
  );


-- File: 022_handle_new_user_business.sql
-- Migration 022 : handle_new_user inclut business_id depuis les métadonnées
-- Permet de créer un membre d'équipe via signUp() sans Edge Function

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO users (id, email, full_name, role, business_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'staff'),
    NULLIF(NEW.raw_user_meta_data->>'business_id', '')::uuid
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name   = EXCLUDED.full_name,
    role        = EXCLUDED.role,
    business_id = COALESCE(EXCLUDED.business_id, users.business_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Ne jamais bloquer la création du compte auth même si le profil échoue
  RETURN NEW;
END;
$$;


-- File: 023_assign_user_to_business.sql
-- Migration 023 : RPC pour assigner un user à un business après sa création
-- Permet à un admin/owner de lier un nouvel utilisateur à son établissement
-- en contournant la RLS (SECURITY DEFINER)

CREATE OR REPLACE FUNCTION assign_user_to_business(
  p_email       TEXT,
  p_full_name   TEXT,
  p_role        TEXT,
  p_business_id UUID
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Vérifier que l'appelant est admin/owner du business cible
  -- (via business_members OU via users.business_id pour rétro-compatibilité)
  IF NOT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE user_id = auth.uid()
      AND business_id = p_business_id
      AND role IN ('admin', 'owner')
  ) AND NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND business_id = p_business_id
      AND role IN ('admin', 'owner')
  ) THEN
    RAISE EXCEPTION 'Permission refusée pour ce business';
  END IF;

  -- Récupérer l'UUID depuis auth.users
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur introuvable dans auth.users';
  END IF;

  -- Insérer le profil si nouveau, sinon laisser business_id/role existants intacts
  -- (un user existant garde son business actif et son rôle principal)
  INSERT INTO public.users (id, email, full_name, role, business_id)
  VALUES (v_user_id, p_email, NULLIF(p_full_name, ''), p_role, p_business_id)
  ON CONFLICT (id) DO UPDATE SET
    full_name   = COALESCE(NULLIF(p_full_name, ''), public.users.full_name),
    -- Ne pas changer le business actif ni le rôle principal si déjà définis
    role        = COALESCE(public.users.role, p_role),
    business_id = COALESCE(public.users.business_id, p_business_id);

  -- Ajouter dans business_members avec le rôle spécifique à ce business
  INSERT INTO public.business_members (business_id, user_id, role)
  VALUES (p_business_id, v_user_id, p_role)
  ON CONFLICT (business_id, user_id)
    DO UPDATE SET role = p_role;
END;
$$;


-- File: 024_fix_business_members_rls.sql
-- Migration 024 : Fix RLS business_members pour le multi-établissements
-- La policy "bm_select" ne laissait voir que les membres du business actif,
-- empêchant get_my_businesses() de retourner tous les établissements de l'utilisateur.

DROP POLICY IF EXISTS "bm_select" ON business_members;

CREATE POLICY "bm_select" ON business_members FOR SELECT
  USING (
    business_id = get_user_business_id()   -- voir tous les membres de l'établissement actif
    OR user_id = auth.uid()                -- voir ses propres memberships (switcher multi-business)
  );


-- File: 025_block_reset_password.sql
-- Migration 025 : Bloquer un utilisateur + réinitialiser son mot de passe (owner only)

-- 1. Colonne is_blocked sur public.users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;

-- 2. RPC : bloquer / débloquer un membre (owner du business uniquement)
CREATE OR REPLACE FUNCTION toggle_user_block(
  p_business_id uuid,
  p_user_id     uuid,
  p_blocked     boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Vérifier que l'appelant est owner du business
  IF NOT EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = p_business_id
      AND user_id     = auth.uid()
      AND role        = 'owner'
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  -- Impossible de bloquer un owner
  IF EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = p_business_id
      AND user_id     = p_user_id
      AND role        = 'owner'
  ) THEN
    RAISE EXCEPTION 'Impossible de bloquer un propriétaire';
  END IF;

  UPDATE public.users SET is_blocked = p_blocked WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_user_block(uuid, uuid, boolean) TO authenticated;

-- 3. RPC : réinitialiser le mot de passe d'un membre (owner du business uniquement)
--    Utilise pgcrypto (disponible par défaut dans Supabase) pour hasher le mot de passe.
CREATE OR REPLACE FUNCTION admin_reset_user_password(
  p_business_id uuid,
  p_user_id     uuid,
  p_new_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  -- Vérifier que l'appelant est owner du business
  IF NOT EXISTS (
    SELECT 1 FROM business_members
    WHERE business_id = p_business_id
      AND user_id     = auth.uid()
      AND role        = 'owner'
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  -- Mettre à jour le mot de passe dans auth.users
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at         = now()
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reset_user_password(uuid, uuid, text) TO authenticated;


-- File: 033_security_hardening.sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- 033 - Security hardening
-- ● Fix RLS policies (multi-tenant isolation)
-- ● Rate limiting on sensitive RPCs
-- ● Server-side input validation in RPCs
-- ● Immutable activity_logs (deny UPDATE / DELETE)
-- ● last_seen_at tracking for session inactivity
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Fix activity_logs INSERT policy ──────────────────────────────────────
-- Old policy had WITH CHECK (true) → any authenticated user could log for any business.
-- New policy restricts inserts to the user's own businesses.

DROP POLICY IF EXISTS "activity_logs_insert" ON public.activity_logs;
CREATE POLICY "activity_logs_insert" ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT business_id FROM public.business_members WHERE user_id = auth.uid()
    )
  );

-- Make activity_logs explicitly immutable: deny UPDATE and DELETE for everyone.
DROP POLICY IF EXISTS "activity_logs_no_update" ON public.activity_logs;
CREATE POLICY "activity_logs_no_update" ON public.activity_logs
  FOR UPDATE TO authenticated
  USING (false);

DROP POLICY IF EXISTS "activity_logs_no_delete" ON public.activity_logs;
CREATE POLICY "activity_logs_no_delete" ON public.activity_logs
  FOR DELETE TO authenticated
  USING (false);

-- ─── 2. Fix users UPDATE self policy (prevent privilege escalation) ───────────
-- Old policy had no field restrictions → user could elevate their own role.

DROP POLICY IF EXISTS "users_update_self" ON public.users;
CREATE POLICY "users_update_self" ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- Prevent changing privileged fields by ensuring they don't change
    AND role      = (SELECT role      FROM public.users WHERE id = auth.uid())
    AND is_superadmin = (SELECT is_superadmin FROM public.users WHERE id = auth.uid())
    AND is_blocked    = (SELECT is_blocked    FROM public.users WHERE id = auth.uid())
  );

-- ─── 3. Rate limiting infrastructure ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key        text        NOT NULL,
  count      int         NOT NULL DEFAULT 1,
  window_end timestamptz NOT NULL,
  PRIMARY KEY (key)
);

-- Only the service role (SECURITY DEFINER functions) can touch rate_limits.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rate_limits_deny_direct" ON public.rate_limits
  FOR ALL TO authenticated
  USING (false);

-- Helper function: returns TRUE if the action is allowed, FALSE if rate-limited.
-- window_seconds: duration of the rolling window
-- max_count: maximum calls allowed within that window
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key            text,
  p_max_count      int,
  p_window_seconds int DEFAULT 60
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  INSERT INTO public.rate_limits (key, count, window_end)
  VALUES (p_key, 1, v_now + (p_window_seconds || ' seconds')::interval)
  ON CONFLICT (key) DO UPDATE
    SET count      = CASE
                       WHEN rate_limits.window_end < v_now
                       THEN 1
                       ELSE rate_limits.count + 1
                     END,
        window_end = CASE
                       WHEN rate_limits.window_end < v_now
                       THEN v_now + (p_window_seconds || ' seconds')::interval
                       ELSE rate_limits.window_end
                     END;

  RETURN (SELECT count <= p_max_count FROM public.rate_limits WHERE key = p_key);
END;
$$;

-- ─── 4. Harden activate_subscription (rate limit + input validation) ──────────

CREATE OR REPLACE FUNCTION activate_subscription(
  p_business_id uuid,
  p_plan_id     uuid,
  p_days        int    DEFAULT 30,
  p_note        text   DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Superadmin check
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  -- Rate limit: 20 activations per 60s per superadmin (prevents bulk abuse)
  IF NOT check_rate_limit('activate_sub:' || auth.uid()::text, 20, 60) THEN
    RAISE EXCEPTION 'Trop de requêtes — réessayez dans quelques secondes';
  END IF;

  -- Input validation
  IF p_days < 1 OR p_days > 3650 THEN
    RAISE EXCEPTION 'Durée invalide : entre 1 et 3650 jours';
  END IF;
  IF p_plan_id IS NULL THEN
    RAISE EXCEPTION 'plan_id requis';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id = p_business_id) THEN
    RAISE EXCEPTION 'Établissement introuvable';
  END IF;

  INSERT INTO subscriptions (business_id, plan_id, status, expires_at, activated_at, payment_note)
  VALUES (p_business_id, p_plan_id, 'active', now() + (p_days || ' days')::interval, now(), p_note)
  ON CONFLICT (business_id) DO UPDATE SET
    plan_id      = p_plan_id,
    status       = 'active',
    expires_at   = now() + (p_days || ' days')::interval,
    activated_at = now(),
    payment_note = COALESCE(p_note, subscriptions.payment_note);
END;
$$;

-- ─── 5. Harden admin_reset_user_password (rate limit + password validation) ───

CREATE OR REPLACE FUNCTION admin_reset_user_password(
  p_user_id    uuid,
  p_new_password text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_role text;
  v_target_business_id uuid;
BEGIN
  -- Get caller's role
  SELECT role INTO v_caller_role FROM public.users WHERE id = auth.uid();

  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  -- Rate limit: 5 password resets per 10 min per caller
  IF NOT check_rate_limit('pwd_reset:' || auth.uid()::text, 5, 600) THEN
    RAISE EXCEPTION 'Trop de tentatives — réessayez dans 10 minutes';
  END IF;

  -- Password validation: min 8 chars
  IF length(p_new_password) < 8 THEN
    RAISE EXCEPTION 'Le mot de passe doit contenir au moins 8 caractères';
  END IF;

  -- Ensure target user belongs to one of the caller's businesses
  SELECT bm_target.business_id INTO v_target_business_id
  FROM public.business_members bm_caller
  JOIN public.business_members bm_target ON bm_target.business_id = bm_caller.business_id
  WHERE bm_caller.user_id = auth.uid()
    AND bm_target.user_id = p_user_id
  LIMIT 1;

  IF v_target_business_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur introuvable ou hors de votre établissement';
  END IF;

  -- Prevent resetting a superadmin's password
  IF EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id AND is_superadmin = true) THEN
    RAISE EXCEPTION 'Impossible de réinitialiser le mot de passe d''un super-administrateur';
  END IF;

  -- Perform the reset via Supabase auth admin API (service role only)
  PERFORM extensions.http_post(
    'http://localhost:9999/admin/users/' || p_user_id::text,
    '{"password":"' || replace(p_new_password, '"', '\"') || '"}',
    'application/json'
  );
END;
$$;

-- Note: If extensions.http is not available, the password reset should be done
-- client-side via supabase.auth.admin.updateUserById() in a server action.
-- The RLS / rate-limit guard above still applies regardless.

-- ─── 6. Harden open_cash_session (rate limit + validation) ───────────────────

CREATE OR REPLACE FUNCTION open_cash_session(
  p_business_id    uuid,
  p_opening_amount numeric DEFAULT 0
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_session_id uuid;
BEGIN
  -- Caller must belong to this business
  IF NOT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE user_id = auth.uid() AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  -- Rate limit: 10 opens per 60s per business (prevents loop abuse)
  IF NOT check_rate_limit('cash_open:' || p_business_id::text, 10, 60) THEN
    RAISE EXCEPTION 'Trop de requêtes';
  END IF;

  -- Input validation
  IF p_opening_amount < 0 THEN
    RAISE EXCEPTION 'Le fond de caisse ne peut pas être négatif';
  END IF;
  IF p_opening_amount > 10000000 THEN
    RAISE EXCEPTION 'Montant d''ouverture trop élevé';
  END IF;

  INSERT INTO public.cash_sessions (business_id, opened_by, opening_amount, status)
  VALUES (p_business_id, auth.uid(), p_opening_amount, 'open')
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;
GRANT EXECUTE ON FUNCTION open_cash_session(uuid, numeric) TO authenticated;

-- ─── 7. Harden close_cash_session (rate limit + validation) ──────────────────

CREATE OR REPLACE FUNCTION close_cash_session(
  p_session_id  uuid,
  p_actual_cash numeric DEFAULT 0,
  p_notes       text    DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_business_id uuid;
  v_total_sales  numeric;
  v_total_cash   numeric;
  v_total_card   numeric;
  v_total_mobile numeric;
  v_total_orders integer;
  v_total_refunds numeric;
  v_expected_cash numeric;
BEGIN
  -- Verify session belongs to caller's business
  SELECT business_id INTO v_business_id
  FROM public.cash_sessions
  WHERE id = p_session_id AND status = 'open';

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Session introuvable ou déjà clôturée';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE user_id = auth.uid() AND business_id = v_business_id
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  -- Rate limit: 10 closes per 60s per session
  IF NOT check_rate_limit('cash_close:' || p_session_id::text, 10, 60) THEN
    RAISE EXCEPTION 'Trop de requêtes';
  END IF;

  -- Input validation
  IF p_actual_cash < 0 THEN
    RAISE EXCEPTION 'Le montant ne peut pas être négatif';
  END IF;

  -- Compute snapshot from orders & payments during session window
  SELECT
    COALESCE(SUM(o.total), 0),
    COALESCE(SUM(CASE WHEN p.method = 'cash'   THEN p.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN p.method = 'card'   THEN p.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN p.method = 'mobile' THEN p.amount ELSE 0 END), 0),
    COUNT(DISTINCT o.id)
  INTO v_total_sales, v_total_cash, v_total_card, v_total_mobile, v_total_orders
  FROM public.orders o
  LEFT JOIN public.payments p ON p.order_id = o.id
  JOIN public.cash_sessions cs ON cs.id = p_session_id
  WHERE o.business_id = v_business_id
    AND o.created_at >= cs.opened_at
    AND o.status NOT IN ('cancelled');

  SELECT COALESCE(SUM(r.amount), 0)
  INTO v_total_refunds
  FROM public.refunds r
  JOIN public.cash_sessions cs ON cs.id = p_session_id
  WHERE r.business_id = v_business_id
    AND r.created_at >= cs.opened_at;

  v_expected_cash := (SELECT opening_amount FROM public.cash_sessions WHERE id = p_session_id)
                     + v_total_cash - COALESCE(v_total_refunds, 0);

  UPDATE public.cash_sessions SET
    status          = 'closed',
    closed_by       = auth.uid(),
    closed_at       = now(),
    total_sales     = v_total_sales,
    total_cash      = v_total_cash,
    total_card      = v_total_card,
    total_mobile    = v_total_mobile,
    total_orders    = v_total_orders,
    total_refunds   = v_total_refunds,
    expected_cash   = v_expected_cash,
    actual_cash     = p_actual_cash,
    difference      = p_actual_cash - v_expected_cash,
    notes           = p_notes
  WHERE id = p_session_id;
END;
$$;
GRANT EXECUTE ON FUNCTION close_cash_session(uuid, numeric, text) TO authenticated;

-- ─── 8. last_seen_at tracking ─────────────────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE OR REPLACE FUNCTION update_last_seen()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.users SET last_seen_at = now() WHERE id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION update_last_seen() TO authenticated;

-- ─── 9. Validate orders amount at insert (server-side) ───────────────────────

CREATE OR REPLACE FUNCTION validate_order_amounts()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.total < 0 THEN
    RAISE EXCEPTION 'Le total d''une commande ne peut pas être négatif';
  END IF;
  IF NEW.subtotal IS NOT NULL AND NEW.subtotal < 0 THEN
    RAISE EXCEPTION 'Le sous-total ne peut pas être négatif';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_validate_amounts ON public.orders;
CREATE TRIGGER orders_validate_amounts
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION validate_order_amounts();

-- ─── 10. Validate payments amount at insert ───────────────────────────────────

CREATE OR REPLACE FUNCTION validate_payment_amounts()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Le montant d''un paiement doit être supérieur à 0';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_validate_amounts ON public.payments;
CREATE TRIGGER payments_validate_amounts
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION validate_payment_amounts();

-- ─── 11. Indexes for rate_limits cleanup (optional background purge) ──────────

CREATE INDEX IF NOT EXISTS rate_limits_window_end_idx ON public.rate_limits (window_end);


-- File: 034_pitr.sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- 034 - Point-in-Time Recovery (PITR)
-- ● snapshots table : JSON dump of products / categories / coupons per business
-- ● create_snapshot  : manual or automatic snapshot
-- ● get_snapshots    : lightweight list (no large data payload)
-- ● restore_snapshot : selective restore with pre-restore safety snapshot
-- ● auto_snapshot_all_businesses : called by pg_cron daily
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 0. Ensure check_rate_limit exists (defined in 033, re-declared here so
--        this migration is self-contained if run independently) ────────────────

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key        text        NOT NULL,
  count      int         NOT NULL DEFAULT 1,
  window_end timestamptz NOT NULL,
  PRIMARY KEY (key)
);

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key            text,
  p_max_count      int,
  p_window_seconds int DEFAULT 60
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  INSERT INTO public.rate_limits (key, count, window_end)
  VALUES (p_key, 1, v_now + (p_window_seconds || ' seconds')::interval)
  ON CONFLICT (key) DO UPDATE
    SET count      = CASE
                       WHEN rate_limits.window_end < v_now THEN 1
                       ELSE rate_limits.count + 1
                     END,
        window_end = CASE
                       WHEN rate_limits.window_end < v_now
                       THEN v_now + (p_window_seconds || ' seconds')::interval
                       ELSE rate_limits.window_end
                     END;

  RETURN (SELECT count <= p_max_count FROM public.rate_limits WHERE key = p_key);
END;
$$;

-- ─── 1. Snapshots table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.snapshots (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_by  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  label       text,
  type        text        NOT NULL DEFAULT 'manual'
                          CHECK (type IN ('manual', 'auto', 'pre_restore')),
  -- Counts stored separately so get_snapshots doesn't need to parse the blob
  product_count   int  NOT NULL DEFAULT 0,
  category_count  int  NOT NULL DEFAULT 0,
  coupon_count    int  NOT NULL DEFAULT 0,
  -- Full data snapshot (can be several hundred KB for large catalogues)
  data        jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS snapshots_business_created
  ON public.snapshots (business_id, created_at DESC);

-- ─── 2. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "snapshots_select"    ON public.snapshots;
DROP POLICY IF EXISTS "snapshots_insert"    ON public.snapshots;
DROP POLICY IF EXISTS "snapshots_delete"    ON public.snapshots;
DROP POLICY IF EXISTS "snapshots_no_update" ON public.snapshots;

-- Any member of the business can read snapshots
CREATE POLICY "snapshots_select" ON public.snapshots
  FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT business_id FROM public.business_members WHERE user_id = auth.uid()
    )
  );

-- Members with owner/admin role can create
CREATE POLICY "snapshots_insert" ON public.snapshots
  FOR INSERT TO authenticated
  WITH CHECK (
    business_id IN (
      SELECT business_id FROM public.business_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Owners can delete snapshots (except pre_restore ones, enforced in RPC)
CREATE POLICY "snapshots_delete" ON public.snapshots
  FOR DELETE TO authenticated
  USING (
    business_id IN (
      SELECT business_id FROM public.business_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- Snapshots are immutable
CREATE POLICY "snapshots_no_update" ON public.snapshots
  FOR UPDATE TO authenticated USING (false);

-- ─── 3. create_snapshot ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_snapshot(
  p_business_id uuid,
  p_label       text    DEFAULT NULL,
  p_type        text    DEFAULT 'manual'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id             uuid;
  v_product_count  int;
  v_category_count int;
  v_coupon_count   int;
  v_data           jsonb;
BEGIN
  -- For manual snapshots, verify the caller is owner/admin
  IF p_type = 'manual' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.business_members
      WHERE user_id = auth.uid()
        AND business_id = p_business_id
        AND role IN ('owner', 'admin')
    ) THEN
      RAISE EXCEPTION 'Accès refusé';
    END IF;

    -- Rate limit: 20 manual snapshots per 60s per business
    IF NOT check_rate_limit('snapshot:' || p_business_id::text, 20, 60) THEN
      RAISE EXCEPTION 'Trop de snapshots — réessayez dans quelques secondes';
    END IF;
  END IF;

  -- Count items for the summary columns
  SELECT COUNT(*) INTO v_product_count
  FROM public.products WHERE business_id = p_business_id;

  SELECT COUNT(*) INTO v_category_count
  FROM public.categories WHERE business_id = p_business_id;

  SELECT COUNT(*) INTO v_coupon_count
  FROM public.coupons WHERE business_id = p_business_id;

  -- Build the full JSON snapshot
  SELECT jsonb_build_object(
    'products',
    COALESCE(
      (SELECT jsonb_agg(to_jsonb(p))
       FROM public.products p
       WHERE p.business_id = p_business_id),
      '[]'::jsonb
    ),
    'categories',
    COALESCE(
      (SELECT jsonb_agg(to_jsonb(c))
       FROM public.categories c
       WHERE c.business_id = p_business_id),
      '[]'::jsonb
    ),
    'coupons',
    COALESCE(
      (SELECT jsonb_agg(to_jsonb(cp))
       FROM public.coupons cp
       WHERE cp.business_id = p_business_id),
      '[]'::jsonb
    )
  ) INTO v_data;

  INSERT INTO public.snapshots
    (business_id, created_by, label, type, product_count, category_count, coupon_count, data)
  VALUES (
    p_business_id,
    CASE WHEN p_type = 'manual' THEN auth.uid() ELSE NULL END,
    COALESCE(p_label, 'Snapshot du ' || to_char(now(), 'DD/MM/YYYY à HH24:MI')),
    p_type,
    v_product_count,
    v_category_count,
    v_coupon_count,
    v_data
  )
  RETURNING id INTO v_id;

  -- Prune: keep the 50 most recent snapshots per business (excluding pre_restore)
  DELETE FROM public.snapshots
  WHERE business_id = p_business_id
    AND type != 'pre_restore'
    AND id NOT IN (
      SELECT id FROM public.snapshots
      WHERE business_id = p_business_id
        AND type != 'pre_restore'
      ORDER BY created_at DESC
      LIMIT 50
    );

  -- Log the action (only for manual snapshots)
  IF p_type = 'manual' THEN
    INSERT INTO public.activity_logs (business_id, user_id, action, metadata)
    VALUES (
      p_business_id,
      auth.uid(),
      'snapshot.created',
      jsonb_build_object(
        'snapshot_id',     v_id,
        'snapshot_label',  p_label,
        'product_count',   v_product_count,
        'category_count',  v_category_count,
        'coupon_count',    v_coupon_count
      )
    );
  END IF;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION create_snapshot(uuid, text, text) TO authenticated;

-- ─── 4. get_snapshots : lightweight list ──────────────────────────────────────

CREATE OR REPLACE FUNCTION get_snapshots(p_business_id uuid)
RETURNS TABLE (
  id              uuid,
  label           text,
  type            text,
  product_count   int,
  category_count  int,
  coupon_count    int,
  created_by_name text,
  created_at      timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE user_id = auth.uid() AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.label,
    s.type,
    s.product_count,
    s.category_count,
    s.coupon_count,
    u.full_name AS created_by_name,
    s.created_at
  FROM public.snapshots s
  LEFT JOIN public.users u ON u.id = s.created_by
  WHERE s.business_id = p_business_id
  ORDER BY s.created_at DESC
  LIMIT 100;
END;
$$;
GRANT EXECUTE ON FUNCTION get_snapshots(uuid) TO authenticated;

-- ─── 5. get_snapshot_data : fetch full JSON for preview/diff ──────────────────

CREATE OR REPLACE FUNCTION get_snapshot_data(p_snapshot_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_snapshot public.snapshots%ROWTYPE;
BEGIN
  SELECT * INTO v_snapshot FROM public.snapshots WHERE id = p_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot introuvable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE user_id = auth.uid() AND business_id = v_snapshot.business_id
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  RETURN v_snapshot.data;
END;
$$;
GRANT EXECUTE ON FUNCTION get_snapshot_data(uuid) TO authenticated;

-- ─── 6. restore_snapshot ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION restore_snapshot(
  p_snapshot_id uuid,
  p_tables      text[] DEFAULT ARRAY['products', 'categories', 'coupons']
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_snapshot     public.snapshots%ROWTYPE;
  v_result       jsonb := '{}';
  v_safety_id    uuid;
  v_count        int;
  v_product      jsonb;
BEGIN
  SELECT * INTO v_snapshot FROM public.snapshots WHERE id = p_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot introuvable';
  END IF;

  -- Only owner/admin can restore
  IF NOT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE user_id = auth.uid()
      AND business_id = v_snapshot.business_id
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  -- Rate limit: 5 restores per 10 min per business (heavy operation)
  IF NOT check_rate_limit('restore:' || v_snapshot.business_id::text, 5, 600) THEN
    RAISE EXCEPTION 'Trop de restaurations — réessayez dans 10 minutes';
  END IF;

  -- ── Safety snapshot before any changes ────────────────────────────────────
  INSERT INTO public.snapshots
    (business_id, created_by, label, type, product_count, category_count, coupon_count, data)
  SELECT
    v_snapshot.business_id,
    auth.uid(),
    'Avant restauration du ' || to_char(v_snapshot.created_at, 'DD/MM/YYYY HH24:MI'),
    'pre_restore',
    (SELECT COUNT(*) FROM public.products WHERE business_id = v_snapshot.business_id),
    (SELECT COUNT(*) FROM public.categories WHERE business_id = v_snapshot.business_id),
    (SELECT COUNT(*) FROM public.coupons WHERE business_id = v_snapshot.business_id),
    jsonb_build_object(
      'products',
      COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM public.products p WHERE p.business_id = v_snapshot.business_id), '[]'),
      'categories',
      COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM public.categories c WHERE c.business_id = v_snapshot.business_id), '[]'),
      'coupons',
      COALESCE((SELECT jsonb_agg(to_jsonb(cp)) FROM public.coupons cp WHERE cp.business_id = v_snapshot.business_id), '[]')
    )
  RETURNING id INTO v_safety_id;

  -- ── Restore products ───────────────────────────────────────────────────────
  IF 'products' = ANY(p_tables) AND jsonb_array_length(COALESCE(v_snapshot.data->'products', '[]')) > 0 THEN
    v_count := 0;
    FOR v_product IN SELECT * FROM jsonb_array_elements(v_snapshot.data->'products')
    LOOP
      UPDATE public.products SET
        name        = v_product->>'name',
        description = v_product->>'description',
        price       = (v_product->>'price')::numeric,
        image_url   = v_product->>'image_url',
        barcode     = v_product->>'barcode',
        sku         = v_product->>'sku',
        track_stock = (v_product->>'track_stock')::boolean,
        stock       = (v_product->>'stock')::numeric,
        unit        = v_product->>'unit',
        category_id = (v_product->>'category_id')::uuid,
        is_active   = (v_product->>'is_active')::boolean,
        updated_at  = now()
      WHERE id = (v_product->>'id')::uuid
        AND business_id = v_snapshot.business_id;

      IF FOUND THEN v_count := v_count + 1; END IF;
    END LOOP;
    v_result := v_result || jsonb_build_object('products_updated', v_count);
  END IF;

  -- ── Restore categories ────────────────────────────────────────────────────
  IF 'categories' = ANY(p_tables) AND jsonb_array_length(COALESCE(v_snapshot.data->'categories', '[]')) > 0 THEN
    INSERT INTO public.categories (id, business_id, name, color, icon, sort_order)
    SELECT
      (cat->>'id')::uuid,
      v_snapshot.business_id,
      cat->>'name',
      cat->>'color',
      cat->>'icon',
      (cat->>'sort_order')::int
    FROM jsonb_array_elements(v_snapshot.data->'categories') AS cat
    ON CONFLICT (id) DO UPDATE SET
      name       = EXCLUDED.name,
      color      = EXCLUDED.color,
      icon       = EXCLUDED.icon,
      sort_order = EXCLUDED.sort_order;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := v_result || jsonb_build_object('categories_restored', v_count);
  END IF;

  -- ── Restore coupons ───────────────────────────────────────────────────────
  IF 'coupons' = ANY(p_tables) AND jsonb_array_length(COALESCE(v_snapshot.data->'coupons', '[]')) > 0 THEN
    v_count := 0;
    FOR v_product IN SELECT * FROM jsonb_array_elements(v_snapshot.data->'coupons')
    LOOP
      UPDATE public.coupons SET
        is_active  = (v_product->>'is_active')::boolean,
        uses_count = (v_product->>'uses_count')::int,
        expires_at = NULLIF(v_product->>'expires_at', '')::timestamptz
      WHERE id = (v_product->>'id')::uuid
        AND business_id = v_snapshot.business_id;
      IF FOUND THEN v_count := v_count + 1; END IF;
    END LOOP;
    v_result := v_result || jsonb_build_object('coupons_updated', v_count);
  END IF;

  -- ── Audit log ─────────────────────────────────────────────────────────────
  INSERT INTO public.activity_logs (business_id, user_id, action, metadata)
  VALUES (
    v_snapshot.business_id,
    auth.uid(),
    'snapshot.restored',
    jsonb_build_object(
      'snapshot_id',       p_snapshot_id,
      'snapshot_label',    v_snapshot.label,
      'snapshot_created_at', v_snapshot.created_at,
      'tables_restored',   p_tables,
      'safety_snapshot_id', v_safety_id,
      'result',            v_result
    )
  );

  RETURN v_result || jsonb_build_object('safety_snapshot_id', v_safety_id);
END;
$$;
GRANT EXECUTE ON FUNCTION restore_snapshot(uuid, text[]) TO authenticated;

-- ─── 7. delete_snapshot ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION delete_snapshot(p_snapshot_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_snapshot public.snapshots%ROWTYPE;
BEGIN
  SELECT * INTO v_snapshot FROM public.snapshots WHERE id = p_snapshot_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Snapshot introuvable'; END IF;

  -- Only owner can delete
  IF NOT EXISTS (
    SELECT 1 FROM public.business_members
    WHERE user_id = auth.uid()
      AND business_id = v_snapshot.business_id
      AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Seul le propriétaire peut supprimer un snapshot';
  END IF;

  -- Protect pre_restore safety snapshots — must keep them for at least 24h
  IF v_snapshot.type = 'pre_restore' AND v_snapshot.created_at > now() - interval '24 hours' THEN
    RAISE EXCEPTION 'Le snapshot de sécurité ne peut pas être supprimé dans les 24h suivant une restauration';
  END IF;

  DELETE FROM public.snapshots WHERE id = p_snapshot_id;
END;
$$;
GRANT EXECUTE ON FUNCTION delete_snapshot(uuid) TO authenticated;

-- ─── 8. Auto-snapshot: called by pg_cron ─────────────────────────────────────

CREATE OR REPLACE FUNCTION auto_snapshot_all_businesses()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_biz record;
BEGIN
  FOR v_biz IN
    SELECT DISTINCT o.business_id
    FROM public.orders o
    WHERE o.created_at > now() - interval '25 hours'
    UNION
    SELECT DISTINCT se.business_id
    FROM public.stock_entries se
    WHERE se.created_at > now() - interval '25 hours'
  LOOP
    INSERT INTO public.snapshots
      (business_id, created_by, label, type, product_count, category_count, coupon_count, data)
    SELECT
      v_biz.business_id,
      NULL,
      'Snapshot auto — ' || to_char(now(), 'DD/MM/YYYY HH24:MI'),
      'auto',
      (SELECT COUNT(*) FROM public.products WHERE business_id = v_biz.business_id),
      (SELECT COUNT(*) FROM public.categories WHERE business_id = v_biz.business_id),
      (SELECT COUNT(*) FROM public.coupons WHERE business_id = v_biz.business_id),
      jsonb_build_object(
        'products',   COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM public.products p WHERE p.business_id = v_biz.business_id), '[]'),
        'categories', COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM public.categories c WHERE c.business_id = v_biz.business_id), '[]'),
        'coupons',    COALESCE((SELECT jsonb_agg(to_jsonb(cp)) FROM public.coupons cp WHERE cp.business_id = v_biz.business_id), '[]')
      );

    -- Prune auto snapshots: keep last 30 per business
    DELETE FROM public.snapshots
    WHERE business_id = v_biz.business_id
      AND type = 'auto'
      AND id NOT IN (
        SELECT id FROM public.snapshots
        WHERE business_id = v_biz.business_id AND type = 'auto'
        ORDER BY created_at DESC
        LIMIT 30
      );
  END LOOP;
END;
$$;

-- ─── 9. Schedule daily auto-snapshot at 02:00 UTC ────────────────────────────
-- Requires pg_cron extension (enabled on Supabase Pro+)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'elm-pos-daily-snapshot',
      '0 2 * * *',
      'SELECT public.auto_snapshot_all_businesses()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron not available — auto-snapshots must be triggered from the app
  NULL;
END;
$$;


-- File: 035_indexes.sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- 035 - Performance indexes on frequently queried columns
--
-- All indexes use IF NOT EXISTS so this migration is safe to re-run.
-- Organized by table, highest-impact first within each section.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── orders ───────────────────────────────────────────────────────────────────

-- Coupon analytics: .not('coupon_code', 'is', null) + GROUP BY coupon_code
CREATE INDEX IF NOT EXISTS idx_orders_coupon_code
  ON public.orders (business_id, coupon_code)
  WHERE coupon_code IS NOT NULL;

-- Coupon FK lookups (validate_coupon, per-user limit checks)
CREATE INDEX IF NOT EXISTS idx_orders_coupon_id
  ON public.orders (business_id, coupon_id)
  WHERE coupon_id IS NOT NULL;

-- Wholesale / reseller analytics: .not('reseller_client_id', 'is', null)
CREATE INDEX IF NOT EXISTS idx_orders_biz_type
  ON public.orders (business_id, order_type)
  WHERE order_type = 'wholesale';

-- Customer order history: .eq('customer_phone', phone)
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone
  ON public.orders (business_id, customer_phone)
  WHERE customer_phone IS NOT NULL;

-- Acompte / partial payment lookups: orders with remaining balance
CREATE INDEX IF NOT EXISTS idx_orders_partial_status
  ON public.orders (business_id, status, created_at DESC)
  WHERE status = 'partial';

-- ─── payments ─────────────────────────────────────────────────────────────────

-- Cash session close RPC: SUM per method per order
-- (existing idx_payments_order covers order_id; add method for covering index)
CREATE INDEX IF NOT EXISTS idx_payments_order_method
  ON public.payments (order_id, method);

-- Business-level payment method analytics (revenue by method)
CREATE INDEX IF NOT EXISTS idx_payments_method_paid_at
  ON public.payments (method, paid_at DESC);

-- ─── order_items ──────────────────────────────────────────────────────────────

-- Product sales analytics: "best sellers" → GROUP BY product_id
CREATE INDEX IF NOT EXISTS idx_order_items_product_qty
  ON public.order_items (product_id, quantity);

-- ─── refunds ──────────────────────────────────────────────────────────────────

-- Cash session close RPC: SUM(amount) WHERE refunded_at >= session.opened_at
CREATE INDEX IF NOT EXISTS idx_refunds_refunded_at
  ON public.refunds (refunded_at DESC);

-- Compound for the cash-session close subquery pattern:
-- JOIN orders ON orders.id = refunds.order_id WHERE orders.business_id = ?
CREATE INDEX IF NOT EXISTS idx_refunds_order_date
  ON public.refunds (order_id, refunded_at DESC);

-- ─── products ─────────────────────────────────────────────────────────────────

-- Product list sorted by name: .order('name') in getProducts
CREATE INDEX IF NOT EXISTS idx_products_name
  ON public.products (business_id, name)
  WHERE is_active = true;

-- decrement_stock RPC: UPDATE products WHERE id = ? AND track_stock = true
CREATE INDEX IF NOT EXISTS idx_products_track_stock
  ON public.products (id)
  WHERE track_stock = true;

-- Low-stock alerts: .lte('stock', threshold) + .eq('track_stock', true)
CREATE INDEX IF NOT EXISTS idx_products_stock_level
  ON public.products (business_id, stock)
  WHERE is_active = true AND track_stock = true;

-- ─── categories ───────────────────────────────────────────────────────────────

-- Category list is always ordered by sort_order
CREATE INDEX IF NOT EXISTS idx_categories_sort
  ON public.categories (business_id, sort_order);

-- ─── users ────────────────────────────────────────────────────────────────────

-- Superadmin authorization checks in RPCs (activate_subscription, etc.)
-- Used as: WHERE id = auth.uid() AND is_superadmin = true
CREATE INDEX IF NOT EXISTS idx_users_superadmin
  ON public.users (id)
  WHERE is_superadmin = true;

-- Block status checks
CREATE INDEX IF NOT EXISTS idx_users_blocked
  ON public.users (id)
  WHERE is_blocked = true;

-- last_seen_at for session inactivity monitoring (column added in 033)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'last_seen_at'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_last_seen
             ON public.users (last_seen_at DESC)
             WHERE last_seen_at IS NOT NULL';
  END IF;
END;
$$;

-- ─── business_members ─────────────────────────────────────────────────────────

-- get_user_business_id() / get_user_role() called in every RLS policy:
-- SELECT business_id/role FROM business_members WHERE user_id = auth.uid()
CREATE INDEX IF NOT EXISTS idx_business_members_user
  ON public.business_members (user_id);

-- Role-based filtering in JOINs (get_all_subscriptions, admin guards)
CREATE INDEX IF NOT EXISTS idx_business_members_biz_role
  ON public.business_members (business_id, role);

-- ─── subscriptions ────────────────────────────────────────────────────────────

-- Direct business subscription lookup: .eq('business_id', id)
CREATE INDEX IF NOT EXISTS idx_subscriptions_business
  ON public.subscriptions (business_id);

-- Status-based expiry checks: WHERE status = 'active' AND expires_at < now()
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_expiry
  ON public.subscriptions (status, expires_at)
  WHERE status IN ('active', 'trial');

-- ─── subscription_requests ────────────────────────────────────────────────────

-- Backoffice request queue: pending requests first
CREATE INDEX IF NOT EXISTS idx_sub_requests_status
  ON public.subscription_requests (status, created_at DESC)
  WHERE status = 'pending';

-- Business request history
CREATE INDEX IF NOT EXISTS idx_sub_requests_business
  ON public.subscription_requests (business_id, created_at DESC);

-- ─── cash_sessions ────────────────────────────────────────────────────────────

-- Closed session history with date filter
CREATE INDEX IF NOT EXISTS idx_cash_sessions_closed
  ON public.cash_sessions (business_id, closed_at DESC)
  WHERE status = 'closed';

-- ─── activity_logs ────────────────────────────────────────────────────────────

-- Entity drill-down: "show all logs for order X" or "for product Y"
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity
  ON public.activity_logs (business_id, entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

-- Action + date compound for filtered journal views
CREATE INDEX IF NOT EXISTS idx_activity_logs_action_date
  ON public.activity_logs (business_id, action, created_at DESC);

-- ─── stock_entries ────────────────────────────────────────────────────────────

-- Product-level stock history with date range
CREATE INDEX IF NOT EXISTS idx_stock_entries_product_date
  ON public.stock_entries (product_id, created_at DESC);

-- Supplier analytics
CREATE INDEX IF NOT EXISTS idx_stock_entries_supplier
  ON public.stock_entries (business_id, supplier)
  WHERE supplier IS NOT NULL;

-- ─── journal_entries (accounting) ─────────────────────────────────────────────

-- Date-range queries: .gte('entry_date').lte('entry_date') + ORDER BY entry_date
CREATE INDEX IF NOT EXISTS idx_journal_entries_date
  ON public.journal_entries (business_id, entry_date DESC);

-- Source filtering: WHERE source = 'order' | 'refund' | 'manual'
CREATE INDEX IF NOT EXISTS idx_journal_entries_source
  ON public.journal_entries (business_id, source);

-- NOT EXISTS check in sync_accounting RPC: source_id lookup
CREATE INDEX IF NOT EXISTS idx_journal_entries_source_id
  ON public.journal_entries (source, source_id)
  WHERE source_id IS NOT NULL;

-- ─── snapshots ────────────────────────────────────────────────────────────────

-- Type-filtered listing (separate manual vs auto vs pre_restore)
CREATE INDEX IF NOT EXISTS idx_snapshots_type
  ON public.snapshots (business_id, type, created_at DESC);

-- ─── rate_limits ──────────────────────────────────────────────────────────────

-- Window expiry cleanup: DELETE FROM rate_limits WHERE window_end < now()
-- (already has rate_limits_window_end_idx from 033 — adding covering index)
CREATE INDEX IF NOT EXISTS idx_rate_limits_key_window
  ON public.rate_limits (key, window_end);


-- File: 037_business_features.sql
-- ─── Business features (optional modules per business) ───────────────────────
--
-- Stores a list of enabled optional feature keys, e.g. ['pos', 'delivery'].
-- Non-hotel businesses always have POS available (checked client-side by type).
-- Hotel businesses show POS only if 'pos' is in this array.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS features text[] NOT NULL DEFAULT '{}';


-- File: 042_get_or_create_profile.sql
-- RPC: get_or_create_profile
-- Returns the public.users row for the calling user.
-- If no row exists (trigger failed for admin-created accounts), creates it from auth metadata.

CREATE OR REPLACE FUNCTION get_or_create_profile()
RETURNS SETOF public.users
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_email    text;
  v_name     text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Return existing row if it exists
  IF EXISTS (SELECT 1 FROM public.users WHERE id = v_user_id) THEN
    RETURN QUERY SELECT * FROM public.users WHERE id = v_user_id;
    RETURN;
  END IF;

  -- Fetch auth metadata to create the missing row
  SELECT
    au.email,
    COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1))
  INTO v_email, v_name
  FROM auth.users au
  WHERE au.id = v_user_id;

  -- Create the profile
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (v_user_id, v_email, v_name, 'owner')
  ON CONFLICT (id) DO NOTHING;

  RETURN QUERY SELECT * FROM public.users WHERE id = v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_or_create_profile() TO authenticated;


-- File: 044_manager_role.sql
-- ─── Rôle Manager ────────────────────────────────────────────────────────────
-- Nouveau rôle intermédiaire entre 'staff' (caissier) et 'admin'

-- 1. Mettre à jour la contrainte sur la table users
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'staff'));

-- 2. Mettre à jour la contrainte sur business_members
ALTER TABLE public.business_members
  DROP CONSTRAINT IF EXISTS business_members_role_check;
ALTER TABLE public.business_members
  ADD CONSTRAINT business_members_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'staff'));


-- File: 064_get_my_subscription.sql
-- Migration 064 : get_my_subscription — résolution correcte pour owner ET staff/caissier
--
-- Problème : owner_id pointe vers le propriétaire, business_id vers UN seul établissement.
-- Un caissier d'un autre établissement du même owner ne trouve pas l'abonnement
-- via les colonnes directes.
--
-- Solution : RPC SECURITY DEFINER qui remonte via business_members.

CREATE OR REPLACE FUNCTION get_my_subscription()
RETURNS SETOF subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_biz_id   uuid;
  v_owner_id uuid;
BEGIN
  -- 1. L'utilisateur est lui-même l'owner du compte
  IF EXISTS (SELECT 1 FROM subscriptions WHERE owner_id = auth.uid()) THEN
    RETURN QUERY SELECT * FROM subscriptions WHERE owner_id = auth.uid();
    RETURN;
  END IF;

  -- 2. Trouver l'établissement actif de l'utilisateur
  SELECT business_id INTO v_biz_id FROM public.users WHERE id = auth.uid();

  IF v_biz_id IS NULL THEN
    RETURN;
  END IF;

  -- 3. Trouver l'owner de cet établissement via business_members
  SELECT user_id INTO v_owner_id
  FROM business_members
  WHERE business_id = v_biz_id AND role = 'owner'
  LIMIT 1;

  -- Fallback : via businesses.owner_id
  IF v_owner_id IS NULL THEN
    SELECT owner_id INTO v_owner_id FROM businesses WHERE id = v_biz_id;
  END IF;

  IF v_owner_id IS NULL THEN
    RETURN;
  END IF;

  -- 4. Retourner l'abonnement de cet owner
  RETURN QUERY SELECT * FROM subscriptions WHERE owner_id = v_owner_id LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_subscription() TO authenticated;


-- File: 065_business_modules.sql
-- ─── Types d'établissement ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_types (
  id           text PRIMARY KEY,
  label        text NOT NULL,
  description  text,
  icon         text NOT NULL DEFAULT 'ShoppingBag',
  accent_color text NOT NULL DEFAULT 'brand',    -- 'brand' | 'orange' | 'purple' | 'teal'
  is_active    boolean NOT NULL DEFAULT true,
  sort_order   int     NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

-- ─── Modules / fonctionnalités ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_modules (
  id          text PRIMARY KEY,
  label       text NOT NULL,
  description text,
  icon        text NOT NULL DEFAULT 'Package',
  is_core     boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  int     NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- ─── Matrice type × module ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_type_modules (
  business_type_id text NOT NULL REFERENCES business_types(id) ON DELETE CASCADE,
  module_id        text NOT NULL REFERENCES app_modules(id)    ON DELETE CASCADE,
  is_default       boolean NOT NULL DEFAULT true,
  PRIMARY KEY (business_type_id, module_id)
);

-- ─── Seed : types ─────────────────────────────────────────────────────────────
INSERT INTO business_types (id, label, description, icon, accent_color, sort_order) VALUES
  ('retail',     'Commerce / Boutique',   'Vente au détail, gestion de stock et livraisons aux clients', 'ShoppingBag', 'brand',  0),
  ('restaurant', 'Restaurant / Café',     'Restauration, bar, commandes en salle et à emporter',          'Utensils',   'orange', 1),
  ('service',    'Prestation de service', 'Factures, devis et services professionnels',                   'Briefcase',  'purple', 2),
  ('hotel',      'Hôtel / Hébergement',   'Chambres, réservations, check-in / check-out',                'BedDouble',  'teal',   3)
ON CONFLICT (id) DO NOTHING;

-- ─── Seed : modules ───────────────────────────────────────────────────────────
INSERT INTO app_modules (id, label, description, icon, is_core, sort_order) VALUES
  ('pos',              'Caisse & encaissement',    'Ventes, encaissement, tickets de caisse', 'ShoppingCart', true,  0),
  ('stock',            'Produits & stock',          'Catalogue produits, suivi du stock',      'Package',      false, 1),
  ('approvisionnement','Approvisionnement',          'Bons de commande fournisseurs',           'Warehouse',    false, 2),
  ('livraison',        'Livraisons',                'Gestion des livraisons clients',          'Truck',        false, 3),
  ('revendeurs',       'Revendeurs',                'Ventes en gros, tarifs revendeurs',       'Store',        false, 4),
  ('hotel',            'Module hôtel',              'Chambres, réservations, check-in/out',   'BedDouble',    false, 5),
  ('coupons',          'Coupons promotionnels',     'Codes promo et remises',                  'Tag',          false, 6),
  ('comptabilite',     'Comptabilité',              'Journal des opérations comptables',       'BookOpen',     false, 7)
ON CONFLICT (id) DO NOTHING;

-- ─── Seed : matrice ───────────────────────────────────────────────────────────
INSERT INTO business_type_modules (business_type_id, module_id, is_default) VALUES
  -- retail
  ('retail','pos',true),('retail','stock',true),('retail','approvisionnement',true),
  ('retail','livraison',true),('retail','revendeurs',true),('retail','coupons',true),
  ('retail','comptabilite',true),('retail','hotel',false),
  -- restaurant
  ('restaurant','pos',true),('restaurant','stock',true),('restaurant','approvisionnement',true),
  ('restaurant','livraison',true),('restaurant','revendeurs',false),('restaurant','coupons',true),
  ('restaurant','comptabilite',true),('restaurant','hotel',false),
  -- service
  ('service','pos',true),('service','stock',false),('service','approvisionnement',false),
  ('service','livraison',false),('service','revendeurs',false),('service','coupons',false),
  ('service','comptabilite',true),('service','hotel',false),
  -- hotel
  ('hotel','pos',false),('hotel','stock',false),('hotel','approvisionnement',false),
  ('hotel','livraison',false),('hotel','revendeurs',false),('hotel','coupons',true),
  ('hotel','comptabilite',true),('hotel','hotel',true)
ON CONFLICT DO NOTHING;

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE business_types        ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_modules           ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_type_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read business_types"        ON business_types        FOR SELECT TO authenticated USING (true);
CREATE POLICY "read app_modules"           ON app_modules           FOR SELECT TO authenticated USING (true);
CREATE POLICY "read business_type_modules" ON business_type_modules FOR SELECT TO authenticated USING (true);

CREATE POLICY "manage business_types"        ON business_types        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "manage app_modules"           ON app_modules           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "manage business_type_modules" ON business_type_modules FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- File: 066_business_types_array.sql
-- Ajoute le support multi-types par établissement
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS types text[] NOT NULL DEFAULT '{}';

-- Initialiser "types" depuis "type" existant pour les lignes déjà créées
UPDATE businesses
  SET types = ARRAY[type]
  WHERE type IS NOT NULL AND type <> '' AND array_length(types, 1) IS NULL;


-- File: 068_reference_data.sql
-- ─── Table de données de référence configurables ─────────────────────────────
-- business_id NULL  = données globales (gérées par superadmin via backoffice)
-- business_id défini = données propres à l'établissement (surcharge ou ajout)

CREATE TABLE IF NOT EXISTS reference_data (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid        REFERENCES businesses(id) ON DELETE CASCADE,
  category    text        NOT NULL,
  value       text        NOT NULL,
  label       text        NOT NULL,
  color       text,       -- classe CSS Tailwind optionnelle, ex: 'text-green-400'
  metadata    jsonb       NOT NULL DEFAULT '{}',
  sort_order  int         NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (business_id, category, value)
);

CREATE INDEX IF NOT EXISTS reference_data_cat_idx ON reference_data (category, business_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE reference_data ENABLE ROW LEVEL SECURITY;

-- Lecture : données globales + celles du business courant
CREATE POLICY "read_reference_data" ON reference_data FOR SELECT TO authenticated
  USING (
    business_id IS NULL
    OR business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
      UNION SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- Écriture : uniquement les données propres au business (pas les globales)
CREATE POLICY "write_reference_data" ON reference_data FOR ALL TO authenticated
  USING (
    business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
      UNION SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT business_id FROM business_members WHERE user_id = auth.uid()
      UNION SELECT id FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- ─── Données globales par défaut ──────────────────────────────────────────────

INSERT INTO reference_data (business_id, category, value, label, color, metadata, sort_order) VALUES
  -- Types d'affaires (juridique)
  (NULL,'type_affaire','civil',         'Civil',                NULL, '{"icon":"⚖️"}', 0),
  (NULL,'type_affaire','pénal',         'Pénal / Criminel',     NULL, '{"icon":"🔒"}', 1),
  (NULL,'type_affaire','commercial',    'Commercial',           NULL, '{"icon":"🏢"}', 2),
  (NULL,'type_affaire','administratif', 'Administratif',        NULL, '{"icon":"🏛️"}', 3),
  (NULL,'type_affaire','travail',       'Droit du travail',     NULL, '{"icon":"👷"}', 4),
  (NULL,'type_affaire','famille',       'Famille / Succession', NULL, '{"icon":"👨‍👩‍👧"}', 5),
  (NULL,'type_affaire','foncier',       'Foncier / Immobilier', NULL, '{"icon":"🏠"}', 6),
  (NULL,'type_affaire','ohada',         'OHADA',                NULL, '{"icon":"📋"}', 7),

  -- Tribunaux (Sénégal)
  (NULL,'tribunal','tgi_dakar',       'TGI Dakar',                        NULL, '{}', 0),
  (NULL,'tribunal','tgi_thies',       'TGI Thiès',                        NULL, '{}', 1),
  (NULL,'tribunal','tgi_stlouis',     'TGI Saint-Louis',                  NULL, '{}', 2),
  (NULL,'tribunal','tgi_ziguinchor',  'TGI Ziguinchor',                   NULL, '{}', 3),
  (NULL,'tribunal','tgi_kaolack',     'TGI Kaolack',                      NULL, '{}', 4),
  (NULL,'tribunal','tgi_diourbel',    'TGI Diourbel',                     NULL, '{}', 5),
  (NULL,'tribunal','tgi_louga',       'TGI Louga',                        NULL, '{}', 6),
  (NULL,'tribunal','tgi_tambacounda', 'TGI Tambacounda',                  NULL, '{}', 7),
  (NULL,'tribunal','tc_dakar',        'TC Dakar (Tribunal du Commerce)',   NULL, '{}', 8),
  (NULL,'tribunal','trav_dakar',      'Tribunal du Travail Dakar',         NULL, '{}', 9),
  (NULL,'tribunal','ca_dakar',        'CA Dakar (Cour d''Appel)',          NULL, '{}', 10),
  (NULL,'tribunal','cs',              'Cour Suprême du Sénégal',          NULL, '{}', 11),
  (NULL,'tribunal','ccja',            'CCJA (OHADA)',                      NULL, '{}', 12),

  -- Statuts dossier
  (NULL,'statut_dossier','ouvert',   'Ouvert',   NULL, '{"cls":"bg-blue-900/30 text-blue-400 border-blue-800"}',     0),
  (NULL,'statut_dossier','en_cours', 'En cours', NULL, '{"cls":"bg-amber-900/30 text-amber-400 border-amber-800"}',  1),
  (NULL,'statut_dossier','plaidé',   'Plaidé',   NULL, '{"cls":"bg-purple-900/30 text-purple-400 border-purple-800"}',2),
  (NULL,'statut_dossier','gagné',    'Gagné',    NULL, '{"cls":"bg-green-900/30 text-green-400 border-green-800"}',  3),
  (NULL,'statut_dossier','perdu',    'Perdu',    NULL, '{"cls":"bg-red-900/30 text-red-400 border-red-800"}',        4),
  (NULL,'statut_dossier','clôturé',  'Clôturé',  NULL, '{"cls":"bg-slate-800 text-slate-400 border-slate-700"}',    5),
  (NULL,'statut_dossier','archivé',  'Archivé',  NULL, '{"cls":"bg-gray-900/50 text-gray-500 border-gray-700"}',    6),

  -- Types de prestation (juridique)
  (NULL,'type_prestation','consultation',   'Consultation',              NULL, '{}', 0),
  (NULL,'type_prestation','plaidoirie',     'Plaidoirie / Audience',     NULL, '{}', 1),
  (NULL,'type_prestation','rédaction',      'Rédaction d''acte',         NULL, '{}', 2),
  (NULL,'type_prestation','conseil',        'Conseil juridique',         NULL, '{}', 3),
  (NULL,'type_prestation','représentation', 'Représentation en justice', NULL, '{}', 4),
  (NULL,'type_prestation','arbitrage',      'Arbitrage / Médiation',     NULL, '{}', 5),
  (NULL,'type_prestation','notarié',        'Acte notarié',              NULL, '{}', 6),
  (NULL,'type_prestation','huissier',       'Acte d''huissier',          NULL, '{}', 7),

  -- Statuts paiement
  (NULL,'statut_paiement','impayé',  'Impayé',          NULL, '{"cls":"bg-red-900/30 text-red-400 border-red-800"}',      0),
  (NULL,'statut_paiement','partiel', 'Paiement partiel', NULL, '{"cls":"bg-amber-900/30 text-amber-400 border-amber-800"}',1),
  (NULL,'statut_paiement','payé',    'Payé',             NULL, '{"cls":"bg-green-900/30 text-green-400 border-green-800"}',2)

ON CONFLICT (business_id, category, value) DO NOTHING;


-- File: 069_get_my_businesses_features.sql
-- Migration 069: Ajouter features + types au RPC get_my_businesses
-- Chaque établissement a ses propres features/types indépendamment

DROP FUNCTION IF EXISTS get_my_businesses();

CREATE OR REPLACE FUNCTION get_my_businesses()
RETURNS TABLE (
  id              UUID,
  name            TEXT,
  type            TEXT,
  types           TEXT[],
  features        TEXT[],
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
    b.id, b.name, b.type,
    COALESCE(b.types, '{}'::text[])    AS types,
    COALESCE(b.features, '{}'::text[]) AS features,
    b.address, b.phone, b.email, b.logo_url,
    b.currency, b.tax_rate, b.receipt_footer, b.stock_units,
    b.owner_id, b.created_at,
    bm.role AS member_role
  FROM businesses b
  JOIN business_members bm ON bm.business_id = b.id
  WHERE bm.user_id = auth.uid()
  ORDER BY b.name;
$$;


-- File: 078_member_permissions.sql
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


-- File: 079_email_templates.sql
-- Email templates stored in DB instead of hardcoded in code.
-- Variables use {{variable_name}} syntax; route does string substitution.
-- Conditional blocks (note_block, validity_text, button_block) are computed
-- by the route and injected as pre-rendered HTML strings.

CREATE TABLE email_templates (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  key          text        UNIQUE NOT NULL,
  name         text        NOT NULL,
  description  text,
  html_body    text        NOT NULL,
  variables    jsonb       DEFAULT '[]'::jsonb,
  is_active    boolean     DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- ─── Seed: subscription_received ─────────────────────────────────────────────

INSERT INTO email_templates (key, name, description, variables, html_body) VALUES (
  'subscription_received',
  'Demande d''abonnement reçue',
  'Envoyé au client après soumission d''une demande d''abonnement.',
  '["business_name", "plan_label"]',
  '<h2 style="color:#0f172a;font-size:22px;font-weight:800;margin:0 0 8px;">Demande reçue ✓</h2>
<p style="color:#475569;font-size:15px;margin:0 0 24px;">
  Bonjour, nous avons bien reçu la demande d''abonnement pour <strong>{{business_name}}</strong> (plan <strong>{{plan_label}}</strong>).
</p>
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:24px;">
  <p style="color:#475569;font-size:14px;margin:0;">
    Votre accès sera activé sous <strong style="color:#0f172a;">24 heures</strong> après vérification de votre paiement.
    Vous recevrez un second email avec vos identifiants de connexion.
  </p>
</div>
<p style="color:#94a3b8;font-size:13px;margin:0;">
  Des questions ? Répondez à cet email ou écrivez-nous à <a href="mailto:contact@elm-app.click" style="color:#2563eb;">contact@elm-app.click</a>.
</p>'
);

-- ─── Seed: subscription_approved ─────────────────────────────────────────────

INSERT INTO email_templates (key, name, description, variables, html_body) VALUES (
  'subscription_approved',
  'Abonnement activé',
  'Envoyé quand un abonnement est approuvé. validity_text est vide ou "Valide jusqu''au <date>".',
  '["business_name", "plan_label", "email", "password", "validity_text"]',
  '<h2 style="color:#0f172a;font-size:22px;font-weight:800;margin:0 0 8px;">Accès activé 🎉</h2>
<p style="color:#475569;font-size:15px;margin:0 0 24px;">
  Félicitations ! Votre abonnement <strong>{{plan_label}}</strong> pour <strong>{{business_name}}</strong> est maintenant actif.
  {{validity_text}}
</p>
<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:24px;margin-bottom:24px;">
  <p style="color:#15803d;font-size:13px;font-weight:700;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.05em;">Vos identifiants de connexion</p>
  <table cellpadding="0" cellspacing="0" style="width:100%;">
    <tr>
      <td style="color:#475569;font-size:14px;padding:6px 0;width:100px;">Email</td>
      <td style="color:#0f172a;font-size:14px;font-weight:600;font-family:monospace;">{{email}}</td>
    </tr>
    <tr>
      <td style="color:#475569;font-size:14px;padding:6px 0;">Mot de passe</td>
      <td style="color:#0f172a;font-size:14px;font-weight:600;font-family:monospace;">{{password}}</td>
    </tr>
  </table>
</div>
<p style="text-align:center;margin:0 0 24px;">
  <a href="https://elm-app.click/login" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none;">Accéder à mon espace →</a>
</p>
<p style="color:#94a3b8;font-size:13px;margin:0;">
  Nous vous recommandons de changer votre mot de passe après votre première connexion.
</p>'
);

-- ─── Seed: subscription_rejected ─────────────────────────────────────────────

INSERT INTO email_templates (key, name, description, variables, html_body) VALUES (
  'subscription_rejected',
  'Demande refusée',
  'Envoyé quand une demande est refusée. note_block est vide ou un bloc HTML avec le motif.',
  '["business_name", "note_block"]',
  '<h2 style="color:#0f172a;font-size:22px;font-weight:800;margin:0 0 8px;">Demande non approuvée</h2>
<p style="color:#475569;font-size:15px;margin:0 0 24px;">
  Nous avons examiné votre demande pour <strong>{{business_name}}</strong> et ne sommes pas en mesure de l''approuver pour le moment.
</p>
{{note_block}}
<p style="color:#475569;font-size:14px;margin:0 0 24px;">
  Si vous pensez qu''il s''agit d''une erreur ou souhaitez soumettre une nouvelle demande, contactez-nous.
</p>
<p style="text-align:center;margin:0 0 24px;">
  <a href="mailto:contact@elm-app.click" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none;">Nous contacter</a>
</p>'
);

-- ─── Seed: marketing ─────────────────────────────────────────────────────────

INSERT INTO email_templates (key, name, description, variables, html_body) VALUES (
  'marketing',
  'Email marketing',
  'Template générique pour les campagnes. button_block est vide ou un bouton CTA complet.',
  '["title", "content", "button_block"]',
  '<h2 style="color:#0f172a;font-size:22px;font-weight:800;margin:0 0 16px;">{{title}}</h2>
<div style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;white-space:pre-wrap;">{{content}}</div>
{{button_block}}
<p style="color:#94a3b8;font-size:13px;margin:32px 0 0;border-top:1px solid #f1f5f9;padding-top:24px;">
  Vous recevez cet email car vous êtes utilisateur de ELM APP.
</p>'
);


-- File: 085_secure_business_config.sql
-- ─── Sécurisation des types et modules (Backoffice) ───────────────────────────
-- Migration 085 : Restreindre la modification des types et modules aux superadmins.

-- 1. Supprimer les anciennes politiques trop permissives
DROP POLICY IF EXISTS "manage business_types" ON public.business_types;
DROP POLICY IF EXISTS "manage app_modules" ON public.app_modules;
DROP POLICY IF EXISTS "manage business_type_modules" ON public.business_type_modules;

-- 2. Créer les nouvelles politiques restreintes aux superadmins
CREATE POLICY "manage business_types" ON public.business_types
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true));

CREATE POLICY "manage app_modules" ON public.app_modules
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true));

CREATE POLICY "manage business_type_modules" ON public.business_type_modules
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true));

-- Note : Les politiques de lecture (SELECT) restent inchangées (accessibles à tous les authentifiés).


-- File: 091_business_webhook_whitelist.sql
-- ─── Whitelist de webhooks pour la sécurité ───────────────────────────────────
-- Évite l'exfiltration de données vers des serveurs malveillants.

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS webhook_whitelist TEXT[] DEFAULT '{}';

COMMENT ON COLUMN businesses.webhook_whitelist IS 'Liste des domaines ou URLs autorisés pour les webhooks sortants';


-- File: 093_decouple_business_owner.sql
-- Migration 093 : Découplage Structure (Business) et Propriétaire (Owner)
-- Permet de créer un établissement sans propriétaire initial et ajoute les champs légaux/branding.

-- 1. Rendre owner_id optionnel
ALTER TABLE public.businesses ALTER COLUMN owner_id DROP NOT NULL;

-- 2. Ajouter les nouveaux champs pour la Structure
ALTER TABLE public.businesses
ADD COLUMN IF NOT EXISTS denomination TEXT,
ADD COLUMN IF NOT EXISTS rib TEXT,
ADD COLUMN IF NOT EXISTS brand_config JSONB DEFAULT '{}'::jsonb;

-- 3. Mettre à jour get_my_businesses pour inclure les nouveaux champs
DROP FUNCTION IF EXISTS get_my_businesses();
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
  member_role     TEXT,
  denomination    TEXT,
  rib             TEXT,
  brand_config    JSONB,
  types           TEXT[],
  features        TEXT[]
)
SECURITY DEFINER LANGUAGE sql AS $$
  SELECT
    b.id, b.name, b.type, b.address, b.phone, b.email, b.logo_url,
    b.currency, b.tax_rate, b.receipt_footer, b.stock_units,
    b.owner_id, b.created_at,
    bm.role AS member_role,
    b.denomination, b.rib, b.brand_config,
    b.types, b.features
  FROM businesses b
  JOIN business_members bm ON bm.business_id = b.id
  WHERE bm.user_id = auth.uid();
$$;

-- 4. Ajouter une politique RLS pour permettre aux superadmins de tout voir dans businesses
DROP POLICY IF EXISTS "superadmin_all_businesses" ON businesses;
CREATE POLICY "superadmin_all_businesses" ON businesses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true)
  );

-- 5. Mettre à jour create_business pour accepter la dénomination et initialiser les modules par défaut
CREATE OR REPLACE FUNCTION create_business(business_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_biz businesses;
  v_type TEXT;
  v_features TEXT[];
BEGIN
  v_type := business_data->>'type';
  
  -- Initialisation des modules par défaut selon le type
  v_features := ARRAY[]::TEXT[];
  IF v_type = 'retail' THEN
    v_features := ARRAY['retail', 'stock', 'expenses'];
  ELSIF v_type = 'restaurant' THEN
    v_features := ARRAY['restaurant', 'retail', 'stock', 'expenses'];
  ELSIF v_type = 'hotel' THEN
    v_features := ARRAY['hotel', 'retail', 'expenses'];
  ELSIF v_type = 'service' THEN
    v_features := ARRAY['legal', 'expenses'];
  END IF;

  INSERT INTO businesses (
    name, 
    denomination,
    type, 
    currency, 
    tax_rate, 
    owner_id,
    features,
    types
  ) VALUES (
    business_data->>'name',
    COALESCE(business_data->>'denomination', business_data->>'name'),
    v_type,
    COALESCE(business_data->>'currency', 'XOF'),
    (COALESCE(business_data->>'tax_rate', '0'))::NUMERIC,
    auth.uid(),
    v_features,
    ARRAY[v_type]
  ) RETURNING * INTO v_biz;

  INSERT INTO business_members (business_id, user_id, role)
  VALUES (v_biz.id, auth.uid(), 'owner');

  UPDATE users
  SET business_id = v_biz.id,
      role        = 'owner'
  WHERE id = auth.uid();

  RETURN to_jsonb(v_biz);
END;
$$;


-- File: 095_data_migration_decouple.sql
-- Migration 095 : Migration des données existantes pour le découplage Structure/Profil
-- Initialise les nouveaux champs pour les établissements existants.

DO $$ 
BEGIN
    -- 1. Initialiser la dénomination avec le nom commercial si elle est vide
    UPDATE public.businesses
    SET denomination = name
    WHERE denomination IS NULL OR denomination = '';

    -- 2. Initialiser brand_config avec un objet vide si NULL
    UPDATE public.businesses
    SET brand_config = '{}'::jsonb
    WHERE brand_config IS NULL;

    -- 3. Sécurité : S'assurer que chaque owner_id est bien présent dans business_members
    -- Cela garantit que la fonction RPC get_my_businesses() continuera de renvoyer les données pour les anciens comptes.
    INSERT INTO public.business_members (business_id, user_id, role)
    SELECT id, owner_id, 'owner'
    FROM public.businesses
    WHERE owner_id IS NOT NULL
    ON CONFLICT (business_id, user_id) DO NOTHING;

    -- 4. Optionnel : On peut aussi mettre à jour les demandes d'abonnement existantes
    UPDATE public.public_subscription_requests
    SET denomination = business_name,
        full_name = 'Ancien Prospect'
    WHERE denomination IS NULL OR full_name IS NULL;

END $$;
