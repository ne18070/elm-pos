-- ============================================================================
-- Migration 161 : Factures d'abonnement
--
-- Jusqu'ici aucune trace des paiements n'était conservée : activate_subscription
-- écrase la ligne `subscriptions`, et la validation d'un prospect
-- (/api/admin/approve-business) ne laisse rien de visible côté client.
--
-- - subscription_invoices : une ligne par période payée, numérotée
--   (FAC-AAAA-NNNNN) et figée — acheteur, plan et montant sont copiés au moment
--   de l'émission pour qu'une facture ne change pas si le plan ou l'entreprise
--   est modifié ensuite. Lecture seule pour le client : seules les fonctions
--   SECURITY DEFINER et le service_role écrivent.
-- - activate_subscription émet la facture à chaque activation payante, et
--   accepte un montant explicite (p_amount ; 0 = activation gratuite, pas de facture).
-- - payment_settings : mentions légales du vendeur imprimées sur la facture.
-- - Reprise de l'historique : voir section 5 (montants = prix ACTUEL des plans).
-- ============================================================================

-- ── 1. Mentions légales du vendeur ───────────────────────────────────────────
ALTER TABLE public.payment_settings
  ADD COLUMN IF NOT EXISTS invoice_company_name text,
  ADD COLUMN IF NOT EXISTS invoice_address      text,
  ADD COLUMN IF NOT EXISTS invoice_ninea        text,
  ADD COLUMN IF NOT EXISTS invoice_rccm         text,
  ADD COLUMN IF NOT EXISTS invoice_email        text;

-- ── 2. Numérotation ──────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.subscription_invoice_seq;

CREATE OR REPLACE FUNCTION public.next_subscription_invoice_number(p_date timestamptz DEFAULT now())
RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT 'FAC-' || to_char(p_date, 'YYYY') || '-'
         || lpad(nextval('public.subscription_invoice_seq')::text, 5, '0');
$$;

-- ── 3. Table des factures ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscription_invoices (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number   text        NOT NULL UNIQUE DEFAULT public.next_subscription_invoice_number(),
  -- SET NULL : la facture survit à la suppression du compte (obligation de conservation)
  owner_id         uuid        REFERENCES auth.users(id)      ON DELETE SET NULL,
  business_id      uuid        REFERENCES public.businesses(id) ON DELETE SET NULL,
  plan_id          uuid        REFERENCES public.plans(id)      ON DELETE SET NULL,
  plan_label       text        NOT NULL,
  quantity         int         NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  unit_price       numeric     NOT NULL CHECK (unit_price >= 0),
  amount           numeric     NOT NULL CHECK (amount > 0),
  currency         text        NOT NULL DEFAULT 'XOF',
  period_start     timestamptz NOT NULL,
  period_end       timestamptz NOT NULL,
  buyer_name       text        NOT NULL,
  buyer_legal_name text,
  buyer_email      text,
  payment_note     text,
  source           text        NOT NULL DEFAULT 'activation'
                               CHECK (source IN ('activation', 'signup', 'backfill')),
  issued_at        timestamptz NOT NULL DEFAULT now(),
  created_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_subscription_invoices_owner    ON public.subscription_invoices(owner_id);
CREATE INDEX IF NOT EXISTS idx_subscription_invoices_business ON public.subscription_invoices(business_id);

ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;

-- Le titulaire de l'abonnement, les owner/admin de l'établissement facturé, et le superadmin
DROP POLICY IF EXISTS "subinv_select" ON public.subscription_invoices;
CREATE POLICY "subinv_select" ON public.subscription_invoices FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.business_members bm
      WHERE bm.business_id = subscription_invoices.business_id
        AND bm.user_id = auth.uid()
        AND bm.role IN ('owner', 'admin')
    )
    OR public.is_superadmin()
  );

