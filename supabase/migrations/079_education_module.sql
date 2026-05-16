-- Migration: 079_education_module.sql
-- Description: Module Éducation & Formation (Classes, Élèves, Scolarité, Notes)

-- 1. Nouveau type d'établissement
INSERT INTO public.business_types (id, label, description, icon, accent_color, sort_order)
VALUES (
  'education', 
  'Éducation & Formation', 
  'Écoles, centres de formation et instituts — gestion des élèves, classes, scolarité et bulletins', 
  'GraduationCap', 
  'blue', 
  5
)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon;

-- 2. Modules applicatifs — core requis (idempotent : déjà présents via 001 normalement)
INSERT INTO public.app_modules (id, label, description, icon, is_core, sort_order)
VALUES
  ('pos',          'Caisse & encaissement', 'Ventes, encaissement, tickets de caisse', 'ShoppingCart', true,  0),
  ('comptabilite', 'Comptabilité',          'Journal des opérations comptables',       'BookOpen',     false, 7)
ON CONFLICT (id) DO NOTHING;

-- Modules spécifiques éducation
INSERT INTO public.app_modules (id, label, description, icon, is_core, sort_order)
VALUES
  ('eleves',    'Gestion des Élèves',  'Fiches élèves, dossiers parents et inscriptions', 'Users',         false, 20),
  ('classes',   'Gestion des Classes', 'Organisation des salles, niveaux et professeurs', 'LayoutGrid',    false, 21),
  ('scolarite', 'Suivi Scolarité',     'Paiements des frais, facturation et relances',    'Receipt',       false, 22),
  ('notes',     'Notes & Bulletins',   'Saisie des notes et génération des bulletins',    'GraduationCap', false, 23)
ON CONFLICT (id) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description,
  icon        = EXCLUDED.icon;

-- 3. Matrice type x module pour l'éducation
-- 'settings' n'est pas un module app_modules valide — retiré
INSERT INTO public.business_type_modules (business_type_id, module_id, is_default)
VALUES
  ('education', 'pos',          true),
  ('education', 'eleves',       true),
  ('education', 'classes',      true),
  ('education', 'scolarite',    true),
  ('education', 'notes',        true),
  ('education', 'comptabilite', true)
ON CONFLICT (business_type_id, module_id) DO NOTHING;

-- 4. Tables métier

-- 4.1 Classes / Salles
CREATE TABLE IF NOT EXISTS public.edu_classrooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name        text NOT NULL,
  level       text, -- ex: CP, CE1, Terminale, etc.
  capacity    int DEFAULT 30,
  teacher     text, -- Nom du professeur principal
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- 4.2 Élèves
CREATE TABLE IF NOT EXISTS public.edu_students (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  classroom_id  uuid REFERENCES public.edu_classrooms(id) ON DELETE SET NULL,
  first_name    text NOT NULL,
  last_name     text NOT NULL,
  birth_date    date,
  gender        text,
  parent_name   text,
  parent_phone  text,
  parent_email  text,
  address       text,
  photo_url     text,
  status        text DEFAULT 'active', -- active, suspended, graduated
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- 4.3 Notes / Évaluations
CREATE TABLE IF NOT EXISTS public.edu_grades (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES public.edu_students(id) ON DELETE CASCADE,
  subject         text NOT NULL, -- ex: Mathématiques, Français
  score           numeric(5,2) NOT NULL,
  max_score       numeric(5,2) DEFAULT 20.0,
  evaluation_date date DEFAULT current_date,
  term            text, -- ex: Trimestre 1, Semestre 2
  comment         text,
  created_at      timestamptz DEFAULT now()
);

-- 5. Sécurité (RLS)
ALTER TABLE public.edu_classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edu_students   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edu_grades     ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "edu_classrooms: select" ON public.edu_classrooms FOR SELECT USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));
CREATE POLICY "edu_classrooms: insert" ON public.edu_classrooms FOR INSERT WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));
CREATE POLICY "edu_classrooms: update" ON public.edu_classrooms FOR UPDATE USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));
CREATE POLICY "edu_classrooms: delete" ON public.edu_classrooms FOR DELETE USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "edu_students: select" ON public.edu_students FOR SELECT USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));
CREATE POLICY "edu_students: insert" ON public.edu_students FOR INSERT WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));
CREATE POLICY "edu_students: update" ON public.edu_students FOR UPDATE USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));
CREATE POLICY "edu_students: delete" ON public.edu_students FOR DELETE USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "edu_grades: select" ON public.edu_grades FOR SELECT USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));
CREATE POLICY "edu_grades: insert" ON public.edu_grades FOR INSERT WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));
CREATE POLICY "edu_grades: update" ON public.edu_grades FOR UPDATE USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));
CREATE POLICY "edu_grades: delete" ON public.edu_grades FOR DELETE USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

-- 6. Liaison Commandes -> Élèves (pour la scolarité)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.edu_students(id) ON DELETE SET NULL;
