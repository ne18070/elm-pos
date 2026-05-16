-- Correctifs module Éducation
-- 1. Unicité des noms de classe par établissement
-- 2. Indices de performance

-- Unicité : deux classes ne peuvent pas avoir le même nom dans un même établissement
ALTER TABLE public.edu_classrooms
  ADD CONSTRAINT edu_classrooms_business_name_unique UNIQUE (business_id, name);

-- Indices performance (requêtes filtrées par business_id et classroom_id)
CREATE INDEX IF NOT EXISTS idx_edu_classrooms_business ON public.edu_classrooms(business_id);
CREATE INDEX IF NOT EXISTS idx_edu_students_business   ON public.edu_students(business_id);
CREATE INDEX IF NOT EXISTS idx_edu_students_classroom  ON public.edu_students(classroom_id);
CREATE INDEX IF NOT EXISTS idx_edu_grades_business     ON public.edu_grades(business_id);
CREATE INDEX IF NOT EXISTS idx_edu_grades_student      ON public.edu_grades(student_id);
