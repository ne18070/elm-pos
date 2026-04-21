-- File: 018_comptabilite.sql
-- ============================================================
-- Migration 018 : Module Comptabilité OHADA (SYSCOHADA)
-- Plan comptable, journal général, balance des comptes
-- ============================================================

-- ── 1. Plan comptable ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS accounts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID        REFERENCES businesses(id) ON DELETE CASCADE,
  code         VARCHAR(10) NOT NULL,
  name         TEXT        NOT NULL,
  class        SMALLINT    NOT NULL CHECK (class BETWEEN 1 AND 9),
  nature       TEXT        NOT NULL CHECK (nature IN ('actif','passif','charge','produit','resultat')),
  balance_type TEXT        NOT NULL DEFAULT 'debit' CHECK (balance_type IN ('debit','credit')),
  is_default   BOOLEAN     DEFAULT FALSE,
  is_active    BOOLEAN     DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_biz_code_uidx
  ON accounts(COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::UUID), code);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounts_select" ON accounts FOR SELECT
  USING (business_id IS NULL OR business_id = get_user_business_id());

CREATE POLICY "accounts_insert" ON accounts FOR INSERT
  WITH CHECK (
    business_id = get_user_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner','admin'))
  );

CREATE POLICY "accounts_update" ON accounts FOR UPDATE
  USING (
    business_id = get_user_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner','admin'))
  );

CREATE POLICY "accounts_delete" ON accounts FOR DELETE
  USING (
    business_id = get_user_business_id() AND is_default = FALSE AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner','admin'))
  );

-- ── 2. Journal général ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS journal_entries (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  entry_date  DATE        NOT NULL DEFAULT CURRENT_DATE,
  reference   TEXT,
  description TEXT        NOT NULL,
  source      TEXT        NOT NULL DEFAULT 'manual'
                          CHECK (source IN ('manual','order','stock','refund','adjustment')),
  source_id   UUID,
  created_by  UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS je_biz_source_uidx
  ON journal_entries(business_id, source, source_id)
  WHERE source_id IS NOT NULL;

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "je_select" ON journal_entries FOR SELECT
  USING (business_id = get_user_business_id());

CREATE POLICY "je_insert" ON journal_entries FOR INSERT
  WITH CHECK (
    business_id = get_user_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner','admin'))
  );

CREATE POLICY "je_update" ON journal_entries FOR UPDATE
  USING (
    business_id = get_user_business_id() AND source = 'manual' AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner','admin'))
  );

CREATE POLICY "je_delete" ON journal_entries FOR DELETE
  USING (
    business_id = get_user_business_id() AND source = 'manual' AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('owner','admin'))
  );

-- ── 3. Lignes du journal ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS journal_lines (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id     UUID        NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_code VARCHAR(10) NOT NULL,
  account_name TEXT        NOT NULL,
  debit        NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (debit  >= 0),
  credit       NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  CONSTRAINT check_not_both CHECK (NOT (debit > 0 AND credit > 0))
);

ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jl_select" ON journal_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.id = journal_lines.entry_id
      AND je.business_id = get_user_business_id()
  ));

CREATE POLICY "jl_insert" ON journal_lines FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.id = journal_lines.entry_id
      AND je.business_id = get_user_business_id()
  ));

-- ── 4. Comptes OHADA par défaut (SYSCOHADA Révisé) ───────────────────────────

