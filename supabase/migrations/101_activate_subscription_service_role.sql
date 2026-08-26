-- Migration 101 : activate_subscription doit accepter l'appelant service_role
-- Le webhook PayDunya (renderer/lib/server/paydunya.ts, autoActivatePaidRequest)
-- appelle cette RPC via le client admin (clé service_role) pour activer un
-- abonnement dès paiement confirmé — sans session utilisateur, donc auth.uid()
-- vaut NULL. La garde existante (`EXISTS (... is_superadmin = true)`) rejette
-- systématiquement cet appel avec "Accès refusé", et comme le code appelant ne
-- vérifiait pas `{ error }` sur le retour de .rpc(), cet échec passait
-- totalement inaperçu : le paiement était marqué "payé" et parfois la demande
-- "approuvée" sans qu'aucun abonnement ne soit réellement activé.
--
-- On autorise donc explicitement auth.role() = 'service_role' en plus du
-- superadmin authentifié — service_role bypass déjà toutes les RLS, il est
-- cohérent de le laisser franchir cette vérification métier équivalente.

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
  IF auth.role() <> 'service_role' AND NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true
  ) THEN
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

GRANT EXECUTE ON FUNCTION activate_subscription(uuid, uuid, int, text) TO authenticated, service_role;
