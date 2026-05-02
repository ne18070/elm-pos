-- Migration: 043_juridique_time_tracking.sql
-- Description: Suivi du temps passé pour la facturation au taux horaire (Billable Hours)

BEGIN;

CREATE TABLE IF NOT EXISTS public.dossier_time_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  dossier_id       UUID NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  -- Référence public.users (et non auth.users) pour que PostgREST puisse faire le JOIN automatique
  user_id          UUID NOT NULL REFERENCES public.users(id),
  date_record      DATE NOT NULL DEFAULT CURRENT_DATE,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  hourly_rate      NUMERIC(12,2) NOT NULL DEFAULT 50000,
  total_amount     NUMERIC(12,2) GENERATED ALWAYS AS ((duration_minutes::numeric / 60.0) * hourly_rate) STORED,
  description      TEXT NOT NULL,
  is_billed        BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Index composite : la requête filtre par dossier_id et trie par date_record
CREATE INDEX IF NOT EXISTS idx_dossier_time_entries_dossier_date
  ON public.dossier_time_entries(dossier_id, date_record DESC);
CREATE INDEX IF NOT EXISTS idx_dossier_time_entries_business
  ON public.dossier_time_entries(business_id);

ALTER TABLE public.dossier_time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_dossier_time_entries" ON public.dossier_time_entries FOR ALL TO authenticated
  USING (business_id IN (
    SELECT business_id FROM public.business_members WHERE user_id = auth.uid()
    UNION SELECT id FROM public.businesses WHERE owner_id = auth.uid()
  ));

COMMIT;
