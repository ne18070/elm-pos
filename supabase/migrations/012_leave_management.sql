-- Migration 012 : Système de gestion des congés et absences
-- Implémente les types de congés, les demandes, les soldes et les jours de pression.

-- 1. Types de congés configurables
CREATE TABLE IF NOT EXISTS public.leave_types (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name         text        NOT NULL, -- ex: "Congés Payés", "Maladie", "RTT"
  description  text,
  color        text        DEFAULT '#3b82f6', -- Couleur pour le calendrier (ex: bleu brand)
  icon         text        DEFAULT 'Calendar',
  yearly_days  decimal     DEFAULT 25.0, -- Nombre de jours alloués par an
  requires_approval boolean DEFAULT true,
  is_paid      boolean     DEFAULT true, -- Si le congé est rémunéré ou non
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- 2. Demandes de congés des employés
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  staff_id       uuid        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  leave_type_id  uuid        NOT NULL REFERENCES public.leave_types(id) ON DELETE RESTRICT,
  start_date     date        NOT NULL,
  end_date       date        NOT NULL,
  total_days     decimal     NOT NULL, -- Calculé côté client ou via trigger
  status         text        NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'cancelled'
  reason         text,
  admin_notes    text,
  approved_at    timestamptz,
  approved_by    uuid        REFERENCES public.users(id),
  attachments    text[]      DEFAULT '{}', -- justificatifs (ex: certificat médical)
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  CONSTRAINT valid_dates CHECK (end_date >= start_date)
);

-- 3. Jours de pression (Blackout days)
CREATE TABLE IF NOT EXISTS public.pressure_days (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  date         date        NOT NULL,
  reason       text        NOT NULL,
  created_at   timestamptz DEFAULT now()
);

-- 4. Soldes de congés (Accruals)
-- Optionnel si calculé dynamiquement, mais utile pour le stockage des reports
CREATE TABLE IF NOT EXISTS public.staff_leave_balances (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id       uuid        NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  leave_type_id  uuid        NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  year           int         NOT NULL,
  total_accrued  decimal     NOT NULL DEFAULT 0, -- Jours acquis
  total_used     decimal     NOT NULL DEFAULT 0, -- Jours consommés
  remaining      decimal     NOT NULL DEFAULT 0, -- Reste (total_accrued - total_used)
  updated_at     timestamptz DEFAULT now(),
  UNIQUE(staff_id, leave_type_id, year)
);

-- 5. Sécurité RLS
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pressure_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_leave_balances ENABLE ROW LEVEL SECURITY;

-- Politiques de lecture
CREATE POLICY "leave_types_select" ON public.leave_types FOR SELECT TO authenticated USING (business_id = get_user_business_id());
CREATE POLICY "leave_requests_select" ON public.leave_requests FOR SELECT TO authenticated USING (business_id = get_user_business_id());
CREATE POLICY "pressure_days_select" ON public.pressure_days FOR SELECT TO authenticated USING (business_id = get_user_business_id());
CREATE POLICY "staff_leave_balances_select" ON public.staff_leave_balances FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND s.business_id = get_user_business_id()));

-- Politiques d'écriture (Admin/Manager ou Superadmin)
CREATE POLICY "leave_types_all_admin" ON public.leave_types FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND (role IN ('admin', 'owner') OR is_superadmin = true)));

CREATE POLICY "pressure_days_all_admin" ON public.pressure_days FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND (role IN ('admin', 'owner') OR is_superadmin = true)));

-- Demandes de congés : les employés peuvent créer les leurs
CREATE POLICY "leave_requests_insert_self" ON public.leave_requests FOR INSERT TO authenticated 
  WITH CHECK (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND (s.user_id = auth.uid() OR (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'owner'))));

-- Triggers updated_at
CREATE TRIGGER leave_types_updated_at BEFORE UPDATE ON leave_types FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER leave_requests_updated_at BEFORE UPDATE ON leave_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER staff_leave_balances_updated_at BEFORE UPDATE ON staff_leave_balances FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 6. Initialisation de types par défaut lors de la création d'un business
-- (Peut être fait via une fonction trigger sur la table businesses ou manuellement)
