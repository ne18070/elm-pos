-- ============================================================================
-- Migration 132 : Module RH — Volet Paie
-- Lignes de cotisation configurables par business (générique, aucune règle
-- légale figée), détail des cotisations par bulletin. Purement additif sur
-- `staff_payments` (net_amount existant inchangé).
-- ============================================================================

-- ── 1. Lignes de cotisation configurables ──────────────────────────────────

CREATE TABLE IF NOT EXISTS payroll_contribution_types (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name           TEXT        NOT NULL, -- libre : "CNSS", "IPRES", "Mutuelle", "IR"...
  code           TEXT,
  payer          TEXT        NOT NULL DEFAULT 'employee' CHECK (payer IN ('employee', 'employer', 'both')),
  calc_method    TEXT        NOT NULL DEFAULT 'percent_of_gross' CHECK (calc_method IN ('percent_of_gross', 'fixed_amount')),
  rate_percent   NUMERIC(6,3),
  fixed_amount   NUMERIC(12,2),
  ceiling_amount NUMERIC(12,2), -- plafond de la base de calcul, optionnel
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  order_index    INT         NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payroll_contribution_types_biz_idx ON payroll_contribution_types(business_id);

ALTER TABLE payroll_contribution_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payroll_contribution_types_select" ON payroll_contribution_types;
CREATE POLICY "payroll_contribution_types_select" ON payroll_contribution_types FOR SELECT TO authenticated
  USING (business_id = get_user_business_id());

DROP POLICY IF EXISTS "payroll_contribution_types_write_admin" ON payroll_contribution_types;
CREATE POLICY "payroll_contribution_types_write_admin" ON payroll_contribution_types FOR ALL TO authenticated
  USING (business_id = get_user_business_id() AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner') OR is_superadmin = true)))
  WITH CHECK (business_id = get_user_business_id() AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner') OR is_superadmin = true)));

CREATE TRIGGER payroll_contribution_types_updated_at BEFORE UPDATE ON payroll_contribution_types FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 2. Détail des cotisations par bulletin ─────────────────────────────────
-- name est dupliqué (snapshot) pour que le bulletin reste lisible même si le
-- type de cotisation est renommé ou supprimé plus tard.

CREATE TABLE IF NOT EXISTS staff_payment_lines (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id            UUID        NOT NULL REFERENCES staff_payments(id) ON DELETE CASCADE,
  contribution_type_id  UUID        REFERENCES payroll_contribution_types(id) ON DELETE SET NULL,
  name                  TEXT        NOT NULL,
  payer                 TEXT        NOT NULL CHECK (payer IN ('employee', 'employer')),
  base_amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  computed_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staff_payment_lines_payment_idx ON staff_payment_lines(payment_id);

ALTER TABLE staff_payment_lines ENABLE ROW LEVEL SECURITY;

-- Lecture : admin/owner/manager voient tout ; un employé (self-service, view_my_hr)
-- ne voit que le détail de SES PROPRES bulletins. Écriture : admin/owner uniquement
-- (aligné sur payroll_contribution_types_write_admin ci-dessus — la paie n'est
-- jamais éditable par un manager).
DROP POLICY IF EXISTS "staff_payment_lines_select" ON staff_payment_lines;
CREATE POLICY "staff_payment_lines_select" ON staff_payment_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_payments p
      WHERE p.id = staff_payment_lines.payment_id
        AND p.business_id = get_user_business_id()
        AND (
          EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner', 'manager') OR is_superadmin = true))
          OR EXISTS (SELECT 1 FROM staff s WHERE s.id = p.staff_id AND s.user_id = auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "staff_payment_lines_insert" ON staff_payment_lines;
CREATE POLICY "staff_payment_lines_insert" ON staff_payment_lines FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff_payments p
      WHERE p.id = staff_payment_lines.payment_id
        AND p.business_id = get_user_business_id()
        AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner') OR is_superadmin = true))
    )
  );

DROP POLICY IF EXISTS "staff_payment_lines_delete" ON staff_payment_lines;
CREATE POLICY "staff_payment_lines_delete" ON staff_payment_lines FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_payments p
      WHERE p.id = staff_payment_lines.payment_id
        AND p.business_id = get_user_business_id()
        AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner') OR is_superadmin = true))
    )
  );

-- ── 3. Détail brut/cotisations sur staff_payments (additif, net_amount inchangé) ──

ALTER TABLE staff_payments
  ADD COLUMN IF NOT EXISTS gross_amount                  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS total_employee_contributions  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS total_employer_contributions  NUMERIC(12,2);

-- ── 4. GRANTs explicites ─────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payroll_contribution_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_payment_lines        TO authenticated;
GRANT ALL ON TABLE public.payroll_contribution_types TO service_role;
GRANT ALL ON TABLE public.staff_payment_lines        TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
