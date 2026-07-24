-- Migration 096 : Archivage des événements
-- Permet de masquer un événement terminé de la liste active sans supprimer
-- ses invités ni son historique de check-in (contrairement à la suppression).

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS events_business_active_idx
  ON public.events (business_id, archived_at)
  WHERE archived_at IS NULL;
