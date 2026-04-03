-- Migration 062 : Abonnement par compte propriétaire (owner) et non par établissement
-- Un owner = un abonnement, valable pour tous ses établissements.

-- ── 1. Ajouter la colonne owner_id ───────────────────────────────────────────
-- Pas de FK sur users — certains user_id viennent de auth.users sans profil public.users
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS owner_id UUID;

-- ── 2. Remplir owner_id depuis business_members (role = owner) ───────────────
UPDATE subscriptions s
SET owner_id = bm.user_id
FROM business_members bm
WHERE bm.business_id = s.business_id
  AND bm.role = 'owner'
  AND s.owner_id IS NULL;

-- Fallback : depuis businesses.owner_id si disponible
UPDATE subscriptions s
SET owner_id = b.owner_id
FROM businesses b
WHERE b.id = s.business_id
  AND s.owner_id IS NULL
  AND b.owner_id IS NOT NULL;

-- ── 3. Dédupliquer : pour les owners avec plusieurs abonnements,
--       garder le plus favorable (active > trial > expired, puis le plus récent)
DELETE FROM subscriptions
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY owner_id
        ORDER BY
          CASE status WHEN 'active' THEN 1 WHEN 'trial' THEN 2 ELSE 3 END,
          COALESCE(expires_at, trial_ends_at, created_at) DESC
      ) AS rn
    FROM subscriptions
    WHERE owner_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- ── 4. Contrainte UNIQUE sur owner_id (un seul abonnement par compte) ────────
ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_owner_id_key;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_owner_id_key UNIQUE (owner_id);

-- ── 5. Mettre à jour le trigger : créer un abonnement par owner, pas par business ──
CREATE OR REPLACE FUNCTION create_trial_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  -- Trouver le propriétaire du business
  SELECT user_id INTO v_owner_id
  FROM business_members
  WHERE business_id = NEW.id AND role = 'owner'
  LIMIT 1;

  -- Fallback sur businesses.owner_id si disponible
  IF v_owner_id IS NULL THEN
    SELECT owner_id INTO v_owner_id FROM businesses WHERE id = NEW.id;
  END IF;

  IF v_owner_id IS NULL THEN
    RETURN NEW; -- pas d'owner trouvé, on ne fait rien
  END IF;

  -- Créer un essai seulement si ce owner n'en a pas déjà un
  INSERT INTO subscriptions (business_id, owner_id, status, trial_ends_at)
  VALUES (NEW.id, v_owner_id, 'trial', now() + interval '7 days')
  ON CONFLICT (owner_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ── 6. Mettre à jour activate_subscription pour utiliser owner_id ─────────────
CREATE OR REPLACE FUNCTION activate_subscription(
  p_business_id UUID,
  p_plan_id     UUID,
  p_days        INT    DEFAULT 30,
  p_note        TEXT   DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  -- Résoudre l'owner depuis le business
  SELECT user_id INTO v_owner_id
  FROM business_members
  WHERE business_id = p_business_id AND role = 'owner'
  LIMIT 1;

  IF v_owner_id IS NULL THEN
    SELECT owner_id INTO v_owner_id FROM businesses WHERE id = p_business_id;
  END IF;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Aucun propriétaire trouvé pour cet établissement';
  END IF;

  INSERT INTO subscriptions (business_id, owner_id, plan_id, status, expires_at, activated_at, payment_note)
  VALUES (p_business_id, v_owner_id, p_plan_id, 'active', now() + (p_days || ' days')::interval, now(), p_note)
  ON CONFLICT (owner_id) DO UPDATE SET
    business_id  = p_business_id,
    plan_id      = p_plan_id,
    status       = 'active',
    expires_at   = now() + (p_days || ' days')::interval,
    activated_at = now(),
    payment_note = COALESCE(p_note, subscriptions.payment_note);
END;
$$;
GRANT EXECUTE ON FUNCTION activate_subscription(uuid, uuid, int, text) TO authenticated;

-- ── 7. Mettre à jour la RLS pour permettre la lecture par owner_id ─────────────
DROP POLICY IF EXISTS "sub_select" ON subscriptions;
CREATE POLICY "sub_select" ON subscriptions FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR business_id = get_user_business_id()
    OR EXISTS (SELECT 1 FROM business_members WHERE business_id = subscriptions.business_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true)
  );
