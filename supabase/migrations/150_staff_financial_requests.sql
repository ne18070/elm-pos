-- ============================================================================
-- Migration 150 : Module RH — Prêts & Avances sur salaire
--
-- Une seule table pour les deux demandes financières ("Demande de prêts" et
-- "Avance sur salaire"), distinguées par `kind` — gardées comme deux onglets
-- self-service distincts côté UI pour matcher exactement l'IA demandée.
-- RLS scopée admin/owner UNIQUEMENT (pas manager) : aligné sur le précédent
-- déjà établi pour les données financières sensibles dans ce dépôt
-- (manage_staff_payroll, staff_payments après durcissement 135).
--
-- Hors scope volontaire : déduction automatique en paie. Le rattachement
-- reste un ajustement manuel via PaymentModal (bonus/déduction), comme pour
-- toute autre ligne de paie aujourd'hui — pas de couplage avec le calcul de
-- computePayroll.
-- ============================================================================

CREATE TABLE IF NOT EXISTS staff_financial_requests (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        UUID          NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id           UUID          NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  kind               TEXT          NOT NULL CHECK (kind IN ('pret', 'avance_salaire')),
  amount             NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason             TEXT,
  repayment_months   INT           CHECK (repayment_months IS NULL OR repayment_months > 0),
  status             TEXT          NOT NULL DEFAULT 'en_attente' CHECK (status IN ('en_attente', 'approuvee', 'rejetee', 'decaissee', 'remboursee')),
  admin_notes        TEXT,
  approved_at        TIMESTAMPTZ,
  approved_by        UUID          REFERENCES users(id),
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT staff_financial_requests_repayment_scope CHECK (kind = 'pret' OR repayment_months IS NULL)
);

CREATE INDEX IF NOT EXISTS staff_financial_requests_staff_idx ON staff_financial_requests(staff_id, kind, status);
CREATE INDEX IF NOT EXISTS staff_financial_requests_biz_idx   ON staff_financial_requests(business_id, kind);

ALTER TABLE staff_financial_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_financial_requests_select" ON staff_financial_requests;
CREATE POLICY "staff_financial_requests_select" ON staff_financial_requests FOR SELECT TO authenticated
  USING (
    business_id = get_user_business_id() AND (
      EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner') OR is_superadmin = true))
      OR EXISTS (SELECT 1 FROM staff s WHERE s.id = staff_financial_requests.staff_id AND s.user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "staff_financial_requests_insert" ON staff_financial_requests;
CREATE POLICY "staff_financial_requests_insert" ON staff_financial_requests FOR INSERT TO authenticated
  WITH CHECK (
    business_id = get_user_business_id()
    AND EXISTS (
      SELECT 1 FROM staff s WHERE s.id = staff_financial_requests.staff_id AND s.business_id = get_user_business_id()
        AND (s.user_id = auth.uid() OR (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'owner'))
    )
  );

DROP POLICY IF EXISTS "staff_financial_requests_update_admin" ON staff_financial_requests;
CREATE POLICY "staff_financial_requests_update_admin" ON staff_financial_requests FOR UPDATE TO authenticated
  USING (business_id = get_user_business_id() AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner') OR is_superadmin = true)));

DROP POLICY IF EXISTS "staff_financial_requests_delete_admin" ON staff_financial_requests;
CREATE POLICY "staff_financial_requests_delete_admin" ON staff_financial_requests FOR DELETE TO authenticated
  USING (business_id = get_user_business_id() AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('admin', 'owner') OR is_superadmin = true)));

CREATE TRIGGER staff_financial_requests_updated_at BEFORE UPDATE ON staff_financial_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_financial_requests TO authenticated;
GRANT ALL ON TABLE public.staff_financial_requests TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
