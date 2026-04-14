-- Migration 027 : Créer le super administrateur ELM APP
-- À exécuter dans Supabase Dashboard > SQL Editor
-- Remplacez l'email par le vôtre avant d'exécuter.

UPDATE public.users
SET is_superadmin = true
WHERE email = 'admin@elm-pos.app';
