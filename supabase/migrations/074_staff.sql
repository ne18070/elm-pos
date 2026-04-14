-- ============================================================
-- 074 — Staff Management & Payroll
-- ============================================================

-- ── Employés ─────────────────────────────────────────────────

CREATE TABLE staff (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  phone          TEXT,
  email          TEXT,
  position       TEXT,          -- Poste (ex: Caissier, Serveur, Manager)
  department     TEXT,          -- Département (ex: Cuisine, Salle, Admin)
  salary_type    TEXT NOT NULL DEFAULT 'monthly'
                   CHECK (salary_type IN ('hourly', 'daily', 'monthly')),
  salary_rate    NUMERIC(12,2) NOT NULL DEFAULT 0,
  hire_date      DATE,
  status         TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'inactive')),
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── Présences ─────────────────────────────────────────────────

CREATE TABLE staff_attendance (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id      UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'present'
                  CHECK (status IN ('present', 'absent', 'half_day', 'leave', 'holiday')),
  clock_in      TIME,
  clock_out     TIME,
  hours_worked  NUMERIC(5,2),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (staff_id, date)
);

-- ── Paiements ─────────────────────────────────────────────────

CREATE TABLE staff_payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  staff_id        UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  base_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  bonuses         NUMERIC(12,2) NOT NULL DEFAULT 0,
  deductions      NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  days_worked     NUMERIC(5,1),
  hours_worked    NUMERIC(6,2),
  payment_method  TEXT DEFAULT 'cash'
                    CHECK (payment_method IN ('cash', 'transfer', 'mobile_money', 'check')),
  payment_date    DATE,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'paid')),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────

CREATE INDEX staff_business_id_idx             ON staff(business_id);
CREATE INDEX staff_status_idx                  ON staff(business_id, status);
CREATE INDEX staff_attendance_staff_date_idx   ON staff_attendance(staff_id, date);
CREATE INDEX staff_attendance_biz_month_idx    ON staff_attendance(business_id, date);
CREATE INDEX staff_payments_staff_id_idx       ON staff_payments(staff_id);
CREATE INDEX staff_payments_business_period_idx ON staff_payments(business_id, period_start);

-- ── RLS ───────────────────────────────────────────────────────

ALTER TABLE staff            ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_payments   ENABLE ROW LEVEL SECURITY;

-- staff
CREATE POLICY "staff: members can read"
  ON staff FOR SELECT
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "staff: members can insert"
  ON staff FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "staff: members can update"
  ON staff FOR UPDATE
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "staff: members can delete"
  ON staff FOR DELETE
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

-- staff_attendance
CREATE POLICY "attendance: members can read"
  ON staff_attendance FOR SELECT
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "attendance: members can insert"
  ON staff_attendance FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "attendance: members can update"
  ON staff_attendance FOR UPDATE
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "attendance: members can delete"
  ON staff_attendance FOR DELETE
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

-- staff_payments
CREATE POLICY "staff_payments: members can read"
  ON staff_payments FOR SELECT
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "staff_payments: members can insert"
  ON staff_payments FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "staff_payments: members can update"
  ON staff_payments FOR UPDATE
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "staff_payments: members can delete"
  ON staff_payments FOR DELETE
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));