-- Lecture seule côté client : pas de policy d'écriture, et pas de grant d'écriture
GRANT SELECT ON TABLE public.subscription_invoices TO authenticated;
GRANT ALL    ON TABLE public.subscription_invoices TO service_role;
GRANT USAGE  ON SEQUENCE public.subscription_invoice_seq TO service_role;
REVOKE ALL   ON FUNCTION public.next_subscription_invoice_number(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_subscription_invoice_number(timestamptz) TO service_role;

-- ── 4. Émission d'une facture ────────────────────────────────────────────────
-- Montant par défaut : prix du plan × nombre de périodes (jours / durée du plan, arrondi, min 1).
-- Renvoie NULL sans rien créer quand le montant est nul (plan gratuit, geste commercial).
CREATE OR REPLACE FUNCTION public.create_subscription_invoice(
  p_business_id  uuid,
  p_owner_id     uuid,
  p_plan_id      uuid,
  p_days         int,
  p_note         text        DEFAULT NULL,
  p_amount       numeric     DEFAULT NULL,
  p_source       text        DEFAULT 'activation',
  p_period_start timestamptz DEFAULT now()
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan       public.plans;
  v_qty        int;
  v_amount     numeric;
  v_buyer_name text;
  v_legal_name text;
  v_email      text;
  v_id         uuid;
BEGIN
  SELECT * INTO v_plan FROM public.plans WHERE id = p_plan_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_qty    := GREATEST(1, round(p_days::numeric / NULLIF(v_plan.duration_days, 0))::int);
  v_amount := COALESCE(p_amount, v_plan.price * v_qty);
  IF v_amount <= 0 THEN RETURN NULL; END IF;

  SELECT b.name, o.legal_name INTO v_buyer_name, v_legal_name
  FROM public.businesses b
  LEFT JOIN public.organizations o ON o.id = b.organization_id
  WHERE b.id = p_business_id;

  SELECT email INTO v_email FROM public.users WHERE id = p_owner_id;

  INSERT INTO public.subscription_invoices (
    invoice_number, owner_id, business_id, plan_id, plan_label, quantity, unit_price, amount,
    currency, period_start, period_end, buyer_name, buyer_legal_name, buyer_email,
    payment_note, source, issued_at, created_by
  ) VALUES (
    public.next_subscription_invoice_number(p_period_start),
    p_owner_id, p_business_id, p_plan_id, v_plan.label, v_qty,
    CASE WHEN p_amount IS NULL THEN v_plan.price ELSE round(p_amount / v_qty, 2) END,
    v_amount, v_plan.currency,
    p_period_start, p_period_start + make_interval(days => p_days),
    COALESCE(v_buyer_name, '—'), v_legal_name, v_email,
    p_note, p_source, p_period_start, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_subscription_invoice(uuid, uuid, uuid, int, text, numeric, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_subscription_invoice(uuid, uuid, uuid, int, text, numeric, text, timestamptz) TO service_role;

-- ── activate_subscription : + p_amount, + facture ────────────────────────────
-- Réunit la validation/rate limit de 001 (perdus lors de la redéfinition de 006)
-- et la résolution par owner_id de 006.
DROP FUNCTION IF EXISTS public.activate_subscription(uuid, uuid, int, text);

CREATE OR REPLACE FUNCTION public.activate_subscription(
  p_business_id uuid,
  p_plan_id     uuid,
  p_days        int     DEFAULT 30,
  p_note        text    DEFAULT NULL,
  p_amount      numeric DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF NOT check_rate_limit('activate_sub:' || auth.uid()::text, 20, 60) THEN
    RAISE EXCEPTION 'Trop de requêtes — réessayez dans quelques secondes';
  END IF;

  IF p_days IS NULL OR p_days < 1 OR p_days > 3650 THEN
    RAISE EXCEPTION 'Durée invalide : entre 1 et 3650 jours';
  END IF;
  IF p_plan_id IS NULL THEN
    RAISE EXCEPTION 'plan_id requis';
  END IF;
  IF p_amount IS NOT NULL AND p_amount < 0 THEN
    RAISE EXCEPTION 'Montant invalide';
  END IF;

  -- Résoudre l'owner depuis le business
  SELECT user_id INTO v_owner_id
  FROM public.business_members
  WHERE business_id = p_business_id AND role = 'owner'
  LIMIT 1;

  IF v_owner_id IS NULL THEN
    SELECT owner_id INTO v_owner_id FROM public.businesses WHERE id = p_business_id;
  END IF;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Aucun propriétaire trouvé pour cet établissement';
  END IF;

  INSERT INTO public.subscriptions (business_id, owner_id, plan_id, status, expires_at, activated_at, payment_note)
  VALUES (p_business_id, v_owner_id, p_plan_id, 'active', now() + (p_days || ' days')::interval, now(), p_note)
  ON CONFLICT (owner_id) DO UPDATE SET
    business_id  = p_business_id,
    plan_id      = p_plan_id,
    status       = 'active',
    expires_at   = now() + (p_days || ' days')::interval,
    activated_at = now(),
    payment_note = COALESCE(p_note, subscriptions.payment_note);

  PERFORM public.create_subscription_invoice(p_business_id, v_owner_id, p_plan_id, p_days, p_note, p_amount, 'activation', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_subscription(uuid, uuid, int, text, numeric) TO authenticated, service_role;

-- ── 5. Reprise de l'historique ───────────────────────────────────────────────
-- Sources, par ordre chronologique (numéros croissants avec la date) :
--   a. demandes d'abonnement approuvées (subscription_requests)
--   b. prospects approuvés (public_subscription_requests), rattachés par email
--   c. abonnements actifs activés sans demande (bouton « Activer » du backoffice)
-- Le prix des plans au moment du paiement n'a pas été conservé : les montants
-- repris sont ceux d'aujourd'hui. Idempotent : ne s'exécute qu'une fois.
DO $$
DECLARE
  r record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.subscription_invoices WHERE source = 'backfill') THEN
    RETURN;
  END IF;

  FOR r IN
    WITH from_requests AS (
      SELECT sr.business_id, b.owner_id, sr.plan_id, sr.processed_at AS paid_at, sr.note, p.duration_days AS days
      FROM public.subscription_requests sr
      JOIN public.businesses b ON b.id = sr.business_id
      JOIN public.plans p      ON p.id = sr.plan_id
      WHERE sr.status = 'approved' AND sr.processed_at IS NOT NULL AND b.owner_id IS NOT NULL
    ),
    from_public AS (
      SELECT DISTINCT ON (psr.id)
             b.id AS business_id, u.id AS owner_id, psr.plan_id, psr.processed_at AS paid_at, psr.note, p.duration_days AS days
      FROM public.public_subscription_requests psr
      JOIN public.users u      ON lower(u.email) = lower(psr.email)
      JOIN public.businesses b ON b.owner_id = u.id
      JOIN public.plans p      ON p.id = psr.plan_id
      WHERE psr.status = 'approved' AND psr.processed_at IS NOT NULL
      ORDER BY psr.id, b.created_at
    ),
    reqs AS (
      SELECT * FROM from_requests
      UNION ALL
      SELECT * FROM from_public
    ),
    from_subs AS (
      SELECT s.business_id, s.owner_id, s.plan_id, s.activated_at AS paid_at, s.payment_note AS note,
             GREATEST(1, round(extract(epoch FROM (s.expires_at - s.activated_at)) / 86400)::int) AS days
      FROM public.subscriptions s
      WHERE s.status = 'active'
        AND s.activated_at IS NOT NULL AND s.expires_at IS NOT NULL
        AND s.plan_id IS NOT NULL AND s.owner_id IS NOT NULL
        -- déjà couvert par une demande approuvée à la même date
        AND NOT EXISTS (
          SELECT 1 FROM reqs
          WHERE reqs.owner_id = s.owner_id
            AND abs(extract(epoch FROM (reqs.paid_at - s.activated_at))) < 86400
        )
    )
    SELECT * FROM (
      SELECT * FROM reqs
      UNION ALL
      SELECT * FROM from_subs
    ) x
    ORDER BY x.paid_at
  LOOP
    PERFORM public.create_subscription_invoice(
      r.business_id, r.owner_id, r.plan_id, r.days, r.note, NULL, 'backfill', r.paid_at
    );
  END LOOP;
END;
$$;