INSERT INTO accounts (business_id, code, name, class, nature, balance_type, is_default) VALUES
-- Classe 1 : Ressources durables
(NULL,'101','Capital social',                        1,'passif','credit',TRUE),
(NULL,'111','Réserves légales',                      1,'passif','credit',TRUE),
(NULL,'121','Report à nouveau (créditeur)',           1,'resultat','credit',TRUE),
(NULL,'129','Report à nouveau (débiteur)',            1,'resultat','debit',TRUE),
(NULL,'131','Résultat net – Bénéfice',               1,'resultat','credit',TRUE),
(NULL,'139','Résultat net – Perte',                  1,'resultat','debit',TRUE),
(NULL,'161','Emprunts',                              1,'passif','credit',TRUE),
(NULL,'166','Dépôts et cautionnements reçus',        1,'passif','credit',TRUE),
-- Classe 2 : Actif immobilisé
(NULL,'211','Frais de constitution',                 2,'actif','debit',TRUE),
(NULL,'215','Fonds commercial',                      2,'actif','debit',TRUE),
(NULL,'221','Terrains',                              2,'actif','debit',TRUE),
(NULL,'222','Aménagements de terrains',              2,'actif','debit',TRUE),
(NULL,'231','Bâtiments',                             2,'actif','debit',TRUE),
(NULL,'241','Matériel et outillage industriel',      2,'actif','debit',TRUE),
(NULL,'244','Matériel de bureau et informatique',    2,'actif','debit',TRUE),
(NULL,'245','Mobilier et agencement',                2,'actif','debit',TRUE),
(NULL,'248','Matériel de transport',                 2,'actif','debit',TRUE),
-- Classe 3 : Stocks
(NULL,'31', 'Marchandises',                          3,'actif','debit',TRUE),
(NULL,'32', 'Matières premières et consommables',    3,'actif','debit',TRUE),
(NULL,'35', 'Stocks de produits finis',              3,'actif','debit',TRUE),
-- Classe 4 : Tiers
(NULL,'401','Fournisseurs',                          4,'passif','credit',TRUE),
(NULL,'408','Fournisseurs – factures non parvenues', 4,'passif','credit',TRUE),
(NULL,'411','Clients',                               4,'actif','debit',TRUE),
(NULL,'419','Clients – avances et acomptes reçus',   4,'passif','credit',TRUE),
(NULL,'421','Personnel – rémunérations dues',        4,'passif','credit',TRUE),
(NULL,'422','Personnel – avances et acomptes',       4,'actif','debit',TRUE),
(NULL,'431','Sécurité sociale',                      4,'passif','credit',TRUE),
(NULL,'441','État – impôts sur résultats',           4,'passif','credit',TRUE),
(NULL,'444','État – impôts et taxes divers',         4,'passif','credit',TRUE),
(NULL,'4441','TVA facturée (collectée)',              4,'passif','credit',TRUE),
(NULL,'4451','TVA récupérable sur achats',           4,'actif','debit',TRUE),
(NULL,'471','Débiteurs divers',                      4,'actif','debit',TRUE),
(NULL,'481','Fournisseurs – avances versées',        4,'actif','debit',TRUE),
-- Classe 5 : Trésorerie
(NULL,'521','Banques – comptes courants',            5,'actif','debit',TRUE),
(NULL,'531','Chèques postaux',                       5,'actif','debit',TRUE),
(NULL,'551','Crédit de trésorerie',                  5,'passif','credit',TRUE),
(NULL,'571','Caisse',                                5,'actif','debit',TRUE),
(NULL,'576','Mobile Money',                          5,'actif','debit',TRUE),
-- Classe 6 : Charges des activités ordinaires
(NULL,'601','Achats de marchandises',                6,'charge','debit',TRUE),
(NULL,'6011','Variation de stocks (marchandises)',   6,'charge','debit',TRUE),
(NULL,'602','Achats de matières premières',          6,'charge','debit',TRUE),
(NULL,'604','Achats stockés – emballages commerciaux',6,'charge','debit',TRUE),
(NULL,'608','Autres achats',                         6,'charge','debit',TRUE),
(NULL,'6091','RRR obtenus sur achats de marchandises',6,'charge','credit',TRUE),
(NULL,'611','Transports sur achats',                 6,'charge','debit',TRUE),
(NULL,'612','Transports sur ventes',                 6,'charge','debit',TRUE),
(NULL,'613','Loyers et charges locatives',           6,'charge','debit',TRUE),
(NULL,'621','Publicité, publications, relations publiques',6,'charge','debit',TRUE),
(NULL,'624','Redevances pour brevets, licences',     6,'charge','debit',TRUE),
(NULL,'625','Frais de télécommunications',           6,'charge','debit',TRUE),
(NULL,'628','Divers services extérieurs',            6,'charge','debit',TRUE),
(NULL,'631','Frais bancaires',                       6,'charge','debit',TRUE),
(NULL,'641','Rémunérations du personnel',            6,'charge','debit',TRUE),
(NULL,'646','Charges sociales',                      6,'charge','debit',TRUE),
(NULL,'661','Intérêts des emprunts',                 6,'charge','debit',TRUE),
(NULL,'681','Dotations aux amortissements – immo incorp',6,'charge','debit',TRUE),
(NULL,'682','Dotations aux amortissements – immo corp',6,'charge','debit',TRUE),
(NULL,'691','Impôts sur résultat',                   6,'charge','debit',TRUE),
-- Classe 7 : Produits des activités ordinaires
(NULL,'701','Ventes de marchandises',                7,'produit','credit',TRUE),
(NULL,'706','Services rendus',                       7,'produit','credit',TRUE),
(NULL,'707','Produits accessoires',                  7,'produit','credit',TRUE),
(NULL,'7091','RRR accordés sur ventes',              7,'produit','debit',TRUE),
(NULL,'721','Production stockée',                    7,'produit','credit',TRUE),
(NULL,'741','Subventions d''exploitation',           7,'produit','credit',TRUE),
(NULL,'751','Produits divers',                       7,'produit','credit',TRUE),
(NULL,'761','Revenus financiers',                    7,'produit','credit',TRUE),
(NULL,'771','Gains de change',                       7,'produit','credit',TRUE)
ON CONFLICT DO NOTHING;

