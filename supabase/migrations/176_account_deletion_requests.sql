-- ============================================================================
-- Migration 176 : demandes de suppression de compte (app ELM Boutique)
--
-- L'inscription est possible depuis l'espace partenaire de l'app iOS/Android :
-- l'App Store (règle 5.1.1(v)) impose alors de pouvoir demander la suppression
-- du compte DANS l'app. Un compte peut porter une boutique (ventes, caisse,
-- factures) : la demande est enregistrée ici puis traitée par un superadmin
-- depuis le backoffice (Support), sous 30 jours — délai annoncé dans l'app.
--
-- Pas de business_id obligatoire (contrairement à support_tickets) : un compte
-- inscrit qui n'a pas encore créé sa boutique doit aussi pouvoir la demander.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SET NULL : la demande survit à la suppression du compte (trace du traitement)
  user_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Copie de l'email : la demande reste lisible une fois le compte supprimé
  email         text,
  reason        text,
  source        text        NOT NULL DEFAULT 'elm_boutique_app',
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'processed', 'cancelled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz,
  processed_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Une seule demande en attente par compte (double appui, réessai réseau)
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_deletion_requests_pending
  ON public.account_deletion_requests (user_id)
  WHERE status = 'pending';

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Le demandeur voit ses demandes ; l'écriture passe par request_account_deletion()
DROP POLICY IF EXISTS "adr_select_own" ON public.account_deletion_requests;
CREATE POLICY "adr_select_own" ON public.account_deletion_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Superadmin : lecture et traitement (statut) depuis le backoffice
DROP POLICY IF EXISTS "adr_superadmin" ON public.account_deletion_requests;
CREATE POLICY "adr_superadmin" ON public.account_deletion_requests
  FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

GRANT SELECT, UPDATE ON TABLE public.account_deletion_requests TO authenticated;
GRANT ALL ON TABLE public.account_deletion_requests TO service_role;

-- ─── RPC : enregistrer la demande du compte connecté ─────────────────────────
-- Idempotente : renvoie la demande déjà en attente au lieu d'en créer une autre.
CREATE OR REPLACE FUNCTION public.request_account_deletion(p_reason text DEFAULT NULL)
RETURNS public.account_deletion_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email text;
  v_row   public.account_deletion_requests;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Connexion requise';
  END IF;

  SELECT * INTO v_row
  FROM public.account_deletion_requests
  WHERE user_id = v_uid AND status = 'pending';
  IF FOUND THEN
    RETURN v_row;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  INSERT INTO public.account_deletion_requests (user_id, email, reason)
  VALUES (v_uid, v_email, NULLIF(left(btrim(coalesce(p_reason, '')), 1000), ''))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.request_account_deletion(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(text) TO authenticated, service_role;