-- ── 5. RPC : Synchroniser depuis les ventes et achats ────────────────────────

CREATE OR REPLACE FUNCTION sync_accounting(p_business_id UUID)
RETURNS INTEGER SECURITY DEFINER LANGUAGE plpgsql AS $$
DECLARE
  v_count     INTEGER := 0;
  v_entry_id  UUID;
  v_order     RECORD;
  v_stock     RECORD;
BEGIN
  -- ── Ventes (orders paid/pending) ──
  FOR v_order IN
    SELECT
      o.id,
      o.created_at::DATE                           AS entry_date,
      COALESCE(o.total, 0)                         AS total,
      COALESCE(o.subtotal, 0)                      AS subtotal,
      COALESCE(o.tax_amount, 0)                    AS tax_amount,
      COALESCE(o.discount_amount, 0)               AS discount_amount,
      '#' || UPPER(LEFT(o.id::TEXT, 8))            AS ref
    FROM orders o
    WHERE o.business_id = p_business_id
      AND o.status IN ('paid','pending')
      AND NOT EXISTS (
        SELECT 1 FROM journal_entries je
        WHERE je.business_id = p_business_id
          AND je.source = 'order'
          AND je.source_id = o.id
      )
    ORDER BY o.created_at
  LOOP
    INSERT INTO journal_entries
      (business_id, entry_date, reference, description, source, source_id)
    VALUES
      (p_business_id, v_order.entry_date, v_order.ref,
       'Vente ' || v_order.ref, 'order', v_order.id)
    RETURNING id INTO v_entry_id;

    -- Débit Caisse (total TTC)
    IF v_order.total > 0 THEN
      INSERT INTO journal_lines (entry_id, account_code, account_name, debit, credit)
      VALUES (v_entry_id, '571', 'Caisse', v_order.total, 0);
    END IF;

    -- Débit RRR accordés (remise)
    IF v_order.discount_amount > 0 THEN
      INSERT INTO journal_lines (entry_id, account_code, account_name, debit, credit)
      VALUES (v_entry_id, '7091', 'RRR accordés sur ventes', v_order.discount_amount, 0);
    END IF;

    -- Crédit Ventes (brut HT = subtotal)
    IF v_order.subtotal > 0 THEN
      INSERT INTO journal_lines (entry_id, account_code, account_name, debit, credit)
      VALUES (v_entry_id, '701', 'Ventes de marchandises', 0, v_order.subtotal);
    END IF;

    -- Crédit TVA collectée
    IF v_order.tax_amount > 0 THEN
      INSERT INTO journal_lines (entry_id, account_code, account_name, debit, credit)
      VALUES (v_entry_id, '4441', 'TVA facturée (collectée)', 0, v_order.tax_amount);
    END IF;

    v_count := v_count + 1;
  END LOOP;

  -- ── Remboursements (refunded orders) ──
  FOR v_order IN
    SELECT
      o.id,
      o.updated_at::DATE                           AS entry_date,
      COALESCE(o.total, 0)                         AS total,
      COALESCE(o.subtotal, 0)                      AS subtotal,
      COALESCE(o.tax_amount, 0)                    AS tax_amount,
      COALESCE(o.discount_amount, 0)               AS discount_amount,
      '#' || UPPER(LEFT(o.id::TEXT, 8))            AS ref
    FROM orders o
    WHERE o.business_id = p_business_id
      AND o.status = 'refunded'
      AND NOT EXISTS (
        SELECT 1 FROM journal_entries je
        WHERE je.business_id = p_business_id
          AND je.source = 'refund'
          AND je.source_id = o.id
      )
    ORDER BY o.updated_at
  LOOP
    INSERT INTO journal_entries
      (business_id, entry_date, reference, description, source, source_id)
    VALUES
      (p_business_id, v_order.entry_date, v_order.ref,
       'Remboursement ' || v_order.ref, 'refund', v_order.id)
    RETURNING id INTO v_entry_id;

    -- Inverse de la vente
    IF v_order.subtotal > 0 THEN
      INSERT INTO journal_lines (entry_id, account_code, account_name, debit, credit)
      VALUES (v_entry_id, '701', 'Ventes de marchandises', v_order.subtotal, 0);
    END IF;
    IF v_order.tax_amount > 0 THEN
      INSERT INTO journal_lines (entry_id, account_code, account_name, debit, credit)
      VALUES (v_entry_id, '4441', 'TVA facturée (collectée)', v_order.tax_amount, 0);
    END IF;
    IF v_order.total > 0 THEN
      INSERT INTO journal_lines (entry_id, account_code, account_name, debit, credit)
      VALUES (v_entry_id, '571', 'Caisse', 0, v_order.total);
    END IF;

    v_count := v_count + 1;
  END LOOP;

  -- ── Achats (stock_entries) ──
  FOR v_stock IN
    SELECT
      se.id,
      se.created_at::DATE                                                  AS entry_date,
      p.name                                                               AS product_name,
      COALESCE(se.supplier, 'Fournisseur')                                 AS supplier,
      ROUND(COALESCE(se.quantity,0) * COALESCE(se.cost_per_unit,0), 2)    AS total_cost
    FROM stock_entries se
    JOIN products p ON p.id = se.product_id
    WHERE se.business_id = p_business_id
      AND COALESCE(se.quantity,0) * COALESCE(se.cost_per_unit,0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM journal_entries je
        WHERE je.business_id = p_business_id
          AND je.source = 'stock'
          AND je.source_id = se.id
      )
    ORDER BY se.created_at
  LOOP
    INSERT INTO journal_entries
      (business_id, entry_date, description, source, source_id)
    VALUES
      (p_business_id, v_stock.entry_date,
       'Achat – ' || v_stock.product_name || ' / ' || v_stock.supplier,
       'stock', v_stock.id)
    RETURNING id INTO v_entry_id;

    INSERT INTO journal_lines (entry_id, account_code, account_name, debit, credit)
    VALUES (v_entry_id, '601', 'Achats de marchandises', v_stock.total_cost, 0);

    INSERT INTO journal_lines (entry_id, account_code, account_name, debit, credit)
    VALUES (v_entry_id, '401', 'Fournisseurs', 0, v_stock.total_cost);

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ── 6. RPC : Balance des comptes ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_trial_balance(
  p_business_id UUID,
  p_date_from   DATE DEFAULT NULL,
  p_date_to     DATE DEFAULT NULL
)
RETURNS TABLE (
  account_code TEXT,
  account_name TEXT,
  class_num    SMALLINT,
  nature       TEXT,
  balance_type TEXT,
  total_debit  NUMERIC,
  total_credit NUMERIC,
  balance      NUMERIC
)
SECURITY DEFINER LANGUAGE sql AS $$
  SELECT
    jl.account_code::TEXT,
    jl.account_name,
    (LEFT(jl.account_code, 1))::SMALLINT                             AS class_num,
    COALESCE(a.nature,
      CASE LEFT(jl.account_code, 1)
        WHEN '1' THEN 'passif'  WHEN '2' THEN 'actif'
        WHEN '3' THEN 'actif'   WHEN '4' THEN 'passif'
        WHEN '5' THEN 'actif'   WHEN '6' THEN 'charge'
        WHEN '7' THEN 'produit' ELSE 'actif'
      END)                                                           AS nature,
    COALESCE(a.balance_type,
      CASE LEFT(jl.account_code, 1)
        WHEN '1' THEN 'credit'  WHEN '4' THEN 'credit'
        WHEN '7' THEN 'credit'  ELSE 'debit'
      END)                                                           AS balance_type,
    SUM(jl.debit)                                                    AS total_debit,
    SUM(jl.credit)                                                   AS total_credit,
    SUM(jl.debit) - SUM(jl.credit)                                   AS balance
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.entry_id
  LEFT JOIN accounts a
    ON a.code = jl.account_code
    AND (a.business_id = p_business_id OR a.business_id IS NULL)
  WHERE je.business_id = p_business_id
    AND (p_date_from IS NULL OR je.entry_date >= p_date_from)
    AND (p_date_to   IS NULL OR je.entry_date <= p_date_to)
  GROUP BY jl.account_code, jl.account_name, 3, 4, 5
  ORDER BY jl.account_code;
$$;


-- File: 038_hotel_accounting.sql
-- ─── Hotel accounting integration ────────────────────────────────────────────
--
-- 1. Add 'hotel' to journal_entries.source check constraint
-- 2. Ensure account 706 (Prestations hébergement) exists

-- Safely update the source check constraint
DO $$
BEGIN
  ALTER TABLE public.journal_entries
    DROP CONSTRAINT IF EXISTS journal_entries_source_check;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_source_check
  CHECK (source IN ('manual', 'order', 'stock', 'refund', 'adjustment', 'hotel'));

-- Account 706 — Prestations hébergement (SYSCOHADA class 7)
INSERT INTO public.accounts (code, name, class, nature, balance_type, is_default, is_active)
SELECT '706', 'Prestations hébergement', 7, 'produit', 'credit', true, true
WHERE NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '706');
